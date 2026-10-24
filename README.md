# Goti Rooms

Free Ludo matchmaking for friends, with an admin panel: create a room, accept a player, share a Ludo King room code, post who won. No money, wallet or payments of any kind.

Full page-by-page flow: [docs/FLOW.md](docs/FLOW.md)

## Run locally (no database setup)

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) stored in `./.pglite`, with 24 demo players, about 30 days of matches, a few disputes, live matches and open rooms.

**Player login:** with an email address. A 6-digit code is emailed to the player. Until you set up email (below), the app runs in demo mode and shows the code on screen instead. Seeded players use `aarav@example.com`, `meera@example.com` … (first name + `@example.com`).

**Admin:** http://localhost:3000/admin — email and password come from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (see `.env.example`). Change the password from *My account* after first sign-in.

**Two players on one computer:** use a normal window and a private/incognito window (or two browsers), log in with different emails.

## Send login codes by email (Resend)

1. Create an account at [resend.com](https://resend.com), add and verify your sending domain.
2. Create an API key.
3. In `.env.local`:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   EMAIL_FROM=Goti Rooms <noreply@yourdomain.com>
   ```
4. Restart the app. Codes now arrive by email and are no longer shown on screen.

To accept only Gmail addresses at sign-up, set `ALLOWED_EMAIL_DOMAINS=gmail.com`.

## Use your Postgres

```bash
cp .env.example .env.local   # set DATABASE_URL
npm run build && npm start
```

Tables are created on first start from `db/schema.sql` (safe to re-run). You can also apply it yourself: `psql "$DATABASE_URL" -f db/schema.sql`.

| Env | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string. If unset, embedded PGlite is used. |
| `PGSSL` | — | `true` for hosted Postgres that needs SSL (Neon, Supabase, RDS). |
| `AUTH_SECRET` | dev value | Long random string used to hash OTPs. **Set in production.** |
| `RESEND_API_KEY` | — | Resend API key for login-code emails. Without it: demo mode, code shown on screen. |
| `EMAIL_FROM` | `Goti Rooms <onboarding@resend.dev>` | Sender shown in the inbox. Its domain must be verified in Resend. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | — | Razorpay API keys for UPI QR top-ups. Without them: demo "Simulate payment" in development, adding cash off in production. |
| `RAZORPAY_WEBHOOK_SECRET` | — | Secret of the Razorpay webhook pointing at `/api/webhooks/razorpay` (events `qr_code.credited`, `qr_code.closed`, `payment.failed`). |
| `ALLOWED_EMAIL_DOMAINS` | — | e.g. `gmail.com` to only accept Gmail addresses. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | see `.env.example` | First admin, created on start if that email doesn't exist. |
| `APP_TIMEZONE` | `Asia/Kolkata` | Time zone for dates in the admin panel. |
| `SEED_DEMO` | `true` | `false` starts with an empty database. |

## Where things are

| Path | What |
|---|---|
| `src/server/logic.ts` | Match rules: rooms, join/accept, room code, results, timers |
| `src/server/auth.ts` | Player email-code login, sessions, admin login, audit log |
| `src/server/mail.ts` | Sends the login code email (SMTP) |
| `public/games/` | Home page card images (WebP, 640 and 1280 px) |
| `src/server/admin.ts` | Admin queries: dashboard, players, matches, winners |
| `src/app/admin/*` | Admin pages and server actions |
| `src/server/db.ts` | Postgres / PGlite connection, schema bootstrap |
| `db/schema.sql` | Tables |
| `src/app/api/*` | API routes |
| `src/lib/store.ts` | Client state, polls `/api/state` every 3 s |
| `src/lib/config.ts` | App name, support links, games, timers, cancel reasons |
| `src/app/*` | Pages |

## Tests

44 API tests and 20 browser checks, all passing on real PostgreSQL with real email delivery, and on PGlite in demo mode. How to run them and what they cover: [docs/TESTING.md](docs/TESTING.md).
