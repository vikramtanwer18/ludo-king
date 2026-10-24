"use client";

import Link from "next/link";
import { useMe, useStore } from "@/lib/store";
import { Empty, PageTitle, timeAgo, useNow } from "@/components/ui";

export default function Notifications() {
  const me = useMe()!;
  const all = useStore((s) => s.notices);
  const list = all.filter((n) => n.userId === me.id);
  const markRead = useStore((s) => s.markRead);
  const now = useNow(30000);
  const unread = list.filter((n) => !n.read).length;

  return (
    <div>
      <PageTitle
        title="Notifications"
        action={unread > 0 && <button className="btn-ghost h-9 text-sm" onClick={() => markRead()}>Mark all read</button>}
      />
      {list.length === 0 ? (
        <Empty title="No notifications yet" body="Join requests, room codes and results will show up here." />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {list.map((n) => {
            const body = (
              <span className="flex gap-3 px-4 py-3.5">
                <span className={`mt-2 h-2 w-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-blue"}`} aria-hidden />
                <span className="flex-1">
                  <span className={`block ${n.read ? "text-muted" : "text-ink"}`}>{n.text}</span>
                  <span className="block text-sm text-muted mt-0.5">{timeAgo(n.at, now)}</span>
                </span>
              </span>
            );
            return (
              <li key={n.id} className={n.read ? "" : "bg-blue-soft/40"}>
                {n.href ? (
                  <Link href={n.href} onClick={() => !n.read && markRead(n.id)} className="block hover:bg-board">
                    {body}
                  </Link>
                ) : (
                  <button onClick={() => !n.read && markRead(n.id)} className="block w-full text-left hover:bg-board">
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
