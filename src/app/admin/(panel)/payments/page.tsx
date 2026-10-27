import Link from "next/link";
import { depositStats, listDeposits, listPaymentEvents, paymentsMode } from "@/server/adminWallet";
import { inr } from "@/lib/config";
import { recheckDepositAction } from "../../actions";
import ActionForm from "@/components/admin/ActionForm";
import { MoneyBadge, PageHead, Pager, Stat, Table, Tabs, fmtDateTime } from "@/components/admin/kit";

const STATUSES = [
  { v: "", l: "All" },
  { v: "pending", l: "In process" },
  { v: "success", l: "Success" },
  { v: "failed", l: "Failed" },
  { v: "expired", l: "Expired" },
  { v: "events", l: "Webhook log" },
];

export default async function Payments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.status ?? "";
  const stats = await depositStats();
  const mode = paymentsMode();

  return (
    <div>
      <PageHead title="Payments" sub="Cash added by players through Razorpay UPI QR." />

      {mode !== "live" && (
        <p className={`mb-4 rounded-xl px-4 py-3 text-[15px] ${mode === "demo" ? "bg-yellow-soft text-yellow-ink" : "bg-red-soft text-red-ink"}`}>
          {mode === "demo"
            ? "Demo mode: Razorpay keys aren't set, so players see a “Simulate payment” button instead of a real QR. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET before going live."
            : "Payments are off: Razorpay keys aren't set. Players can't add cash."}
        </p>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Added today" value={inr(stats.todaySum)} hint={`${stats.todayN} payments`} tone="green" />
        <Stat label="Last 7 days" value={inr(stats.weekSum)} hint={`${inr(stats.allSum)} all time`} tone="blue" />
        <Stat label="In process" value={stats.pending} hint="QR codes waiting for payment" href="/admin/payments?status=pending" tone="yellow" />
        <Stat label="Failed / expired today" value={stats.failedToday + stats.expiredToday} hint={`${stats.failedToday} failed · ${stats.expiredToday} expired`} href="/admin/payments?status=failed" tone="red" />
      </section>

      <Tabs base="/admin/payments" current={view} items={STATUSES} params={{ q: sp.q }} />
      {view === "events" ? <Events page={Number(sp.page) || 1} deposit={sp.deposit} /> : <Deposits sp={sp} />}
    </div>
  );
}

async function Deposits({ sp }: { sp: Record<string, string | undefined> }) {
  const { rows, total, page, per } = await listDeposits({ status: sp.status, q: sp.q, page: Number(sp.page) || 1 });
  return (
    <>
      <form className="card p-3 mb-4 flex flex-wrap gap-2" role="search">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="Player, email, payment ID, QR ID or UPI ID" className="field h-10 flex-1 min-w-[200px] text-[15px]" />
        <button className="btn-primary h-10">Search</button>
      </form>
      <Table head={["Payment", "Player", "Amount", "Status", "Razorpay", "Created", "Updated", ""]} empty={rows.length ? undefined : "No payments here."}>
        {rows.map((d) => (
          <tr key={d.id} className="align-top">
            <td>
              <span className="font-mono text-sm">{d.id}</span>
              {d.demo && <span className="ml-2 rounded bg-yellow-soft text-yellow-ink text-xs px-1.5">demo</span>}
            </td>
            <td>
              <Link href={`/admin/users/${d.userId}`} className="font-medium hover:underline">{d.userName}</Link>
              <span className="block text-sm text-muted">{d.userEmail}</span>
            </td>
            <td className="font-display font-semibold whitespace-nowrap">
              {inr(d.paidAmount ?? d.amount)}
              {d.paidAmount != null && d.paidAmount !== d.amount && <span className="block text-xs text-red">asked {inr(d.amount)}</span>}
            </td>
            <td>
              <MoneyBadge kind="dep" s={d.status} />
              {d.failureReason && <span className="block text-xs text-muted mt-1 max-w-[220px]">{d.failureReason}</span>}
            </td>
            <td className="text-sm">
              {d.paymentId && <span className="block font-mono">{d.paymentId}</span>}
              {d.qrId && <span className="block font-mono text-muted">{d.qrId}</span>}
              {d.payer && <span className="block text-muted">{d.payer}</span>}
              {!d.paymentId && !d.qrId && <span className="text-muted">—</span>}
            </td>
            <td className="text-muted whitespace-nowrap">{fmtDateTime(d.createdAt)}</td>
            <td className="text-muted whitespace-nowrap">
              {fmtDateTime(d.updatedAt)}
              <Link href={`/admin/payments?status=events&deposit=${d.id}`} className="block text-blue text-sm">Webhooks</Link>
            </td>
            <td>
              {(d.status === "pending" || d.status === "expired" || d.status === "failed") && d.qrId && (
                <ActionForm action={recheckDepositAction} submit="Check with Razorpay" submitClass="btn-ghost h-9 text-sm whitespace-nowrap" className="space-y-1">
                  <input type="hidden" name="id" value={d.id} />
                </ActionForm>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} per={per} total={total} base="/admin/payments" params={{ status: sp.status, q: sp.q }} />
    </>
  );
}

async function Events({ page: p, deposit }: { page: number; deposit?: string }) {
  const { rows, total, page, per } = await listPaymentEvents({ page: p, depositId: deposit });
  return (
    <>
      <p className="text-muted mb-3">
        Every signed webhook Razorpay sent{deposit ? <> for <span className="font-mono">{deposit}</span> (<Link className="text-blue" href="/admin/payments?status=events">show all</Link>)</> : ""}. Duplicates are ignored, so a payment is never credited twice.
      </p>
      {rows.length === 0 ? (
        <p className="card p-8 text-center text-muted">No webhooks received yet. In Razorpay → Webhooks, point a webhook at <span className="font-mono">/api/webhooks/razorpay</span>.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono font-medium">{e.event}</span>
                <span className="rounded-full bg-board px-2.5 py-0.5 text-[13px]">{e.result}</span>
                {e.depositId && <Link href={`/admin/payments?q=${e.depositId}`} className="font-mono text-sm text-blue">{e.depositId}</Link>}
                {e.paymentId && <span className="font-mono text-sm text-muted">{e.paymentId}</span>}
                <span className="ml-auto text-sm text-muted">{fmtDateTime(e.at)}</span>
              </div>
              <details className="mt-2">
                <summary className="text-sm text-blue cursor-pointer">Payload</summary>
                <pre className="mt-2 text-xs bg-board rounded-xl p-3 overflow-x-auto max-h-80">{e.payload}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} per={per} total={total} base="/admin/payments" params={{ status: "events", deposit }} />
    </>
  );
}
