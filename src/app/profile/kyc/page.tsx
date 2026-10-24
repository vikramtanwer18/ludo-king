"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Landmark, ShieldCheck, Smartphone } from "lucide-react";
import { walletApi } from "@/lib/store";
import type { Kyc } from "@/lib/types";
import { PageTitle, toast } from "@/components/ui";

const statusMeta = {
  pending: { l: "Under review", cls: "bg-yellow-soft text-yellow-ink", body: "We're checking your details. You'll get a notification when it's done." },
  approved: { l: "Verified", cls: "bg-green-soft text-green-ink", body: "You can withdraw to the account below." },
  rejected: { l: "Rejected", cls: "bg-red-soft text-red-ink", body: "Fix the details and submit again." },
} as const;

export default function KycPage() {
  const [kyc, setKyc] = useState<Kyc | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch("/api/wallet", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setKyc(j.ok ? j.kyc : null);
        if (j.ok && !j.kyc) setEditing(true);
      })
      .catch(() => toast.error("Can't reach the server. Check your connection and try again."));
  }, []);

  if (kyc === undefined) return <div className="card p-8 text-center text-muted">Loading…</div>;

  return (
    <div className="space-y-5">
      <Link href="/profile" className="text-muted hover:text-ink text-[15px]">‹ Profile</Link>
      <PageTitle title="KYC & bank details" sub="Needed before you can withdraw from your wallet." />

      {kyc && (
        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold flex items-center gap-2"><ShieldCheck size={20} /> Your KYC</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium ${statusMeta[kyc.status].cls}`}>{statusMeta[kyc.status].l}</span>
          </div>
          <p className="text-muted mt-1">{statusMeta[kyc.status].body}</p>
          {kyc.status === "rejected" && kyc.rejectReason && <p className="mt-2 rounded-xl bg-red-soft text-red-ink px-3 py-2">Reason: {kyc.rejectReason}</p>}
          <dl className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-[15px]">
            <Item k="Name (as on PAN)" v={kyc.fullName} />
            <Item k="PAN" v={kyc.pan} mono />
            {kyc.bankAccount && <Item k="Bank account" v={`${kyc.bankHolder} · ${kyc.bankAccount}`} />}
            {kyc.bankIfsc && <Item k="IFSC" v={kyc.bankIfsc} mono />}
            {kyc.upiId && <Item k="UPI ID" v={kyc.upiId} />}
          </dl>
          {!editing && (
            <button className="btn-ghost mt-5" onClick={() => setEditing(true)}>
              Update details
            </button>
          )}
        </section>
      )}

      {editing && (
        <KycForm
          hadKyc={!!kyc}
          onSaved={(k) => {
            setKyc(k);
            setEditing(false);
          }}
          onCancel={kyc ? () => setEditing(false) : undefined}
        />
      )}
    </div>
  );
}

function Item({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted">{k}</dt>
      <dd className={`font-medium break-all ${mono ? "font-mono tracking-wide" : ""}`}>{v}</dd>
    </div>
  );
}

function KycForm({ hadKyc, onSaved, onCancel }: { hadKyc: boolean; onSaved: (k: Kyc) => void; onCancel?: () => void }) {
  const [f, setF] = useState({
    fullName: "",
    pan: "",
    useBank: true,
    useUpi: false,
    bankHolder: "",
    bankAccount: "",
    bankAccountConfirm: "",
    bankIfsc: "",
    upiId: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await walletApi<{ kyc: Kyc }>({ type: "saveKyc", ...f });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok("KYC submitted. We'll review it soon.");
    onSaved(r.kyc);
  };

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <h2 className="text-xl font-semibold">{hadKyc ? "Update your details" : "Submit KYC"}</h2>
      {hadKyc && <p className="text-sm text-muted -mt-2">Saving sends your KYC for review again. Withdrawals wait until it&apos;s approved.</p>}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="fullName">Full name (as on PAN)</label>
          <input id="fullName" className="field" value={f.fullName} onChange={set("fullName")} maxLength={80} autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="pan">PAN</label>
          <input id="pan" className="field font-mono uppercase tracking-wider" value={f.pan} onChange={(e) => setF((s) => ({ ...s, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) }))} placeholder="ABCDE1234F" required />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="label">Where should withdrawals go? (one or both)</legend>
        <label className="flex items-center gap-3 font-medium cursor-pointer">
          <input type="checkbox" checked={f.useBank} onChange={set("useBank")} className="w-5 h-5 accent-[#1B2142]" />
          <Landmark size={18} className="text-muted" /> Bank account
        </label>
        {f.useBank && (
          <div className="grid sm:grid-cols-2 gap-3 pl-8">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="bankHolder">Account holder name</label>
              <input id="bankHolder" className="field" value={f.bankHolder} onChange={set("bankHolder")} maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="bankAccount">Account number</label>
              <input id="bankAccount" className="field font-mono" inputMode="numeric" value={f.bankAccount} onChange={(e) => setF((s) => ({ ...s, bankAccount: e.target.value.replace(/\D/g, "").slice(0, 18) }))} />
            </div>
            <div>
              <label className="label" htmlFor="bankAccountConfirm">Confirm account number</label>
              <input id="bankAccountConfirm" className="field font-mono" inputMode="numeric" value={f.bankAccountConfirm} onChange={(e) => setF((s) => ({ ...s, bankAccountConfirm: e.target.value.replace(/\D/g, "").slice(0, 18) }))} onPaste={(e) => e.preventDefault()} />
            </div>
            <div>
              <label className="label" htmlFor="bankIfsc">IFSC code</label>
              <input id="bankIfsc" className="field font-mono uppercase" value={f.bankIfsc} onChange={(e) => setF((s) => ({ ...s, bankIfsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) }))} placeholder="SBIN0001234" />
            </div>
          </div>
        )}
        <label className="flex items-center gap-3 font-medium cursor-pointer">
          <input type="checkbox" checked={f.useUpi} onChange={set("useUpi")} className="w-5 h-5 accent-[#1B2142]" />
          <Smartphone size={18} className="text-muted" /> UPI ID
        </label>
        {f.useUpi && (
          <div className="pl-8">
            <label className="label" htmlFor="upiId">UPI ID</label>
            <input id="upiId" className="field" value={f.upiId} onChange={set("upiId")} placeholder="name@okaxis" autoCapitalize="none" />
          </div>
        )}
      </fieldset>

      <p className="text-sm text-muted">The name on your bank account or UPI should match your PAN. Details are only used to send your withdrawals.</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="btn-primary">{busy ? "Submitting…" : "Submit for review"}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
