"use client";

import Link from "next/link";
import { statsFor, useMe, useStore } from "@/lib/store";
import { Avatar, Empty, PageTitle, timeAgo } from "@/components/ui";

export default function Friends() {
  const me = useMe()!;
  const users = useStore((s) => s.users);
  const matches = useStore((s) => s.matches);
  const friends = users.filter((u) => u.invitedBy === me.id).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <PageTitle title="Friends who joined" sub="People who signed up with your invite code." />
      {friends.length === 0 ? (
        <Empty
          title="No one yet"
          body="Share your invite link. Friends who join with it will show up here."
          action={<Link href="/invite" className="btn-primary">Share invite link</Link>}
        />
      ) : (
        <ul className="card divide-y divide-line">
          {friends.map((f) => {
            const st = statsFor(matches, f.id);
            return (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={f.name} tone={f.tone} />
                <span className="flex-1">
                  <span className="block font-semibold">{f.name}</span>
                  <span className="block text-sm text-muted">Joined {timeAgo(f.createdAt)} · {st.played} matches</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
