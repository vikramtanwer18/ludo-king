"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { gameBySlug, inr, prizeFor } from "@/lib/config";
import type { Match } from "@/lib/types";
import { Avatar, StatusPill, timeAgo } from "./ui";

export default function MatchCard({ m, meId, now, action }: { m: Match; meId: string; now: number; action?: React.ReactNode }) {
  const users = useStore((s) => s.users);
  const host = users.find((u) => u.id === m.createdBy);
  const guest = users.find((u) => u.id === m.joinedBy);
  const game = gameBySlug(m.game);
  const mine = m.createdBy === meId || m.joinedBy === meId;
  let outcome: string | null = null;
  if (m.status === "completed" && mine) outcome = m.winnerId === meId ? "You won" : "You lost";

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-sm text-muted">
          {game?.name} · {timeAgo(m.updatedAt, now)}
        </span>
        <StatusPill status={m.status} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {host && <Avatar name={host.name} tone={host.tone} size={42} />}
          {guest ? (
            <Avatar name={guest.name} tone={guest.tone} size={42} />
          ) : (
            <span className="w-[42px] h-[42px] rounded-full border-2 border-dashed border-line bg-white grid place-items-center text-muted text-lg">?</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">
            {host?.id === meId ? "You" : host?.name}
            <span className="text-muted font-normal"> vs </span>
            {guest ? (guest.id === meId ? "You" : guest.name) : "open seat"}
          </p>
          {m.amount > 0 && (
            <p className="text-sm text-muted">
              Entry <b className="text-ink">{inr(m.amount)}</b> · Win <b className="text-green">{inr(m.prize ?? prizeFor(m.amount, m.feePct).prize)}</b>
            </p>
          )}
          {outcome ? (
            <p className={`text-sm font-medium ${outcome === "You won" ? "text-green" : "text-red"}`}>{outcome}</p>
          ) : (
            !m.amount && m.note && <p className="text-sm text-muted truncate">“{m.note}”</p>
          )}
        </div>
        {action ?? (
          <Link href={`/match/${m.id}`} className="btn-ghost h-10 px-3 text-sm">
            Open
          </Link>
        )}
      </div>
    </div>
  );
}
