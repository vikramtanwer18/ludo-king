import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/server/admin";
import { getDb } from "@/server/db";
import { gameBySlug, inr } from "@/lib/config";
import { userWallet } from "@/server/adminWallet";
import {
  adjustBalanceAction,
  forceLogoutAction,
  messageUserAction,
  renameUserAction,
  suspendUserAction,
  unsuspendUserAction,
} from "../../../actions";
import ActionForm, { ConfirmButton } from "@/components/admin/ActionForm";
import { Dot, MatchStatusBadge, MoneyBadge, Stat, Table, UserStatusBadge, ago, fmtDate, fmtDateTime } from "@/components/admin/kit";

const TXN_LABEL: Record<string, string> = {
  deposit: "Cash added",
  stake: "Room entry",
  refund: "Refund",
  win: "Match won",
  withdraw: "Withdrawal",
  withdraw_refund: "Withdrawal returned",
  adjust: "Admin adjustment",
};

export default async function UserDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const data = await getUser(params.id);
  if (!data) notFound();
  const { user: u, matches, invited, sessions, h2h } = data;
  const wallet = await userWallet(u.id);
  const db = await getDb();
  const names = new Map(
    (await db.q<{ id: string; name: string }>("SELECT id, name FROM users")).map((r) => [r.id, r.name])
  );
  const nm = (id?: string) => (id ? names.get(id) ?? "—" : "—");

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-muted hover:text-ink text-[15px]">‹ Players</Link>

      <section className="card p-5 flex flex-wrap items-center gap-4">
        <Dot name={u.name} tone={u.tone} size={64} />
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[28px] font-bold">{u.name}</h1>
            <UserStatusBadge s={u.status} />
          </div>
          <p className="text-muted">
            <b className="text-green">{inr(wallet.balance)}</b> in wallet · {u.email || "No email"} · Invite code {u.inviteCode} · Joined {fmtDate(u.createdAt)} · Last seen {ago(u.lastSeenAt)}
          </p>
          {u.invitedByName && (
            <p className="text-muted">Invited by <Link className="text-blue" href={`/admin/users/${u.invitedBy}`}>{u.invitedByName}</Link></p>
          )}
          {u.status === "suspended" && <p className="text-red mt-1">Suspended: {u.suspendedReason}</p>}
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="Finished matches" value={u.played} tone="blue" />
        <Stat label="Won" value={u.wins} tone="green" />
        <Stat label="Lost" value={u.losses} tone="red" />
        <Stat label="Win rate" value={u.played ? `${u.rate}%` : "—"} tone="yellow" />
        <Stat label="Disputes" value={u.disputes} tone="red" />
        <Stat label="Friends invited" value={u.invites} tone="blue" />
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-5">
          <h2 className="text-xl font-semibold">Actions</h2>
          {u.status === "active" ? (
            <ActionForm action={suspendUserAction} submit="Suspend player" submitClass="btn-danger" confirm={`Suspend ${u.name}? They'll be signed out everywhere.`}>
              <input type="hidden" name="id" value={u.id} />
              <label className="label" htmlFor="reason">Reason (shown to the player)</label>
              <input id="reason" name="reason" className="field" placeholder="e.g. Posted an edited win screenshot" maxLength={200} />
            </ActionForm>
          ) : (
            <ConfirmButton action={unsuspendUserAction} fields={{ id: u.id }} label="Lift suspension" cls="btn-go" />
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <ConfirmButton action={forceLogoutAction} fields={{ id: u.id }} label={`Sign out of all devices (${sessions})`} confirm="Sign this player out everywhere?" />
          </div>
          <ActionForm action={renameUserAction} submit="Rename" submitClass="btn-ghost" className="space-y-2 border-t border-line pt-4">
            <input type="hidden" name="id" value={u.id} />
            <label className="label" htmlFor="name">Display name</label>
            <input id="name" name="name" className="field" defaultValue={u.name} maxLength={40} />
          </ActionForm>
          <ActionForm action={messageUserAction} submit="Send message" submitClass="btn-primary" className="space-y-2 border-t border-line pt-4">
            <input type="hidden" name="id" value={u.id} />
            <label className="label" htmlFor="text">Message to this player&apos;s notifications</label>
            <textarea id="text" name="text" className="field h-24 py-2" maxLength={280} placeholder="e.g. We reviewed your match and…" />
          </ActionForm>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-xl font-semibold mb-3">Most played against</h2>
            {h2h.length === 0 ? <p className="text-muted">No finished matches yet.</p> : (
              <ul className="divide-y divide-line">
                {h2h.map((h) => (
                  <li key={h.opp} className="flex items-center justify-between py-2.5">
                    <Link href={`/admin/users/${h.opp}`} className="font-medium hover:underline">{nm(h.opp)}</Link>
                    <span className="text-[15px]">
                      <span className="text-green font-medium">{h.wins}W</span>{" "}
                      <span className="text-red">{h.played - h.wins}L</span>{" "}
                      <span className="text-muted">of {h.played}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5">
            <h2 className="text-xl font-semibold mb-3">Friends who joined with their code</h2>
            {invited.length === 0 ? <p className="text-muted">None yet.</p> : (
              <ul className="flex flex-wrap gap-2">
                {invited.map((f) => (
                  <li key={f.id}>
                    <Link href={`/admin/users/${f.id}`} className="inline-block rounded-full border border-line px-3 py-1 text-[15px] hover:bg-board">{f.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Wallet</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Balance now" value={inr(wallet.balance)} tone="green" />
          <Stat label="Cash added" value={inr(wallet.totals.deposited)} tone="blue" />
          <Stat label="Withdrawn" value={inr(wallet.totals.withdrawn)} hint="incl. in progress" tone="yellow" />
          <Stat label="Won from matches" value={inr(wallet.totals.won)} tone="green" />
          <Stat label="Net room entries" value={inr(wallet.totals.staked)} tone="red" />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-lg font-semibold">KYC</h3>
              <MoneyBadge kind="kyc" s={wallet.kyc?.status ?? "none"} />
            </div>
            {wallet.kyc ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
                <dt className="text-muted">Name on PAN</dt><dd>{wallet.kyc.fullName}</dd>
                <dt className="text-muted">PAN</dt><dd className="font-mono">{wallet.kyc.pan}</dd>
                <dt className="text-muted">Bank</dt>
                <dd className="font-mono break-all">{wallet.kyc.bankAccount ? `${wallet.kyc.bankHolder} · ${wallet.kyc.bankAccount} · ${wallet.kyc.bankIfsc}` : "—"}</dd>
                <dt className="text-muted">UPI</dt><dd className="font-mono break-all">{wallet.kyc.upiId ?? "—"}</dd>
                <dt className="text-muted">Submitted</dt><dd>{fmtDateTime(wallet.kyc.submittedAt)}</dd>
                {wallet.kyc.rejectReason && (<><dt className="text-muted">Rejected</dt><dd className="text-red">{wallet.kyc.rejectReason}</dd></>)}
              </dl>
            ) : (
              <p className="text-muted">Not submitted yet.</p>
            )}
            {wallet.kyc && (
              <Link href={`/admin/kyc?status=all&q=${encodeURIComponent(u.email || u.name)}`} className="inline-block mt-3 text-blue text-sm font-medium">Review in KYC</Link>
            )}
          </div>
          <div className="card p-5">
            <h3 className="text-lg font-semibold mb-1">Adjust balance</h3>
            <p className="text-sm text-muted mb-3">For refunds or corrections. The player sees the reason in their wallet history, and it&apos;s in the activity log.</p>
            <ActionForm action={adjustBalanceAction} submit="Apply" submitClass="btn-primary" confirm="Change this player's wallet balance?" className="space-y-2">
              <input type="hidden" name="userId" value={u.id} />
              <div className="flex gap-2">
                <select name="dir" className="field h-11 w-32" aria-label="Credit or debit">
                  <option value="credit">Add (+)</option>
                  <option value="debit">Deduct (−)</option>
                </select>
                <input name="amount" className="field h-11" inputMode="decimal" placeholder="Amount in ₹" aria-label="Amount in rupees" required />
              </div>
              <input name="reason" className="field h-11" maxLength={200} placeholder="Reason, e.g. Refund for match abc123" aria-label="Reason" required />
            </ActionForm>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Cash added ({wallet.deposits.length})</h3>
          <Table head={["Payment", "Amount", "Status", "Razorpay payment", "When"]} empty={wallet.deposits.length ? undefined : "No payments yet."}>
            {wallet.deposits.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/admin/payments?q=${d.id}`} className="font-mono text-sm text-blue hover:underline">{d.id}</Link>{d.demo && <span className="ml-1 text-xs text-yellow-ink">demo</span>}</td>
                <td className="font-medium">{inr(d.paidAmount ?? d.amount)}</td>
                <td><MoneyBadge kind="dep" s={d.status} />{d.failureReason && <span className="block text-xs text-muted">{d.failureReason}</span>}</td>
                <td className="font-mono text-sm text-muted">{d.paymentId ?? "—"}{d.payer ? ` · ${d.payer}` : ""}</td>
                <td className="text-muted whitespace-nowrap">{fmtDateTime(d.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Withdrawals ({wallet.withdrawals.length})</h3>
          <Table head={["Request", "Amount", "To", "Status", "UTR / note", "When"]} empty={wallet.withdrawals.length ? undefined : "No withdrawals yet."}>
            {wallet.withdrawals.map((w) => (
              <tr key={w.id}>
                <td><Link href={`/admin/withdrawals?status=all&q=${w.id}`} className="font-mono text-sm text-blue hover:underline">{w.id}</Link></td>
                <td className="font-medium">{inr(w.amount)}</td>
                <td className="text-sm font-mono break-all">{w.destinationFull}</td>
                <td><MoneyBadge kind="wd" s={w.status} /></td>
                <td className="text-sm">{w.utr && <span className="font-mono">{w.utr}</span>}{w.adminNote && <span className="block text-muted">{w.adminNote}</span>}</td>
                <td className="text-muted whitespace-nowrap">{fmtDateTime(w.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Wallet history ({wallet.txns.length})</h3>
          <Table head={["When", "Type", "Amount", "Balance after", "Details"]} empty={wallet.txns.length ? undefined : "No wallet activity yet."}>
            {wallet.txns.map((t) => (
              <tr key={t.id}>
                <td className="text-muted whitespace-nowrap">{fmtDateTime(t.at)}</td>
                <td>{TXN_LABEL[t.kind] ?? t.kind}</td>
                <td className={`font-medium tabular-nums ${t.amount > 0 ? "text-green" : ""}`}>{t.amount > 0 ? "+" : "−"}{inr(Math.abs(t.amount))}</td>
                <td className="tabular-nums text-muted">{inr(t.balanceAfter)}</td>
                <td className="text-sm">
                  {t.note}
                  {t.ref && (t.kind === "stake" || t.kind === "refund" || t.kind === "win") && <Link href={`/admin/matches/${t.ref}`} className="ml-2 text-blue">match</Link>}
                  {t.admin && <span className="text-muted"> · by {t.admin}</span>}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Matches ({matches.length})</h2>
        <Table head={["Game", "Opponent", "Role", "Entry", "Status", "Result", "When"]} empty={matches.length ? undefined : "No matches yet."}>
          {matches.map((m) => {
            const opp = m.createdBy === u.id ? m.joinedBy : m.createdBy;
            const res = m.status === "completed" ? (m.winnerId === u.id ? "Won" : "Lost") : m.results[u.id]?.outcome ? `Posted “${m.results[u.id].outcome}”` : "—";
            return (
              <tr key={m.id}>
                <td><Link href={`/admin/matches/${m.id}`} className="hover:underline">{gameBySlug(m.game)?.name}</Link></td>
                <td>{opp ? <Link href={`/admin/users/${opp}`} className="hover:underline">{nm(opp)}</Link> : <span className="text-muted">open seat</span>}</td>
                <td className="text-muted">{m.createdBy === u.id ? "Host" : "Joined"}</td>
                <td className="tabular-nums">{m.amount ? inr(m.amount) : <span className="text-muted">Free</span>}</td>
                <td><MatchStatusBadge s={m.status} /></td>
                <td className={res === "Won" ? "text-green font-medium" : res === "Lost" ? "text-red" : "text-muted"}>{res}</td>
                <td className="text-muted whitespace-nowrap">{fmtDateTime(m.updatedAt)}</td>
              </tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}
