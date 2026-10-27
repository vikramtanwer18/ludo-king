import Link from "next/link";
import { listUsers, type UserSort } from "@/server/admin";
import { Dot, PageHead, Pager, Table, UserStatusBadge, ago, fmtDate } from "@/components/admin/kit";

const SORTS: { v: UserSort; l: string }[] = [
  { v: "joined", l: "Newest" },
  { v: "wins", l: "Most wins" },
  { v: "losses", l: "Most losses" },
  { v: "rate", l: "Best win rate" },
  { v: "played", l: "Most matches" },
  { v: "seen", l: "Recently active" },
];

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sort = (SORTS.find((s) => s.v === sp.sort)?.v ?? "joined") as UserSort;
  const { rows, total, page, per } = await listUsers({ q: sp.q, status: sp.status, sort, page: Number(sp.page) || 1 });

  return (
    <div>
      <PageHead title="Players" sub={`${total} ${sp.q || sp.status ? "matching" : "registered"} players`} />

      <form className="card p-3 mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search name, email or invite code" className="field h-10 flex-1 min-w-[200px] text-[15px]" />
        <select name="status" defaultValue={sp.status ?? ""} className="field h-10 w-auto text-[15px]" aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select name="sort" defaultValue={sort} className="field h-10 w-auto text-[15px]" aria-label="Sort">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <button className="btn-primary h-10">Apply</button>
        {(sp.q || sp.status || sp.sort) && <Link href="/admin/users" className="btn-ghost h-10">Clear</Link>}
      </form>

      <Table head={["Player", "Email", "Played", "Won", "Lost", "Win rate", "Joined", "Last seen", "Status"]} empty={rows.length ? undefined : "No players match these filters."}>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>
              <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                <Dot name={u.name} tone={u.tone} size={28} /> {u.name}
              </Link>
            </td>
            <td className="text-muted max-w-[220px] truncate" title={u.email}>{u.email || "—"}</td>
            <td className="tabular-nums">{u.played}</td>
            <td className="tabular-nums text-green font-medium">{u.wins}</td>
            <td className="tabular-nums text-red">{u.losses}</td>
            <td className="tabular-nums">{u.played ? `${u.rate}%` : "—"}</td>
            <td className="text-muted whitespace-nowrap">{fmtDate(u.createdAt)}</td>
            <td className="text-muted whitespace-nowrap">{ago(u.lastSeenAt)}</td>
            <td><UserStatusBadge s={u.status} /></td>
          </tr>
        ))}
      </Table>
      <Pager page={page} per={per} total={total} base="/admin/users" params={{ q: sp.q, status: sp.status, sort: sp.sort }} />
    </div>
  );
}
