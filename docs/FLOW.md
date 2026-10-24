# Goti Rooms — App flow and functionality

Player app at `/`, admin panel at `/admin`, both in the same Next.js project.

An app where friends find each other for a Ludo match, share a Ludo King room code, and record who won. Each room has an **entry amount** paid from the player's **wallet**; the winner gets the pot minus a platform commission. Players add cash with a **Razorpay UPI QR** and withdraw after **KYC**, with every withdrawal reviewed by an admin (see section 16).

- **Stack:** Next.js 14 (App Router) + Tailwind, PostgreSQL, Next.js API routes.
- **Where the rules live:** `src/server/logic.ts` (server). The browser only shows state and sends actions.
- **Brand placeholders:** `src/lib/config.ts` (`APP.name`, support links, game list, timers).

---

## 1. Navigation (every signed-in page)

| Area | Mobile | Desktop |
|---|---|---|
| Top bar | Menu button, logo, notification bell with unread count, avatar → Profile | Bell and avatar |
| Main nav | Bottom bar: Home, Matches, Leaderboard, Invite, Profile | Left sidebar with the same items |
| More | Drawer from the menu button: Notifications, Fair-play rules, Help & support, About, Terms, Privacy, Log out | Same items in the sidebar |
| Toasts | Bottom of screen, auto-hide after ~3 s | Same |

**Live updates:** the app refreshes state every 3 seconds while the tab is visible and when the tab regains focus, so each player sees the other's actions without reloading.

**Access:** signed-out visitors can open Login, Rules, Support, About, Terms and Privacy. Any other page sends them to Login and returns them to that page after login (`/login?next=...`).

---

## 2. Login and sign-up — `/login`

**Step 1 — email address**
- Any valid email (trimmed and lower-cased, so `Aarav@Gmail.com` and `aarav@gmail.com` are the same account). Optional `ALLOWED_EMAIL_DOMAINS=gmail.com` accepts only Gmail.
- **Send code** → `POST /api/auth/otp` → a 6-digit code is emailed (subject "123456 is your Goti Rooms login code", plain-text and HTML body).
- If the email can't be sent (wrong SMTP password, server down), the player sees "We couldn't send the email…", nothing is stored, and they can retry straight away.
- Blocked if the account is suspended (shows the reason), if the last code was sent under 30 seconds ago, or after 5 codes in an hour.

**Step 2 — code (and name for new players)**
- 6-digit code, valid for **5 minutes**. Countdown and "Resend in 30s" shown under the field.
- Codes are stored hashed (HMAC with `AUTH_SECRET`), never in plain text.
- **5 wrong tries** lock that code; the player must ask for a new one. Each wrong try shows how many are left.
- A code works once. It's consumed inside the same transaction that creates the session.
- The screen shows which address the code went to, with "Check your inbox and spam folder" and a **Change** link.
- If the email is new, the same screen asks for **name** (2–40 letters) and an optional **invite code**. An invite code that doesn't exist is rejected.
- Demo mode (no `SMTP_HOST` set): no email is sent; the code is shown on screen in a yellow box and printed in the server log. With SMTP set (Gmail settings in the README), the code is only in the email.
- Accounts created earlier with a mobile number: demo players got `firstname@example.com`; other mobile-only accounts keep their matches but can't log in until an email is added.

**After login**
- 30-day session in an httpOnly cookie. `last_seen_at` is updated at most once a minute.
- New account: colour assigned in rotation, unique invite code, welcome notification, inviter notified.
- Suspended players are signed out on their next request and can't request a code.

**Log out** (Profile): this device only, or **Log out of all devices** (deletes every session for the account).

## 3. Home — `/`

- Greeting and heading.
- **Your active matches**: any match where you're a player and it's *Join request* or *Live*, with an Open button.
- **Game cards** with artwork from `public/games/` (WebP at 640 and 1280 px; the phone loads the small one):
  - Ludo Classic: Ludo board image, wide card with a **Play Ludo Classic** button.
  - Snakes & Ladders: snake game image.
  - Ludo Popular: Coming soon image, not clickable.
  - Each card shows the open-room count (green when there are rooms). A game an admin has turned off shows its image greyed with "Not open right now".
- **How a match works**: 4 steps (create → accept → share code → post result) and a link to the rules.

---

## 4. Game lobby — `/play/[game]`

**Create a room**
- **Room amount** (numbers only): ₹50 to ₹2,000, multiple of ₹50, with quick chips. Shows "Both players pay ₹X. Winner gets ₹Y (Z% platform fee)". The amount is held from the wallet when the room is created.
- Blocked when:
  - amount missing, not a number, outside ₹50–2,000 or not a multiple of 50
  - wallet balance is below the amount → "You need ₹X in your wallet… Add cash first."
  - the game isn't live → "This game isn't open yet."
  - you already have **2** rooms that are open or have a join request → "You can have 2 open rooms at a time. Delete one first."
  - you're in a running match without having posted your result → "Finish your running match before creating a new one."

**Your rooms** (open or requested, created by you)
- Open → Delete button (trash).
- Join request → **Review request** → match page.

**Open rooms** (other people's rooms waiting for a player)
- Search by host name.
- **Ask to join** → room becomes *Join request*, host gets a notification, you go to the match page.
- Rooms you've asked to join show **Withdraw** instead.
- Blocked when it's your own room, someone else already asked, or you have a running match.

**Playing now**: up to 6 live matches between other players (view only).

---

## 5. Match page — `/match/[id]`

Header: back to lobby, status pill. Player card: host and player 2 avatars, "You" labels, trophy on the winner, the room note.

### Match states

```
open ──ask to join──▶ requested ──accept──▶ running ──results──▶ completed
  ▲                     │  │                  │  │                 
  └──decline/withdraw───┘  │                  │  └──▶ disputed (results conflict)
  delete (host) ◀──────────┘                  └──▶ cancelled (no code in time / both cancel)
```

| State | Host sees | Player 2 sees | Others see |
|---|---|---|---|
| **open** | "Waiting for a player", Delete room | — | Ask to join |
| **requested** | "X wants to play" — Accept / Decline | "Waiting for the host" — Withdraw request | "Someone already asked to join" |
| **running, no code** | 5:00 countdown, Open Ludo King, room-code field, Share code | "Waiting for the room code" + countdown | "This match is being played" |
| **running, code shared** | Code tiles, Copy code, Open Ludo King, Change room code (until host posts a result), result form | Code tiles, Copy code, Open Ludo King, result form | view only |
| **completed** | "You won" / "X won", each player's posted result, screenshots, Play again | same | winner, results (screenshots hidden) |
| **cancelled** | "Match cancelled" + reason, Play again | same | same |
| **disputed** | "Under review" + reason, Contact support | same | same |

### Accepting
- Starts the match (status *running*) and a **5-minute** room-code timer.
- Any other pending join requests by the same player 2 are released (their rooms go back to *open*).
- Player 2 is notified.

### Room code
- Host only. Must be **8 digits starting with 0** (Ludo King format). Error: "Room codes are 8 digits and start with 0."
- On save, player 2 is notified with the code. Changing the code notifies them again.
- If no code within 5 minutes → match **cancelled** automatically, both notified.

### Posting a result
Choose one: **I won** / **I lost** / **Cancel**.
- **I won** needs a screenshot: JPG, PNG, WebP or GIF (resized in the browser to max 1080 px JPEG before upload; server rejects SVG, non-images and anything over ~1.5 MB). Full-size view opens from `/api/screenshot/[match]/[player]`, allowed only for the two players and admins.
- **Cancel** needs a reason: no room code shared, room code didn't work, we didn't play, opponent left before the game started, something else.
- **I won / I lost** need the room code to have been shared.
- One result per player, final once posted.

### How results decide the match

| Player A | Player B | Outcome |
|---|---|---|
| I lost | (anything or nothing yet) | **Completed**, B wins immediately |
| I won | I lost | **Completed**, A wins |
| Cancel | Cancel | **Cancelled** |
| I won | I won | **Disputed** |
| I won | Cancel (either order) | **Disputed** |
| posted | nothing for **15 min** | Poster's result stands: won → poster wins; cancel → cancelled |

After the first result, the other player is notified and sees a 15-minute countdown on their result form; the poster sees "Waiting for X".

Timers are checked on the server every time any client reads state, so they fire within a few seconds even if nobody is on the match page.

### Privacy on the match page
- Win screenshots are sent only to the two players.
- Email addresses are never sent to other users.

---

## 6. My matches — `/matches`

- Stats: Played, Won, Win rate (completed matches only).
- Tabs with counts: All, Active (open/requested/live), Finished, Cancelled & review.
- Each card: game, time, status, both players, note or "You won/You lost", Open.

## 7. Leaderboard — `/leaderboard`

- Toggle: This week / All time.
- Ranked by wins, then win rate, then fewer games. Top 3 get gold/silver/bronze badges. Your row is highlighted.
- Only players with at least one completed match appear.

## 8. Invite — `/invite` and `/invite/friends`

- Your invite code and link (`/login?invite=CODE`), copy button.
- Share to WhatsApp, Telegram, or the phone's share sheet.
- "Friends who joined" count → list of people who signed up with your code, when they joined, their match count.
- No rewards are attached to invites.

## 9. Notifications — `/notifications`

Sent for: welcome, friend joined with your code, join request, request withdrawn, request accepted/declined, room deleted, room code shared/changed, opponent posted a result, match won/lost, match cancelled, match under review.
- Unread items have a dot and tint; tapping marks read and opens the linked page. **Mark all read** button.
- Bell badge in the header and sidebar shows the unread count.

## 10. Profile — `/profile`

- Avatar (token in your colour), name with edit (bottom sheet, min 2 letters), email address, member since.
- Profile completion bar.
- Token colour picker (4 colours).
- Stats: matches, wins, losses, win rate.
- Browser notifications: asks the browser for permission (permission only; push delivery would need a push service).
- Links: invite code, My matches, Rules, Support. **Log out** (deletes the session server-side).

## 11. Information pages

| Page | Content |
|---|---|
| `/rules` | Starting a match, leaving a game, posting results, disputes, accounts |
| `/support` | WhatsApp, Telegram, email; one-tap topic messages; FAQ |
| `/about` | What the app is; free, no payments; not affiliated with Ludo King |
| `/terms`, `/privacy` | Placeholder text, to be replaced by the client's reviewed copy |

---

## 12. Admin panel — `/admin`

Separate login with email and password. Only people in the `admins` table can sign in.

**Sign in — `/admin/login`**
- Default admin is created on first start from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults in `.env.example`).
- Passwords are hashed with scrypt. 5 wrong passwords lock that email for 15 minutes.
- Admin session: 24 hours, separate httpOnly cookie (`SameSite=Strict`). Every admin page and action checks it on the server.

**Dashboard — `/admin`**
- Red banner when disputes are waiting, with a Review button.
- Registered players (new today / this week), active in last 7 days, suspended count.
- Matches finished, cancelled, live now, rooms waiting.
- Bar charts: matches finished per day and new sign-ups per day (last 14 days); split by game.
- Top 5 winners this week; latest 8 match updates.

**Players — `/admin/users`**
- Search by name, email or invite code. Filter active / suspended.
- Sort: newest, most wins, most losses, best win rate, most matches, recently active.
- Columns: player, email, played, won, lost, win rate, joined, last seen, status. 25 per page.

**Player detail — `/admin/users/[id]`**
- Profile: email, invite code, joined, last seen, who invited them, suspension reason.
- Stats: finished matches, won, lost, win rate, disputes, friends invited.
- Most played against (head-to-head W/L), friends who joined with their code, full match history.
- Actions:
  - **Suspend** (reason required, shown to the player): signs them out everywhere, removes their open rooms, releases their pending join requests.
  - **Lift suspension** (player gets a notification).
  - **Sign out of all devices** (shows the number of active sessions).
  - **Rename** (old → new name logged).
  - **Send message** to the player's notifications.

**Matches — `/admin/matches`**
- Tabs: All, Disputed, Live, Open, Join request, Finished, Cancelled. Search by player, room code or match ID; filter by game.

**Match detail — `/admin/matches/[id]`**
- Both players with overall W/L and dispute counts; each player's posted result, reason and screenshot (click to open full size).
- **Settle** (disputed or live matches): pick Host won / Player 2 won / Cancel, optional note to players. Both players are notified; the decision is in the timeline and the activity log.
- **Remove room** for open rooms (host is notified).
- Timeline: created, accepted, each result, every admin action on the match.

**Winners — `/admin/leaderboard`**
- 7 days / 30 days / all time. Rank by most wins, most losses, or best win rate (5+ games).

**Settings & broadcast — `/admin/settings`**
- **Announcement banner**: yellow banner on every player page, on/off.
- **Games**: turn each game on or off. Off = "not open right now", no new rooms; live matches finish normally.
- **Maintenance mode**: red banner; blocks new rooms and join requests.
- **Send notification**: to all active players or only those active in the last 7 days.

**Activity log — `/admin/audit`**: every admin sign-in, suspension, settlement, setting change and broadcast, with who, when and details.

**My account — `/admin/account`**: change password (8+ characters with letters and numbers; signs out other admin sessions); list of admins with last sign-in.

## 13. Data model (PostgreSQL) — `db/schema.sql`

| Table | Key columns |
|---|---|
| `users` | id, name, phone (unique), tone, invite_code (unique), invited_by, created_at |
| `sessions` | token, user_id, expires_at |
| `matches` | id, game, note, created_by, joined_by, status, room_code, room_code_deadline, started_at, first_result_at, results (jsonb per player: outcome, reason, screenshot, at), winner_id, ended_reason, created_at, updated_at |
| `notices` | id, user_id, text, href, at, read |
| `users` (v2/v3 columns) | status (active/suspended), suspended_reason, last_seen_at, **email** (unique, lower-case; `phone` is now optional and unused) |
| `email_otps` | email, code_hash, expires_at, attempts, sent_at, sends_hour, hour_start |
| `admins` | id, email, name, password_hash, last_login_at |
| `admin_sessions` | token, admin_id, expires_at |
| `admin_login_attempts` | email, fails, locked_until |
| `settings` | key (announcement / games / maintenance), value jsonb |
| `audit_log` | admin_id, action, target, detail, at |

All state changes run inside a transaction with the match row locked (`SELECT … FOR UPDATE`), so two players acting at once can't both win the same seat.

## 14. API

| Method & path | Purpose |
|---|---|
| `POST /api/auth/otp` | `{email}` → emails the code; returns `{isNew, resendIn, expiresIn, devCode?}` (`devCode` only in demo mode) |
| `POST /api/auth/login` | `{email, otp, name?, invite?}` → sets session cookie |
| `POST /api/auth/logout` | `{everywhere?}` → ends this or every session |
| `GET /api/state` | Runs timers, returns `{meId, settings, users, matches, notices}` for the caller |
| Admin | Server-rendered pages + server actions in `src/app/admin/actions.ts` (no public admin API) |
| `GET /api/wallet` | Balance, KYC (masked), deposits, withdrawals, wallet history |
| `POST /api/wallet` | `{type}` — `deposit {amount}`, `checkDeposit {id}`, `simulateDeposit {id}` (demo only), `withdraw {amount, method}`, `cancelWithdraw {id}`, `saveKyc {…}` |
| `POST /api/webhooks/razorpay` | Razorpay events (signature checked) |
| `POST /api/action` | `{type, …}` — `createMatch {game, amount}`, `deleteMatch`, `requestJoin`, `withdrawRequest`, `acceptRequest`, `rejectRequest`, `setRoomCode`, `submitResult`, `updateProfile`, `markRead`. Returns `{ok, error?, state}` |

## 16. Wallet, payments, KYC and withdrawals

All amounts are stored in paise. Every balance change goes through one function (`move()` in `src/server/wallet.ts`) that updates `users.balance` (never below 0) and writes a `wallet_txns` row in the same transaction.

**Navigation:** "Wallet" in the sidebar and bottom bar (Invite moved to the drawer); balance chip in the top bar.

**Wallet page — `/wallet`**
- Balance, **Add cash**, **Withdraw**, KYC status banner.
- Tabs: *Added cash* (each payment with status: Processing / Success / Failed / Expired), *Withdrawals* (Under review / Approved · sending / Paid with UTR / Declined with reason / Cancelled; pending ones can be cancelled), *All activity* (every wallet movement with balance after).

**Add cash (Razorpay UPI QR)**
1. Player enters ₹50–2,000 → `POST /api/wallet {type:"deposit"}` creates a `deposits` row (*pending*) and a single-use, fixed-amount Razorpay UPI QR that closes after 15 minutes.
2. The QR is shown with a countdown; the page polls every 3 s.
3. Razorpay calls `POST /api/webhooks/razorpay`. The signature (`x-razorpay-signature`, HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`) is checked; every event is stored in `payment_events` once (by `x-razorpay-event-id`).
   - `qr_code.credited` with a captured payment → deposit *success*, wallet credited, player notified. A payment id can only be credited once.
   - `qr_code.closed` with nothing paid → *expired*. `payment.failed` → reason saved on the deposit.
4. Backup: while the QR is on screen, the server also asks Razorpay for the QR's payments (at most every 15 s), so a late webhook doesn't keep the player waiting. Admin can **Check with Razorpay** on any open/expired deposit.
- Without Razorpay keys in development: demo mode, a **Simulate payment** button instead of a real QR. In production without keys, adding cash is off.

**Room money**
| Event | Money |
|---|---|
| Create room | host's amount held |
| Ask to join | joiner's amount held |
| Withdraw request / host declines / another match starts for the joiner | joiner refunded |
| Delete room / admin removes room / host suspended | host (and pending joiner) refunded |
| Match completed (any path, incl. admin settle) | winner gets 2 × amount − commission (`matches.prize`, `matches.fee`) |
| Match cancelled (both cancel, no room code, timeout, admin cancel) | both refunded |
| Disputed | held until an admin settles |
Commission % is set in Admin → Settings and fixed on each room when it's created.

**KYC — `/profile/kyc`** (also linked from Profile and Wallet)
- Name as on PAN, PAN (`ABCDE1234F`), and a bank account (holder, account number twice, IFSC) and/or a UPI ID. One PAN per account.
- Saved as *pending*; admin approves or rejects with a reason (player notified). Any edit goes back to *pending*.

**Withdraw**
- Needs approved KYC. Minimum ₹100, up to the balance, one request in progress at a time. Bank or UPI from the KYC.
- The amount leaves the wallet at once. Admin: **Approve** → sends the money manually → **Mark as paid** with the UTR. **Decline** (reason required) returns the money to the wallet.

**Admin**
- **Payments** — every deposit with player, amount, status, Razorpay payment/QR ids, payer UPI, failure reason; tabs by status; stats (today, 7 days, in process, failed/expired); **Webhook log** with the raw payload of every event.
- **Withdrawals** — "To do" queue (pending + approved) with full bank/UPI details, KYC name/PAN and current balance; approve / mark paid with UTR / decline & refund.
- **KYC** — review queue with full details; approve, reject or revoke with a reason.
- **Player detail** — balance, totals (added, withdrawn, won, net entries), KYC, every deposit, withdrawal and wallet movement, and **Adjust balance** (add/deduct with a reason, shown to the player).
- **Dashboard** — cash added, withdrawals to pay, total in player wallets (and held in rooms), commission earned; banners for pending withdrawals and KYC.
- Every review, adjustment and setting change is in the activity log.

## 15. Not in the demo (production to-dos)

- Set the SMTP settings (README) so codes are emailed; for more than ~500 sign-ins a day use a mail service rather than a personal Gmail.
- IP-based rate limiting in front of `/api/auth/otp` (per-email limits are already in place).
- Admin roles (e.g. read-only support vs full admin) and an "add admin" screen.
- Screenshot storage in object storage (S3/R2) instead of the database.
- Web push or WebSockets instead of 3-second polling.
- Leaderboard computed in SQL for large user counts.
