"use client";

import { useState } from "react";
import { statsFor, useMe, useStore } from "@/lib/store";
import { Avatar, Empty, PageTitle, useNow } from "@/components/ui";

export default function Leaderboard() {
  const me = useMe()!;
  const users = useStore((s) => s.users);
  const matches = useStore((s) => s.matches);
  const [range, setRange] = useState<"week" | "all">("week");
  const now = useNow(60_000);
  const since = range === "week" ? now - 7 * 86400000 : 0;
  const pool = matches.filter((m) => m.updatedAt >= since);

  const rows = users
    .map((u) => ({ u, ...statsFor(pool, u.id) }))
    .filter((r) => r.played > 0)
    .sort((a, b) => b.wins - a.wins || b.rate - a.rate || a.played - b.played);

  const podium = ["bg-yellow", "bg-[#B9C1D6]", "bg-[#D9A273]"];

  return (
    <div>
      <PageTitle
        title="Leaderboard"
        sub="Ranked by wins, then win rate."
        action={
          <div className="flex rounded-full bg-white border border-line p-1 text-sm">
            {(["week", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`rounded-full px-3 h-8 font-medium ${range === r ? "bg-ink text-white" : "text-muted"}`}
              >
                {r === "week" ? "This week" : "All time"}
              </button>
            ))}
          </div>
        }
      />
      {rows.length === 0 ? (
        <Empty title="No finished matches yet" body="Play a match and you'll appear here." />
      ) : (
        <ol className="card divide-y divide-line overflow-hidden">
          {rows.map((r, i) => (
            <li key={r.u.id} className={`flex items-center gap-3 px-4 py-3 ${r.u.id === me.id ? "bg-blue-soft" : ""}`}>
              <span
                className={`w-8 h-8 shrink-0 rounded-lg grid place-items-center font-display font-bold ${
                  i < 3 ? `${podium[i]} text-ink` : "text-muted"
                }`}
              >
                {i + 1}
              </span>
              <Avatar name={r.u.name} tone={r.u.tone} size={40} />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{r.u.id === me.id ? `${r.u.name} (you)` : r.u.name}</span>
                <span className="block text-sm text-muted">
                  {r.played} played · {r.rate}% win rate
                </span>
              </span>
              <span className="text-right">
                <span className="block font-display font-bold text-2xl leading-none">{r.wins}</span>
                <span className="text-xs text-muted">wins</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
