# 🌊 Moment Kart

A water-themed souvenir shop: customers personalise keepsakes, pay via UPI, and track orders. A single admin manages the catalog, orders, and reviews. Vite + React SPA with Vercel serverless functions and Neon Postgres.

## Environment variables

Same names in `.env.local` (dev) and the Vercel dashboard (production):

| Variable | Purpose |
| --- | --- |
| `APP_NAME` | Shop display name (defaults to `Moment Kart`) |
| `ADMIN_EMAIL` | Admin login email — also the sender of all outgoing email |
| `ADMIN_PASSWORD` | Admin login password |
| `ADMIN_UPI_ID` | UPI id shown at checkout (embedded at build time) |
| `DATABASE_URL` | Set automatically by Vercel when the Neon database is attached |
| `AUTH_SECRET` | Set automatically by Vercel |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key for verification and shipping emails |

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. Dev mode stores everything in localStorage — no database needed. With `RESEND_API_KEY` in `.env.local`, verification and shipping emails are sent for real.

## Email (Resend)

Until a domain is verified, Resend's sandbox only delivers to your own Resend account email — sends to any other address fail with a 403 `validation_error`.

To email real customers, verify a domain:

1. Add your domain at [resend.com/domains](https://resend.com/domains)
2. Add the DNS records Resend shows (DKIM + SPF) at your domain registrar and wait for the status to turn **Verified** (minutes to a few hours)
3. Set `ADMIN_EMAIL` to an address on that domain (e.g. `orders@yourdomain.com`) — it is the sender of all emails

A gmail.com address can never be a sender; while `ADMIN_EMAIL` is on an unverified domain, the app automatically falls back to Resend's shared sender (`onboarding@resend.dev`, sandbox rules apply) with `ADMIN_EMAIL` as reply-to.

Verification codes (OTPs) are always recoverable from logs, never shown in the UI:

- Local: the `npm run dev` terminal and `app.log` (rolls over at 5 MB, keeps 3 old files)
- Production: Vercel function logs (`verification_code_issued`)

## Home page carousel

Drop images into `src/assets/carousel/` — they are shown in the "Signature Pieces" carousel in numeric filename order.

## Notes

Database tables are created automatically on first API call. Env var changes in Vercel require a redeploy.
