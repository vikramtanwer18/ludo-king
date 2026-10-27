import "server-only";
import crypto from "node:crypto";

// Read when first used (not at import, which also happens during `next build` without secrets).
// Production refuses to start without a real AUTH_SECRET (src/server/env.ts); the fallback is for local dev only.
function secret() {
  const s = process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-secret");
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return s;
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");
export const shortId = () => crypto.randomBytes(6).toString("base64url").slice(0, 8);

/** scrypt password hash: "scrypt$<salt>$<hash>" */
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(pw, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const got = crypto.scryptSync(pw, salt, 64);
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** OTPs are never stored in plain text. */
export const hashOtp = (email: string, code: string) =>
  crypto.createHmac("sha256", secret()).update(`${email}:${code}`).digest("base64url");
export const otpEquals = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const newOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
