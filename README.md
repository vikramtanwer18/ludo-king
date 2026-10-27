# Goti Rooms

Ludo matchmaking with a wallet and an admin panel. Players create a room with an entry amount, accept an opponent, share a Ludo King room code and post who won; the winner gets the pot minus a platform commission. Cash is added with a Razorpay UPI QR and withdrawn after KYC, with every withdrawal reviewed by an admin.

Full page-by-page flow: [docs/FLOW.md](docs/FLOW.md)

**Stack:** Next.js 16 (App Router) · React 19 · PostgreSQL on AWS RDS · Resend (email) · Razorpay (UPI QR) · Docker.

## Run in production (Docker)

Needs Docker Engine + Compose (or Docker Desktop) and an **AWS RDS for PostgreSQL** database.

```bash
cp .env.example .env           # fill in every REQUIRED value, incl. DATABASE_URL = your RDS endpoint
docker compose up -d --build   # app on http://localhost:3000, connected to RDS
docker compose logs -f app
```

### AWS RDS

1. **Create the database** (RDS → Create database → PostgreSQL 16 or newer). Note the master username/password; create the initial database name (e.g. `goti_rooms`).
2. **Network:** the RDS security group must allow inbound TCP 5432 **from the app server only** (its security group or IP). Keep "Publicly accessible" off when the app runs in the same VPC (EC2/ECS); if you must connect from outside AWS, allow only that server's IP.
3. **`.env`:** `DATABASE_URL=postgres://USER:PASSWORD@<endpoint>.rds.amazonaws.com:5432/goti_rooms` — the endpoint is under *Connectivity & security*. URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`).
4. **SSL** is automatic for `*.rds.amazonaws.com`: connections are encrypted and the server certificate is verified against Amazon's CA bundle shipped in `certs/rds-global-bundle.pem` (refresh it from <https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem> if AWS rotates CAs). Don't add `sslmode` to the URL; it's ignored.
5. **Start:** the container creates the tables (migrations) and the first admin on the empty database.
6. **Connections:** each app instance opens up to `PG_POOL_MAX` (default 10). Keep *instances × PG_POOL_MAX* well below the instance's `max_connections` (≈ 80 on db.t3.micro, ≈ 180 on db.t3.small).
7. **Backups:** turn on automated backups (7+ days) and deletion protection; Multi-AZ for production uptime.

Move data from the local Docker database to RDS (optional):

```bash
docker compose --profile local-db up -d db
docker compose exec -T db pg_dump -U goti --no-owner --no-acl goti_rooms > local.sql
psql "postgres://USER:PASSWORD@<endpoint>.rds.amazonaws.com:5432/goti_rooms?sslmode=require" -f local.sql   # into an EMPTY RDS database
```


On every start the container applies new database migrations (`db/migrations`), creates the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if it doesn't exist, then starts the server. The server **refuses to start** if a required setting is missing or still a placeholder, and says which.

Before going live:

1. **HTTPS.** Put the app behind a reverse proxy or load balancer with TLS (nginx, Caddy, Cloudflare, a cloud load balancer). Login cookies are HTTPS-only in production. The proxy must pass `X-Forwarded-For` (used for rate limits).
2. **Razorpay webhook** → `https://<your-domain>/api/webhooks/razorpay`, events `qr_code.credited`, `qr_code.closed`, `payment.failed`, secret = `RAZORPAY_WEBHOOK_SECRET`. Switch to live keys (`rzp_live_…`) when you're ready.
3. **Resend:** verify the domain of `EMAIL_FROM`.
4. **Support contacts** and the **Terms / Privacy** text: `src/lib/config.ts`, `src/app/terms`, `src/app/privacy`.
5. **RDS backups** turned on (see above).

Useful:

```bash
docker compose ps                  # app health
docker compose down                # stop the app (data lives in RDS)
```

`GET /api/health` returns `{"ok":true}` when the app can reach the database (used by the Docker health check).

**Without Compose** (e.g. ECS or another host): `docker build -t goti-rooms .` then `docker run -p 3000:3000 --env-file .env goti-rooms`.

## Develop locally

Needs Node.js 22.9+ and Docker (for PostgreSQL).

```bash
npm install
cp .env.example .env               # AUTH_SECRET, ADMIN_*, and a DATABASE_URL (RDS dev database, or the local one below)
docker compose --profile local-db up -d db   # optional local PostgreSQL on localhost:5433
#   DATABASE_URL=postgres://goti:<POSTGRES_PASSWORD>@localhost:5433/goti_rooms
npm run dev                        # migrates, then http://localhost:3000
npm run db:seed                    # optional: 24 demo players and a month of matches (empty database only)
```

In development, if `RESEND_API_KEY` is empty the login code is shown on screen, and if the Razorpay keys are empty the wallet shows a **Simulate payment** button. Neither shortcut exists in production.

- **Admin:** http://localhost:3000/admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Change the password in *My account* after the first sign-in.
- **Two players on one computer:** a normal and a private window, different emails.
- Demo players log in as `aarav@example.com`, `meera@example.com`, … (first name + `@example.com`).

| Command | What |
|---|---|
| `npm run dev` | Migrate, then the development server |
| `npm run build` / `npm start` | Production build / migrate + start the built server (without Docker) |
| `npm run db:migrate` | Apply new migrations, create the first admin |
| `npm run db:seed` | Demo data (development only, empty database only) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run test:api` / `npm run test:e2e` | API tests / browser tests ([docs/TESTING.md](docs/TESTING.md)) |

**Changing the database:** add a new file `db/migrations/002_<what>.sql`. Each file runs once, in order, inside a transaction; never edit a file that has already run in production.

## Settings (`.env`)

| Env | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | AWS RDS PostgreSQL connection string. SSL with certificate checks is automatic for RDS. |
| `POSTGRES_PASSWORD` | — | Password of the optional local development database. |
| `PG_POOL_MAX` | — | Connections per app instance (default 10). |
| `PGSSL` / `PGSSL_CA_FILE` / `PGSSL_REJECT_UNAUTHORIZED` | — | SSL for non-RDS hosts; RDS is handled automatically. |
| `AUTH_SECRET` | yes | 32+ random characters (`openssl rand -base64 48`). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | first run | First admin, created by the migration if that email isn't an admin yet. Never overwrites an existing password. |
| `RESEND_API_KEY` / `EMAIL_FROM` | yes | Login-code emails. The sender's domain must be verified in Resend. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | for payments | UPI QR top-ups. Without them adding cash is off. |
| `RAZORPAY_WEBHOOK_SECRET` | with keys | Webhook signature secret. |
| `ALLOWED_EMAIL_DOMAINS` | — | e.g. `gmail.com` to only accept Gmail addresses. |
| `APP_TIMEZONE` | — | Time zone for admin dates (default `Asia/Kolkata`). |
| `INSECURE_COOKIES` | — | `true` only when serving over plain http on something other than localhost. |
| `RATE_LIMITS` | — | Rate limits are on in production; `off` only for load tests. |
| `APP_PORT` / `DB_PORT` | — | Host ports for Compose (default 3000 / 5433; the database port is bound to localhost only). |

## Security built in

- Email one-time codes, hashed with `AUTH_SECRET`; 5 tries per code, 5 codes an hour per email.
- Rate limits per IP (login codes, logins, admin sign-in) and per player (actions, wallet), stored in PostgreSQL so they hold across instances.
- Admin passwords hashed with scrypt; 5 wrong passwords lock the email for 15 minutes.
- httpOnly, SameSite cookies, HTTPS-only in production; security headers (HSTS, nosniff, frame-deny, referrer policy).
- Every wallet change in one transaction with a ledger row; balances can't go below zero (database check).
- Razorpay webhooks verified by signature, stored once by event id, payments credited at most once.
- Admin actions written to the activity log.

## Where things are

| Path | What |
|---|---|
| `src/server/logic.ts` | Match rules: rooms, join/accept, room code, results, timers, stakes |
| `src/server/wallet.ts` | Wallet ledger, deposits, Razorpay webhook handling, KYC, withdrawals |
| `src/server/razorpay.ts` | Razorpay API client and webhook signature check |
| `src/server/auth.ts` | Player email-code login, sessions, admin login, audit log |
| `src/server/mail.ts` | Login-code email (Resend) |
| `src/server/db.ts`, `scripts/pg-config.mjs` | PostgreSQL pool; connection and SSL settings (RDS) |
| `src/server/env.ts` | Startup check of the settings |
| `src/server/ratelimit.ts` | Rate limits |
| `src/server/admin.ts`, `adminWallet.ts` | Admin queries |
| `src/app/admin/*` | Admin pages and server actions |
| `src/app/api/*` | API routes (`/api/webhooks/razorpay`, `/api/wallet`, `/api/health`, …) |
| `db/migrations/` | Database schema, one file per change |
| `scripts/` | `migrate.mjs`, `seed-demo.mjs`, `pg-config.mjs` |
| `certs/rds-global-bundle.pem` | AWS RDS certificate authorities (public) |
| `src/lib/config.ts` | App name, support links, games, wallet limits, timers |
