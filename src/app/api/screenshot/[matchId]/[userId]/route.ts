import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { ADMIN_COOKIE, SESSION_COOKIE, userFromToken } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Serves a posted screenshot as a real image (browsers won't open data: URLs in a new tab).
 * Allowed for the two players in the match and for signed-in admins.
 */
export async function GET(_: Request, ctx: { params: Promise<{ matchId: string; userId: string }> }) {
  const params = await ctx.params;
  const db = await getDb();
  const jar = await cookies();
  const me = await userFromToken(jar.get(SESSION_COOKIE)?.value);
  const adminToken = jar.get(ADMIN_COOKIE)?.value;
  const [admin] = adminToken
    ? await db.q("SELECT 1 FROM admin_sessions WHERE token=$1 AND expires_at>$2", [adminToken, Date.now()])
    : [];

  const [m] = await db.q<{ created_by: string; joined_by: string | null; results: Record<string, { screenshot?: string }> | string }>(
    "SELECT created_by, joined_by, results FROM matches WHERE id=$1",
    [params.matchId]
  );
  if (!m) return new Response("Not found", { status: 404 });
  const isPlayer = me && (m.created_by === me || m.joined_by === me);
  if (!isPlayer && !admin) return new Response("Not allowed", { status: 403 });

  const results = typeof m.results === "string" ? JSON.parse(m.results) : m.results;
  const shot: string | undefined = results?.[params.userId]?.screenshot;
  const parsed = shot?.match(/^data:(image\/(?:jpeg|png|webp|gif|svg\+xml));base64,(.+)$/);
  if (!parsed) return new Response("No screenshot", { status: 404 });

  return new Response(Buffer.from(parsed[2], "base64"), {
    headers: {
      "Content-Type": parsed[1],
      "Cache-Control": "private, max-age=3600",
      // Image only: no scripts even if someone uploads an SVG.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
