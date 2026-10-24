import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { hashOtp, hashPassword, newOtp, otpEquals, randomToken, shortId, verifyPassword } from "./security";
import { DEMO_CODE_ON_SCREEN, sendLoginCode } from "./mail";
import type { Tone } from "@/lib/types";

export class AuthFail extends Error {
  constructor(msg: string, public retryIn?: number) {
    super(msg);
  }
}
const fail = (msg: string, retryIn?: number): never => {
  throw new AuthFail(msg, retryIn);
};

export const SESSION_COOKIE = "goti_session";
export const ADMIN_COOKIE = "goti_admin";
const DAY = 86400000;

export const OTP = {
  ttlMs: 5 * 60000,
  resendMs: 30000,
  maxAttempts: 5,
  maxPerHour: 5,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Optional: ALLOWED_EMAIL_DOMAINS=gmail.com (comma-separated) to only accept those addresses. */
const allowedDomains = () =>
  (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

function cleanEmail(raw: unknown) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) fail("Enter a valid email address.");
  const allowed = allowedDomains();
  if (allowed.length && !allowed.includes(email.split("@")[1]))
    fail(`Use an email address ending in ${allowed.map((d) => "@" + d).join(" or ")}.`);
  return email;
}

/* ===================== Players: email code login ===================== */

export async function requestOtp(emailRaw: unknown) {
  const email = cleanEmail(emailRaw);
  const db = await getDb();
  const now = Date.now();

  const [user] = await db.q<{ status: string; suspended_reason: string | null }>(
    "SELECT status, suspended_reason FROM users WHERE email=$1",
    [email]
  );
  if (user?.status === "suspended")
    fail(`This account is suspended${user.suspended_reason ? `: ${user.suspended_reason}` : ""}. Contact support.`);

  const [prev] = await db.q<{ sent_at: string; sends_hour: number; hour_start: string }>(
    "SELECT sent_at, sends_hour, hour_start FROM email_otps WHERE email=$1",
    [email]
  );
  let sendsHour = 1;
  let hourStart = now;
  if (prev) {
    const wait = Number(prev.sent_at) + OTP.resendMs - now;
    if (wait > 0) fail(`Wait ${Math.ceil(wait / 1000)} seconds before asking for a new code.`, wait);
    if (now - Number(prev.hour_start) < 3600000) {
      if (prev.sends_hour >= OTP.maxPerHour) fail("Too many codes requested. Try again in an hour.");
      sendsHour = prev.sends_hour + 1;
      hourStart = Number(prev.hour_start);
    }
  }

  const code = newOtp();
  // Send first: if the email can't go out, nothing is stored and the player can retry straight away.
  try {
    await sendLoginCode(email, code, OTP.ttlMs / 60000);
  } catch (e) {
    console.error("[mail] send failed:", (e as Error).message);
    fail("We couldn't send the email. Check the address and try again in a minute.");
  }
  await db.q(
    `INSERT INTO email_otps (email, code_hash, expires_at, attempts, sent_at, sends_hour, hour_start)
     VALUES ($1,$2,$3,0,$4,$5,$6)
     ON CONFLICT (email) DO UPDATE SET code_hash=$2, expires_at=$3, attempts=0, sent_at=$4, sends_hour=$5, hour_start=$6`,
    [email, hashOtp(email, code), now + OTP.ttlMs, now, sendsHour, hourStart]
  );

  return {
    isNew: !user,
    resendIn: OTP.resendMs,
    expiresIn: OTP.ttlMs,
    devCode: DEMO_CODE_ON_SCREEN ? code : undefined,
  };
}

export async function verifyOtp(input: { email?: unknown; otp?: unknown; name?: unknown; invite?: unknown }) {
  const email = cleanEmail(input.email);
  const code = String(input.otp ?? "").trim();
  if (!/^\d{6}$/.test(code)) fail("Enter the 6-digit code.");
  const db = await getDb();

  // Check the code outside the transaction so a wrong try is counted even though we then throw.
  {
    const [row] = await db.q<{ code_hash: string; expires_at: string; attempts: number }>(
      "SELECT code_hash, expires_at, attempts FROM email_otps WHERE email=$1",
      [email]
    );
    if (!row) fail("Ask for a code first.");
    if (Number(row.expires_at) < Date.now()) fail("This code has expired. Ask for a new one.");
    if (row.attempts >= OTP.maxAttempts) fail("Too many wrong tries. Ask for a new code.");
    if (!otpEquals(row.code_hash, hashOtp(email, code))) {
      const [{ attempts }] = await db.q<{ attempts: number }>(
        "UPDATE email_otps SET attempts = attempts + 1 WHERE email=$1 RETURNING attempts",
        [email]
      );
      const left = OTP.maxAttempts - attempts;
      fail(left > 0 ? `That code doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Ask for a new code.");
    }
  }

  return db.tx(async (q) => {
    const now = Date.now();
    // Consume the code atomically so two parallel requests can't both use it.
    const used = await q("DELETE FROM email_otps WHERE email=$1 AND code_hash=$2 RETURNING email", [email, hashOtp(email, code)]);
    if (!used.length) fail("This code was already used. Ask for a new one.");

    let [user] = await q<{ id: string; status: string; suspended_reason: string | null }>(
      "SELECT id, status, suspended_reason FROM users WHERE email=$1",
      [email]
    );
    if (user?.status === "suspended") fail("This account is suspended. Contact support.");

    if (!user) {
      const name = String(input.name ?? "").trim();
      if (name.length < 2) fail("Enter a name with at least 2 letters.");
      if (name.length > 40) fail("Keep your name under 40 characters.");
      const [{ n }] = await q<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
      const inviteCode = String(input.invite ?? "").trim().toUpperCase();
      const inviter = inviteCode
        ? (await q<{ id: string }>("SELECT id FROM users WHERE invite_code=$1", [inviteCode]))[0]
        : undefined;
      if (inviteCode && !inviter) fail("That invite code doesn't exist. Check it or leave it empty.");
      let myCode = "";
      for (let i = 0; i < 6; i++) {
        myCode = randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
        if (myCode.length === 6 && !(await q("SELECT 1 FROM users WHERE invite_code=$1", [myCode]))[0]) break;
      }
      const id = shortId();
      const tones: Tone[] = ["red", "green", "yellow", "blue"];
      await q(
        "INSERT INTO users (id,name,email,tone,invite_code,invited_by,created_at,last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)",
        [id, name, email, tones[n % 4], myCode, inviter?.id ?? null, now]
      );
      const note = (uid: string, text: string, href: string) =>
        q("INSERT INTO notices (id,user_id,text,href,at,read) VALUES ($1,$2,$3,$4,$5,FALSE)", [shortId(), uid, text, href, now]);
      if (inviter) await note(inviter.id, `${name} joined with your invite code.`, "/invite/friends");
      await note(id, `Welcome, ${name}. Create a room or join one to start playing.`, "/");
      user = { id, status: "active", suspended_reason: null };
    }

    const token = randomToken();
    await q("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)", [token, user.id, now, now + 30 * DAY]);
    return { token, maxAge: 30 * 86400 };
  });
}

/** Returns the user id for a valid session of an active user. */
export async function userFromToken(token?: string) {
  if (!token) return null;
  const db = await getDb();
  const now = Date.now();
  const [r] = await db.q<{ user_id: string; status: string; last_seen_at: string | null }>(
    `SELECT s.user_id, u.status, u.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token=$1 AND s.expires_at>$2`,
    [token, now]
  );
  if (!r || r.status !== "active") return null;
  if (!r.last_seen_at || now - Number(r.last_seen_at) > 60000)
    await db.q("UPDATE users SET last_seen_at=$2 WHERE id=$1", [r.user_id, now]);
  return r.user_id;
}

export async function logoutSession(token?: string, everywhere = false) {
  if (!token) return;
  const db = await getDb();
  if (everywhere) {
    await db.q("DELETE FROM sessions WHERE user_id = (SELECT user_id FROM sessions WHERE token=$1)", [token]);
  } else {
    await db.q("DELETE FROM sessions WHERE token=$1", [token]);
  }
}

/* ===================== Admins: email + password ===================== */

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60000;

export async function adminLogin(emailRaw: string, password: string) {
  const email = (emailRaw ?? "").trim().toLowerCase();
  if (!email || !password) fail("Enter your email and password.");
  const db = await getDb();
  const now = Date.now();
  const [lock] = await db.q<{ fails: number; locked_until: string | null }>(
    "SELECT fails, locked_until FROM admin_login_attempts WHERE email=$1",
    [email]
  );
  if (lock?.locked_until && Number(lock.locked_until) > now)
    fail(`Too many failed attempts. Try again in ${Math.ceil((Number(lock.locked_until) - now) / 60000)} minutes.`);

  const [a] = await db.q<{ id: string; password_hash: string }>("SELECT id, password_hash FROM admins WHERE email=$1", [email]);
  if (!a || !verifyPassword(password, a.password_hash)) {
    const fails = (lock?.fails ?? 0) + 1;
    await db.q(
      `INSERT INTO admin_login_attempts (email, fails, locked_until) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET fails=$2, locked_until=$3`,
      [email, fails >= LOCK_AFTER ? 0 : fails, fails >= LOCK_AFTER ? now + LOCK_MS : null]
    );
    fail(fails >= LOCK_AFTER ? "Too many failed attempts. Locked for 15 minutes." : "Email or password is wrong.");
  }
  await db.q("DELETE FROM admin_login_attempts WHERE email=$1", [email]);
  await db.q("UPDATE admins SET last_login_at=$2 WHERE id=$1", [a.id, now]);
  const token = randomToken(32);
  await db.q("INSERT INTO admin_sessions (token, admin_id, created_at, expires_at) VALUES ($1,$2,$3,$4)", [token, a.id, now, now + DAY]);
  await audit(a.id, "admin.login", a.id);
  return { token, maxAge: 86400 };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export async function currentAdmin(): Promise<AdminUser | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [a] = await db.q<AdminUser>(
    `SELECT a.id, a.email, a.name FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token=$1 AND s.expires_at>$2`,
    [token, Date.now()]
  );
  return a ?? null;
}

/** For admin pages and server actions. Redirects to the admin login when signed out. */
export async function requireAdmin(): Promise<AdminUser> {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

export async function adminLogout() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.q("DELETE FROM admin_sessions WHERE token=$1", [token]);
  }
  cookies().delete(ADMIN_COOKIE);
}

export async function changeAdminPassword(adminId: string, current: string, next: string) {
  const db = await getDb();
  const [a] = await db.q<{ password_hash: string }>("SELECT password_hash FROM admins WHERE id=$1", [adminId]);
  if (!a || !verifyPassword(current, a.password_hash)) fail("Current password is wrong.");
  if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next))
    fail("New password needs 8+ characters with letters and numbers.");
  await db.q("UPDATE admins SET password_hash=$2 WHERE id=$1", [adminId, hashPassword(next)]);
  const token = cookies().get(ADMIN_COOKIE)?.value;
  await db.q("DELETE FROM admin_sessions WHERE admin_id=$1 AND token<>$2", [adminId, token ?? ""]);
  await audit(adminId, "admin.password_changed", adminId);
}

export async function audit(adminId: string | null, action: string, target?: string, detail?: string) {
  const db = await getDb();
  await db.q("INSERT INTO audit_log (id, admin_id, action, target, detail, at) VALUES ($1,$2,$3,$4,$5,$6)", [
    shortId(),
    adminId,
    action,
    target ?? null,
    detail ?? null,
    Date.now(),
  ]);
}
