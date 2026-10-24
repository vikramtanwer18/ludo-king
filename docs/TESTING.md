# Testing

Two suites, both run against a live server.

| Suite | File | What it covers |
|---|---|---|
| API | `tests/api.test.mjs` | 44 tests: email-code login rules, sessions, privacy of `/api/state`, every match rule, timers, settings, notifications |
| Browser | `tests/e2e.py` | 20 checks: every player and admin page on a 360px phone and desktop, home card images, a full two-player match in the UI with a PNG upload, every admin action, a security replay, optional accessibility scan |

## Run

```bash
# 1. start the app (fresh database gives the seeded disputes the admin tests use)
npm run build
DATABASE_URL=postgres://... PORT=3000 npm start      # or leave DATABASE_URL unset for PGlite

# 2. API tests (DATABASE_URL lets 12 extra tests edit rows to check timers, rate limits, suspension)
BASE_URL=http://localhost:3000 DATABASE_URL=postgres://... npm run test:api

# 3. Browser tests
pip install playwright pillow && python -m playwright install chromium
BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:e2e
#   optional: AXE_PATH=node_modules/axe-core/axe.min.js (npm i -D axe-core) for the accessibility scan
#   optional: SHOTS_DIR=./shots to save screenshots
```

### Testing real email delivery

`tests/smtp-capture.mjs` is a local SMTP server that asks for a username and password like Gmail does and saves every message to a JSON file. Both suites read login codes from that file when `MAIL_INBOX` is set, so every login in the tests goes through a real email.

```bash
node tests/smtp-capture.mjs ./inbox.json &
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_SECURE=false SMTP_USER=sender@gmail.com SMTP_PASS="abcd efgh ijkl mnop" PORT=3000 npm start
MAIL_INBOX=./inbox.json BASE_URL=http://localhost:3000 DATABASE_URL=postgres://... npm run test:api
MAIL_INBOX=./inbox.json BASE_URL=http://localhost:3000 npm run test:e2e
```

## Results — 23 Oct 2026 (after the switch to email login)

| Check | Real PostgreSQL 18.4 + real SMTP | Embedded PGlite, demo mode |
|---|---|---|
| TypeScript (`tsc --noEmit`) | pass | — |
| ESLint | no warnings | — |
| Production build | pass | — |
| API suite | **44 / 44** (every code read from the delivered email) | 32 / 32 (12 need `DATABASE_URL`, skipped) |
| Browser suite | **20 / 20** (codes from email, never on screen) | **20 / 20** (codes from the demo box) |
| Login emails delivered | 85, all with SMTP login, code in subject, text and HTML | — |
| Page errors / console errors | 0 | 0 |
| Accessibility (axe, serious + critical) | 0 | — |
| Server errors in log | 0 | 0 |

Also checked by hand against the running app:
- **Migration**: an existing database from the mobile-number version upgrades on start — `otp_codes` replaced by `email_otps`, all 24 demo players get `firstname@example.com`, mobile-only test accounts are kept.
- **Wrong SMTP password**: the player sees "We couldn't send the email…", no code is stored, an immediate retry isn't blocked by the 30-second wait; the server log shows the SMTP error (`535 Username and Password not accepted`).
- **`ALLOWED_EMAIL_DOMAINS=gmail.com`**: `someone@yahoo.com` is refused with "Use an email address ending in @gmail.com."

### What was verified

**Home page**
- The three card images load (Ludo King art on Ludo Classic, Snake Game art on Snakes & Ladders, Coming Soon art on Ludo Popular); Ludo Classic and Snakes & Ladders link to their lobbies; the Coming soon card isn't a link.

**Player login (email code)**
- Malformed emails rejected; email is case- and space-insensitive (same account); 30 s resend cooldown; max 5 codes an hour.
- Code expires after 5 min; 5 wrong tries lock it (right code refused after that); a code works once, even with two requests at the same moment.
- Codes stored hashed; with real email the code never appears in the API response or on screen. New emails must give a name; invalid invite codes rejected; inviter notified.
- Existing emails log in without changing their name.
- Suspended players can't get a code and are signed out on their next request.
- Log out on one device, or on all devices.

**Privacy and access**
- Signed-out state carries no notifications, emails or invite codes; signed-in players never see other players' emails or invite codes.
- Win screenshots are only sent to, and only openable by, the two players (and admins).
- Every `/admin` page redirects to admin login without an admin session; a player session or a player token used as the admin cookie doesn't get in.
- All 13 admin server actions check the admin session; a captured admin action replayed without the cookie had no effect.
- Nobody outside a match can accept, decline, withdraw, delete, set the room code or post a result in it.

**Match rules**
- Max 2 open rooms; closed games can't be used; notes trimmed to 60 characters.
- One join request per room (also when two players ask at the same instant); accept / decline / withdraw / delete with notifications.
- Accepting releases the player's other pending requests; a running match blocks creating or joining another.
- Room code: 8 digits starting with 0, spaces ignored, can be changed, player 2 notified.
- Results: screenshot required for "I won" (JPG/PNG/WebP/GIF only, SVG and non-images rejected, 1.5 MB max), reason required for cancel, one result each.
- won+lost → finished; "I lost" ends it immediately; won+won and won+cancel → disputed; cancel+cancel → cancelled.
- No room code in 5 min → cancelled; opponent silent 15 min → poster's result stands; not yet due → unchanged.

**Admin**
- Wrong password refused; 5 wrong passwords lock the email for 15 min.
- Dashboard, players (sorted by wins and by losses, verified), player detail, matches, disputes, winners, settings, activity log, account — all load on desktop and phone with no sideways scroll.
- Settle a dispute (screenshot opens; winner, note and timeline saved).
- Message one player, broadcast to all — player receives both.
- Announcement banner, turning a game off and maintenance mode all reach the player app within seconds; maintenance blocks new rooms and joins but live matches can finish.
- Suspend → player is signed out and can't log in; lift; rename.
- Activity log shows each action; password change (wrong current, too short, no number, success, sign back in with the new password).

### Bugs found and fixed during testing

| Issue | Fix |
|---|---|
| Home game card links had an `aria-label` that didn't match their visible text (screen readers and voice control) | Label removed; images marked decorative since the card text names the game |
| Wrong OTP tries weren't counted (the count was rolled back with the failed request), so there was no lockout | Count is now saved before the error; code is consumed atomically on success |
| "Open full size" on screenshots didn't work: browsers block opening `data:` URLs in a new tab | New `/api/screenshot/[match]/[player]` route, allowed only for the two players and admins, served with a no-script CSP |
| SVG images were accepted as win screenshots | Only JPG, PNG, WebP and GIF are accepted |
| Low colour contrast on green/red buttons, status badges, WhatsApp/Telegram buttons and game-card labels; terms links not underlined; three admin inputs without labels | Darker green/red/blue, separate dark text shade for light badges, links underlined, labels added — axe now reports 0 serious issues |
| Suspended players still counted as "active last 7 days" on the dashboard | Excluded |

### Not covered by these tests
- Delivery through Gmail's own servers (this environment can't reach them); the same SMTP code was verified against a local server that requires a login the way Gmail does. Send one test code after adding your Gmail app password.
- Load and performance under many concurrent players.
- Ludo King itself; the app only stores the room code players type in.
