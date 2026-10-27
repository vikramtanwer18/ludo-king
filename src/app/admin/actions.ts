"use server";

import { cookies, headers } from "next/headers";
import { LIMITS, clientIp, rateLimit, tooMany } from "@/server/ratelimit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import {
  ADMIN_COOKIE,
  AuthFail,
  adminLogin,
  adminLogout,
  audit,
  changeAdminPassword,
  requireAdmin,
} from "@/server/auth";
import {
  finish,
  lockMatch,
  nameOf,
  notify,
  refundBoth,
  releaseRequestsBy,
  removeRoom,
  saveMatch,
  toMatch,
  type MatchRow,
} from "@/server/logic";
import { getSettings, setSetting } from "@/server/settings";
import { shortId } from "@/server/security";
import { Fail } from "@/server/errors";
import { adjustBalance, adminRecheckDeposit, reviewKyc, reviewWithdrawal } from "@/server/wallet";
import type { GameSlug } from "@/lib/config";
import { GAMES, inr } from "@/lib/config";

export type FormState = { ok?: boolean; error?: string; message?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ---------- session ---------- */
export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const rl = await rateLimit(`admin-login:${clientIp(await headers())}`, ...LIMITS.adminLoginPerIp);
  if (!rl.ok) return { error: tooMany(rl.retryIn) };
  try {
    const { token, maxAge } = await adminLogin(str(f, "email"), String(f.get("password") ?? ""));
    (await cookies()).set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
      path: "/",
      maxAge,
    });
  } catch (e) {
    if (e instanceof AuthFail) return { error: e.message };
    console.error(e);
    return { error: "Couldn't sign in. Try again." };
  }
  redirect("/admin");
}

export async function logoutAction() {
  await adminLogout();
  redirect("/admin/login");
}

export async function changePasswordAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const next = String(f.get("next") ?? "");
  if (next !== String(f.get("confirm") ?? "")) return { error: "New passwords don't match." };
  try {
    await changeAdminPassword(a.id, String(f.get("current") ?? ""), next);
    return { ok: true, message: "Password changed. Other admin sessions were signed out." };
  } catch (e) {
    return { error: e instanceof AuthFail ? e.message : "Couldn't change the password." };
  }
}

/* ---------- players ---------- */
export async function suspendUserAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const id = str(f, "id");
  const reason = str(f, "reason").slice(0, 200);
  if (!reason) return { error: "Add a reason. The player sees it when they try to log in." };
  const db = await getDb();
  await db.tx(async (q) => {
    await q("UPDATE users SET status='suspended', suspended_reason=$2 WHERE id=$1", [id, reason]);
    await q("DELETE FROM sessions WHERE user_id=$1", [id]);
    // Free any rooms they were holding so other players aren't stuck. Stakes go back to the wallets.
    const rooms = (await q<MatchRow>("SELECT * FROM matches WHERE created_by=$1 AND status IN ('open','requested') FOR UPDATE", [id])).map(toMatch);
    for (const m of rooms) {
      if (m.joinedBy) await notify(q, m.joinedBy, `The room you asked to join was removed.${m.amount ? ` ${inr(m.amount)} is back in your wallet.` : ""}`, "/wallet");
      await removeRoom(q, m, "Room removed by support");
    }
    await releaseRequestsBy(q, id, null, "Join request released by support");
  });
  await audit(a.id, "user.suspend", id, reason);
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, message: "Player suspended and signed out everywhere." };
}

export async function unsuspendUserAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  const db = await getDb();
  await db.q("UPDATE users SET status='active', suspended_reason=NULL WHERE id=$1", [id]);
  await notify(db.q, id, "Your account is active again. Welcome back.", "/");
  await audit(a.id, "user.unsuspend", id);
  revalidatePath(`/admin/users/${id}`);
}

export async function forceLogoutAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  const db = await getDb();
  await db.q("DELETE FROM sessions WHERE user_id=$1", [id]);
  await audit(a.id, "user.force_logout", id);
  revalidatePath(`/admin/users/${id}`);
}

export async function renameUserAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const id = str(f, "id");
  const name = str(f, "name");
  if (name.length < 2 || name.length > 40) return { error: "Name must be 2 to 40 characters." };
  const db = await getDb();
  const old = await nameOf(db.q, id);
  await db.q("UPDATE users SET name=$2 WHERE id=$1", [id, name]);
  await audit(a.id, "user.rename", id, `${old} → ${name}`);
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, message: "Name updated." };
}

export async function messageUserAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const id = str(f, "id");
  const text = str(f, "text").slice(0, 280);
  if (!text) return { error: "Write a message first." };
  const db = await getDb();
  await notify(db.q, id, text);
  await audit(a.id, "user.message", id, text);
  return { ok: true, message: "Sent to the player's notifications." };
}

/* ---------- matches ---------- */
export async function resolveMatchAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const id = str(f, "id");
  const decision = str(f, "decision"); // user id of winner, or "cancel"
  const note = str(f, "note").slice(0, 200);
  const db = await getDb();
  try {
    await db.tx(async (q) => {
      const m = await lockMatch(q, id);
      if (!["disputed", "running"].includes(m.status)) throw new Error("Only disputed or live matches can be settled.");
      if (!m.joinedBy) throw new Error("This match has no second player.");
      if (decision === "cancel") {
        m.status = "cancelled";
        m.winnerId = undefined;
        m.endedReason = `Cancelled by support${note ? `: ${note}` : "."}`;
        await refundBoth(q, m, "Match cancelled by support");
        for (const uid of [m.createdBy, m.joinedBy]) await notify(q, uid, `Support cancelled your match${note ? `: ${note}` : "."}`, `/match/${m.id}`);
      } else if (decision === m.createdBy || decision === m.joinedBy) {
        await finish(q, m, decision, `Decided by support${note ? `: ${note}` : "."}`);
      } else throw new Error("Pick a winner or cancel.");
      await saveMatch(q, m);
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  await audit(a.id, decision === "cancel" ? "match.cancel" : "match.resolve", id, decision === "cancel" ? note : `winner ${await nameOf(db.q, decision)}${note ? ` — ${note}` : ""}`);
  revalidatePath(`/admin/matches/${id}`);
  return { ok: true, message: "Match settled. Both players were notified." };
}

export async function deleteRoomAction(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  const db = await getDb();
  const removed = await db.tx(async (q) => {
    const [r] = await q<MatchRow>("SELECT * FROM matches WHERE id=$1 FOR UPDATE", [id]);
    if (!r) return false;
    const m = toMatch(r);
    if (m.status !== "open" && m.status !== "requested") return false;
    const back = m.amount ? ` ${inr(m.amount)} is back in your wallet.` : "";
    await notify(q, m.createdBy, `Support removed one of your open rooms.${back}`, "/wallet");
    if (m.joinedBy) await notify(q, m.joinedBy, `The room you asked to join was removed by support.${back}`, "/wallet");
    await removeRoom(q, m, "Room removed by support");
    return true;
  });
  if (removed) await audit(a.id, "match.delete_room", id);
  redirect("/admin/matches");
}

/* ---------- settings & broadcast ---------- */
export async function saveAnnouncementAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const text = str(f, "text").slice(0, 300);
  const active = f.get("active") === "on";
  if (active && !text) return { error: "Write the announcement text, or turn it off." };
  const db = await getDb();
  await setSetting(db.q, "announcement", { text, active });
  await audit(a.id, "settings.announcement", undefined, active ? text : "turned off");
  revalidatePath("/admin/settings");
  return { ok: true, message: active ? "Announcement is live on the players' screens." : "Announcement turned off." };
}

export async function saveMaintenanceAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const text = str(f, "text").slice(0, 300);
  const active = f.get("active") === "on";
  const db = await getDb();
  await setSetting(db.q, "maintenance", { text: text || "We're making a few improvements. Back shortly.", active });
  await audit(a.id, "settings.maintenance", undefined, active ? "on" : "off");
  revalidatePath("/admin/settings");
  return { ok: true, message: active ? "Maintenance mode is on. New rooms and joins are blocked." : "Maintenance mode is off." };
}

export async function saveGamesAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const db = await getDb();
  const games = Object.fromEntries(GAMES.map((g) => [g.slug, f.get(`game_${g.slug}`) === "on"])) as Record<GameSlug, boolean>;
  await setSetting(db.q, "games", games);
  await audit(a.id, "settings.games", undefined, Object.entries(games).map(([k, v]) => `${k}:${v ? "on" : "off"}`).join(", "));
  revalidatePath("/admin/settings");
  return { ok: true, message: "Games updated." };
}

export async function broadcastAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const text = str(f, "text").slice(0, 280);
  const audience = str(f, "audience");
  if (!text) return { error: "Write a message first." };
  const db = await getDb();
  const since = Date.now() - 7 * 86400000;
  const users = await db.q<{ id: string }>(
    audience === "active7"
      ? "SELECT id FROM users WHERE status='active' AND last_seen_at >= $1"
      : "SELECT id FROM users WHERE status='active' AND $1::bigint >= 0",
    [since]
  );
  const now = Date.now();
  await db.tx(async (q) => {
    for (const u of users)
      await q("INSERT INTO notices (id,user_id,text,href,at,read) VALUES ($1,$2,$3,NULL,$4,FALSE)", [shortId(), u.id, text, now]);
  });
  await audit(a.id, "broadcast", audience, `${users.length} players: ${text}`);
  return { ok: true, message: `Sent to ${users.length} players.` };
}

/* ---------- wallet ---------- */
const failMsg = (e: unknown) => {
  if (e instanceof Fail) return e.message;
  console.error(e);
  return "Something went wrong. Try again.";
};

export async function reviewWithdrawalAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const id = str(f, "id");
  const op = str(f, "op") as "approve" | "decline" | "paid";
  if (!["approve", "decline", "paid"].includes(op)) return { error: "Pick an action." };
  const note = str(f, "note").slice(0, 200);
  const utr = str(f, "utr");
  try {
    const { userId, amount } = await reviewWithdrawal(a.id, id, op, { note, utr });
    await audit(a.id, `withdrawal.${op}`, userId, `${id} · ${inr(amount)}${utr ? ` · UTR ${utr}` : ""}${note ? ` · ${note}` : ""}`);
  } catch (e) {
    return { error: failMsg(e) };
  }
  revalidatePath("/admin/withdrawals");
  return { ok: true, message: op === "approve" ? "Approved. Send the money, then mark it paid." : op === "paid" ? "Marked as paid. The player was notified." : "Declined. The money is back in the player's wallet." };
}

export async function reviewKycAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const userId = str(f, "userId");
  const op = str(f, "op");
  const reason = str(f, "reason").slice(0, 200);
  try {
    await reviewKyc(a.id, userId, op === "approve", reason);
    await audit(a.id, op === "approve" ? "kyc.approve" : "kyc.reject", userId, reason || undefined);
  } catch (e) {
    return { error: failMsg(e) };
  }
  revalidatePath("/admin/kyc");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: op === "approve" ? "KYC approved." : "KYC rejected. The player was told why." };
}

export async function recheckDepositAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const id = str(f, "id");
  try {
    const msg = await adminRecheckDeposit(id);
    await audit(a.id, "deposit.recheck", id, msg);
    revalidatePath("/admin/payments");
    return { ok: true, message: msg };
  } catch (e) {
    return { error: failMsg(e) };
  }
}

export async function adjustBalanceAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const userId = str(f, "userId");
  const rupees = Number(str(f, "amount"));
  const dir = str(f, "dir") === "debit" ? -1 : 1;
  const reason = str(f, "reason").slice(0, 200);
  if (!Number.isFinite(rupees) || rupees <= 0 || Math.round(rupees * 100) !== rupees * 100) return { error: "Enter an amount in rupees, e.g. 100 or 49.50." };
  const paise = Math.round(rupees * 100) * dir;
  try {
    const bal = await adjustBalance(a.id, userId, paise, reason);
    await audit(a.id, dir > 0 ? "wallet.credit" : "wallet.debit", userId, `${inr(Math.abs(paise))} · ${reason}`);
    revalidatePath(`/admin/users/${userId}`);
    return { ok: true, message: `Done. New balance ${inr(bal ?? 0)}.` };
  } catch (e) {
    return { error: failMsg(e) };
  }
}

export async function saveWalletSettingsAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const pct = Number(str(f, "commissionPct"));
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) return { error: "Commission must be between 0 and 50%." };
  const commissionPct = Math.round(pct * 100) / 100;
  const db = await getDb();
  await setSetting(db.q, "wallet", { commissionPct });
  await audit(a.id, "settings.wallet", undefined, `commission ${commissionPct}%`);
  revalidatePath("/admin/settings");
  return { ok: true, message: `Commission set to ${commissionPct}%. It applies to rooms created from now on.` };
}

export async function currentSettings() {
  await requireAdmin();
  const db = await getDb();
  return getSettings(db.q);
}
