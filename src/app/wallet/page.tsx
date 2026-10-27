"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, Landmark, QrCode, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { useStore, walletApi } from "@/lib/store";
import { WALLET, inr } from "@/lib/config";
import type { Deposit, Kyc, WalletTxn, Withdrawal } from "@/lib/types";
import { Empty, PageTitle, Sheet, mmss, toast, useNow } from "@/components/ui";

type WalletData = {
  balance: number;
  kyc: Kyc | null;
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  txns: WalletTxn[];
  commissionPct: number;
  demo: boolean;
  payments: boolean;
};

async function fetchWallet(): Promise<WalletData | null> {
  try {
    const r = await fetch("/api/wallet", { cache: "no-store" });
    const j = await r.json();
    return j.ok ? (j as WalletData) : null;
  } catch {
    toast.error("Can't reach the server. Check your connection and try again.");
    return null;
  }
}

const when = (t: number) =>
  new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function WalletPage() {
  const [w, setW] = useState<WalletData | null>(null);
  const [tab, setTab] = useState<"deposits" | "withdrawals" | "all">("deposits");
  const [addOpen, setAddOpen] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const [active, setActive] = useState<Deposit | null>(null);
  const refreshState = useStore((s) => s.refresh);

  const apply = useCallback((j: WalletData) => {
    setW(j);
    useStore.setState({ wallet: { balance: j.balance, kyc: j.kyc?.status ?? null } });
    const open = j.deposits.find((d) => d.status === "pending" && (d.closeBy ?? 0) > Date.now() && (d.qrImage || d.demo));
    setActive((a) => a ?? open ?? null);
  }, []);
  const load = useCallback(() => fetchWallet().then((j) => j && apply(j)), [apply]);

  useEffect(() => {
    let alive = true;
    fetchWallet().then((j) => alive && j && apply(j));
    return () => {
      alive = false;
    };
  }, [apply]);

  if (!w) return <div className="card p-8 text-center text-muted">Loading wallet…</div>;

  const kycOk = w.kyc?.status === "approved";

  return (
    <div className="space-y-5">
      <PageTitle title="Wallet" sub="Add cash with UPI, play rooms, withdraw your winnings." />

      <section className="rounded-2xl bg-ink text-white p-5 sm:p-6">
        <p className="text-white/70">Wallet balance</p>
        <p className="font-display font-bold text-[40px] leading-tight tabular-nums">{inr(w.balance)}</p>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="btn-go" onClick={() => setAddOpen(true)} disabled={!w.payments}>
            <ArrowDownLeft size={18} /> Add cash
          </button>
          <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={() => setWdOpen(true)}>
            <ArrowUpRight size={18} /> Withdraw
          </button>
        </div>
        {!w.payments && <p className="text-sm text-white/70 mt-3">Adding cash isn&apos;t available right now.</p>}
      </section>

      <KycBanner kyc={w.kyc} />

      {active && (
        <QrPanel
          key={active.id}
          deposit={active}
          onDone={async (d) => {
            setActive(d); // keep the result card on screen until the player closes it
            await load();
            refreshState();
          }}
          onClose={() => setActive(null)}
        />
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {(
          [
            ["deposits", `Added cash (${w.deposits.length})`],
            ["withdrawals", `Withdrawals (${w.withdrawals.length})`],
            ["all", "All activity"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-full px-4 h-9 text-[15px] font-medium border ${tab === k ? "bg-ink text-white border-ink" : "bg-white border-line text-muted"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "deposits" && <DepositList list={w.deposits} onOpen={(d) => setActive(d)} />}
      {tab === "withdrawals" && <WithdrawalList list={w.withdrawals} onChange={setW} />}
      {tab === "all" && <TxnList list={w.txns} />}

      <AddCashSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(d) => {
          setAddOpen(false);
          setActive(d);
          load();
        }}
      />
      {/* key: fresh form (amount, default method) every time the sheet opens */}
      <WithdrawSheet key={wdOpen ? "open" : "closed"} open={wdOpen} onClose={() => setWdOpen(false)} w={w} kycOk={kycOk} onDone={(next) => { setW(next); setWdOpen(false); refreshState(); }} />
    </div>
  );
}

/* ---------- KYC status ---------- */
function KycBanner({ kyc }: { kyc: Kyc | null }) {
  if (kyc?.status === "approved")
    return (
      <Link href="/profile/kyc" className="card p-4 flex items-center gap-3 hover:bg-board/60">
        <ShieldCheck className="text-green shrink-0" />
        <span className="flex-1">
          <span className="block font-medium">KYC verified</span>
          <span className="block text-sm text-muted">Withdrawals go to {[kyc.bankAccount && `bank ${kyc.bankAccount}`, kyc.upiId].filter(Boolean).join(" or ")}</span>
        </span>
      </Link>
    );
  const t =
    kyc?.status === "pending"
      ? { cls: "bg-yellow-soft text-yellow-ink", title: "KYC under review", body: "You can withdraw once it's approved." }
      : kyc?.status === "rejected"
      ? { cls: "bg-red-soft text-red-ink", title: "KYC rejected", body: kyc.rejectReason ? `${kyc.rejectReason}. Update and submit again.` : "Update your details and submit again." }
      : { cls: "bg-blue-soft text-blue", title: "Complete KYC to withdraw", body: "Add your PAN and bank account or UPI ID." };
  return (
    <Link href="/profile/kyc" className={`rounded-2xl p-4 flex items-center gap-3 ${t.cls}`}>
      <ShieldCheck className="shrink-0" />
      <span className="flex-1">
        <span className="block font-semibold">{t.title}</span>
        <span className="block text-sm">{t.body}</span>
      </span>
      <span className="text-sm font-semibold underline">{kyc ? "View" : "Start"}</span>
    </Link>
  );
}

/* ---------- Add cash ---------- */
function AddCashSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (d: Deposit) => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const r = Number(amount);
  const err = amount === "" ? "" : r < WALLET.depositMin || r > WALLET.depositMax ? `Enter ₹${WALLET.depositMin} to ₹${WALLET.depositMax.toLocaleString("en-IN")}.` : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === "" || err) return toast.error(err || "Enter an amount.");
    setBusy(true);
    const res = await walletApi<{ deposit: Deposit }>({ type: "deposit", amount: r });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setAmount("");
    onCreated(res.deposit);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add cash">
      <form onSubmit={submit}>
        <label className="label" htmlFor="dep">Amount (₹)</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display font-semibold text-muted">₹</span>
          <input
            id="dep"
            className="field pl-8 font-display font-semibold text-lg"
            inputMode="numeric"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder={`${WALLET.depositMin} – ${WALLET.depositMax}`}
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {WALLET.depositChips.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setAmount(String(c))}
              className={`rounded-full border px-3 h-8 text-sm font-medium ${r === c ? "bg-ink text-white border-ink" : "bg-white border-line hover:bg-board"}`}
            >
              ₹{c.toLocaleString("en-IN")}
            </button>
          ))}
        </div>
        <p className={`text-sm mt-2 ${err ? "text-red" : "text-muted"}`}>
          {err || `Minimum ₹${WALLET.depositMin}, maximum ₹${WALLET.depositMax.toLocaleString("en-IN")} per payment.`}
        </p>
        <button disabled={busy || !!err || amount === ""} className="btn-go w-full mt-4">
          <QrCode size={18} /> {busy ? "Creating QR…" : `Pay ${amount ? inr(r * 100) : ""} with UPI QR`}
        </button>
        <p className="text-sm text-muted mt-3">Scan the QR with any UPI app (GPay, PhonePe, Paytm, BHIM). Your wallet updates as soon as the payment is received.</p>
      </form>
    </Sheet>
  );
}

/* ---------- QR on screen, polling for the result ---------- */
function QrPanel({ deposit, onDone, onClose }: { deposit: Deposit; onDone: (d: Deposit) => void; onClose: () => void }) {
  const [d, setD] = useState(deposit);
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);
  const finished = useRef(false);
  const left = (d.closeBy ?? 0) - now;

  useEffect(() => {
    if (d.status !== "pending") return;
    let stop = false;
    const tick = async () => {
      if (stop || document.visibilityState !== "visible") return;
      const r = await walletApi<{ deposit: Deposit }>({ type: "checkDeposit", id: d.id });
      if (!stop && r.ok) setD(r.deposit);
    };
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [d.id, d.status]);

  useEffect(() => {
    if (d.status === "pending" || finished.current) return;
    finished.current = true;
    if (d.status === "success") toast.ok(`${inr(d.paidAmount ?? d.amount)} added to your wallet.`);
    onDone(d);
  }, [d, onDone]);

  const simulate = async () => {
    setBusy(true);
    const r = await walletApi<{ deposit: Deposit }>({ type: "simulateDeposit", id: d.id });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setD(r.deposit);
  };

  if (d.status === "success")
    return (
      <section className="card p-5 flex items-center gap-3">
        <CheckCircle2 className="text-green shrink-0" size={28} />
        <div className="flex-1">
          <p className="font-semibold">Payment received</p>
          <p className="text-sm text-muted">{inr(d.paidAmount ?? d.amount)} added to your wallet.</p>
        </div>
        <button className="btn-ghost h-9 text-sm" onClick={onClose}>Done</button>
      </section>
    );
  if (d.status !== "pending")
    return (
      <section className="card p-5 flex items-center gap-3">
        <XCircle className="text-red shrink-0" size={28} />
        <div className="flex-1">
          <p className="font-semibold">{d.status === "expired" ? "QR code expired" : "Payment failed"}</p>
          <p className="text-sm text-muted">{d.failureReason ?? "No money was taken. Try again."}</p>
        </div>
        <button className="btn-ghost h-9 text-sm" onClick={onClose}>Close</button>
      </section>
    );

  return (
    <section className="card p-5 text-center">
      <div className="flex items-center justify-between gap-3 text-left">
        <div>
          <h2 className="text-xl font-semibold">Scan to pay {inr(d.amount)}</h2>
          <p className="text-sm text-muted">Use any UPI app. Pay the exact amount shown.</p>
        </div>
        <span className={`font-display font-bold text-xl tabular-nums ${left < 60000 ? "text-red" : ""}`} aria-label="Time left">{mmss(left)}</span>
      </div>
      {d.qrImage ? (
        <img src={d.qrImage} alt={`UPI QR code for ${inr(d.amount)}`} className="mx-auto mt-4 w-full max-w-[280px] rounded-xl border border-line bg-white" />
      ) : (
        <div className="mx-auto mt-4 w-full max-w-[280px] aspect-square rounded-xl border-2 border-dashed border-line grid place-items-center text-muted p-6">
          <span>
            <QrCode className="mx-auto mb-2" size={40} />
            Demo mode: Razorpay keys aren&apos;t set, so no real QR is shown.
          </span>
        </div>
      )}
      <p className="mt-4 flex items-center justify-center gap-2 text-[15px]">
        <Clock size={16} className="text-yellow-ink animate-pulse" /> Waiting for payment… this updates by itself.
      </p>
      {d.failureReason && <p className="text-sm text-red mt-1">Last attempt: {d.failureReason}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {d.demo && (
          <button className="btn-go" disabled={busy} onClick={simulate}>Simulate payment (demo)</button>
        )}
        <button className="btn-ghost" onClick={onClose}>Hide</button>
      </div>
      <p className="text-xs text-muted mt-3">Already paid? Don&apos;t pay again. It can take up to a minute to show.</p>
    </section>
  );
}

/* ---------- Withdraw ---------- */
function WithdrawSheet({ open, onClose, w, kycOk, onDone }: { open: boolean; onClose: () => void; w: WalletData; kycOk: boolean; onDone: (w: WalletData) => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank" | "upi">(w.kyc?.bankAccount ? "bank" : "upi");
  const [busy, setBusy] = useState(false);
  const inProgress = w.withdrawals.some((x) => x.status === "pending" || x.status === "approved");
  const r = Number(amount);
  const err = amount === "" ? "" : r < WALLET.withdrawMin ? `Minimum ₹${WALLET.withdrawMin}.` : r * 100 > w.balance ? `You can withdraw up to ${inr(w.balance)}.` : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === "" || err) return toast.error(err || "Enter an amount.");
    setBusy(true);
    const res = await walletApi<WalletData>({ type: "withdraw", amount: r, method });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setAmount("");
    toast.ok("Withdrawal requested. We'll review it soon.");
    onDone(res as unknown as WalletData);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Withdraw">
      {!kycOk ? (
        <div>
          <p className="text-muted">
            {w.kyc?.status === "pending" ? "Your KYC is under review. You can withdraw once it's approved." : "Complete your KYC first: PAN and a bank account or UPI ID."}
          </p>
          <Link href="/profile/kyc" className="btn-primary w-full mt-4">{w.kyc ? "View KYC" : "Complete KYC"}</Link>
        </div>
      ) : inProgress ? (
        <p className="text-muted">You already have a withdrawal in progress. You can request another one after it&apos;s paid or declined.</p>
      ) : (
        <form onSubmit={submit}>
          <p className="text-sm text-muted mb-3">Available: <b className="text-ink">{inr(w.balance)}</b></p>
          <label className="label" htmlFor="wd">Amount (₹)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display font-semibold text-muted">₹</span>
            <input id="wd" className="field pl-8 font-display font-semibold text-lg" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder={`${WALLET.withdrawMin} or more`} />
          </div>
          <button type="button" className="text-sm text-blue font-medium mt-2" onClick={() => setAmount(String(Math.floor(w.balance / 100)))}>Withdraw all</button>
          {err && <p className="text-sm text-red mt-1">{err}</p>}

          <fieldset className="mt-4 space-y-2">
            <legend className="label">Send to</legend>
            {w.kyc?.bankAccount && (
              <Method on={method === "bank"} onPick={() => setMethod("bank")} icon={<Landmark size={20} />} title="Bank account" sub={`${w.kyc.bankHolder} · ${w.kyc.bankAccount} · ${w.kyc.bankIfsc}`} />
            )}
            {w.kyc?.upiId && <Method on={method === "upi"} onPick={() => setMethod("upi")} icon={<Smartphone size={20} />} title="UPI" sub={w.kyc.upiId} />}
          </fieldset>

          <button disabled={busy || !!err || amount === ""} className="btn-primary w-full mt-5">{busy ? "Sending request…" : "Request withdrawal"}</button>
          <p className="text-sm text-muted mt-3">The amount is taken from your wallet now. An admin reviews every withdrawal; if it&apos;s declined, the money comes back to your wallet.</p>
        </form>
      )}
    </Sheet>
  );
}

function Method({ on, onPick, icon, title, sub }: { on: boolean; onPick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${on ? "border-ink ring-1 ring-ink" : "border-line"}`}>
      <input type="radio" name="method" checked={on} onChange={onPick} className="sr-only" />
      <span className="text-muted">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted truncate">{sub}</span>
      </span>
      <span className={`w-5 h-5 rounded-full border-2 ${on ? "border-ink bg-ink shadow-[inset_0_0_0_3px_#fff]" : "border-line"}`} />
    </label>
  );
}

/* ---------- history ---------- */
const depMeta: Record<Deposit["status"], { l: string; cls: string }> = {
  pending: { l: "Processing", cls: "bg-yellow-soft text-yellow-ink" },
  success: { l: "Success", cls: "bg-green-soft text-green-ink" },
  failed: { l: "Failed", cls: "bg-red-soft text-red-ink" },
  expired: { l: "Expired", cls: "bg-board text-muted" },
};
const wdMeta: Record<Withdrawal["status"], { l: string; cls: string }> = {
  pending: { l: "Under review", cls: "bg-yellow-soft text-yellow-ink" },
  approved: { l: "Approved · sending", cls: "bg-blue-soft text-blue" },
  paid: { l: "Paid", cls: "bg-green-soft text-green-ink" },
  declined: { l: "Declined", cls: "bg-red-soft text-red-ink" },
  cancelled: { l: "Cancelled", cls: "bg-board text-muted" },
};
const Pill = ({ m }: { m: { l: string; cls: string } }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap ${m.cls}`}>{m.l}</span>
);

function DepositList({ list, onOpen }: { list: Deposit[]; onOpen: (d: Deposit) => void }) {
  const now = useNow(30_000);
  if (!list.length) return <Empty title="No cash added yet" body="Tap Add cash to top up your wallet with UPI." />;
  return (
    <ul className="card divide-y divide-line">
      {list.map((d) => {
        const open = d.status === "pending" && (d.closeBy ?? 0) > now;
        return (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-9 h-9 rounded-full bg-green-soft text-green grid place-items-center shrink-0"><ArrowDownLeft size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{inr(d.paidAmount ?? d.amount)} <span className="text-muted font-normal text-sm">· UPI QR</span></p>
              <p className="text-sm text-muted truncate">
                {when(d.createdAt)}
                {d.paymentId ? ` · ${d.paymentId}` : ""}
                {d.status !== "success" && d.failureReason ? ` · ${d.failureReason}` : ""}
              </p>
            </div>
            {open ? (
              <button className="btn-ghost h-9 text-sm" onClick={() => onOpen(d)}>Show QR</button>
            ) : (
              <Pill m={depMeta[d.status]} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WithdrawalList({ list, onChange }: { list: Withdrawal[]; onChange: (w: WalletData) => void }) {
  const [busy, setBusy] = useState("");
  if (!list.length) return <Empty title="No withdrawals yet" body="Withdraw your balance to your bank account or UPI after KYC." />;
  const cancel = async (id: string) => {
    if (!confirm("Cancel this withdrawal? The money goes back to your wallet.")) return;
    setBusy(id);
    const r = await walletApi<WalletData>({ type: "cancelWithdraw", id });
    setBusy("");
    if (!r.ok) return toast.error(r.error);
    toast.ok("Withdrawal cancelled. The money is back in your wallet.");
    onChange(r as unknown as WalletData);
  };
  return (
    <ul className="card divide-y divide-line">
      {list.map((x) => (
        <li key={x.id} className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-blue-soft text-blue grid place-items-center shrink-0"><ArrowUpRight size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{inr(x.amount)} <span className="text-muted font-normal text-sm">· {x.method === "upi" ? "UPI" : "Bank"}</span></p>
              <p className="text-sm text-muted truncate">{when(x.createdAt)} · {x.destination}</p>
            </div>
            <Pill m={wdMeta[x.status]} />
          </div>
          {(x.utr || x.adminNote || x.status === "pending") && (
            <div className="mt-2 ml-12 text-sm space-y-1">
              {x.utr && <p>Reference (UTR): <b className="font-mono">{x.utr}</b></p>}
              {x.adminNote && <p className={x.status === "declined" ? "text-red" : "text-muted"}>{x.status === "declined" ? "Reason: " : "Note: "}{x.adminNote}</p>}
              {x.status === "pending" && (
                <button className="text-red font-medium" disabled={busy === x.id} onClick={() => cancel(x.id)}>Cancel request</button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const kindLabel: Record<string, string> = {
  deposit: "Cash added",
  stake: "Room entry",
  refund: "Refund",
  win: "Match won",
  withdraw: "Withdrawal",
  withdraw_refund: "Withdrawal returned",
  adjust: "Adjustment by support",
};

function TxnList({ list }: { list: WalletTxn[] }) {
  if (!list.length) return <Empty title="No activity yet" body="Deposits, room entries, winnings and withdrawals show up here." />;
  return (
    <ul className="card divide-y divide-line">
      {list.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {kindLabel[t.kind] ?? t.kind}
              {t.ref?.length === 8 && (t.kind === "stake" || t.kind === "refund" || t.kind === "win") && (
                <Link href={`/match/${t.ref}`} className="text-blue text-sm font-normal ml-2">View match</Link>
              )}
            </p>
            <p className="text-sm text-muted truncate">{when(t.at)}{t.note ? ` · ${t.note}` : ""}</p>
          </div>
          <div className="text-right">
            <p className={`font-display font-semibold tabular-nums ${t.amount > 0 ? "text-green" : "text-ink"}`}>{t.amount > 0 ? "+" : "−"}{inr(Math.abs(t.amount))}</p>
            <p className="text-xs text-muted tabular-nums">Bal {inr(t.balanceAfter)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
