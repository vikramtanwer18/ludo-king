import Link from "next/link";
import { listWithdrawals, withdrawalStats } from "@/server/adminWallet";
import { inr } from "@/lib/config";
import { reviewWithdrawalAction } from "../../actions";
import ActionForm from "@/components/admin/ActionForm";
import { MoneyBadge, PageHead, Pager, Stat, Tabs, fmtDateTime } from "@/components/admin/kit";

const STATUSES = [
  { v: "", l: "To do" },
  { v: "pending", l: "Needs review" },
  { v: "approved", l: "Approved · to pay" },
  { v: "paid", l: "Paid" },
  { v: "declined", l: "Declined" },
  { v: "cancelled", l: "Cancelled" },
  { v: "all", l: "All" },
];

export default async function Withdrawals({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.status ?? "";
  const stats = await withdrawalStats();
  // "To do" = pending + approved.
  const { rows, total, page, per } = await listWithdrawals({
    status: view === "" ? "todo" : view === "all" ? undefined : view,
    q: sp.q,
    page: Number(sp.page) || 1,
  });

  return (
    <div>
      <PageHead title="Withdrawals" sub="Review each request, send the money from your bank or UPI, then mark it paid with the UTR." />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Needs review" value={stats.pending} hint={inr(stats.pendingSum)} href="/admin/withdrawals?status=pending" tone="yellow" />
        <Stat label="Approved, not paid yet" value={stats.approved} hint={inr(stats.approvedSum)} href="/admin/withdrawals?status=approved" tone="blue" />
        <Stat label="Paid today" value={inr(stats.paidToday)} tone="green" />
        <Stat label="Paid all time" value={inr(stats.paidAll)} tone="red" />
      </section>

      <Tabs base="/admin/withdrawals" current={view} items={STATUSES} params={{ q: sp.q }} />
      <form className="card p-3 mb-4 flex flex-wrap gap-2" role="search">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="Player, email, withdrawal ID or UTR" className="field h-10 flex-1 min-w-[200px] text-[15px]" />
        <button className="btn-primary h-10">Search</button>
      </form>

      {rows.length === 0 ? (
        <p className="card p-8 text-center text-muted">{view === "" ? "Nothing to review. 🎉" : "No withdrawals here."}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((w) => (
            <li key={w.id} className="card p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-2xl">{inr(w.amount)}</span>
                    <MoneyBadge kind="wd" s={w.status} />
                    <span className="font-mono text-sm text-muted">{w.id}</span>
                  </div>
                  <p className="mt-1">
                    <Link href={`/admin/users/${w.userId}`} className="font-medium hover:underline">{w.userName}</Link>
                    <span className="text-muted"> · {w.userEmail} · wallet now {inr(w.balance)}</span>
                  </p>
                  <p className="text-sm text-muted">Requested {fmtDateTime(w.createdAt)}{w.reviewer ? ` · last action by ${w.reviewer} ${fmtDateTime(w.updatedAt)}` : ""}</p>
                </div>
                <div className="rounded-xl bg-board px-4 py-3 text-[15px] min-w-[260px]">
                  <p className="text-sm text-muted">Send to · {w.method === "upi" ? "UPI" : "Bank account"}</p>
                  {w.method === "upi" ? (
                    <p className="font-mono font-semibold break-all">{w.dest.upi}</p>
                  ) : (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3">
                      <dt className="text-muted">Name</dt><dd className="font-medium">{w.dest.holder}</dd>
                      <dt className="text-muted">A/c no.</dt><dd className="font-mono font-semibold">{w.dest.account}</dd>
                      <dt className="text-muted">IFSC</dt><dd className="font-mono">{w.dest.ifsc}</dd>
                    </dl>
                  )}
                  <p className="text-sm text-muted mt-1">
                    KYC: {w.kycName ?? "—"} · {w.kycPan ?? "—"}{" "}
                    {w.kycStatus && <MoneyBadge kind="kyc" s={w.kycStatus} />}
                  </p>
                </div>
              </div>

              {(w.utr || w.adminNote) && (
                <p className="mt-3 text-[15px]">
                  {w.utr && <>UTR <b className="font-mono">{w.utr}</b></>}
                  {w.utr && w.adminNote && " · "}
                  {w.adminNote && <span className="text-muted">{w.adminNote}</span>}
                </p>
              )}

              {(w.status === "pending" || w.status === "approved") && (
                <div className="mt-4 border-t border-line pt-4 grid md:grid-cols-2 gap-4">
                  {w.status === "pending" ? (
                    <ActionForm action={reviewWithdrawalAction} submit="Approve" submitClass="btn-go" className="space-y-2">
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="op" value="approve" />
                      <label className="label" htmlFor={`an-${w.id}`}>Note (optional)</label>
                      <input id={`an-${w.id}`} name="note" className="field h-10" maxLength={200} placeholder="e.g. Checked KYC and match history" />
                    </ActionForm>
                  ) : (
                    <ActionForm action={reviewWithdrawalAction} submit="Mark as paid" submitClass="btn-go" className="space-y-2" confirm={`Mark ${inr(w.amount)} as paid to ${w.userName}?`}>
                      <input type="hidden" name="id" value={w.id} />
                      <input type="hidden" name="op" value="paid" />
                      <label className="label" htmlFor={`utr-${w.id}`}>UTR / transaction reference</label>
                      <input id={`utr-${w.id}`} name="utr" className="field h-10 font-mono" maxLength={40} placeholder="e.g. 412345678901" required />
                    </ActionForm>
                  )}
                  <ActionForm action={reviewWithdrawalAction} submit="Decline & refund" submitClass="btn-danger" className="space-y-2" confirm={`Decline and put ${inr(w.amount)} back in ${w.userName}'s wallet?`}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="op" value="decline" />
                    <label className="label" htmlFor={`dn-${w.id}`}>Reason (shown to the player)</label>
                    <input id={`dn-${w.id}`} name="note" className="field h-10" maxLength={200} placeholder="e.g. Bank name doesn't match PAN" required />
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} per={per} total={total} base="/admin/withdrawals" params={{ status: sp.status, q: sp.q }} />
    </div>
  );
}
