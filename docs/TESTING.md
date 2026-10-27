# Testing

| Suite | File | What it covers |
|---|---|---|
| API | `tests/api.test.mjs` | Login codes, sessions, rooms and join requests, room codes, results and timers, disputes, settings, suspension, profile, notifications, and the wallet: deposits, stakes held/refunded, winner payout with commission, KYC validation, withdrawals, Razorpay webhook signature and de-duplication |
| Browser | `tests/e2e.py` | Every player and admin page on a 360 px phone and on desktop, a full two-player match in the UI with a screenshot upload, admin actions, optional accessibility scan |

## Setup

Both suites need a **development** server **without** Resend and Razorpay keys, so login codes come back in the response and payments use the demo "Simulate payment" flow. Rate limits are off in development.

```bash
docker compose --profile local-db up -d db                # local PostgreSQL on localhost:5433 (never test against production RDS)
RESEND_API_KEY= RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET=whsec_test npm run dev
```

Use a separate database for tests if you have data you care about (`DATABASE_URL=…/goti_test`).

## API tests

```bash
BASE_URL=http://localhost:3000 DATABASE_URL=postgres://goti:<password>@localhost:5433/goti_rooms \
WEBHOOK_SECRET=whsec_test npm run test:api
```

- With `DATABASE_URL` (the same database as the server) the suite also tests timers, settings, rate limits on codes and suspension by editing rows directly; without it those tests are skipped.
- `WEBHOOK_SECRET` must equal the server's `RAZORPAY_WEBHOOK_SECRET` to run the webhook test.

## Browser tests

```bash
pip install playwright pillow && python -m playwright install chromium
npm run db:seed                                           # on a fresh database
BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... python tests/e2e.py
```

Optional: `AXE_PATH=path/to/axe.min.js` for an accessibility scan, `SHOTS_DIR=./shots` to save screenshots. Results are also written to `e2e-report.json`.

## Before each release

```bash
npm run lint && npm run typecheck && npm run build
docker compose build
```
