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
- Preview on the Workers runtime: `pnpm preview` (build + `wrangler dev`)
- Deploy: `pnpm deploy` (build + `wrangler deploy`)
- Lint: `pnpm lint`
- Test: `pnpm test` (Vitest + Testing Library, jsdom). Watch mode: `pnpm test:watch`.
  Tests sit next to the code they cover (`*.test.ts(x)`).

### Architecture

- **Fully static.** `next.config.ts` sets `output: "export"`, `trailingSlash: true`,
  and unoptimized images; Cloudflare Workers serves `./out` as static assets
  (`wrangler.jsonc`, no Worker script). There is no server at runtime: no
  middleware, route handlers, server actions, or `next/image` optimization.
  Anything dynamic (e.g. the waitlist) needs a separate backend.
- **Waitlist endpoint.** The form posts `{ name, email, locale, ref }` to
  `NEXT_PUBLIC_WAITLIST_ENDPOINT` and expects `200 { position, inviteUrl }`
  (`src/lib/waitlist.ts`). The value is inlined at build time. Without it,
  `pnpm dev` uses a local stub and production builds show the form as disabled
  ("Sign-ups open very soon"). Invite links carry `?ref=`; the root `/` redirect
  keeps the query string.
- **i18n via next-intl without middleware.** Locales live in `src/i18n/routing.ts`
  (`en` default, `ar`; `rtlLocales` drives `dir`). Messages are `messages/{locale}.json`,
  loaded by `src/i18n/request.ts`. Every page under `src/app/[locale]/` must call
  `setRequestLocale(locale)` for static rendering, and the layout's
  `generateStaticParams` emits one tree per locale.
- **Layout split.** `src/app/layout.tsx` is a pass-through; `<html lang dir>` is
  rendered in `src/app/[locale]/layout.tsx`. Pages outside `[locale]`
  (`src/app/page.tsx`, `src/app/not-found.tsx`) render their own `<html>`.
  The root `/` page redirects in the browser based on `navigator.language`.
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
- `next dev` re-inserts the managed block below if it is missing. Keep it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
