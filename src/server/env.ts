/*
 * Startup check of the environment (called from src/instrumentation.ts).
 * In production a missing or placeholder value stops the server with a clear message,
 * instead of failing later on a player's request.
 */

import { pgConfig } from "../../scripts/pg-config.mjs";

const PLACEHOLDER = /change-me|example\.com|xxxx/i;

export function checkEnv() {
  const prod = process.env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];
  const need = (key: string, why: string) => {
    if (!process.env[key]) errors.push(`${key} is not set (${why}).`);
  };

  need("DATABASE_URL", "PostgreSQL connection string");
  if (process.env.DATABASE_URL) {
    try {
      const db = pgConfig();
      if (prod && db.isRds && !db.ssl) warnings.push("PGSSL=false with AWS RDS: the database connection is not encrypted.");
      if (db.ssl && !db.ssl.rejectUnauthorized) warnings.push("PGSSL_REJECT_UNAUTHORIZED=false: the database certificate is not checked.");
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  const secret = process.env.AUTH_SECRET ?? "";
  if (prod && (secret.length < 32 || PLACEHOLDER.test(secret)))
    errors.push("AUTH_SECRET must be a random string of 32+ characters (e.g. `openssl rand -base64 48`).");

  if (prod) {
    need("RESEND_API_KEY", "login codes are emailed with Resend");
    need("EMAIL_FROM", 'sender address, e.g. Goti Rooms <noreply@yourdomain.com>');
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
      warnings.push("Razorpay keys are not set: players can't add cash.");
    else if (!process.env.RAZORPAY_WEBHOOK_SECRET)
      errors.push("RAZORPAY_WEBHOOK_SECRET is not set: payments would never be credited.");
    if (process.env.PAYMENTS_DEMO === "true") warnings.push("PAYMENTS_DEMO=true: fake payments are enabled. Never use this with real players.");
    if (process.env.INSECURE_COOKIES === "true") warnings.push("INSECURE_COOKIES=true: login cookies are sent over plain http.");
  }

  for (const w of warnings) console.warn(`[env] ${w}`);
  if (errors.length) {
    const msg = `[env] The server can't start:\n  - ${errors.join("\n  - ")}\nSee .env.example.`;
    if (prod) throw new Error(msg);
    console.warn(msg);
  }
}

/**
 * Next.js would log a startup error and keep a half-started server running; stop instead so the
 * problem is obvious (Docker shows the container exiting with the message).
 */
export function checkEnvOrExit() {
  try {
    checkEnv();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
