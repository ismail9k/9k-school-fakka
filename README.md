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

### Production setup (once)

1. `pnpm exec wrangler d1 create fakka-waitlist` and add the printed
   `database_id` to the `d1_databases` entry in `wrangler.jsonc`.
2. Create a Turnstile widget for `fakka.com`; then
   `pnpm exec wrangler secret put TURNSTILE_SECRET_KEY`.
3. Verify `fakka.com` in Resend, create an API key, then
   `pnpm exec wrangler secret put RESEND_API_KEY`. The sender is `EMAIL_FROM`
   in `wrangler.jsonc`.
4. Build and deploy with
   `NEXT_PUBLIC_WAITLIST_ENDPOINT=/api/waitlist NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key> pnpm deploy`.
5. Attach `fakka.com` to the `fakka` Worker as a custom domain.

Change how far each referral moves someone with the `REFERRAL_JUMP` var.
