import "server-only";
import crypto from "node:crypto";
import { getDb, type Q } from "./db";
import { getSettings } from "./settings";
import { Fail, fail } from "./errors";
import { notify } from "./notices";
import { balanceOf, holdStake, payWinner, refundStake, stakeFromInput } from "./wallet";
export { SESSION_COOKIE, userFromToken } from "./auth";
export { Fail, notify };
import { CANCEL_REASONS, RULES, gameBySlug, inr } from "@/lib/config";
import type { KycStatus, Match, Notice, Outcome, Tone, User } from "@/lib/types";

const id8 = () => crypto.randomBytes(6).toString("base64url").slice(0, 8);
const TONES: Tone[] = ["red", "green", "yellow", "blue"];

/* ---------- row mapping ---------- */
export type MatchRow = {
  id: string; game: string; note: string | null; created_by: string; joined_by: string | null;
  status: Match["status"]; room_code: string | null; room_code_deadline: string | number | null;
  started_at: string | number | null; first_result_at: string | number | null; results: Match["results"];
  winner_id: string | null; ended_reason: string | null; created_at: string | number; updated_at: string | number;
  amount: string | number; fee_pct: string | number; prize: string | number | null; fee: string | number | null;
};
const num = (v: string | number | null) => (v == null ? undefined : Number(v));
export const toMatch = (r: MatchRow): Match => ({
  id: r.id,
  game: r.game as Match["game"],
  note: r.note ?? undefined,
  createdBy: r.created_by,
  joinedBy: r.joined_by ?? undefined,
  status: r.status,
  roomCode: r.room_code ?? undefined,
  roomCodeDeadline: num(r.room_code_deadline),
  startedAt: num(r.started_at),
  firstResultAt: num(r.first_result_at),
  results: typeof r.results === "string" ? JSON.parse(r.results) : r.results ?? {},
  winnerId: r.winner_id ?? undefined,
  endedReason: r.ended_reason ?? undefined,
  amount: Number(r.amount ?? 0),
  feePct: Number(r.fee_pct ?? 0),
  prize: num(r.prize),
  fee: num(r.fee),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});
export async function saveMatch(q: Q, m: Match) {
  await q(
    `UPDATE matches SET joined_by=$2,status=$3,room_code=$4,room_code_deadline=$5,started_at=$6,
       first_result_at=$7,results=$8,winner_id=$9,ended_reason=$10,updated_at=$11,prize=$12,fee=$13 WHERE id=$1`,
    [m.id, m.joinedBy ?? null, m.status, m.roomCode ?? null, m.roomCodeDeadline ?? null, m.startedAt ?? null,
     m.firstResultAt ?? null, JSON.stringify(m.results), m.winnerId ?? null, m.endedReason ?? null, Date.now(),
     m.prize ?? null, m.fee ?? null]
  );
}

/** Match ended without a winner: both stakes go back. */
export async function refundBoth(q: Q, m: Match, why: string) {
  await refundStake(q, m.createdBy, m, why);
  await refundStake(q, m.joinedBy, m, why);
}

/** Releases join requests the player has on other rooms, returning their stakes. */
export async function releaseRequestsBy(q: Q, userId: string, exceptId: string | null, why: string) {
  const rows = (await q<MatchRow>(
    "SELECT * FROM matches WHERE joined_by=$1 AND status='requested' AND id<>$2 FOR UPDATE",
    [userId, exceptId ?? ""]
  )).map(toMatch);
  for (const m of rows) {
    await refundStake(q, userId, m, why);
    await q("UPDATE matches SET joined_by=NULL,status='open',updated_at=$2 WHERE id=$1", [m.id, Date.now()]);
  }
  return rows;
}

/** Deletes a room that hasn't started, refunding the host and any pending joiner. */
export async function removeRoom(q: Q, m: Match, why: string) {
  await refundStake(q, m.createdBy, m, why);
  await refundStake(q, m.joinedBy, m, why);
  await q("DELETE FROM matches WHERE id=$1", [m.id]);
}
export async function lockMatch(q: Q, id: string) {
  const [r] = await q<MatchRow>("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [id]);
  return r ? toMatch(r) : fail("This room no longer exists.");
}
export async function nameOf(q: Q, id?: string) {
  if (!id) return "Someone";
  const [r] = await q<{ name: string }>("SELECT name FROM users WHERE id=$1", [id]);
  return r?.name ?? "Someone";
}
async function hasRunning(q: Q, userId: string) {
  const rows = await q<MatchRow>(
    "SELECT * FROM matches WHERE status='running' AND (created_by=$1 OR joined_by=$1)",
    [userId]
  );
  return rows.map(toMatch).some((m) => !m.results[userId]);
}

/* ---------- read model ---------- */
export async function stateFor(meId: string | null) {
  const db = await getDb();
  await sweep();
  const users = await db.q<{ id: string; name: string; tone: Tone; invite_code: string; invited_by: string | null; created_at: string; email: string | null }>(
    "SELECT id,name,tone,invite_code,invited_by,created_at,email FROM users WHERE status='active' OR id=$1",
    [meId ?? ""]
  );
  const matches = (await db.q<MatchRow>(
    `SELECT * FROM matches WHERE status IN ('open','requested','running')
       OR updated_at > $1 OR created_by=$2 OR joined_by=$2
     ORDER BY updated_at DESC LIMIT 500`,
    [Date.now() - 30 * 86400000, meId ?? ""]
  )).map(toMatch);
  const notices = meId
    ? (await db.q<{ id: string; user_id: string; text: string; href: string | null; at: string; read: boolean }>(
        "SELECT * FROM notices WHERE user_id=$1 ORDER BY at DESC LIMIT 100",
        [meId]
      )).map<Notice>((n) => ({ id: n.id, userId: n.user_id, text: n.text, href: n.href ?? undefined, at: Number(n.at), read: n.read }))
    : [];
  const settings = await getSettings(db.q);
  const wallet = meId
    ? {
        balance: await balanceOf(db.q, meId),
        kyc: ((await db.q<{ status: KycStatus }>("SELECT status FROM kyc WHERE user_id=$1", [meId]))[0]?.status ?? null) as KycStatus | null,
      }
    : null;
  return {
    meId,
    wallet,
    settings: {
      announcement: settings.announcement.active ? settings.announcement.text : "",
      games: settings.games,
      maintenance: settings.maintenance.active ? settings.maintenance.text : "",
      commissionPct: settings.wallet.commissionPct,
    },
    // Only the signed-in player sees their own email and invite code; names, colours and who-invited-whom are public.
    users: users.map<User>((u) => ({
      id: u.id,
      name: u.name,
      tone: u.tone,
      inviteCode: u.id === meId ? u.invite_code : "",
      invitedBy: u.invited_by ?? undefined,
      createdAt: Number(u.created_at),
      email: u.id === meId ? u.email ?? "" : "",
    })),
    // Win screenshots are only sent to the two players.
    matches: matches.map((m) =>
      m.createdBy === meId || m.joinedBy === meId
        ? m
        : { ...m, results: Object.fromEntries(Object.entries(m.results).map(([k, v]) => [k, { ...v, screenshot: undefined }])) }
    ),
    notices,
  };
}

/* ---------- actions ---------- */
export type Action =
  | { type: "updateProfile"; name?: string; tone?: Tone }
  | { type: "createMatch"; game: string; amount: number }
  | { type: "deleteMatch"; id: string }
  | { type: "requestJoin"; id: string }
  | { type: "withdrawRequest"; id: string }
  | { type: "acceptRequest"; id: string }
  | { type: "rejectRequest"; id: string }
  | { type: "setRoomCode"; id: string; code: string }
  | { type: "submitResult"; id: string; outcome: Outcome; reason?: string; screenshot?: string }
  | { type: "markRead"; id?: string };

export async function run(me: string, a: Action): Promise<{ id?: string }> {
  const db = await getDb();
  return db.tx(async (q) => {
    switch (a.type) {
      case "updateProfile": {
        if (a.name !== undefined && a.name.trim().length < 2) fail("Enter a name with at least 2 letters.");
        if (a.tone && !TONES.includes(a.tone)) fail("Pick one of the four colours.");
        if (a.name !== undefined) await q("UPDATE users SET name=$2 WHERE id=$1", [me, a.name.trim().slice(0, 40)]);
        if (a.tone) await q("UPDATE users SET tone=$2 WHERE id=$1", [me, a.tone]);
        return {};
      }

      case "createMatch": {
        const g = gameBySlug(a.game);
        const st = await getSettings(q);
        if (st.maintenance.active) fail(st.maintenance.text || "The app is under maintenance. Try again soon.");
        if (!g || !st.games[g.slug]) fail("This game isn't open right now.");
        if (await hasRunning(q, me)) fail("Finish your running match before creating a new one.");
        const [{ n }] = await q<{ n: number }>(
          "SELECT COUNT(*)::int AS n FROM matches WHERE created_by=$1 AND status IN ('open','requested')",
          [me]
        );
        if (n >= RULES.maxOpenMatches) fail(`You can have ${RULES.maxOpenMatches} open rooms at a time. Delete one first.`);
        const amount = stakeFromInput(a.amount);
        const id = id8();
        const now = Date.now();
        await q(
          "INSERT INTO matches (id,game,created_by,status,results,amount,fee_pct,created_at,updated_at) VALUES ($1,$2,$3,'open','{}',$4,$5,$6,$6)",
          [id, a.game, me, amount, st.wallet.commissionPct, now]
        );
        await holdStake(q, me, { id, amount }, `Room entry · ${g!.name}`);
        return { id };
      }

      case "deleteMatch": {
        const m = await lockMatch(q, a.id);
        if (m.createdBy !== me) fail("Only the host can delete this room.");
        if (m.status !== "open" && m.status !== "requested") fail("This room has already started.");
        if (m.joinedBy)
          await notify(q, m.joinedBy, `${await nameOf(q, me)} deleted the room you asked to join.${m.amount ? ` ${inr(m.amount)} is back in your wallet.` : ""}`, "/wallet");
        await removeRoom(q, m, "Room deleted");
        return {};
      }

      case "requestJoin": {
        const st = await getSettings(q);
        if (st.maintenance.active) fail(st.maintenance.text || "The app is under maintenance. Try again soon.");
        const m = await lockMatch(q, a.id);
        if (m.createdBy === me) fail("This is your own room.");
        if (m.status !== "open") fail("Someone else already asked to join this room.");
        if (await hasRunning(q, me)) fail("Finish your running match first.");
        await holdStake(q, me, m, `Room entry · ${gameBySlug(m.game)?.name ?? "match"}`);
        m.joinedBy = me;
        m.status = "requested";
        await saveMatch(q, m);
        await notify(q, m.createdBy, `${await nameOf(q, me)} wants to join your ${gameBySlug(m.game)?.name} room.`, `/match/${m.id}`);
        return { id: m.id };
      }

      case "withdrawRequest": {
        const m = await lockMatch(q, a.id);
        if (m.joinedBy !== me || m.status !== "requested") fail("There is no request to withdraw.");
        await refundStake(q, me, m, "Join request withdrawn");
        await notify(q, m.createdBy, `${await nameOf(q, me)} withdrew their request.`, `/match/${m.id}`);
        m.joinedBy = undefined;
        m.status = "open";
        await saveMatch(q, m);
        return {};
      }

      case "acceptRequest": {
        const m = await lockMatch(q, a.id);
        if (m.createdBy !== me || m.status !== "requested" || !m.joinedBy) fail("There is no request to accept.");
        if (await hasRunning(q, me)) fail("Finish your running match first.");
        const now = Date.now();
        m.status = "running";
        m.startedAt = now;
        m.roomCodeDeadline = now + RULES.roomCodeMinutes * 60000;
        await saveMatch(q, m);
        // The joiner can only be in one match: release their other pending requests (and refund those stakes).
        await releaseRequestsBy(q, m.joinedBy!, m.id, "Join request released: another match started");
        await notify(q, m.joinedBy!, `${await nameOf(q, me)} accepted. Wait for the room code.`, `/match/${m.id}`);
        return {};
      }

      case "rejectRequest": {
        const m = await lockMatch(q, a.id);
        if (m.createdBy !== me || m.status !== "requested" || !m.joinedBy) fail("There is no request to decline.");
        await refundStake(q, m.joinedBy, m, "Join request declined");
        await notify(q, m.joinedBy!, `${await nameOf(q, me)} declined your request.${m.amount ? ` ${inr(m.amount)} is back in your wallet.` : ""}`, `/play/${m.game}`);
        m.joinedBy = undefined;
        m.status = "open";
        await saveMatch(q, m);
        return {};
      }

      case "setRoomCode": {
        const m = await lockMatch(q, a.id);
        if (m.createdBy !== me) fail("Only the host sets the room code.");
        if (m.status !== "running") fail("This match isn't running.");
        const c = (a.code ?? "").replace(/\s/g, "");
        if (!RULES.roomCodePattern.test(c)) fail("Room codes are 8 digits and start with 0.");
        const updated = !!m.roomCode;
        m.roomCode = c;
        m.roomCodeDeadline = undefined;
        await saveMatch(q, m);
        await notify(q, m.joinedBy!, updated ? `Room code changed to ${c}.` : `Room code is ready: ${c}. Open Ludo King and join.`, `/match/${m.id}`);
        return {};
      }

      case "submitResult": {
        const m = await lockMatch(q, a.id);
        if (m.createdBy !== me && m.joinedBy !== me) fail("You're not in this match.");
        if (m.status !== "running") fail("This match is already closed.");
        if (m.results[me]) fail("You've already posted your result.");
        if (!["won", "lost", "cancel"].includes(a.outcome)) fail("Pick won, lost or cancel.");
        if (a.outcome === "won") {
          if (!a.screenshot || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(a.screenshot))
            fail("Add a screenshot of the win screen (JPG, PNG, WebP or GIF).");
          if (a.screenshot!.length > 1_500_000) fail("Screenshot is too large. Try a smaller image.");
        }
        if (a.outcome === "cancel" && !CANCEL_REASONS.some((r) => r.id === a.reason)) fail("Pick a reason for cancelling.");
        if (a.outcome !== "cancel" && !m.roomCode) fail("The room code hasn't been shared yet.");
        const now = Date.now();
        m.results[me] = {
          outcome: a.outcome,
          reason: a.outcome === "cancel" ? a.reason : undefined,
          screenshot: a.outcome === "won" ? a.screenshot : undefined,
          at: now,
        };
        m.firstResultAt ??= now;
        const other = m.createdBy === me ? m.joinedBy! : m.createdBy;
        await resolve(q, m, me, other);
        await saveMatch(q, m);
        return {};
      }

      case "markRead": {
        if (a.id) await q("UPDATE notices SET read=TRUE WHERE id=$1 AND user_id=$2", [a.id, me]);
        else await q("UPDATE notices SET read=TRUE WHERE user_id=$1", [me]);
        return {};
      }
    }
    return fail("Unknown action.");
  });
}

/* ---------- result rules ---------- */
export async function finish(q: Q, m: Match, winner: string, why?: string) {
  m.status = "completed";
  m.winnerId = winner;
  m.endedReason = why;
  const loser = winner === m.createdBy ? m.joinedBy! : m.createdBy;
  await payWinner(q, m, winner);
  await notify(q, winner, `You won against ${await nameOf(q, loser)}.${m.prize ? ` ${inr(m.prize)} added to your wallet.` : ""}`, `/match/${m.id}`);
  await notify(q, loser, `${await nameOf(q, winner)} won this one.`, `/match/${m.id}`);
}

async function resolve(q: Q, m: Match, poster: string, other: string) {
  const a = m.results[poster];
  const b = m.results[other];
  if (a.outcome === "lost") return finish(q, m, other); // conceding closes it straight away
  if (!b) {
    await notify(q, other, `${await nameOf(q, poster)} posted "${a.outcome === "won" ? "I won" : "Cancel"}". Post your result within ${RULES.resultMinutes} minutes.`, `/match/${m.id}`);
    return;
  }
  if (a.outcome === "won" && b.outcome === "lost") return finish(q, m, poster);
  if (a.outcome === "cancel" && b.outcome === "cancel") {
    m.status = "cancelled";
    m.endedReason = "Both players cancelled.";
    await refundBoth(q, m, "Match cancelled");
    await notify(q, other, "Match cancelled by both players.", `/match/${m.id}`);
    await notify(q, poster, "Match cancelled by both players.", `/match/${m.id}`);
    return;
  }
  m.status = "disputed"; // won+won, won+cancel, cancel+won
  m.endedReason = "Results don't match. Support will review the screenshots.";
  await notify(q, other, "Results don't match. This match is under review.", `/match/${m.id}`);
  await notify(q, poster, "Results don't match. This match is under review.", `/match/${m.id}`);
}

/* ---------- timers (run on every state read) ---------- */
export async function sweep() {
  const db = await getDb();
  const now = Date.now();
  // Housekeeping now and then: expired sessions and old login codes.
  if (Math.random() < 0.005) {
    db.q("DELETE FROM sessions WHERE expires_at < $1", [now]).catch(() => {});
    db.q("DELETE FROM admin_sessions WHERE expires_at < $1", [now]).catch(() => {});
    db.q("DELETE FROM email_otps WHERE expires_at < $1 AND hour_start < $2", [now, now - 3_600_000]).catch(() => {});
  }
  const due = (await db.q<MatchRow>(
    `SELECT * FROM matches WHERE status='running' AND (
       (room_code IS NULL AND room_code_deadline < $1) OR (first_result_at < $2))`,
    [now, now - RULES.resultMinutes * 60000]
  )).map(toMatch);
  for (const d of due) {
    await db.tx(async (q) => {
      const m = await lockMatch(q, d.id);
      if (m.status !== "running") return;
      if (!m.roomCode && m.roomCodeDeadline && now > m.roomCodeDeadline) {
        m.status = "cancelled";
        m.endedReason = "The host didn't share a room code in time.";
        await refundBoth(q, m, "Match cancelled: no room code");
        await notify(q, m.createdBy, "Match cancelled: no room code within the time limit.", `/match/${m.id}`);
        await notify(q, m.joinedBy!, "Match cancelled: the host didn't share a room code.", `/match/${m.id}`);
      } else if (m.firstResultAt) {
        // Whoever posted is taken as final when the other player stays silent.
        const [poster] = Object.keys(m.results);
        const silent = poster === m.createdBy ? m.joinedBy! : m.createdBy;
        const r = m.results[poster];
        if (r.outcome === "won") await finish(q, m, poster, `Opponent didn't post a result in ${RULES.resultMinutes} minutes.`);
        else if (r.outcome === "lost") await finish(q, m, silent);
        else {
          m.status = "cancelled";
          m.endedReason = "Cancelled; opponent didn't respond.";
          await refundBoth(q, m, "Match cancelled");
        }
      }
      await saveMatch(q, m);
    });
  }
}
