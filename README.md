# 🌊 Moment Kart

A water-themed souvenir shop. Customers sign up with email verification, personalise souvenirs
(e.g. a photo frame with a custom name), pay via UPI, and track their orders. A single admin
manages the catalog, orders, and reviews.

Vite + React SPA with Vercel serverless functions and Neon Postgres.

## Features

### Customer

- Email + password signup with a 6-digit verification code sent to email
- Elegant water-themed landing page: animated waves, image carousel, featured reviews
- Shop with personalisation message on customizable products
- Product reviews (visible after admin approval)
- Cart (localStorage), checkout with UPI payment — QR code, deep link, UTR reference entry
- Multiple saved shipping addresses, selectable and editable per-order at checkout
- Order history with courier + tracking ID once shipped

### Admin (login defined by `ADMIN_EMAIL` / `ADMIN_PASSWORD` — no signup needed)

- Products: add / edit / delete SKUs, upload images (auto-cropped 4:3 and compressed),
  set the customisation prompt, mark out of stock
- Orders: pending → shipped (courier + tracking ID, defaults to Bluedart) → fulfilled
- Reviews: approve / unapprove / delete; feature selected reviews on the home page

## Environment variables

Same names in `.env.local` (dev) and the Vercel dashboard (production):

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Admin login email — the account exists by default, no signup needed |
| `ADMIN_PASSWORD` | Admin login password |
| `ADMIN_UPI_ID` | UPI id shown at checkout (embedded at build time) |
| `DATABASE_URL` | Neon Postgres connection string (production only) |
| `AUTH_SECRET` | HMAC secret for auth tokens (production only) |
| `RESEND_API_KEY` | Resend API key for verification emails (production only) |
| `EMAIL_FROM` | Sender, e.g. `Moment Kart <hello@yourdomain.com>` |
| `ALLOW_DEV_OTP` | Set `true` to show OTP on screen in production before Resend is set up. Remove for launch! |

## Email setup (Resend)

Verification emails are sent via [Resend](https://resend.com) — an HTTP email API, no SMTP
credentials needed.

1. Sign up at [resend.com](https://resend.com)
2. Create a key at [API Keys](https://resend.com/api-keys)
   ([docs](https://resend.com/docs/dashboard/api-keys/introduction))
   and set it as `RESEND_API_KEY` in Vercel
3. Verify your domain at [Domains](https://resend.com/domains) and set `EMAIL_FROM`
   (e.g. `Moment Kart <hello@yourdomain.com>`)

Until a domain is verified, the default `onboarding@resend.dev` sender only delivers to your
own Resend account email — fine for testing, not for customers. In production without
`RESEND_API_KEY`, signup is disabled unless `ALLOW_DEV_OTP=true` is set.

## Local development

There is no offline/dev mode — the app always talks to the serverless APIs and Postgres,
locally and in production alike. Run both the API and the Vite dev server together:

```bash
npm install
vercel dev          # serves api/* + Postgres on :3000
npm run dev          # Vite dev server with HMR on :5173, proxies /api to :3000
```

Open `http://localhost:5173`. `vercel dev` reads `DATABASE_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, etc. from `.env.local` just like production reads them from the Vercel
dashboard. Without `RESEND_API_KEY`, verification codes are returned in the API response
and shown on screen (same fallback as production unless `ALLOW_DEV_OTP` is unset there).

## Home page carousel

Drop images into `src/assets/carousel/` — they are bundled automatically and shown in the
"Signature Pieces" carousel in numeric filename order.

## Notes

Database tables are created automatically on first API call. Env var changes in Vercel
require a redeploy to take effect.
