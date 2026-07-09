# 🌊 Moment Kart

A water-themed souvenir shop. Customers sign up with email verification, personalise souvenirs
(e.g. a photo frame with a custom name), pay via UPI, and track their orders. Admins manage the
product catalog and fulfil orders.

Vite + React SPA with Vercel serverless functions and Neon Postgres.

## Features

**Customer**
- Email + password signup with a 6-digit verification code sent to email
- Water-themed animated landing page (waves, bubbles)
- Shop with personalisation message on customizable products
- Cart (localStorage), checkout with UPI payment (deep link + UTR reference entry)
- Shipping address saved in profile, editable per-order at checkout
- Order history

**Admin** (emails listed in `ADMIN_EMAILS`)
- Products page: add / edit / delete SKUs, set the customisation prompt, mark out of stock
- Orders page: filter pending / fulfilled, see customer, address, message and UPI reference,
  mark orders fulfilled

## Environment variables (Vercel)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | HMAC secret for auth tokens |
| `ADMIN_EMAIL` | Built-in admin login email — exists by default, no signup needed |
| `ADMIN_PASSWORD` | Built-in admin login password |
| `ADMIN_EMAILS` | Optional: additional admin emails (comma-separated, these sign up normally) |
| `RESEND_API_KEY` | Resend API key for verification emails |
| `EMAIL_FROM` | Sender, e.g. `Moment Kart <hello@yourdomain.com>` |
| `VITE_UPI_ID` | Your UPI id shown at checkout (build-time) |

## Email setup (Resend)

Verification emails are sent via [Resend](https://resend.com) — an HTTP email API, no SMTP
credentials needed.

1. Sign up at [resend.com](https://resend.com)
2. Create a key at [API Keys](https://resend.com/api-keys) ([docs](https://resend.com/docs/dashboard/api-keys/introduction))
   and set it as `RESEND_API_KEY` in Vercel
3. Verify your domain at [Domains](https://resend.com/domains) and set `EMAIL_FROM`
   (e.g. `Moment Kart <hello@yourdomain.com>`)

Until a domain is verified, the default `onboarding@resend.dev` sender only delivers to your
own Resend account email — fine for testing, not for customers. Without `RESEND_API_KEY` set,
the verification code is returned in the API response and shown on screen instead.

## Local development — no backend needed

```bash
npm install
npm run dev
```

In dev mode the whole app runs against **browser localStorage** — no database, no email
provider. Verification codes are shown on screen, and a default admin login comes from
`.env.local`:

```ini
VITE_ADMIN_EMAIL=admin@momentkart.dev
VITE_ADMIN_PASSWORD=admin123
```

In the production build the app talks to the serverless APIs backed by Postgres.

## Deploy

```bash
vercel --prod
```

Tables are created automatically on first API call.
