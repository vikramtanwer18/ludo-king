import Link from "next/link";
import { leaderboard } from "@/server/admin";
import { Dot, PageHead, Table, UserStatusBadge } from "@/components/admin/kit";

const RANGES = [
  { v: "7", l: "7 days" },
  { v: "30", l: "30 days" },
  { v: "all", l: "All time" },
];

export default async function Winners({ searchParams }: { searchParams: { range?: string; by?: string } }) {
  const range = RANGES.find((r) => r.v === searchParams.range)?.v ?? "7";
  const by = searchParams.by === "losses" ? "losses" : searchParams.by === "rate" ? "rate" : "wins";
  let rows = await leaderboard(range === "all" ? null : Number(range));
  if (by === "losses") rows = [...rows].sort((a, b) => b.losses - a.losses || a.rate - b.rate);
  if (by === "rate") rows = rows.filter((r) => r.played >= 5).sort((a, b) => b.rate - a.rate || b.played - a.played);
  const href = (k: string, v: string) => `/admin/leaderboard?${new URLSearchParams({ range, by, [k]: v })}`;

  return (
    <div>
      <PageHead
        title="Winners & losers"
        sub="Who won the most, who lost the most, and who wins most often."
      />
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex rounded-full bg-white border border-line p-1 text-sm">
          {RANGES.map((r) => (
            <Link key={r.v} href={href("range", r.v)} className={`rounded-full px-3 h-8 grid place-items-center font-medium ${range === r.v ? "bg-ink text-white" : "text-muted"}`}>{r.l}</Link>
          ))}
        </div>
        <div className="flex rounded-full bg-white border border-line p-1 text-sm">
          {[
            { v: "wins", l: "Most wins" },
            { v: "losses", l: "Most losses" },
            { v: "rate", l: "Best win rate (5+ games)" },
          ].map((r) => (
            <Link key={r.v} href={href("by", r.v)} className={`rounded-full px-3 h-8 grid place-items-center font-medium ${by === r.v ? "bg-ink text-white" : "text-muted"}`}>{r.l}</Link>
          ))}
        </div>
      </div>

      <Table head={["#", "Player", "Played", "Won", "Lost", "Win rate", "Disputes", "Status"]} empty={rows.length ? undefined : "No finished matches in this period."}>
        {rows.map((u, i) => (
          <tr key={u.id}>
            <td className="font-display font-bold text-muted">{i + 1}</td>
            <td>
              <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                <Dot name={u.name} tone={u.tone} size={28} /> {u.name}
              </Link>
            </td>
            <td className="tabular-nums">{u.played}</td>
            <td className="tabular-nums text-green font-semibold">{u.wins}</td>
            <td className="tabular-nums text-red">{u.losses}</td>
            <td className="tabular-nums">
              <span className="inline-flex items-center gap-2">
                <span className="w-16 h-1.5 rounded-full bg-board overflow-hidden"><span className="block h-full bg-green" style={{ width: `${u.rate}%` }} /></span>
                {u.rate}%
              </span>
            </td>
            <td className={`tabular-nums ${u.disputes ? "text-red" : "text-muted"}`}>{u.disputes}</td>
            <td><UserStatusBadge s={u.status} /></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
