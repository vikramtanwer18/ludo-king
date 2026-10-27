import Link from "next/link";
import { listMatches } from "@/server/admin";
import { GAMES, gameBySlug, inr } from "@/lib/config";
import { MatchStatusBadge, PageHead, Pager, Table, fmtDateTime } from "@/components/admin/kit";

const STATUSES = [
  { v: "", l: "All" },
  { v: "disputed", l: "Disputed" },
  { v: "running", l: "Live" },
  { v: "open", l: "Open" },
  { v: "requested", l: "Join request" },
  { v: "completed", l: "Finished" },
  { v: "cancelled", l: "Cancelled" },
];

export default async function Matches({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { rows, total, page, per } = await listMatches({ status: sp.status, game: sp.game, q: sp.q, page: Number(sp.page) || 1 });
  const tabHref = (v: string) => {
    const p = new URLSearchParams(Object.entries({ ...sp, status: v, page: "" }).filter(([, x]) => x) as [string, string][]);
    return `/admin/matches${p.size ? `?${p}` : ""}`;
  };

  return (
    <div>
      <PageHead title={sp.status === "disputed" ? "Disputes" : "Matches"} sub={`${total} matches`} />

      <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
        {STATUSES.map((s) => (
          <Link key={s.v} href={tabHref(s.v)} className={`shrink-0 rounded-full px-4 h-9 grid place-items-center text-[15px] font-medium border ${(sp.status ?? "") === s.v ? "bg-ink text-white border-ink" : "bg-white border-line text-muted"}`}>
            {s.l}
          </Link>
        ))}
      </div>

      <form className="card p-3 mb-4 flex flex-wrap gap-2" role="search">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="Player name, room code or match ID" className="field h-10 flex-1 min-w-[200px] text-[15px]" />
        <select name="game" defaultValue={sp.game ?? ""} className="field h-10 w-auto text-[15px]" aria-label="Game">
          <option value="">All games</option>
          {GAMES.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
        </select>
        <button className="btn-primary h-10">Apply</button>
      </form>

      <Table head={["Match", "Players", "Game", "Entry", "Room code", "Status", "Winner", "Updated"]} empty={rows.length ? undefined : "No matches here."}>
        {rows.map((m) => (
          <tr key={m.id}>
            <td><Link href={`/admin/matches/${m.id}`} className="font-mono text-sm text-blue hover:underline">{m.id}</Link></td>
            <td className="whitespace-nowrap">
              <Link href={`/admin/users/${m.createdBy}`} className="hover:underline">{m.hostName}</Link>
              <span className="text-muted"> vs </span>
              {m.joinedBy ? <Link href={`/admin/users/${m.joinedBy}`} className="hover:underline">{m.guestName}</Link> : <span className="text-muted">—</span>}
            </td>
            <td className="text-muted whitespace-nowrap">{gameBySlug(m.game)?.name}</td>
            <td className="tabular-nums whitespace-nowrap">{m.amount ? inr(m.amount) : <span className="text-muted">Free</span>}</td>
            <td className="tabular-nums text-muted">{m.roomCode ?? "—"}</td>
            <td><MatchStatusBadge s={m.status} /></td>
            <td className="font-medium text-green">{m.winnerName ?? <span className="text-muted font-normal">—</span>}</td>
            <td className="text-muted whitespace-nowrap">{fmtDateTime(m.updatedAt)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={page} per={per} total={total} base="/admin/matches" params={{ status: sp.status, game: sp.game, q: sp.q }} />
    </div>
  );
}
