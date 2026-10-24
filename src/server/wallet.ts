import "server-only";
import crypto from "node:crypto";
import { getDb, type Q } from "./db";
import { fail } from "./errors";
import { notify } from "./notices";
import { shortId } from "./security";
import { getSettings } from "./settings";
import * as rzp from "./razorpay";
import { WALLET, inr, prizeFor } from "@/lib/config";
import type { Deposit, Kyc, KycStatus, Match, WalletTxn, Withdrawal } from "@/lib/types";

/*
 * Wallet rules. All amounts are in paise.
 *
 * Every balance change goes through move(): it updates users.balance (never below 0)
 * and writes one row to wallet_txns, inside the caller's transaction.
 */

export type TxnKind = "deposit" | "stake" | "refund" | "win" | "withdraw" | "withdraw_refund" | "adjust";

export async function move(
  q: Q,
  userId: string,
  amount: number,
  kind: TxnKind,
  ref?: string,
  note?: string,
  adminId?: string
) {
  if (!Number.isSafeInteger(amount) || amount === 0) return null;
  const rows = await q<{ balance: string }>(
    "UPDATE users SET balance = balance + $2 WHERE id=$1 AND balance + $2 >= 0 RETURNING balance",
    [userId, amount]
  );
  if (!rows.length) fail(amount < 0 ? "Not enough balance in your wallet. Add cash first." : "Player not found.");
  const balance = Number(rows[0].balance);
  await q(
    "INSERT INTO wallet_txns (id,user_id,kind,amount,balance_after,ref,note,admin_id,at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [shortId(), userId, kind, amount, balance, ref ?? null, note ?? null, adminId ?? null, Date.now()]
  );
  return balance;
}

export async function balanceOf(q: Q, userId: string) {
  const [r] = await q<{ balance: string }>("SELECT balance FROM users WHERE id=$1", [userId]);
  return Number(r?.balance ?? 0);
}

/* ===================== Match stakes ===================== */

/** Parses the rupee amount typed on Create room. */
export function stakeFromInput(raw: unknown) {
  const r = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(r)) fail("Enter the room amount.");
  if (!Number.isInteger(r) || r < WALLET.stakeMin || r > WALLET.stakeMax)
    fail(`Room amount must be between ${inr(WALLET.stakeMin * 100)} and ${inr(WALLET.stakeMax * 100)}.`);
  if (r % WALLET.stakeStep !== 0) fail(`Room amount must be a multiple of ₹${WALLET.stakeStep} (50, 100, 150…).`);
  return r * 100;
}

export async function holdStake(q: Q, userId: string, m: { id: string; amount: number }, note: string) {
  if (!m.amount) return;
  const bal = await balanceOf(q, userId);
  if (bal < m.amount) fail(`You need ${inr(m.amount)} in your wallet for this room. Your balance is ${inr(bal)}. Add cash first.`);
  await move(q, userId, -m.amount, "stake", m.id, note);
}

export async function refundStake(q: Q, userId: string | undefined | null, m: { id: string; amount: number }, note: string) {
  if (!userId || !m.amount) return;
  await move(q, userId, m.amount, "refund", m.id, note);
}

/** Pays the pot minus commission to the winner. Sets m.prize and m.fee. */
export async function payWinner(q: Q, m: Match, winner: string) {
  if (!m.amount || m.prize != null) return;
  const { fee, prize } = prizeFor(m.amount, m.feePct);
  m.prize = prize;
  m.fee = fee;
  await move(q, winner, prize, "win", m.id, "Match won");
}

/* ===================== Deposits (Razorpay UPI QR) ===================== */

type DepositRow = {
  id: string; user_id: string; amount: string; paid_amount: string | null; status: Deposit["status"]; qr_id: string | null;
  qr_image: string | null; close_by: string | null; payment_id: string | null; method: string | null; payer: string | null;
  failure_reason: string | null; demo: boolean; last_checked_at: string | null; created_at: string; updated_at: string;
};
const toDeposit = (r: DepositRow): Deposit => ({
  id: r.id,
  amount: Number(r.amount),
  paidAmount: r.paid_amount == null ? undefined : Number(r.paid_amount),
  status: r.status,
  qrImage: r.status === "pending" ? r.qr_image ?? undefined : undefined,
  closeBy: r.close_by == null ? undefined : Number(r.close_by),
  paymentId: r.payment_id ?? undefined,
  method: r.method ?? undefined,
  failureReason: r.failure_reason ?? undefined,
  demo: r.demo,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

export async function createDeposit(userId: string, rupeesRaw: unknown) {
  const rupees = Number(rupeesRaw);
  if (!Number.isInteger(rupees) || rupees < WALLET.depositMin || rupees > WALLET.depositMax)
    fail(`You can add ${inr(WALLET.depositMin * 100)} to ${inr(WALLET.depositMax * 100)} at a time.`);
  if (!rzp.RZP_CONFIGURED && !rzp.PAYMENTS_DEMO) fail("Adding cash isn't available right now. Try again later.");
  const amount = rupees * 100;
  const db = await getDb();
  const now = Date.now();

  const [{ n }] = await db.q<{ n: number }>(
    "SELECT COUNT(*)::int n FROM deposits WHERE user_id=$1 AND created_at > $2",
    [userId, now - 3600000]
  );
  if (n >= 10) fail("Too many payment attempts. Try again in an hour.");

  // Reuse an open QR for the same amount; close any other open ones.
  const open = (await db.q<DepositRow>("SELECT * FROM deposits WHERE user_id=$1 AND status='pending'", [userId])).map((r) => ({ r, d: toDeposit(r) }));
  for (const { r, d } of open) {
    const stillValid = (d.closeBy ?? 0) - now > 2 * 60000;
    if (d.amount === amount && stillValid && (r.qr_image || r.demo)) return d;
    await expireDeposit(r, "Replaced by a new QR code.");
  }

  const id = "dep_" + shortId();
  const closeBy = now + WALLET.qrMinutes * 60000;
  await db.q(
    "INSERT INTO deposits (id,user_id,amount,status,close_by,demo,created_at,updated_at) VALUES ($1,$2,$3,'pending',$4,$5,$6,$6)",
    [id, userId, amount, closeBy, !rzp.RZP_CONFIGURED, now]
  );
  if (rzp.RZP_CONFIGURED) {
    try {
      const qr = await rzp.createQr({ amount, depositId: id, userId, closeBy });
      await db.q("UPDATE deposits SET qr_id=$2, qr_image=$3, updated_at=$4 WHERE id=$1", [id, qr.id, qr.image_url, Date.now()]);
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[razorpay] create QR failed:", msg);
      await db.q("UPDATE deposits SET status='failed', failure_reason=$2, updated_at=$3 WHERE id=$1", [
        id,
        `Couldn't create the QR code: ${msg.slice(0, 200)}`,
        Date.now(),
      ]);
      fail("Couldn't start the payment. Try again in a minute.");
    }
  }
  const [row] = await db.q<DepositRow>("SELECT * FROM deposits WHERE id=$1", [id]);
  return toDeposit(row);
}

/** Credits a captured payment once. Safe to call again for the same deposit or payment. */
export async function creditDeposit(
  q: Q,
  depositId: string,
  p: { id: string; amount: number; method?: string | null; payer?: string | null }
) {
  const [d] = await q<DepositRow>("SELECT * FROM deposits WHERE id=$1 FOR UPDATE", [depositId]);
  if (!d) return "no matching deposit";
  if (d.status === "success") return "already credited";
  const [used] = await q("SELECT id FROM deposits WHERE payment_id=$1", [p.id]);
  if (used) return "payment already credited";
  if (!Number.isSafeInteger(p.amount) || p.amount <= 0) return "bad amount";
  await q(
    `UPDATE deposits SET status='success', paid_amount=$2, payment_id=$3, method=$4, payer=$5, failure_reason=NULL, updated_at=$6
     WHERE id=$1`,
    [depositId, p.amount, p.id, p.method ?? null, p.payer ?? null, Date.now()]
  );
  await move(q, d.user_id, p.amount, "deposit", depositId, `Added with ${p.method === "upi" || !p.method ? "UPI QR" : p.method}`);
  await notify(q, d.user_id, `${inr(p.amount)} added to your wallet.`, "/wallet");
  return d.status === "pending" ? "credited" : `credited (deposit was ${d.status})`;
}

async function closeDeposit(q: Q, depositId: string, status: "expired" | "failed", reason: string) {
  const r = await q(
    "UPDATE deposits SET status=$2, failure_reason=COALESCE(failure_reason,$3), updated_at=$4 WHERE id=$1 AND status='pending' RETURNING id",
    [depositId, status, reason, Date.now()]
  );
  return r.length ? status : "not pending";
}

async function expireDeposit(r: DepositRow, reason: string) {
  const db = await getDb();
  if (r.qr_id && rzp.RZP_CONFIGURED) {
    try {
      // A payment may have landed just now: check before closing.
      if (await reconcileWithRazorpay(r)) return;
      await rzp.closeQr(r.qr_id);
    } catch (e) {
      console.error("[razorpay] close QR failed:", (e as Error).message);
    }
  }
  await db.tx((q) => closeDeposit(q, r.id, "expired", reason));
}

/** Asks Razorpay for payments on this QR. Returns true if it credited one. */
async function reconcileWithRazorpay(r: DepositRow) {
  if (!r.qr_id || !rzp.RZP_CONFIGURED) return false;
  const db = await getDb();
  await db.q("UPDATE deposits SET last_checked_at=$2 WHERE id=$1", [r.id, Date.now()]);
  const payments = await rzp.fetchQrPayments(r.qr_id);
  const paid = payments.find((p) => p.status === "captured");
  if (paid) {
    const out = await db.tx((q) =>
      creditDeposit(q, r.id, { id: paid.id, amount: paid.amount, method: paid.method, payer: paid.vpa ?? paid.contact ?? null })
    );
    return out.startsWith("credited") || out === "already credited";
  }
  const failed = payments.find((p) => p.status === "failed");
  if (failed) {
    await db.q("UPDATE deposits SET failure_reason=$2 WHERE id=$1 AND status='pending'", [
      r.id,
      failed.error_description || "The last payment attempt failed.",
    ]);
  }
  return false;
}

/** Player polls this while the QR is on screen. Falls back to asking Razorpay if the webhook is late. */
export async function checkDeposit(userId: string, id: string) {
  const db = await getDb();
  const [r] = await db.q<DepositRow>("SELECT * FROM deposits WHERE id=$1 AND user_id=$2", [String(id), userId]);
  if (!r) fail("Payment not found.");
  const now = Date.now();
  if (r.status === "pending") {
    const expired = Number(r.close_by ?? 0) < now;
    try {
      if (r.demo) {
        if (expired) await db.tx((q) => closeDeposit(q, r.id, "expired", "No payment before the QR code expired."));
      } else if (expired) {
        await expireDeposit(r, "No payment before the QR code expired.");
      } else if (!r.last_checked_at || now - Number(r.last_checked_at) > 15000) {
        await reconcileWithRazorpay(r);
      }
    } catch (e) {
      console.error("[razorpay] check failed:", (e as Error).message);
    }
  }
  const [row] = await db.q<DepositRow>("SELECT * FROM deposits WHERE id=$1", [r.id]);
  return { deposit: toDeposit(row), balance: await balanceOf(db.q, userId) };
}

/** Local testing without Razorpay keys. */
export async function simulateDeposit(userId: string, id: string) {
  if (!rzp.PAYMENTS_DEMO) fail("Not available.");
  const db = await getDb();
  const [r] = await db.q<DepositRow>("SELECT * FROM deposits WHERE id=$1 AND user_id=$2", [String(id), userId]);
  if (!r || !r.demo) fail("Payment not found.");
  if (r.status !== "pending") fail("This QR code is no longer active.");
  await db.tx((q) => creditDeposit(q, r.id, { id: "pay_demo_" + shortId(), amount: Number(r.amount), method: "upi", payer: "demo@upi" }));
  return checkDeposit(userId, id);
}

/** Admin: re-check a pending deposit with Razorpay. */
export async function adminRecheckDeposit(id: string) {
  const db = await getDb();
  const [r] = await db.q<DepositRow>("SELECT * FROM deposits WHERE id=$1", [id]);
  if (!r) fail("Deposit not found.");
  if (r.status === "success") return "Already credited.";
  if (!r.qr_id || !rzp.RZP_CONFIGURED) return "No Razorpay QR code for this deposit.";
  const credited = await reconcileWithRazorpay(r);
  if (credited) return "Payment found and credited to the wallet.";
  if (r.status === "pending" && Number(r.close_by ?? 0) < Date.now()) {
    await expireDeposit(r, "No payment before the QR code expired.");
    return "No payment found. Marked as expired.";
  }
  return "No payment found yet.";
}

/* ---------- webhook ---------- */

// eslint-disable-next-line
type Json = Record<string, any>;

export async function handleRazorpayEvent(eventId: string | null, raw: string, ev: Json) {
  const db = await getDb();
  const event = String(ev.event ?? "");
  const qr: Json | undefined = ev.payload?.qr_code?.entity;
  const pay: Json | undefined = ev.payload?.payment?.entity;
  const payNotes = pay?.notes && !Array.isArray(pay.notes) ? (pay.notes as Json) : {};
  const id = eventId || "sha_" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);

  let depositId: string | undefined = qr?.notes?.deposit_id ?? payNotes.deposit_id;
  if (!depositId && qr?.id) depositId = (await db.q<{ id: string }>("SELECT id FROM deposits WHERE qr_id=$1", [qr.id]))[0]?.id;
  if (!depositId && pay?.id) depositId = (await db.q<{ id: string }>("SELECT id FROM deposits WHERE payment_id=$1", [pay.id]))[0]?.id;

  // One transaction: if processing fails, the event isn't stored and Razorpay's retry is processed again.
  return db.tx(async (q) => {
    const fresh = await q(
      `INSERT INTO payment_events (id,event,deposit_id,payment_id,result,payload,received_at)
       VALUES ($1,$2,$3,$4,'received',$5,$6) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, event, depositId ?? null, pay?.id ?? null, raw, Date.now()]
    );
    if (!fresh.length) return "duplicate";

    let result = "ignored";
    if (!depositId) result = "no matching deposit";
    else if ((event === "qr_code.credited" || event === "payment.captured") && pay?.status === "captured") {
      result = await creditDeposit(q, depositId, {
        id: String(pay.id),
        amount: Number(pay.amount),
        method: pay.method ?? "upi",
        payer: pay.vpa ?? pay.contact ?? null,
      });
    } else if (event === "qr_code.closed") {
      result = Number(qr?.payments_amount_received ?? 0) > 0
        ? "closed after payment"
        : await closeDeposit(q, depositId, "expired", qr?.close_reason === "on_demand" ? "QR code was closed." : "No payment before the QR code expired.");
    } else if (event === "payment.failed") {
      await q("UPDATE deposits SET failure_reason=$2, updated_at=$3 WHERE id=$1 AND status='pending'", [
        depositId,
        String(pay?.error_description || "Payment failed.").slice(0, 300),
        Date.now(),
      ]);
      result = "payment failed";
    }
    await q("UPDATE payment_events SET result=$2 WHERE id=$1", [id, result]);
    return result;
  });
}

/* ===================== KYC ===================== */

type KycRow = {
  user_id: string; full_name: string; pan: string; bank_holder: string | null; bank_account: string | null; bank_ifsc: string | null;
  upi_id: string | null; status: KycStatus; reject_reason: string | null; submitted_at: string; reviewed_at: string | null;
};
export const maskAccount = (a: string) => (a.length <= 4 ? a : "X".repeat(Math.min(8, a.length - 4)) + a.slice(-4));
const toKyc = (r: KycRow, mask: boolean): Kyc => ({
  fullName: r.full_name,
  pan: mask ? r.pan.slice(0, 2) + "XXX" + r.pan.slice(5, 9).replace(/./g, "X") + r.pan.slice(-1) : r.pan,
  bankHolder: r.bank_holder ?? undefined,
  bankAccount: r.bank_account ? (mask ? maskAccount(r.bank_account) : r.bank_account) : undefined,
  bankIfsc: r.bank_ifsc ?? undefined,
  upiId: r.upi_id ?? undefined,
  status: r.status,
  rejectReason: r.reject_reason ?? undefined,
  submittedAt: Number(r.submitted_at),
});

export async function getKyc(q: Q, userId: string, mask = true) {
  const [r] = await q<KycRow>("SELECT * FROM kyc WHERE user_id=$1", [userId]);
  return r ? toKyc(r, mask) : null;
}

const clean = (v: unknown, max = 100) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function saveKyc(userId: string, input: Record<string, unknown>) {
  const fullName = clean(input.fullName, 80);
  const pan = clean(input.pan, 10).toUpperCase();
  const useBank = !!input.useBank;
  const useUpi = !!input.useUpi;
  const holder = clean(input.bankHolder, 80);
  const account = String(input.bankAccount ?? "").replace(/\s/g, "");
  const account2 = String(input.bankAccountConfirm ?? "").replace(/\s/g, "");
  const ifsc = clean(input.bankIfsc, 11).toUpperCase();
  const upi = clean(input.upiId, 100).toLowerCase();

  if (fullName.length < 3) fail("Enter your full name as it is on your PAN card.");
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) fail("Enter a valid PAN, e.g. ABCDE1234F.");
  if (!useBank && !useUpi) fail("Add a bank account or a UPI ID for withdrawals.");
  if (useBank) {
    if (holder.length < 3) fail("Enter the account holder's name.");
    if (!/^\d{9,18}$/.test(account)) fail("Account number should be 9 to 18 digits.");
    if (account !== account2) fail("Account numbers don't match.");
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) fail("Enter a valid IFSC code, e.g. SBIN0001234.");
  }
  if (useUpi && !/^[a-z0-9.\-_]{2,256}@[a-z]{2,64}$/.test(upi)) fail("Enter a valid UPI ID, e.g. name@okaxis.");

  const db = await getDb();
  await db.tx(async (q) => {
    const [taken] = await q("SELECT 1 FROM kyc WHERE pan=$1 AND user_id<>$2", [pan, userId]);
    if (taken) fail("This PAN is already linked to another account. Contact support.");
    await q(
      `INSERT INTO kyc (user_id,full_name,pan,bank_holder,bank_account,bank_ifsc,upi_id,status,reject_reason,submitted_at,reviewed_at,reviewed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NULL,$8,NULL,NULL)
       ON CONFLICT (user_id) DO UPDATE SET full_name=$2, pan=$3, bank_holder=$4, bank_account=$5, bank_ifsc=$6, upi_id=$7,
         status='pending', reject_reason=NULL, submitted_at=$8, reviewed_at=NULL, reviewed_by=NULL`,
      [userId, fullName, pan, useBank ? holder : null, useBank ? account : null, useBank ? ifsc : null, useUpi ? upi : null, Date.now()]
    );
  });
  return getKyc(db.q, userId);
}

export async function reviewKyc(adminId: string, userId: string, approve: boolean, reason: string) {
  const db = await getDb();
  if (!approve && !reason) fail("Add a reason. The player sees it.");
  await db.tx(async (q) => {
    const r = await q(
      "UPDATE kyc SET status=$2, reject_reason=$3, reviewed_at=$4, reviewed_by=$5 WHERE user_id=$1 RETURNING user_id",
      [userId, approve ? "approved" : "rejected", approve ? null : reason, Date.now(), adminId]
    );
    if (!r.length) fail("KYC not found.");
    await notify(
      q,
      userId,
      approve ? "Your KYC is approved. You can now withdraw from your wallet." : `Your KYC was rejected: ${reason}. Update your details and submit again.`,
      approve ? "/wallet" : "/profile/kyc"
    );
  });
}

/* ===================== Withdrawals ===================== */

type WithdrawalRow = {
  id: string; user_id: string; amount: string; method: "bank" | "upi"; destination: unknown; status: Withdrawal["status"];
  admin_note: string | null; utr: string | null; created_at: string; updated_at: string;
};
type Dest = { holder?: string; account?: string; ifsc?: string; upi?: string };
const dest = (v: unknown): Dest => (typeof v === "string" ? JSON.parse(v) : (v as Dest)) ?? {};
export const destLabel = (method: "bank" | "upi", d: Dest, mask = true) =>
  method === "upi" ? d.upi ?? "" : `${d.holder ?? ""} · ${mask ? maskAccount(d.account ?? "") : d.account} · ${d.ifsc ?? ""}`;
const toWithdrawal = (r: WithdrawalRow): Withdrawal => ({
  id: r.id,
  amount: Number(r.amount),
  method: r.method,
  destination: destLabel(r.method, dest(r.destination)),
  status: r.status,
  adminNote: r.admin_note ?? undefined,
  utr: r.utr ?? undefined,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

export async function requestWithdrawal(userId: string, rupeesRaw: unknown, methodRaw: unknown) {
  const method = methodRaw === "upi" ? "upi" : methodRaw === "bank" ? "bank" : fail("Choose bank account or UPI.");
  const rupees = Number(rupeesRaw);
  if (!Number.isInteger(rupees) || rupees < WALLET.withdrawMin) fail(`You can withdraw ${inr(WALLET.withdrawMin * 100)} or more, in whole rupees.`);
  const amount = rupees * 100;
  const db = await getDb();
  return db.tx(async (q) => {
    const [k] = await q<KycRow>("SELECT * FROM kyc WHERE user_id=$1", [userId]);
    if (!k || k.status !== "approved") fail("Complete your KYC and wait for approval before withdrawing.");
    if (method === "bank" && !k.bank_account) fail("Add a bank account in KYC first, or choose UPI.");
    if (method === "upi" && !k.upi_id) fail("Add a UPI ID in KYC first, or choose bank account.");
    const [open] = await q("SELECT 1 FROM withdrawals WHERE user_id=$1 AND status IN ('pending','approved')", [userId]);
    if (open) fail("You already have a withdrawal in progress. Wait for it to finish.");
    const bal = await balanceOf(q, userId);
    if (amount > bal) fail(`You can withdraw up to ${inr(bal)}.`);
    const id = "wd_" + shortId();
    const now = Date.now();
    const d: Dest = method === "bank" ? { holder: k.bank_holder!, account: k.bank_account!, ifsc: k.bank_ifsc! } : { upi: k.upi_id! };
    await q(
      "INSERT INTO withdrawals (id,user_id,amount,method,destination,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'pending',$6,$6)",
      [id, userId, amount, method, JSON.stringify(d), now]
    );
    await move(q, userId, -amount, "withdraw", id, `Withdrawal to ${destLabel(method, d)}`);
    await notify(q, userId, `Withdrawal of ${inr(amount)} requested. We'll review it soon.`, "/wallet");
    return { id };
  });
}

export async function cancelWithdrawal(userId: string, id: string) {
  const db = await getDb();
  await db.tx(async (q) => {
    const [w] = await q<WithdrawalRow>("SELECT * FROM withdrawals WHERE id=$1 AND user_id=$2 FOR UPDATE", [String(id), userId]);
    if (!w) fail("Withdrawal not found.");
    if (w.status !== "pending") fail("This withdrawal is already being processed and can't be cancelled.");
    await q("UPDATE withdrawals SET status='cancelled', updated_at=$2 WHERE id=$1", [w.id, Date.now()]);
    await move(q, userId, Number(w.amount), "withdraw_refund", w.id, "Withdrawal cancelled");
  });
}

export async function reviewWithdrawal(
  adminId: string,
  id: string,
  action: "approve" | "decline" | "paid",
  extra: { note?: string; utr?: string }
) {
  const db = await getDb();
  return db.tx(async (q) => {
    const [w] = await q<WithdrawalRow>("SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE", [id]);
    if (!w) fail("Withdrawal not found.");
    const amount = Number(w.amount);
    const now = Date.now();
    if (action === "approve") {
      if (w.status !== "pending") fail("Only pending withdrawals can be approved.");
      await q("UPDATE withdrawals SET status='approved', admin_note=$2, reviewed_by=$3, updated_at=$4 WHERE id=$1", [id, extra.note || null, adminId, now]);
      await notify(q, w.user_id, `Your withdrawal of ${inr(amount)} is approved and being sent.`, "/wallet");
    } else if (action === "paid") {
      if (w.status !== "approved" && w.status !== "pending") fail("This withdrawal is already closed.");
      const utr = (extra.utr ?? "").trim();
      if (utr.length < 6) fail("Enter the UTR / transaction reference of the payment you sent.");
      await q("UPDATE withdrawals SET status='paid', utr=$2, admin_note=COALESCE($3, admin_note), reviewed_by=$4, updated_at=$5 WHERE id=$1", [
        id, utr.slice(0, 40), extra.note || null, adminId, now,
      ]);
      await notify(q, w.user_id, `${inr(amount)} sent to your account. Reference: ${utr}.`, "/wallet");
    } else {
      if (w.status !== "pending" && w.status !== "approved") fail("This withdrawal is already closed.");
      if (!extra.note) fail("Add a reason. The player sees it.");
      await q("UPDATE withdrawals SET status='declined', admin_note=$2, reviewed_by=$3, updated_at=$4 WHERE id=$1", [id, extra.note, adminId, now]);
      await move(q, w.user_id, amount, "withdraw_refund", id, `Withdrawal declined: ${extra.note}`, adminId);
      await notify(q, w.user_id, `Your withdrawal of ${inr(amount)} was declined: ${extra.note}. The money is back in your wallet.`, "/wallet");
    }
    return { userId: w.user_id, amount };
  });
}

/* ===================== Admin adjustments ===================== */

export async function adjustBalance(adminId: string, userId: string, amount: number, reason: string) {
  if (!Number.isSafeInteger(amount) || amount === 0) fail("Enter an amount other than 0.");
  if (!reason) fail("Add a reason. It's shown in the player's wallet history.");
  const db = await getDb();
  return db.tx(async (q) => {
    const bal = await move(q, userId, amount, "adjust", undefined, reason, adminId);
    await notify(q, userId, `${amount > 0 ? "Added" : "Deducted"} ${inr(Math.abs(amount))} ${amount > 0 ? "to" : "from"} your wallet by support: ${reason}`, "/wallet");
    return bal;
  });
}

/* ===================== Player wallet page ===================== */

const toTxn = (r: { id: string; kind: string; amount: string; balance_after: string; ref: string | null; note: string | null; at: string }): WalletTxn => ({
  id: r.id,
  kind: r.kind,
  amount: Number(r.amount),
  balanceAfter: Number(r.balance_after),
  ref: r.ref ?? undefined,
  note: r.note ?? undefined,
  at: Number(r.at),
});

export async function walletFor(userId: string) {
  const db = await getDb();
  const st = await getSettings(db.q);
  const [deposits, withdrawals, txns] = await Promise.all([
    db.q<DepositRow>("SELECT * FROM deposits WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [userId]),
    db.q<WithdrawalRow>("SELECT * FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [userId]),
    db.q<Parameters<typeof toTxn>[0]>("SELECT * FROM wallet_txns WHERE user_id=$1 ORDER BY at DESC LIMIT 200", [userId]),
  ]);
  return {
    balance: await balanceOf(db.q, userId),
    kyc: await getKyc(db.q, userId),
    deposits: deposits.map(toDeposit),
    withdrawals: withdrawals.map(toWithdrawal),
    txns: txns.map(toTxn),
    commissionPct: st.wallet.commissionPct,
    demo: rzp.PAYMENTS_DEMO,
    payments: rzp.RZP_CONFIGURED || rzp.PAYMENTS_DEMO,
  };
}

export const _rows = { toDeposit, toWithdrawal, toTxn, dest };
export type { DepositRow, WithdrawalRow, KycRow };
