import Link from "next/link";
import { dashboard } from "@/server/admin";
import { walletDashboard } from "@/server/adminWallet";
import { gameBySlug, inr } from "@/lib/config";
import { Bars, Dot, MatchStatusBadge, PageHead, Stat, Table, ago } from "@/components/admin/kit";

export default async function Dashboard() {
  const [d, w] = await Promise.all([dashboard(), walletDashboard()]);
  const totalGames = d.byGame.reduce((a, b) => a + b.n, 0) || 1;

  return (
    <div className="space-y-6">
      <PageHead title="Dashboard" sub="Players, matches, money and anything that needs you." />

      {d.matches.disputed > 0 && (
        <Link href="/admin/matches?status=disputed" className="flex items-center justify-between gap-3 rounded-2xl bg-red text-white px-5 py-4">
          <span>
            <span className="block font-semibold text-lg">{d.matches.disputed} {d.matches.disputed === 1 ? "match needs" : "matches need"} a decision</span>
            <span className="text-white text-[15px]">Players posted results that don&apos;t match.</span>
          </span>
          <span className="btn bg-white text-red h-10">Review</span>
        </Link>
      )}

      {(w.withdrawals.pending > 0 || w.kycPending > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {w.withdrawals.pending > 0 && (
            <Link href="/admin/withdrawals" className="flex items-center justify-between gap-3 rounded-2xl bg-yellow-soft text-yellow-ink px-5 py-4">
              <span>
                <span className="block font-semibold text-lg">{w.withdrawals.pending} {w.withdrawals.pending === 1 ? "withdrawal needs" : "withdrawals need"} review</span>
                <span className="text-[15px]">{inr(w.withdrawals.pendingSum)} requested</span>
              </span>
              <span className="btn bg-white text-ink h-10">Review</span>
            </Link>
          )}
          {w.kycPending > 0 && (
            <Link href="/admin/kyc" className="flex items-center justify-between gap-3 rounded-2xl bg-blue-soft text-blue px-5 py-4">
              <span>
                <span className="block font-semibold text-lg">{w.kycPending} KYC {w.kycPending === 1 ? "submission" : "submissions"} waiting</span>
                <span className="text-[15px]">Players can&apos;t withdraw until approved.</span>
              </span>
              <span className="btn bg-white text-ink h-10">Review</span>
            </Link>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Cash added today" value={inr(w.deposits.todaySum)} hint={`${inr(w.deposits.weekSum)} last 7 days · ${w.deposits.pending} in process`} href="/admin/payments" tone="green" />
        <Stat label="Withdrawals to pay" value={inr(w.withdrawals.pendingSum + w.withdrawals.approvedSum)} hint={`${w.withdrawals.pending + w.withdrawals.approved} requests · ${inr(w.withdrawals.paidToday)} paid today`} href="/admin/withdrawals" tone="yellow" />
        <Stat label="Player wallets" value={inr(w.walletsTotal)} hint={`${inr(w.heldInMatches)} held in rooms`} tone="blue" />
        <Stat label="Commission earned" value={inr(w.fees)} hint={`${inr(w.feesWeek)} last 7 days`} tone="red" />
      </section>
      {w.mode !== "live" && (
        <p className="rounded-xl bg-yellow-soft text-yellow-ink px-4 py-3 text-[15px]">
          Payments are in {w.mode === "demo" ? "demo mode" : "off mode"}: Razorpay keys aren&apos;t set. <Link href="/admin/payments" className="underline font-medium">Details</Link>
        </p>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Registered players" value={d.users.total} hint={`+${d.users.today} today · +${d.users.week} this week`} href="/admin/users" tone="blue" />
        <Stat label="Active last 7 days" value={d.users.active7} hint={`${d.users.suspended} suspended`} href="/admin/users?sort=seen" tone="green" />
        <Stat label="Matches finished" value={d.matches.completed} hint={`${d.matches.cancelled} cancelled`} href="/admin/matches?status=completed" tone="yellow" />
        <Stat label="Live now" value={d.matches.live} hint={`${d.matches.open} rooms waiting`} href="/admin/matches?status=running" tone="red" />
      </section>

      <section className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xl font-semibold">Matches finished, last 14 days</h2>
            <span className="text-sm text-muted">{d.perDay.reduce((a, b) => a + b.n, 0)} total</span>
          </div>
          <Bars data={d.perDay} label="Matches finished per day" />
        </div>
        <div className="card p-5">
          <h2 className="text-xl font-semibold mb-3">By game</h2>
          <ul className="space-y-3">
            {d.byGame.map((g) => (
              <li key={g.game}>
                <div className="flex justify-between text-[15px]">
                  <span>{gameBySlug(g.game)?.name ?? g.game}</span>
                  <span className="text-muted">{g.n}</span>
                </div>
                <div className="h-2 rounded-full bg-board mt-1">
                  <div className="h-full rounded-full bg-blue" style={{ width: `${(g.n / totalGames) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <h2 className="text-xl font-semibold mt-6 mb-2">New sign-ups</h2>
          <Bars data={d.signups} label="New players per day" />
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xl font-semibold">Top winners this week</h2>
            <Link href="/admin/leaderboard" className="text-blue text-sm font-medium">All winners</Link>
          </div>
          <div className="card divide-y divide-line">
            {d.topWinners.length === 0 && <p className="p-4 text-muted">No finished matches this week.</p>}
            {d.topWinners.map((u, i) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-board/60">
                <span className="w-6 text-muted font-display font-bold">{i + 1}</span>
                <Dot name={u.name} tone={u.tone} />
                <span className="flex-1">
                  <span className="block font-medium">{u.name}</span>
                  <span className="text-sm text-muted">{u.played} played · {u.rate}% win rate</span>
                </span>
                <span className="font-display font-bold text-2xl">{u.wins}</span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xl font-semibold">Latest activity</h2>
            <Link href="/admin/matches" className="text-blue text-sm font-medium">All matches</Link>
          </div>
          <Table compact head={["Players", "Status", "Updated"]}>
            {d.recent.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/admin/matches/${m.id}`} className="font-medium hover:underline">
                    {m.hostName} <span className="text-muted font-normal">vs</span> {m.guestName ?? "—"}
                  </Link>
                  {m.winnerName && <span className="block text-sm text-green">{m.winnerName} won</span>}
                </td>
                <td><MatchStatusBadge s={m.status} /></td>
                <td className="text-muted whitespace-nowrap">{ago(m.updatedAt)}</td>
              </tr>
            ))}
          </Table>
        </div>
      </section>
    </div>
  );
}
