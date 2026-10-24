import "server-only";
import { getDb } from "./db";
import { _rows, destLabel, getKyc, type DepositRow, type KycRow, type WithdrawalRow } from "./wallet";
import { RZP_CONFIGURED, PAYMENTS_DEMO } from "./razorpay";
import type { Tone } from "@/lib/types";

const DAY = 86400000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
type Who = { user_name: string; user_email: string | null; user_tone: Tone };
const who = (r: Who) => ({ userName: r.user_name, userEmail: r.user_email ?? "", userTone: r.user_tone });
const JOIN_USER = "JOIN users u ON u.id = x.user_id";
const USER_COLS = "u.name AS user_name, u.email AS user_email, u.tone AS user_tone";

export const paymentsMode = () => (RZP_CONFIGURED ? "live" : PAYMENTS_DEMO ? "demo" : "off");

/* ---------------- deposits ---------------- */
export async function listDeposits(opts: { status?: string; q?: string; page?: number; per?: number; userId?: string }) {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status && ["pending", "success", "failed", "expired"].includes(opts.status)) {
    params.push(opts.status);
    where.push(`x.status = $${params.length}`);
  }
  if (opts.userId) {
    params.push(opts.userId);
    where.push(`x.user_id = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(LOWER(u.name) LIKE ${p} OR LOWER(u.email) LIKE ${p} OR LOWER(x.id) LIKE ${p} OR LOWER(COALESCE(x.payment_id,'')) LIKE ${p} OR LOWER(COALESCE(x.qr_id,'')) LIKE ${p} OR LOWER(COALESCE(x.payer,'')) LIKE ${p})`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const per = opts.per ?? 30;
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db.q<DepositRow & Who>(
    `SELECT x.*, ${USER_COLS} FROM deposits x ${JOIN_USER} ${w} ORDER BY x.created_at DESC LIMIT ${per} OFFSET ${(page - 1) * per}`,
    params
  );
  const [{ n }] = await db.q<{ n: number }>(`SELECT COUNT(*)::int n FROM deposits x ${JOIN_USER} ${w}`, params);
  return {
    rows: rows.map((r) => ({ ...(_rows.toDeposit(r)), qrId: r.qr_id, payer: r.payer, userId: r.user_id, lastCheckedAt: r.last_checked_at ? Number(r.last_checked_at) : null, ...who(r) })),
    total: n,
    page,
    per,
  };
}
export type AdminDeposit = Awaited<ReturnType<typeof listDeposits>>["rows"][number];

export async function depositStats() {
  const db = await getDb();
  const today = startOfToday();
  const [s] = await db.q<{ today_sum: string; today_n: number; week_sum: string; all_sum: string; pending: number; failed_today: number; expired_today: number }>(
    `SELECT COALESCE(SUM(paid_amount) FILTER (WHERE status='success' AND updated_at >= $1),0) today_sum,
            COUNT(*) FILTER (WHERE status='success' AND updated_at >= $1)::int today_n,
            COALESCE(SUM(paid_amount) FILTER (WHERE status='success' AND updated_at >= $2),0) week_sum,
            COALESCE(SUM(paid_amount) FILTER (WHERE status='success'),0) all_sum,
            COUNT(*) FILTER (WHERE status='pending')::int pending,
            COUNT(*) FILTER (WHERE status='failed' AND updated_at >= $1)::int failed_today,
            COUNT(*) FILTER (WHERE status='expired' AND updated_at >= $1)::int expired_today
     FROM deposits`,
    [today, today - 6 * DAY]
  );
  return {
    todaySum: Number(s.today_sum), todayN: s.today_n, weekSum: Number(s.week_sum), allSum: Number(s.all_sum),
    pending: s.pending, failedToday: s.failed_today, expiredToday: s.expired_today,
  };
}

export async function listPaymentEvents(opts: { page?: number; per?: number; depositId?: string }) {
  const db = await getDb();
  const per = opts.per ?? 40;
  const page = Math.max(1, opts.page ?? 1);
  const params: unknown[] = [];
  let w = "";
  if (opts.depositId) {
    params.push(opts.depositId);
    w = "WHERE deposit_id = $1";
  }
  const rows = await db.q<{ id: string; event: string; deposit_id: string | null; payment_id: string | null; result: string | null; payload: unknown; received_at: string }>(
    `SELECT * FROM payment_events ${w} ORDER BY received_at DESC LIMIT ${per} OFFSET ${(page - 1) * per}`,
    params
  );
  const [{ n }] = await db.q<{ n: number }>(`SELECT COUNT(*)::int n FROM payment_events ${w}`, params);
  return {
    rows: rows.map((r) => ({
      id: r.id, event: r.event, depositId: r.deposit_id, paymentId: r.payment_id, result: r.result,
      payload: typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload, null, 2),
      at: Number(r.received_at),
    })),
    total: n,
    page,
    per,
  };
}

/* ---------------- withdrawals ---------------- */
export async function listWithdrawals(opts: { status?: string; q?: string; page?: number; per?: number; userId?: string }) {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status === "todo") where.push("x.status IN ('pending','approved')");
  else if (opts.status && ["pending", "approved", "paid", "declined", "cancelled"].includes(opts.status)) {
    params.push(opts.status);
    where.push(`x.status = $${params.length}`);
  }
  if (opts.userId) {
    params.push(opts.userId);
    where.push(`x.user_id = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(LOWER(u.name) LIKE ${p} OR LOWER(u.email) LIKE ${p} OR LOWER(x.id) LIKE ${p} OR LOWER(COALESCE(x.utr,'')) LIKE ${p})`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const per = opts.per ?? 30;
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db.q<WithdrawalRow & Who & { balance: string; kyc_name: string | null; kyc_pan: string | null; kyc_status: string | null; reviewer: string | null }>(
    `SELECT x.*, ${USER_COLS}, u.balance, k.full_name AS kyc_name, k.pan AS kyc_pan, k.status AS kyc_status, a.name AS reviewer
     FROM withdrawals x ${JOIN_USER} LEFT JOIN kyc k ON k.user_id = x.user_id LEFT JOIN admins a ON a.id = x.reviewed_by
     ${w} ORDER BY CASE x.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, x.created_at DESC
     LIMIT ${per} OFFSET ${(page - 1) * per}`,
    params
  );
  const [{ n }] = await db.q<{ n: number }>(`SELECT COUNT(*)::int n FROM withdrawals x ${JOIN_USER} ${w}`, params);
  return {
    rows: rows.map((r) => {
      const d = _rows.dest(r.destination);
      return {
        ...(_rows.toWithdrawal(r)),
        destinationFull: destLabel(r.method, d, false),
        dest: d,
        userId: r.user_id,
        balance: Number(r.balance),
        kycName: r.kyc_name,
        kycPan: r.kyc_pan,
        kycStatus: r.kyc_status,
        reviewer: r.reviewer,
        ...who(r),
      };
    }),
    total: n,
    page,
    per,
  };
}
export type AdminWithdrawal = Awaited<ReturnType<typeof listWithdrawals>>["rows"][number];

export async function withdrawalStats() {
  const db = await getDb();
  const [s] = await db.q<{ pending: number; pending_sum: string; approved: number; approved_sum: string; paid_today: string; paid_all: string }>(
    `SELECT COUNT(*) FILTER (WHERE status='pending')::int pending,
            COALESCE(SUM(amount) FILTER (WHERE status='pending'),0) pending_sum,
            COUNT(*) FILTER (WHERE status='approved')::int approved,
            COALESCE(SUM(amount) FILTER (WHERE status='approved'),0) approved_sum,
            COALESCE(SUM(amount) FILTER (WHERE status='paid' AND updated_at >= $1),0) paid_today,
            COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) paid_all
     FROM withdrawals`,
    [startOfToday()]
  );
  return {
    pending: s.pending, pendingSum: Number(s.pending_sum), approved: s.approved, approvedSum: Number(s.approved_sum),
    paidToday: Number(s.paid_today), paidAll: Number(s.paid_all),
  };
}

/* ---------------- KYC ---------------- */
export async function listKyc(opts: { status?: string; q?: string; page?: number; per?: number }) {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status && ["pending", "approved", "rejected"].includes(opts.status)) {
    params.push(opts.status);
    where.push(`x.status = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(LOWER(u.name) LIKE ${p} OR LOWER(u.email) LIKE ${p} OR LOWER(x.full_name) LIKE ${p} OR LOWER(x.pan) LIKE ${p} OR LOWER(COALESCE(x.upi_id,'')) LIKE ${p})`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const per = opts.per ?? 30;
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db.q<KycRow & Who & { reviewer: string | null }>(
    `SELECT x.*, ${USER_COLS}, a.name AS reviewer FROM kyc x ${JOIN_USER} LEFT JOIN admins a ON a.id = x.reviewed_by
     ${w} ORDER BY CASE x.status WHEN 'pending' THEN 0 ELSE 1 END, x.submitted_at DESC LIMIT ${per} OFFSET ${(page - 1) * per}`,
    params
  );
  const [{ n }] = await db.q<{ n: number }>(`SELECT COUNT(*)::int n FROM kyc x ${JOIN_USER} ${w}`, params);
  return {
    rows: rows.map((r) => ({
      userId: r.user_id, fullName: r.full_name, pan: r.pan, bankHolder: r.bank_holder, bankAccount: r.bank_account, bankIfsc: r.bank_ifsc,
      upiId: r.upi_id, status: r.status, rejectReason: r.reject_reason, submittedAt: Number(r.submitted_at),
      reviewedAt: r.reviewed_at ? Number(r.reviewed_at) : null, reviewer: r.reviewer, ...who(r),
    })),
    total: n,
    page,
    per,
  };
}

/* ---------------- one player ---------------- */
export async function userWallet(userId: string) {
  const db = await getDb();
  const [u] = await db.q<{ balance: string }>("SELECT balance FROM users WHERE id=$1", [userId]);
  const txns = await db.q<Parameters<typeof _rows.toTxn>[0] & { admin: string | null }>(
    "SELECT t.*, a.name AS admin FROM wallet_txns t LEFT JOIN admins a ON a.id = t.admin_id WHERE t.user_id=$1 ORDER BY t.at DESC LIMIT 200",
    [userId]
  );
  const [sums] = await db.q<{ dep: string; wd: string; won: string; staked: string; refunded: string }>(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE kind='deposit'),0) dep,
            COALESCE(-SUM(amount) FILTER (WHERE kind='withdraw'),0) - COALESCE(SUM(amount) FILTER (WHERE kind='withdraw_refund'),0) wd,
            COALESCE(SUM(amount) FILTER (WHERE kind='win'),0) won,
            COALESCE(-SUM(amount) FILTER (WHERE kind='stake'),0) staked,
            COALESCE(SUM(amount) FILTER (WHERE kind='refund'),0) refunded
     FROM wallet_txns WHERE user_id=$1`,
    [userId]
  );
  return {
    balance: Number(u?.balance ?? 0),
    kyc: await getKyc(db.q, userId, false),
    deposits: (await listDeposits({ userId, per: 50 })).rows,
    withdrawals: (await listWithdrawals({ userId, per: 50 })).rows,
    txns: txns.map((t) => ({ ..._rows.toTxn(t), admin: t.admin })),
    totals: {
      deposited: Number(sums.dep), withdrawn: Number(sums.wd), won: Number(sums.won),
      staked: Number(sums.staked) - Number(sums.refunded),
    },
  };
}

/* ---------------- dashboard + nav badges ---------------- */
export async function walletDashboard() {
  const db = await getDb();
  const [b] = await db.q<{ wallets: string; held: string; fees: string; fees_week: string }>(
    `SELECT (SELECT COALESCE(SUM(balance),0) FROM users) wallets,
            (SELECT COALESCE(SUM(amount * CASE WHEN joined_by IS NULL THEN 1 ELSE 2 END),0) FROM matches
               WHERE amount > 0 AND status IN ('open','requested','running','disputed')) held,
            (SELECT COALESCE(SUM(fee),0) FROM matches WHERE status='completed') fees,
            (SELECT COALESCE(SUM(fee),0) FROM matches WHERE status='completed' AND updated_at >= $1) fees_week`,
    [startOfToday() - 6 * DAY]
  );
  const [{ kyc }] = await db.q<{ kyc: number }>("SELECT COUNT(*)::int kyc FROM kyc WHERE status='pending'");
  return {
    deposits: await depositStats(),
    withdrawals: await withdrawalStats(),
    walletsTotal: Number(b.wallets),
    heldInMatches: Number(b.held),
    fees: Number(b.fees),
    feesWeek: Number(b.fees_week),
    kycPending: kyc,
    mode: paymentsMode(),
  };
}

export async function navCounts() {
  const db = await getDb();
  const [r] = await db.q<{ disputes: number; withdrawals: number; kyc: number }>(
    `SELECT (SELECT COUNT(*)::int FROM matches WHERE status='disputed') disputes,
            (SELECT COUNT(*)::int FROM withdrawals WHERE status IN ('pending','approved')) withdrawals,
            (SELECT COUNT(*)::int FROM kyc WHERE status='pending') kyc`
  );
  return r;
}
