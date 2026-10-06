This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Waitlist backend

The waitlist API is a Cloudflare Worker (`worker/`) deployed with the static
site. It stores signups in D1, checks visitors with Turnstile and a per-IP rate
limit, and emails each new signup through Resend.

### Local

1. `cp .dev.vars.example .dev.vars` (uses Turnstile's always-pass test secret).
2. Build with the endpoint and Turnstile's always-pass test site key:
   `NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm preview`

### Production setup

Production deploys from CI on every push to `master` (see CI/CD below).
`pnpm run deploy` does the same from your machine.

- The D1 databases already exist (`fakka-waitlist` for production,
  `fakka-waitlist-preview` for previews); their IDs are in `wrangler.jsonc`.
- Turnstile uses Cloudflare's always-pass **test keys** everywhere, because
  this is a demo project: the site key is in `.env.production` and the secret
  is a var in `wrangler.jsonc`. For real bot protection, create a widget, put
  its site key in `.env.production`, delete the `TURNSTILE_SECRET_KEY` var and
  run `pnpm exec wrangler secret put TURNSTILE_SECRET_KEY`.
- No email is sent until a Resend key exists: verify the sender domain in
  Resend, then `pnpm exec wrangler secret put RESEND_API_KEY`. The sender is
  `EMAIL_FROM` in `wrangler.jsonc`.
- The Worker is served at `fakka.<subdomain>.workers.dev`. To use `fakka.com`,
  attach it to the `fakka` Worker as a custom domain (`SITE_URL`, used in
  invite links, already points there).

Change how far each referral moves someone with the `REFERRAL_JUMP` var.

## CI/CD

GitHub Actions (`.github/workflows/ci-cd.yml`):

| Event | What runs |
| --- | --- |
| Pull request | the checks, then a Cloudflare Workers Preview named `pr-<number>`; its URL is commented on the PR |
| Pull request closed | its preview is deleted |
| Push to `develop` | the checks, then a Cloudflare Workers Preview named `develop` |
| Push to `master` | the checks, then the production deploy (`pnpm run deploy` steps, minus migrations) |

Previews share one D1 database (`fakka-waitlist-preview`) and send no emails,
so they never touch production sign-ups.
Pull requests from forks get no secrets, so they run the checks only.

One-time setup: create a Cloudflare API token from the "Edit Cloudflare
Workers" template. Add it and your account ID (`pnpm exec wrangler whoami`) as
repository secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

**D1 migrations are not run by CI**, because the token has no D1 access. When
a change adds a file to `migrations/`, apply it yourself (logged in with
`wrangler login`) before that change deploys:

- preview database, before the PR or `develop` deploy: `pnpm db:migrate:preview`
- production database, before merging into `master`: `pnpm db:migrate:remote`
