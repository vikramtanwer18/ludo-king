import "server-only";
import { getDb } from "./db";
import { sweep, toMatch, type MatchRow } from "./logic";
import type { Match, MatchStatus, Tone } from "@/lib/types";

const DAY = 86400000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  tone: Tone;
  status: "active" | "suspended";
  suspendedReason: string | null;
  inviteCode: string;
  invitedBy: string | null;
  invitedByName: string | null;
  invites: number;
  createdAt: number;
  lastSeenAt: number | null;
  played: number;
  wins: number;
  losses: number;
  rate: number;
  disputes: number;
  cancels: number;
}

const PLAYER_STATS = `
  WITH p AS (
    SELECT created_by AS uid, winner_id, status, updated_at FROM matches
    UNION ALL
    SELECT joined_by AS uid, winner_id, status, updated_at FROM matches WHERE joined_by IS NOT NULL
  )
  SELECT uid,
    COUNT(*) FILTER (WHERE status='completed')::int AS played,
    COUNT(*) FILTER (WHERE status='completed' AND winner_id=uid)::int AS wins,
    COUNT(*) FILTER (WHERE status='disputed')::int AS disputes,
    COUNT(*) FILTER (WHERE status='cancelled')::int AS cancels
  FROM p WHERE updated_at >= $1 GROUP BY uid`;

type UserSqlRow = {
  id: string; name: string; email: string | null; tone: Tone; status: "active" | "suspended"; suspended_reason: string | null;
  invite_code: string; invited_by: string | null; inviter_name: string | null; invites: number; created_at: string;
  last_seen_at: string | null; played: number | null; wins: number | null; disputes: number | null; cancels: number | null;
};
const mapUser = (r: UserSqlRow): AdminUserRow => {
  const played = r.played ?? 0;
  const wins = r.wins ?? 0;
  return {
    id: r.id, name: r.name, email: r.email ?? "", tone: r.tone, status: r.status, suspendedReason: r.suspended_reason,
    inviteCode: r.invite_code, invitedBy: r.invited_by, invitedByName: r.inviter_name, invites: r.invites ?? 0,
    createdAt: Number(r.created_at), lastSeenAt: r.last_seen_at ? Number(r.last_seen_at) : null,
    played, wins, losses: played - wins, rate: played ? Math.round((wins / played) * 100) : 0,
    disputes: r.disputes ?? 0, cancels: r.cancels ?? 0,
  };
};

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.tone, u.status, u.suspended_reason, u.invite_code, u.invited_by,
         inv.name AS inviter_name,
         (SELECT COUNT(*)::int FROM users x WHERE x.invited_by = u.id) AS invites,
         u.created_at, u.last_seen_at, s.played, s.wins, s.disputes, s.cancels
  FROM users u
  LEFT JOIN users inv ON inv.id = u.invited_by
  LEFT JOIN (${PLAYER_STATS}) s ON s.uid = u.id`;

/* ---------------- dashboard ---------------- */
export async function dashboard() {
  const db = await getDb();
  await sweep();
  const now = Date.now();
  const today = startOfToday();
  const [u] = await db.q<{ total: number; today: number; week: number; active7: number; suspended: number }>(
    `SELECT COUNT(*)::int total,
       COUNT(*) FILTER (WHERE created_at >= $1)::int today,
       COUNT(*) FILTER (WHERE created_at >= $2)::int week,
       COUNT(*) FILTER (WHERE last_seen_at >= $2 AND status='active')::int active7,
       COUNT(*) FILTER (WHERE status='suspended')::int suspended
     FROM users`,
    [today, now - 7 * DAY]
  );
  const [m] = await db.q<{ total: number; today: number; live: number; open: number; disputed: number; completed: number; cancelled: number }>(
    `SELECT COUNT(*)::int total,
       COUNT(*) FILTER (WHERE created_at >= $1)::int today,
       COUNT(*) FILTER (WHERE status='running')::int live,
       COUNT(*) FILTER (WHERE status IN ('open','requested'))::int open,
       COUNT(*) FILTER (WHERE status='disputed')::int disputed,
       COUNT(*) FILTER (WHERE status='completed')::int completed,
       COUNT(*) FILTER (WHERE status='cancelled')::int cancelled
     FROM matches`,
    [today]
  );
  // matches finished per day, last 14 days
  const perDayRows = await db.q<{ day: string; n: number }>(
    `SELECT FLOOR((updated_at - $1) / ${DAY})::int AS day, COUNT(*)::int n
     FROM matches WHERE status='completed' AND updated_at >= $1 GROUP BY 1`,
    [today - 13 * DAY]
  );
  const perDay = Array.from({ length: 14 }, (_, i) => ({
    date: today - (13 - i) * DAY,
    n: perDayRows.find((x) => Number(x.day) === i)?.n ?? 0,
  }));
  const signupRows = await db.q<{ day: string; n: number }>(
    `SELECT FLOOR((created_at - $1) / ${DAY})::int AS day, COUNT(*)::int n FROM users WHERE created_at >= $1 GROUP BY 1`,
    [today - 13 * DAY]
  );
  const signups = perDay.map((d, i) => ({ date: d.date, n: signupRows.find((x) => Number(x.day) === i)?.n ?? 0 }));
  const byGame = await db.q<{ game: string; n: number }>(
    "SELECT game, COUNT(*)::int n FROM matches WHERE status='completed' GROUP BY game ORDER BY n DESC"
  );

  return {
    users: u,
    matches: m,
    perDay,
    signups,
    byGame,
    topWinners: (await leaderboard(7)).slice(0, 5),
    recent: (await listMatches({ limit: 8 })).rows,
  };
}

/* ---------------- users ---------------- */
export type UserSort = "joined" | "wins" | "played" | "rate" | "losses" | "seen";
export async function listUsers(opts: { q?: string; status?: string; sort?: UserSort; page?: number; per?: number }) {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [0];
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    where.push(`(LOWER(u.name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length} OR LOWER(u.invite_code) LIKE $${params.length})`);
  }
  if (opts.status === "active" || opts.status === "suspended") {
    params.push(opts.status);
    where.push(`u.status = $${params.length}`);
  }
  const order: Record<UserSort, string> = {
    joined: "u.created_at DESC",
    wins: "COALESCE(s.wins,0) DESC, COALESCE(s.played,0) ASC",
    played: "COALESCE(s.played,0) DESC",
    losses: "(COALESCE(s.played,0) - COALESCE(s.wins,0)) DESC",
    rate: "CASE WHEN COALESCE(s.played,0)=0 THEN -1 ELSE s.wins::float / s.played END DESC, COALESCE(s.played,0) DESC",
    seen: "u.last_seen_at DESC NULLS LAST",
  };
  const per = opts.per ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await db.q<UserSqlRow>(
    `${USER_SELECT} ${w} ORDER BY ${order[opts.sort ?? "joined"] ?? order.joined} LIMIT ${per} OFFSET ${(page - 1) * per}`,
    params
  );
  // $1 is the stats window used by USER_SELECT; reference it so parameter numbering stays the same.
  const [{ n }] = await db.q<{ n: number }>(
    `SELECT COUNT(*)::int n FROM users u WHERE $1::bigint >= 0 ${where.length ? "AND " + where.join(" AND ") : ""}`,
    params
  );
  return { rows: rows.map(mapUser), total: n, page, per };
}

export async function getUser(id: string) {
  const db = await getDb();
  const [r] = await db.q<UserSqlRow>(`${USER_SELECT} WHERE u.id = $2`, [0, id]);
  if (!r) return null;
  const matches = (await db.q<MatchRow>(
    "SELECT * FROM matches WHERE created_by=$1 OR joined_by=$1 ORDER BY updated_at DESC LIMIT 200",
    [id]
  )).map(toMatch);
  const invited = await db.q<{ id: string; name: string; created_at: string }>(
    "SELECT id, name, created_at FROM users WHERE invited_by=$1 ORDER BY created_at DESC",
    [id]
  );
  const [{ sessions }] = await db.q<{ sessions: number }>(
    "SELECT COUNT(*)::int sessions FROM sessions WHERE user_id=$1 AND expires_at>$2",
    [id, Date.now()]
  );
  // head-to-head
  const h2h = new Map<string, { played: number; wins: number }>();
  for (const m of matches) {
    if (m.status !== "completed") continue;
    const opp = m.createdBy === id ? m.joinedBy! : m.createdBy;
    const e = h2h.get(opp) ?? { played: 0, wins: 0 };
    e.played++;
    if (m.winnerId === id) e.wins++;
    h2h.set(opp, e);
  }
  return {
    user: mapUser(r),
    matches,
    invited: invited.map((x) => ({ id: x.id, name: x.name, createdAt: Number(x.created_at) })),
    sessions,
    h2h: [...h2h.entries()].map(([opp, v]) => ({ opp, ...v })).sort((a, b) => b.played - a.played).slice(0, 8),
  };
}

/* ---------------- matches ---------------- */
export async function listMatches(opts: { status?: string; game?: string; q?: string; page?: number; per?: number; limit?: number }) {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  const statuses: MatchStatus[] = ["open", "requested", "running", "completed", "cancelled", "disputed"];
  if (opts.status && statuses.includes(opts.status as MatchStatus)) {
    params.push(opts.status);
    where.push(`m.status = $${params.length}`);
  }
  if (opts.game) {
    params.push(opts.game);
    where.push(`m.game = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    where.push(`(LOWER(h.name) LIKE $${params.length} OR LOWER(g.name) LIKE $${params.length} OR m.room_code LIKE $${params.length} OR m.id LIKE $${params.length})`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const per = opts.limit ?? opts.per ?? 30;
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db.q<MatchRow & { host_name: string; guest_name: string | null; winner_name: string | null }>(
    `SELECT m.*, h.name AS host_name, g.name AS guest_name, wn.name AS winner_name
     FROM matches m JOIN users h ON h.id = m.created_by
     LEFT JOIN users g ON g.id = m.joined_by LEFT JOIN users wn ON wn.id = m.winner_id
     ${w} ORDER BY m.updated_at DESC LIMIT ${per} OFFSET ${(page - 1) * per}`,
    params
  );
  const [{ n }] = await db.q<{ n: number }>(
    `SELECT COUNT(*)::int n FROM matches m JOIN users h ON h.id = m.created_by LEFT JOIN users g ON g.id = m.joined_by ${w}`,
    params
  );
  return {
    rows: rows.map((r) => ({ ...toMatch(r), hostName: r.host_name, guestName: r.guest_name, winnerName: r.winner_name })),
    total: n,
    page,
    per,
  };
}
export type AdminMatchRow = Match & { hostName: string; guestName: string | null; winnerName: string | null };

export async function getMatch(id: string) {
  const db = await getDb();
  const [r] = await db.q<MatchRow>("SELECT * FROM matches WHERE id=$1", [id]);
  if (!r) return null;
  const m = toMatch(r);
  const ids = [m.createdBy, m.joinedBy].filter(Boolean) as string[];
  const users = (await db.q<UserSqlRow>(`${USER_SELECT} WHERE u.id = ANY($2)`, [0, ids])).map(mapUser);
  const history = await db.q<{ action: string; detail: string | null; at: string; admin: string | null }>(
    `SELECT a.action, a.detail, a.at, ad.name AS admin FROM audit_log a LEFT JOIN admins ad ON ad.id = a.admin_id
     WHERE a.target=$1 ORDER BY a.at DESC`,
    [id]
  );
  return { match: m, users, history: history.map((h) => ({ ...h, at: Number(h.at) })) };
}

/* ---------------- leaderboard ---------------- */
export async function leaderboard(days: number | null) {
  const db = await getDb();
  const since = days ? Date.now() - days * DAY : 0;
  const rows = await db.q<UserSqlRow>(
    `${USER_SELECT} WHERE COALESCE(s.played,0) > 0 ORDER BY s.wins DESC, s.played ASC LIMIT 100`,
    [since]
  );
  return rows.map(mapUser).sort((a, b) => b.wins - a.wins || b.rate - a.rate || a.played - b.played);
}

/* ---------------- audit ---------------- */
export async function auditLog(limit = 200) {
  const db = await getDb();
  const rows = await db.q<{ id: string; action: string; target: string | null; detail: string | null; at: string; admin: string | null }>(
    `SELECT a.id, a.action, a.target, a.detail, a.at, ad.name AS admin
     FROM audit_log a LEFT JOIN admins ad ON ad.id = a.admin_id ORDER BY a.at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ ...r, at: Number(r.at) }));
}

export async function adminList() {
  const db = await getDb();
  return (await db.q<{ id: string; email: string; name: string; created_at: string; last_login_at: string | null }>(
    "SELECT id, email, name, created_at, last_login_at FROM admins ORDER BY created_at"
  )).map((a) => ({ ...a, createdAt: Number(a.created_at), lastLoginAt: a.last_login_at ? Number(a.last_login_at) : null }));
}
