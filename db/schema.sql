-- Goti Rooms — Postgres schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL UNIQUE,
  tone         TEXT NOT NULL CHECK (tone IN ('red','green','yellow','blue')),
  invite_code  TEXT NOT NULL UNIQUE,
  invited_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_seed      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS matches (
  id                  TEXT PRIMARY KEY,
  game                TEXT NOT NULL,
  note                TEXT,
  created_by          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  status              TEXT NOT NULL CHECK (status IN ('open','requested','running','completed','cancelled','disputed')),
  room_code           TEXT,
  room_code_deadline  BIGINT,
  started_at          BIGINT,
  first_result_at     BIGINT,
  results             JSONB NOT NULL DEFAULT '{}'::jsonb,
  winner_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  ended_reason        TEXT,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_status_idx ON matches(status);
CREATE INDEX IF NOT EXISTS matches_players_idx ON matches(created_by, joined_by);

CREATE TABLE IF NOT EXISTS notices (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text      TEXT NOT NULL,
  href      TEXT,
  at        BIGINT NOT NULL,
  read      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS notices_user_idx ON notices(user_id, at DESC);

-- ---------- v2: auth, admin, settings ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE TABLE IF NOT EXISTS admins (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     BIGINT NOT NULL,
  last_login_at  BIGINT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token       TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  email      TEXT PRIMARY KEY,
  fails      INT NOT NULL DEFAULT 0,
  locked_until BIGINT
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT REFERENCES admins(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  at         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS matches_updated_idx ON matches(updated_at DESC);

-- ---------- v3: email login (replaces mobile OTP) ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email);
-- Demo players from the earlier mobile-number seed get demo addresses.
UPDATE users SET email = replace(id, 'seed-', '') || '@example.com' WHERE is_seed AND email IS NULL;

CREATE TABLE IF NOT EXISTS email_otps (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  BIGINT NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  sent_at     BIGINT NOT NULL,
  sends_hour  INT NOT NULL DEFAULT 1,
  hour_start  BIGINT NOT NULL
);
DROP TABLE IF EXISTS otp_codes;

-- ---------- v4: wallet, Razorpay QR deposits, withdrawals, KYC ----------
-- All money is stored in paise (1 rupee = 100).
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance BIGINT NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS fee_pct NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS prize BIGINT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS fee BIGINT;

CREATE TABLE IF NOT EXISTS wallet_txns (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  amount         BIGINT NOT NULL,
  balance_after  BIGINT NOT NULL,
  ref            TEXT,
  note           TEXT,
  admin_id       TEXT REFERENCES admins(id) ON DELETE SET NULL,
  at             BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS wallet_txns_user_idx ON wallet_txns(user_id, at DESC);
CREATE INDEX IF NOT EXISTS wallet_txns_ref_idx ON wallet_txns(ref);

CREATE TABLE IF NOT EXISTS deposits (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount           BIGINT NOT NULL,
  paid_amount      BIGINT,
  status           TEXT NOT NULL CHECK (status IN ('pending','success','failed','expired')),
  qr_id            TEXT UNIQUE,
  qr_image         TEXT,
  close_by         BIGINT,
  payment_id       TEXT UNIQUE,
  method           TEXT,
  payer            TEXT,
  failure_reason   TEXT,
  demo             BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at  BIGINT,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS deposits_user_idx ON deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deposits_status_idx ON deposits(status, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawals (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       BIGINT NOT NULL,
  method       TEXT NOT NULL CHECK (method IN ('bank','upi')),
  destination  JSONB NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','approved','paid','declined','cancelled')),
  admin_note   TEXT,
  utr          TEXT,
  reviewed_by  TEXT REFERENCES admins(id) ON DELETE SET NULL,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS withdrawals_user_idx ON withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON withdrawals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS kyc (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name      TEXT NOT NULL,
  pan            TEXT NOT NULL,
  bank_holder    TEXT,
  bank_account   TEXT,
  bank_ifsc      TEXT,
  upi_id         TEXT,
  status         TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  reject_reason  TEXT,
  submitted_at   BIGINT NOT NULL,
  reviewed_at    BIGINT,
  reviewed_by    TEXT REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS kyc_status_idx ON kyc(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS payment_events (
  id           TEXT PRIMARY KEY,
  event        TEXT NOT NULL,
  deposit_id   TEXT,
  payment_id   TEXT,
  result       TEXT,
  payload      JSONB NOT NULL,
  received_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_events_at_idx ON payment_events(received_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_deposit_idx ON payment_events(deposit_id);
