# Privacy policy and terms pages — design

Intent-Issue: #4 — https://github.com/ismail9k/9k-school-fakka/issues/4

## Understanding

**From the issue (binding):** add a Privacy page and a Terms page in Arabic and
English, reachable from the landing page. Privacy says what the waitlist keeps
(name, email, preferred language, join time, who invited whom), that we never
share or sell it, and that we only email about Fakka's launch. Terms cover the
waitlist and invites only, promise no launch date, price, or feature beyond the
brief. Operator name, contact email, and governing law are clearly marked
placeholders until real details exist. Both languages say the same thing, each
written naturally; Arabic reads right to left; the voice is the brief's. The
site stays fully static.

**From the code (base branch = issue #3's backend):**

- `migrations/0001_*.sql` stores `name`, `email`, a normalized `email_key`,
  `locale`, `invite_code`, `referred_by`, `referral_count`, `created_at`. The
  extra columns are derived from the brief's five items (the normalized email,
  the person's own invite code, and a count of who they invited), so the policy
  can describe them in plain words without breaking the brief.
- No IP address, user agent, or Turnstile data is stored (backend spec). The
  IP is used in-flight for the per-IP rate limit and Turnstile siteverify.
- Service providers: Cloudflare (hosting via Workers static assets, D1
  storage, Turnstile bot check, rate limiting) and Resend (email delivery).
  This answers the issue's open question about providers.
- The site sets no cookies and has no analytics. The waitlist form keeps an
  invite code from `?ref=` in `sessionStorage` (`fakka.ref`) until the tab
  closes.
- Emails sent: one confirmation with queue place and invite link. The brief
  adds a launch email ("we'll email you when Fakka is ready").

## Decisions (answered on the user's behalf)

| # | Question | Decision | Cost if wrong |
|---|----------|----------|---------------|
| 1 | Path classification | Architectural (two new routes, shared component, footer change). Spec + plan. | Some extra paperwork. |
| 2 | URLs | `/{locale}/privacy/` and `/{locale}/terms/`, as `src/app/[locale]/privacy/page.tsx` and `.../terms/page.tsx`. | Renaming routes later breaks links shared meanwhile. |
| 3 | Where the copy lives | `messages/{en,ar}.json`, namespaces `Privacy` and `Terms`, per AGENTS.md. Sections are an ordered list of keys in the page component; each section has `title`, `paragraphs` (string array) and optional `items` (string array), read with `t.raw`. | Lawyers editing JSON is awkward; moving to MDX later is mechanical. |
| 4 | How placeholders work | One file, `src/lib/legal.ts`, holds `operatorName` (per locale), `contactEmail`, `governingLaw` (per locale), each `null` until known, plus `LEGAL_LAST_UPDATED = "2026-10-04"`. A null value renders as a visibly marked placeholder (`<mark data-placeholder>` with bracketed text like "[Operator name — to be confirmed]"). Details are shown in a small labelled details block (`<dl>`), not interpolated into prose, so filling one in is a one-line change and no sentence needs rewording. | If the owner wants the name inside sentences, copy needs a small rewrite. |
| 5 | Draft notice | While any detail is null, each legal page shows a short notice at the top: the page is a draft and marked details are still being confirmed. It disappears automatically once all three are filled. | A visitor sees "draft" wording on a public page until the owner fills the details — intended honesty. |
| 6 | Contact email | When set, rendered as a `mailto:` link. Not `hello@fakka.com` by default: that is the sender address and the issue says to use a placeholder. | None beyond the placeholder showing. |
| 7 | Retention | "We keep it only as long as the waitlist needs it, and you can ask us to delete it any time." No fixed period — the brief doesn't set one and a promise we can't keep is worse. | A regulator or reviewer may want a concrete period; owner adds it. |
| 8 | Providers named | Cloudflare and Resend by name, with what each does. Phrasing: they process data only to run these services for us; we don't sell or share it with anyone for their own use. | If providers change, the page must be updated. |
| 9 | IP and browser data | Say plainly: Cloudflare sees your IP address and browser to stop bots and limit repeated attempts; we don't store it. No ads, no analytics, no tracking cookies. Mention the invite code kept in the browser tab. | Workers Logs (observability) may hold IPs briefly; the copy says so. Turning invocation logs off is #3's config call. |
| 10 | Rights | See, correct, or delete your details by emailing the contact address; deleting removes your place in the queue. No self-serve tool (none exists). | — |
| 11 | Terms scope | Waitlist and invites only: free to join; your own real name and email; one email, one place; queue place can change as others invite friends and is not a promise of invite order or timing; invite rules from the brief; we may remove sign-ups that are fake, automated, or game invites; no launch date, price, or features are final and joining doesn't guarantee access; we may change or stop the waitlist; governing law placeholder; contact. | Owner may want stronger or softer wording after legal review (open question on the issue). |
| 12 | Links from the landing page | Footer gets a small nav with "Privacy" and "Terms" links (shown on every page that uses the footer). The under-form privacy line is left unchanged. | Visitors may miss the link at the point of sign-up; adding it there is a small follow-up. |
| 13 | Language switch on legal pages | `LocaleSwitch` takes an optional `path` (e.g. `privacy/`) so switching language keeps you on the same page. `Header` and `Footer` pass it through. Default stays `""` (landing). | — |
| 14 | Page chrome | Legal pages reuse `Header` and `Footer`. Body is a single readable column (`max-w-3xl`), h1 + "Last updated" date + sections as h2 with paragraphs and bullet lists, logical utilities only. | — |
| 15 | Date format | "Last updated" uses `Intl.DateTimeFormat` with `dateStyle: "long"`, `ar-EG` for Arabic (Arabic-Indic digits, matching `formatNumber`). Added as `formatDate` in `src/lib/format.ts`. | — |
| 16 | Metadata | Each page has its own title and description from messages and `alternates.languages` pointing at the other locale's same page. | — |
| 17 | Open question: legal review | Not answerable here; stays open and is listed as a follow-up. | — |

## Content outline

**Privacy** — intro (short, plain); sections:
1. *Who runs Fakka* — details block (operator, contact email).
2. *What we keep* — bullets: name, email, language, join time, who invited you
   and whom you invited (with your invite code and how many friends joined).
3. *Why we keep it* — your place, your invite link, your emails.
4. *Emails we send* — a confirmation with your place and link, and news about
   Fakka's launch. Nothing else; no marketing from others.
5. *What we don't keep* — no IP stored, no ads/analytics/tracking cookies;
   Cloudflare checks bots; browser keeps the invite code until the tab closes.
6. *Who helps us* — Cloudflare (site, storage, bot check, rate limit); Resend
   (sending email). Never sold or shared for anyone else's use.
7. *How long we keep it* — decision 7.
8. *Your choices* — see, correct, delete via contact email.
9. *Changes* — we update this page and its date.

**Terms** — intro; sections:
1. *What this is* — a waitlist for an upcoming app; no app, account, or payment yet.
2. *Joining* — free; your own real name and email; one email, one place.
3. *Your place in the queue* — shown at join time; can change; not a promise.
4. *Inviting friends* — link moves you up; no self-invites; each friend once;
   no fake or automated sign-ups; we may remove sign-ups that break this.
5. *No promises yet* — no launch date, price, or features final; joining doesn't
   guarantee access; we may change or stop the waitlist.
6. *Your data* — link to the Privacy page.
7. *Changes to these terms* — updated here with the date.
8. *Governing law* — details block (governing law).
9. *Contact* — details block (contact email).

## Components

- `src/lib/legal.ts` — details config + `hasMissingDetails()` helper.
- `src/components/legal/LegalDetails.tsx` — `DetailsList`: a labelled `<dl>` of
  details, each value or its marked placeholder.
- `src/components/legal/LegalPage.tsx` — server-safe component taking a
  namespace (`"Privacy" | "Terms"`) and an ordered section list; renders
  Header/Footer with the right `path`, the h1, date, draft notice, sections,
  and per-section extras (details block or privacy link) through a small
  `extras` map from section key to node.
- `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/terms/page.tsx` —
  `setRequestLocale`, `generateMetadata`, render `LegalPage`.
- Footer: nav with two links; `LocaleSwitch`/`Header`/`Footer` get `path`.

## Testing

- `LegalPage` render tests (Testing Library, like `WaitlistForm.test.tsx`) in
  both locales: h1, every section title, placeholders marked and draft notice
  shown when details are null; filled details shown, mailto link, no notice.
- Message parity test: `Privacy` and `Terms` in `en.json` and `ar.json` have
  the same keys and the same number of paragraphs/items per section.
- Footer test: links to `/{locale}/privacy/` and `/{locale}/terms/`;
  `LocaleSwitch` with `path` links to the other locale's same page.
- `pnpm build` produces `out/{en,ar}/{privacy,terms}/index.html`; Arabic
  pages have `dir="rtl"`.

## Out of scope

Real operator details, legal review, cookie banner (no cookies), a self-serve
deletion tool, linking the under-form privacy line.
