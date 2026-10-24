"use client";

import Link from "next/link";
import { useState } from "react";
import { statsFor, useMe, useStore } from "@/lib/store";
import { Empty, PageTitle, useNow } from "@/components/ui";
import MatchCard from "@/components/MatchCard";
import type { MatchStatus } from "@/lib/types";

const TABS: { id: string; label: string; has: MatchStatus[] }[] = [
  { id: "all", label: "All", has: ["open", "requested", "running", "completed", "cancelled", "disputed"] },
  { id: "active", label: "Active", has: ["open", "requested", "running"] },
  { id: "finished", label: "Finished", has: ["completed"] },
  { id: "other", label: "Cancelled & review", has: ["cancelled", "disputed"] },
];

export default function MyMatches() {
  const me = useMe()!;
  const all = useStore((s) => s.matches);
  const now = useNow(30000);
  const [tab, setTab] = useState("all");
  const t = TABS.find((x) => x.id === tab)!;
  const mine = all
    .filter((m) => m.createdBy === me.id || m.joinedBy === me.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const list = mine.filter((m) => t.has.includes(m.status));
  const st = statsFor(all, me.id);

  return (
    <div>
      <PageTitle title="My matches" />
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { v: st.played, l: "Played" },
          { v: st.wins, l: "Won" },
          { v: `${st.rate}%`, l: "Win rate" },
        ].map((x) => (
          <div key={x.l} className="card p-4">
            <p className="font-display font-bold text-3xl">{x.v}</p>
            <p className="text-sm text-muted">{x.l}</p>
          </div>
        ))}
      </div>

      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`shrink-0 rounded-full px-4 h-9 text-[15px] font-medium border ${
              tab === x.id ? "bg-ink text-white border-ink" : "bg-white border-line text-muted"
            }`}
          >
            {x.label} <span className="opacity-60">{mine.filter((m) => x.has.includes(m.status)).length}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.length === 0 ? (
          <Empty
            title="Nothing here yet"
            body="Matches you create or join show up here."
            action={<Link href="/" className="btn-primary">Find a game</Link>}
          />
        ) : (
          list.map((m) => <MatchCard key={m.id} m={m} meId={me.id} now={now} />)
        )}
      </div>
    </div>
  );
}
