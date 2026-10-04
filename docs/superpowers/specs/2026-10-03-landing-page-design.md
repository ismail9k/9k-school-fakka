# Landing page design

Date: 2026-10-03
Status: approved in brainstorming, awaiting spec review
Source of truth for scope and voice: `docs/faka-product-brief.md`

## Goal

Replace the placeholder home page (`src/app/[locale]/page.tsx`) with the Fakka launch page: a bilingual (English, Egyptian Arabic RTL) static page that explains Fakka within the first phone screen and collects waitlist signups.

Success for this piece of work:

- Both `/en/` and `/ar/` render all sections, correctly in LTR and RTL, from a static export (`pnpm build`).
- On a ~390×700 phone viewport, the hero alone states what Fakka does, who it is for, and offers the join action.
- The waitlist form submits to a configurable endpoint and shows queue position plus invite link on success.
- No copy promises a date, price, or feature outside the brief.

## Out of scope

- The waitlist backend (storage, queue position, invite crediting, email sending, dedupe, real bot protection). It is a separate project that must satisfy the API contract below.
- Dark mode.
- Illustrations or a designed logo. The wordmark is type only; hero coins are CSS shapes.
- Analytics.

## Page structure

`src/app/[locale]/page.tsx` stays a thin server component: it calls `setRequestLocale(locale)` and renders, in order:

| # | Component | Purpose |
|---|-----------|---------|
| 0 | `Header` | Wordmark (start side), `LocaleSwitch` (end side). |
| 1 | `Hero` | Headline, one supporting line, button linking to `#join`, reassurance line, decorative CSS coins (hidden on phones). |
| 2 | `Features` | Three cards: add an expense in seconds; see your month (how much, on what); made for Egypt (EGP, Arabic or English). |
| 3 | `WaitlistForm` | Section `id="join"`. The only client component. See below. |
| 4 | `Faq` | 4–5 native `<details>` items. No JS. |
| 5 | `NextSteps` | "Coming soon": three steps (join, invite friends, get your invite by email) and a second link to `#join`. |
| 6 | `Footer` | Wordmark, one-line privacy promise, `LocaleSwitch`, year. |

Files live in `src/components/landing/`, one component per file. `LocaleSwitch` is shared by `Header` and `Footer`; it links to the other locale's root (`/ar/` or `/en/`) with `hrefLang`. Every section except `WaitlistForm` is a server component that reads its strings with `useTranslations("<Section>")`.

## Visual design

Reference mockup: `.superpowers/brainstorm/*/content/page-sections-v2.html` (local, not committed).

**Colour tokens** (added to `@theme inline` in `src/app/globals.css`; existing dark-mode override removed):

| Token | Value | Use |
|-------|-------|-----|
| `paper` | `#F7F2E9` | Page background |
| `ink` | `#1F1A15` | Body text |
| `ink-soft` | `#5E554B` | Secondary text |
| `line` | `#E0D4BF` | Dividers, FAQ borders |
| `green` | `#166434` | Main colour: primary buttons, kickers, icons, step numbers, hero highlight word, form band background |
| `green-deep` | `#0F4A26` | Hover/active of green elements |
| `green-tint` | `#E3EEE5` | Feature card background |
| `gold` | `#E9B866` | Only on the green form band: Join button, position number, copy button |

Contrast: green on paper ≈ 6.5:1, white on green ≈ 7:1 (both pass WCAG AA for body text).

**Type**

- English: IBM Plex Sans via `next/font/google` (400, 500, 600). Headings use 600.
- Arabic: Thmanyah via `next/font/local`, files copied into `src/fonts/thmanyah/`:
  - `thmanyahsans-Regular.woff2` (400): all Arabic body text.
  - `thmanyahserifdisplay-Bold.woff2` (700): Arabic headings, card titles, buttons.
  - No Medium/Bold Sans exists, so Arabic must never request a synthetic bold: anything emphasised in Arabic uses Serif Display.
- Inter and IBM Plex Sans Arabic are removed from `src/app/[locale]/layout.tsx`.
- `globals.css` exposes `--font-sans` (Plex) and, under `html:lang(ar)`, swaps body to Thmanyah Sans; a `font-display` utility maps to Plex 600 in English and Thmanyah Serif Display in Arabic.

**Layout**

- Single column on phones; hero is two columns (text + coins) from `md` up; feature cards and steps are three columns from `md` up.
- Logical utilities only (`ms-`, `pe-`, `start-`, `text-start`) so RTL needs no overrides.
- Email inputs and invite links are always `dir="ltr"`.

## Waitlist form

**Fields**

- `name`: required, trimmed, max 80 characters.
- `email`: required, `type="email"`, trimmed, `dir="ltr"`.
- `website`: honeypot, visually hidden, `tabIndex={-1}`, `autoComplete="off"`. If filled, no request is sent and the form stays in `idle`.
- `ref`: not a visible field; read from `?ref=` in `window.location.search` on mount.

**Request** to `process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT`:

```
POST <endpoint>
Content-Type: application/json

{ "name": string, "email": string, "locale": "en" | "ar", "ref": string | null }
```

**Expected response** (contract for the backend project):

```
200 { "position": number, "inviteUrl": string }
```

A repeat email returns 200 with that person's existing position. Any non-2xx response, a malformed body, or a network failure is treated as a generic error.

**States**

| State | UI |
|-------|----|
| `idle` | Form enabled. |
| `submitting` | Button shows "Joining…" / "ثانية واحدة…", inputs disabled. |
| `success` | Form replaced by "You're #N" (number via `Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en")`), invite explanation, invite link, Copy button. |
| `error` | Inline message "Something went wrong. Please try again." with form still enabled. |
| `unavailable` | Endpoint not configured in a production build: inputs and button disabled, line "Sign-ups open very soon." |

Field-level validation uses the browser's built-in constraint validation (`required`, `type="email"`, `maxLength`), with messages in the page language via `setCustomValidity`.

**Copy button**: `navigator.clipboard.writeText(inviteUrl)`; on success the label switches to "Copied" for 2 s; if the API is missing or throws, the link text is selected so the user can copy it manually.

**Endpoint stub**: when `NEXT_PUBLIC_WAITLIST_ENDPOINT` is unset and `process.env.NODE_ENV === "development"`, a local `submitToStub()` resolves after ~600 ms with a random position and `https://example.com/<locale>/?ref=demo123`. The submit logic lives in `src/lib/waitlist.ts` (`submitWaitlist(input): Promise<{position, inviteUrl}>`), so the component never knows whether it hit the stub.

## Copy

All strings live in `messages/en.json` and `messages/ar.json` under namespaces `Header`, `Hero`, `Features`, `Waitlist`, `Faq`, `NextSteps`, `Footer` (plus the existing `Metadata`). The old `Home` namespace is removed. Arabic is written in natural Egyptian Arabic, not translated word for word. The mockup's draft copy is the starting point; final wording is reviewed in the browser during implementation.

FAQ questions (answers draw only on the brief):

1. What is Fakka?
2. Who is it for?
3. When does it launch? (Not decided yet. Join to hear first.)
4. How does the queue work? (Your place, your invite link, each friend who joins moves you up, each friend counts once.)
5. What do you do with my data? (Only name, email, language, join time, who invited whom; never shared or sold; launch emails only.)

## Testing

- Add Vitest, `@testing-library/react`, `@testing-library/user-event`, and `jsdom`; add a `test` script to `package.json`, and update `AGENTS.md` (Commands) accordingly.
- Unit tests for `src/lib/waitlist.ts`: sends the right body, parses a valid response, rejects on non-2xx / malformed body / network error, uses the stub only in development without an endpoint.
- Component tests for `WaitlistForm` (with `NextIntlClientProvider` and English messages): submitting → success shows position and link; error state on failure; `ref` from the URL is sent; honeypot blocks the request; `unavailable` state when no endpoint in production; copy button.
- Static sections: verified by `pnpm build`, `pnpm lint`, and a manual check of `/en/` and `/ar/` at phone and desktop widths.

## Housekeeping

- Add `.superpowers/` to `.gitignore`.
- Document `NEXT_PUBLIC_WAITLIST_ENDPOINT` in `AGENTS.md`.
