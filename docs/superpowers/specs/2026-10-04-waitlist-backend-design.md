# Waitlist backend design

Intent-Issue: #3 — https://github.com/ismail9k/9k-school-fakka/issues/3

## Understanding

**Outcome.** Real visitors join the waitlist on fakka.com, immediately see their
place in the queue and a personal invite link, and get an email (in the language
they signed up in) with both. Each friend who joins through the link moves the
inviter up the queue.

**Binding constraints (from the issue).** Production-grade; runs on Cloudflare
alongside the static site; API on the same origin (`fakka.com/api/waitlist`, no
CORS); invite links point at fakka.com; email via Resend from a verified
fakka.com sender; Turnstile token sent by the form and verified before any
write, plus per-IP rate limiting; no double opt-in; score = join order −
N × referrals, earlier join wins ties, N configurable without code edits; store
only name, email, language, join time, who invited whom; no accounts, payments,
leaderboard, or other languages.

**Brief rules the backend enforces.** One email joins once however it is typed;
no self-invites; each friend counts once; automated signups can't flood it.

**Success.** A signup through the page returns `200 { position, inviteUrl }`
with the correct queue position; a referral moves the inviter up exactly N
places relative to the ordering rule; duplicates, bots, and floods are refused
or folded into the existing entry; an email goes out per new signup.

## Approaches considered

1. **One Worker: static assets + `/api/*` script, D1 storage (chosen).** Add a
   `main` script to the existing `wrangler.jsonc`, with
   `assets.run_worker_first: ["/api/*"]` so only API calls invoke the script and
   every page is still served straight from `./out`. D1 (SQLite) gives unique
   constraints, atomic batches, and window functions for ranking. One deploy,
   one config, same origin by construction.
2. **Separate API Worker on a `fakka.com/api/*` route.** Same storage, but two
   configs and two deploys that must stay in step; nothing gained here.
3. **Durable Object as the store.** Strong single-writer ordering, but more code
   and a bespoke query layer for what SQL does in one statement. Overkill at
   waitlist scale.

## Architecture

```
browser ──POST /api/waitlist──▶ Worker (worker/index.ts)
                                  ├─ rate limiter binding (per IP)
                                  ├─ Turnstile siteverify (fetch)
                                  ├─ D1 "fakka-waitlist" (signups table)
                                  └─ ctx.waitUntil → Resend /emails (fetch)
all other paths ───────────────▶ static assets in ./out (unchanged)
```

### Units (all under `worker/`)

| File | Purpose |
| --- | --- |
| `index.ts` | Worker entry: routes `POST /api/waitlist`, 404/405 JSON otherwise. |
| `env.ts` | `Env` type and minimal hand-written binding types (D1 subset, rate limiter, execution context) so worker code type-checks under the root tsconfig without generated runtime types. |
| `config.ts` | Reads vars: `SITE_URL`, `EMAIL_FROM`, `REFERRAL_JUMP` (integer ≥ 0, default 5). |
| `validate.ts` | Parses and validates the request body. |
| `email-key.ts` | Email normalization into the uniqueness key. |
| `store.ts` | D1 access: find by key, create with referral credit, position. |
| `turnstile.ts` | Siteverify call. |
| `email.ts` | Builds and sends the confirmation email through Resend. |
| `waitlist.ts` | The handler that composes the above. |

Schema lives in `migrations/0001_create_signups.sql` (Wrangler's default D1
migrations directory).

## Request contract (changed)

`POST /api/waitlist`, JSON body:

```json
{ "name": "Mona", "email": "mona@example.com", "locale": "ar", "ref": "k7qm2x9a" , "turnstileToken": "…" }
```

| Status | Body | When |
| --- | --- | --- |
| 200 | `{ position, inviteUrl }` | New signup, or the email is already on the list. |
| 400 | `{ error: "invalid_request" }` | Malformed JSON, body > 4 KB, or failed validation. |
| 403 | `{ error: "verification_failed" }` | Missing or rejected Turnstile token. |
| 405 | `{ error: "method_not_allowed" }` | Not POST. |
| 429 | `{ error: "rate_limited" }` | Per-IP limit exceeded. |
| 500 | `{ error: "server_error" }` | Misconfiguration or storage failure. |

Order of checks: method → rate limit (keyed by `CF-Connecting-IP`) → body size
and validation → Turnstile → storage. Nothing is written before Turnstile passes.

Validation: `name` trimmed, control and invisible format characters (`\p{Cc}`, `\p{Cf}`, e.g. bidi overrides) removed, 1–80 characters;
`email` trimmed, ≤ 254 characters, `local@domain.tld` shape without whitespace or `@<>()[]\,;:"`; `locale` is `en`
or `ar`; `ref` optional, trimmed and lowercased — anything that isn't a well-formed invite code is
treated as no ref (the signup still succeeds); `turnstileToken` a non-empty
string ≤ 2048 characters.

## Data model

```sql
CREATE TABLE signups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT, -- join order
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,           -- as typed (trimmed), used to send
  email_key      TEXT NOT NULL UNIQUE,    -- normalized, enforces one place
  locale         TEXT NOT NULL CHECK (locale IN ('en', 'ar')),
  invite_code    TEXT NOT NULL UNIQUE,
  referred_by    INTEGER REFERENCES signups(id),
  referral_count INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL            -- ISO 8601 join time
);
```

Every column is one of the brief's allowed fields or derived from them
(`email_key` from email; `invite_code`, `referred_by`, `referral_count` from who
invited whom). No IP address, user agent, or Turnstile data is stored.

## Behaviour

**Email normalization (`email_key`).** Lowercase the whole address; split at the
last `@`; strip a trailing dot from the domain; map `googlemail.com` to
`gmail.com`; drop a `+tag` from the local part for every domain; for
`gmail.com` also remove dots from the local part. Emails are sent to the
address as typed, never to the key.

**Signup.**
1. Look up `email_key`. If found, return that entry's current position and
   invite link (in its stored locale). Name, locale, and inviter are not
   changed and no second email is sent.
2. Resolve `ref` to an inviter by `invite_code`. Unknown codes are ignored.
3. Generate an 8-character invite code from a 31-character unambiguous
   lowercase alphabet (`crypto.getRandomValues`).
4. In one D1 batch (atomic): insert the signup; if there is an inviter,
   `UPDATE signups SET referral_count = referral_count + 1 WHERE id = ?`.
5. If the insert hits a unique constraint: when the `email_key` now exists (a
   concurrent duplicate), return that entry; otherwise (invite code
   collision) retry with a new code, at most 3 attempts.
6. Compute the position, respond 200, and send the email in `ctx.waitUntil`.

**Fair inviting.** A brand-new email has no invite code yet, so its `ref` can
only belong to someone else; a second submission of an existing email (however
typed) never applies a referral, so you can't invite yourself through an alias
and each friend counts once.

**Position.** Join order is the row's rank by `id` (`ROW_NUMBER()`), so
AUTOINCREMENT gaps don't distort scores. Score = join order − N × referral_count.
Position = 1 + the number of entries with a lower score, or an equal score and
an earlier join. Computed per request with one window-function query; this is a
full scan, fine for tens of thousands of rows.

**Invite link.** `${SITE_URL}/${locale}/?ref=${invite_code}` — the existing
page and root redirect already keep `?ref=`.

**Email.** Sent through `POST https://api.resend.com/emails` with
`Idempotency-Key: signup-<id>`, `from` = `EMAIL_FROM`, HTML and plain-text
bodies, `dir="rtl"` for Arabic. Copy lives in `messages/{en,ar}.json` under
`Email`, written naturally for each language, with the position formatted by
`src/lib/format.ts` (Arabic-Indic digits for Arabic). The email does not
include the visitor's name (it is sent from fakka.com, so free text from a
visitor stays out of it); the invite URL is HTML-escaped.
A send failure is logged and never fails the signup; the email carries the
position at join time. Without `RESEND_API_KEY` the email is skipped with a
log line (local development).

**Turnstile.** `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
with `secret`, `response`, and `remoteip`, 10-second timeout. Anything but
`success: true` → 403. A network error or timeout also → 403 (fail closed).
Missing `TURNSTILE_SECRET_KEY` → 500 and a log line.

**Rate limit.** Workers Rate Limiting binding `WAITLIST_LIMITER`, 20 requests
per 60 seconds per IP. Requests without `CF-Connecting-IP` share one key.

## Configuration

`wrangler.jsonc` gains: `main: "worker/index.ts"`, `assets.run_worker_first:
["/api/*"]`, a `d1_databases` binding `DB` → `fakka-waitlist`, a `ratelimits`
binding, `observability.enabled`, and `vars` `SITE_URL=https://fakka.com`,
`EMAIL_FROM=Fakka <hello@fakka.com>`, `REFERRAL_JUMP=5`. Secrets:
`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`. `.dev.vars.example` documents local
values (Turnstile's always-pass test secret). Changing N is editing the
`REFERRAL_JUMP` var (in `wrangler.jsonc` or the dashboard), no code edit.

Front-end build config: `NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist` and the
new `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

Scripts: `pnpm preview` applies local D1 migrations before `wrangler dev`;
`pnpm run deploy` first runs `scripts/check-release-env.mjs` (both public build
vars must be set, from the environment or the committed `.env.production`),
then applies remote migrations before `wrangler deploy`, so schema always lands
before code; `pnpm db:migrate:local` / `db:migrate:remote` run them
alone.

## Front-end changes

- `getWaitlistMode` returns `remote` only when both the endpoint and the
  Turnstile site key are set (the mode carries the site key). An endpoint
  without a site key is `unavailable` — the backend would refuse every signup.
- `submitWaitlist` sends `turnstileToken` and throws a `WaitlistError` with a
  reason: `rate_limited` (429), `verification` (403), or `failed`.
- New `TurnstileWidget` client component: loads
  `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` once,
  renders a managed widget (`appearance: "interaction-only"`, `language` = page
  locale, `action: "waitlist"`), and reports the token (or null on expiry or
  error) to the form. The form resets it after every failed submit, since a
  token is single-use.
- Submitting before a token exists shows a "checking you're not a bot" notice
  instead of sending. 403 shows the same notice; 429 shows a "too many tries"
  notice; anything else keeps the existing generic error. All new strings in
  both message files. Stub mode (dev without endpoint) has no widget.

## Decisions on the issue's open questions

| Question | Decision | Cost if wrong |
| --- | --- | --- |
| DNS on Cloudflare? | Assumed yes. No `routes`/custom domain added to `wrangler.jsonc`; attaching fakka.com is an owner step. | Owner attaches the domain differently; no code change. |
| N | 5, as `REFERRAL_JUMP` var. | Change one var. |
| Sender | `Fakka <hello@fakka.com>`, as `EMAIL_FROM` var. | Change one var; address must be verified in Resend. |
| Existing email submits again | 200 with the existing position and invite link; no update, no second email. | Someone who knows an address can see that it's on the list and its position (bounded by Turnstile and rate limiting). Switching to an "already on the list" error is a small handler change. |
| Aliases | Lowercase everywhere; strip `+tag` for every domain; strip dots and map googlemail for Gmail only. | Two different people at a provider where `+` is a literal character would collide (very rare); dot-aliases at non-Gmail providers that ignore dots still count twice. |

## Other decisions

- Email copy lives in `messages/*.json` (`Email` namespace) per the repo
  convention, even though the page ships those messages to the client; cost: a
  few hundred bytes of client payload.
- Turnstile `hostname`/`action` are not checked server-side (test keys don't
  return production values); cost: a token minted for another of the account's
  sites using this sitekey would pass — sitekeys are per-site, so low.
- Worker tests run in Vitest's Node environment against a real SQLite
  (`node:sqlite`) behind a small D1-shaped adapter, rather than
  `@cloudflare/vitest-pool-workers`; cost: D1-specific quirks are not exercised
  by unit tests, only by the `wrangler dev` smoke check.
- `database_id` is left out of `wrangler.jsonc` until the owner creates the D1
  database; cost: the first remote deploy fails until it is added.

## Error handling summary

Every failure path returns JSON with a stable `error` code and logs server-side
detail with `console.error`; no stack or upstream body reaches the client.

## Testing

- Unit: `email-key`, `validate`, `config`, `turnstile` (stubbed fetch), `email`
  (template content per locale, escaping, Resend request shape, skip without key).
- Store against SQLite: insert, duplicate key, referral credit, ordering rule
  (N jump, tie → earlier join), unknown ref, concurrent-duplicate handling.
- Handler end to end with a fake env: method, rate limit, validation, Turnstile
  failure writes nothing, success shape, duplicate returns same entry without
  email, email scheduled via `waitUntil`.
- Front end: updated `waitlist.test.ts` and `WaitlistForm.test.tsx` for the
  token, the new error notices, widget reset, and the mode rule.
- Smoke: `pnpm build`, local migrations, `wrangler dev`, curl the endpoint with
  Turnstile's test secret.

## Changes after final review

- Rate limit is 20 requests per 60 seconds per IP (was 5).
- The confirmation email no longer contains the visitor's name; `Email.greeting`
  is "Hi," / "أهلًا،".
- Names also have `\p{Cf}` characters (bidi overrides, zero-width) stripped.
- The email pattern excludes whitespace and `@<>()[]\,;:"` in each part.
- `ref` is trimmed and lowercased before matching the invite-code pattern.
- The Resend request times out after 10 seconds.
- `.env.production` (committed, public values only) holds
  `NEXT_PUBLIC_WAITLIST_ENDPOINT`; `scripts/check-release-env.mjs` blocks a
  deploy missing either public var.
- The deploy command is `pnpm run deploy` (`pnpm deploy` is pnpm's built-in).
- The form shows a distinct notice when the bot check is blocked or fails to
  load, and retries loading it on the next submit.
