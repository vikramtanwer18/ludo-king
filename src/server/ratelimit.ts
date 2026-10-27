import "server-only";
import { getDb } from "./db";

/*
 * Fixed-window rate limits stored in Postgres, so they hold across several app instances.
 * Returns how long to wait when the limit is hit.
 */
// On in production; RATE_LIMITS=off (e.g. for load tests) or RATE_LIMITS=on overrides.
const ENABLED = process.env.RATE_LIMITS ? process.env.RATE_LIMITS !== "off" : process.env.NODE_ENV === "production";

/** Limits used by the routes. Generous per IP because mobile carriers put many players behind one IP. */
export const LIMITS = {
  otpPerIp: [30, 10 * 60_000],
  loginPerIp: [60, 10 * 60_000],
  adminLoginPerIp: [20, 15 * 60_000],
  actionsPerUser: [120, 60_000],
  walletPerUser: [40, 60_000],
} as const;

export async function rateLimit(key: string, limit: number, windowMs: number) {
  if (!ENABLED) return { ok: true, retryIn: 0 };
  const db = await getDb();
  const now = Date.now();
  const [r] = await db.q<{ hits: number; window_start: number }>(
    `INSERT INTO rate_limits (key, window_start, hits) VALUES ($1, $2, 1)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start <= $2 - $3 THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= $2 - $3 THEN $2 ELSE rate_limits.window_start END
     RETURNING hits, window_start`,
    [key, now, windowMs]
  );
  // Now and then, drop windows that ended long ago.
  if (Math.random() < 0.01) db.q("DELETE FROM rate_limits WHERE window_start < $1", [now - 86_400_000]).catch(() => {});
  const ok = r.hits <= limit;
  return { ok, retryIn: ok ? 0 : Number(r.window_start) + windowMs - now };
}

/**
 * The caller's IP. Behind a reverse proxy / load balancer (nginx, Vercel, Cloudflare…) the proxy
 * must set X-Forwarded-For; the left-most address is the client.
 */
export function clientIp(h: Headers) {
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export const tooMany = (retryIn: number) =>
  `Too many attempts. Try again in ${Math.max(1, Math.ceil(retryIn / 60000))} minute${retryIn > 60000 ? "s" : ""}.`;
