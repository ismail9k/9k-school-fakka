# AGENTS.md

Canonical instruction file for this repository, shared by all coding agents
(Claude Code, Codex, Cursor, and others). Claude Code reaches it through the
`@AGENTS.md` import in `CLAUDE.md`. Repository guidance belongs here, while
tool-specific pointer files contain no duplicate guidance.

## Project knowledge

<!--
Keep this under a page so stale context does not burden every session. When an
agent makes the same mistake twice, record the correction here.
-->

Fakka (فكّة) is the bilingual (Arabic/English) launch and waitlist page for an
upcoming personal-expense app. `docs/faka-product-brief.md` defines scope, voice,
typography, and privacy rules; when a request disagrees with it, ask before acting.

### Commands

Package manager is pnpm (`pnpm-workspace.yaml` allowlists which deps may run build scripts).

- Dev server: `pnpm dev`
- Build: `pnpm build` (static export to `./out`)
- Preview on the Workers runtime: `pnpm preview` (build + local D1 migrations + `wrangler dev`).
  Copy `.dev.vars.example` to `.dev.vars` first.
- Deploy: `pnpm run deploy` (release env check + build + remote D1 migrations + `wrangler deploy`).
  The check needs `NEXT_PUBLIC_WAITLIST_ENDPOINT` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  (environment or the committed `.env.production`).
- D1 migrations alone: `pnpm db:migrate:local` / `pnpm db:migrate:remote` (SQL in `migrations/`)
- Lint: `pnpm lint`
- Test: `pnpm test` (Vitest + Testing Library, jsdom). Watch mode: `pnpm test:watch`.
  Tests sit next to the code they cover (`*.test.ts(x)`). Worker tests (`worker/*.test.ts`)
  run in the node environment against in-memory SQLite (`worker/test/sqlite-d1.ts`).

### Architecture

- **Static site plus one API Worker.** `next.config.ts` sets `output: "export"`,
  `trailingSlash: true`, and unoptimized images, so Next has no server at
  runtime: no middleware, route handlers, server actions, or `next/image`
  optimization. Cloudflare serves `./out` as static assets; `wrangler.jsonc`
  also runs `worker/index.ts` for `/api/*` only (`assets.run_worker_first`).
- **Waitlist backend (`worker/`).** `POST /api/waitlist` takes
  `{ name, email, locale, ref, turnstileToken }` and returns
  `200 { position, inviteUrl }` (400/403/404/405/429/500 with `{ error }`; 404 is an unknown `/api` path, 405 a non-POST). Order:
  per-IP rate limit (`WAITLIST_LIMITER`), validation, Turnstile siteverify,
  then D1 (`DB`, table `signups`). Same email (normalized by
  `worker/email-key.ts`) returns the existing place. Score = join order −
  `REFERRAL_JUMP` × referrals, earlier join wins ties. The Resend confirmation
  email is sent in `ctx.waitUntil` and never fails a signup; its copy is the
  `Email` namespace in `messages/*.json`. Vars live in `wrangler.jsonc`;
  secrets are `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY`. Store only what
  the brief's Privacy section allows. Binding types are hand-written in
  `worker/env.ts` (the root tsconfig uses the DOM lib).
- **Waitlist form.** Posts to `NEXT_PUBLIC_WAITLIST_ENDPOINT` (`/api/waitlist`)
  with a token from the Turnstile widget (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`);
  both are inlined at build time (`src/lib/waitlist.ts`). Without the endpoint,
  `pnpm dev` uses a local stub; production builds missing either value show
  the form as disabled ("Sign-ups open very soon"). Invite links carry
  `?ref=`; the root `/` redirect keeps the query string.
- **i18n via next-intl without middleware.** Locales live in `src/i18n/routing.ts`
  (`en` default, `ar`; `rtlLocales` drives `dir`). Messages are `messages/{locale}.json`,
  loaded by `src/i18n/request.ts`. Every page under `src/app/[locale]/` must call
  `setRequestLocale(locale)` for static rendering, and the layout's
  `generateStaticParams` emits one tree per locale.
- **Layout split.** `src/app/layout.tsx` is a pass-through; `<html lang dir>` is
  rendered in `src/app/[locale]/layout.tsx`. Pages outside `[locale]`
  (`src/app/page.tsx`, `src/app/not-found.tsx`) render their own `<html>`.
  The root `/` page redirects in the browser based on `navigator.language`.
- **Privacy and Terms.** `/{locale}/privacy/` and `/{locale}/terms/` render
  `src/components/legal/*` from the `Legal`, `Privacy`, and `Terms` message
  namespaces. Operator name, contact email, and governing law live in
  `src/lib/legal.ts` (`null` = marked placeholder plus a draft notice); bump
  `LEGAL_LAST_UPDATED` when the copy changes.
- Internal links use trailing-slash locale paths (`/en/`, `/ar/`).
- Path alias `@/*` → `src/*`. Styling is Tailwind CSS v4 (`src/app/globals.css`).

### Conventions

- Add every user-facing string to both `messages/en.json` and `messages/ar.json`,
  written naturally for each language (not word-for-word), per the brief's voice rules.
- Layouts must work in RTL; prefer logical Tailwind utilities (`ms-`, `pe-`, `start-`)
  over `ml-`/`pr-`/`left-`.

### Things agents get wrong

- Next.js here is 16.x with breaking changes from older versions; see the managed
  block below and check the bundled docs before using an API.
- `pnpm deploy` is pnpm's built-in workspace command; use `pnpm run deploy`.
- `next dev` re-inserts the managed block below if it is missing. Keep it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
