import Link from "next/link";
import { listKyc } from "@/server/adminWallet";
import { reviewKycAction } from "../../actions";
import ActionForm from "@/components/admin/ActionForm";
import { MoneyBadge, PageHead, Pager, Tabs, fmtDateTime } from "@/components/admin/kit";

const STATUSES = [
  { v: "", l: "Needs review" },
  { v: "approved", l: "Approved" },
  { v: "rejected", l: "Rejected" },
  { v: "all", l: "All" },
];

export default async function KycPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.status ?? "";
  const { rows, total, page, per } = await listKyc({
    status: view === "" ? "pending" : view === "all" ? undefined : view,
    q: sp.q,
    page: Number(sp.page) || 1,
  });

  return (
    <div>
      <PageHead title="KYC" sub="Players can withdraw only after their KYC is approved. Check that the bank/UPI name matches the PAN name." />
      <Tabs base="/admin/kyc" current={view} items={STATUSES} params={{ q: sp.q }} />
      <form className="card p-3 mb-4 flex flex-wrap gap-2" role="search">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="Player, email, name on PAN, PAN or UPI ID" className="field h-10 flex-1 min-w-[200px] text-[15px]" />
        <button className="btn-primary h-10">Search</button>
      </form>

      {rows.length === 0 ? (
        <p className="card p-8 text-center text-muted">{view === "" ? "No KYC waiting for review." : "Nothing here."}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((k) => (
            <li key={k.userId} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/users/${k.userId}`} className="font-semibold text-lg hover:underline">{k.userName}</Link>
                  <span className="text-muted"> · {k.userEmail}</span>
                  <p className="text-sm text-muted">
                    Submitted {fmtDateTime(k.submittedAt)}
                    {k.reviewedAt ? ` · reviewed by ${k.reviewer ?? "admin"} ${fmtDateTime(k.reviewedAt)}` : ""}
                  </p>
                </div>
                <MoneyBadge kind="kyc" s={k.status} />
              </div>

              <dl className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-[15px]">
                <Field k="Name on PAN" v={k.fullName} />
                <Field k="PAN" v={k.pan} mono />
                {k.bankAccount ? (
                  <>
                    <Field k="Bank account holder" v={k.bankHolder ?? "—"} />
                    <Field k="Account no. · IFSC" v={`${k.bankAccount} · ${k.bankIfsc}`} mono />
                  </>
                ) : (
                  <Field k="Bank account" v="Not added" />
                )}
                <Field k="UPI ID" v={k.upiId ?? "Not added"} mono={!!k.upiId} />
              </dl>
              {k.status === "rejected" && k.rejectReason && <p className="mt-3 text-red text-[15px]">Rejected: {k.rejectReason}</p>}

              {(
                <div className="mt-4 border-t border-line pt-4 grid md:grid-cols-2 gap-4">
                  {k.status !== "approved" && (
                    <ActionForm action={reviewKycAction} submit="Approve KYC" submitClass="btn-go" className="space-y-2">
                      <input type="hidden" name="userId" value={k.userId} />
                      <input type="hidden" name="op" value="approve" />
                      <p className="text-sm text-muted">Name matches, PAN looks right, account details are complete.</p>
                    </ActionForm>
                  )}
                  <ActionForm action={reviewKycAction} submit={k.status === "approved" ? "Revoke approval" : "Reject"} submitClass="btn-danger" className="space-y-2" confirm={k.status === "approved" ? "Revoke this player's KYC? They won't be able to withdraw until approved again." : undefined}>
                    <input type="hidden" name="userId" value={k.userId} />
                    <input type="hidden" name="op" value="reject" />
                    <label className="label" htmlFor={`r-${k.userId}`}>Reason (shown to the player)</label>
                    <input id={`r-${k.userId}`} name="reason" className="field h-10" maxLength={200} placeholder="e.g. Bank account name doesn't match PAN" required />
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} per={per} total={total} base="/admin/kyc" params={{ status: sp.status, q: sp.q }} />
    </div>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted">{k}</dt>
      <dd className={`font-medium break-all ${mono ? "font-mono" : ""}`}>{v}</dd>
    </div>
  );
}
