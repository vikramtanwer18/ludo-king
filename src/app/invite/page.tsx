"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";
import { useMe, useStore } from "@/lib/store";
import { APP } from "@/lib/config";
import { PageTitle, toast } from "@/components/ui";

export default function Invite() {
  const me = useMe()!;
  const users = useStore((s) => s.users);
  const friends = users.filter((u) => u.invitedBy === me.id);
  // Player pages only render in the browser (AppShell waits for the session), so window is available.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [copied, setCopied] = useState(false);

  const link = `${origin}/login?invite=${me.inviteCode}`;
  const msg = `Let's play Ludo on ${APP.name}. Join with my code ${me.inviteCode}: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: APP.name, text: msg, url: link });
      } catch {}
    } else copy();
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Invite friends" sub="More friends, more open rooms." />

      <section className="card p-6 text-center">
        <p className="text-muted">Your invite code</p>
        <p className="font-display font-bold text-5xl tracking-[0.15em] mt-1">{me.inviteCode}</p>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-board px-3 h-11 text-left">
          <span className="truncate flex-1 text-[15px] text-muted">{link}</span>
          <button onClick={copy} className="shrink-0 text-ink" aria-label="Copy invite link">
            {copied ? <Check size={18} className="text-green" /> : <Copy size={18} />}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          <a className="btn bg-[#0F7A55] text-white" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <a className="btn bg-[#1677B3] text-white" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
            <Send size={16} /> Telegram
          </a>
          <button className="btn-ghost col-span-2 sm:col-span-1" onClick={share}>
            <Share2 size={16} /> More
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ul className="mt-2 space-y-1.5 text-muted list-disc pl-5">
          <li>Your friend opens the link, or types your code when they sign up.</li>
          <li>You get a notification when they join.</li>
          <li>Their open rooms show up in your lobby, ready to play.</li>
        </ul>
      </section>

      <Link href="/invite/friends" className="card p-5 flex items-center justify-between hover:bg-white/70">
        <span>
          <span className="block font-semibold">Friends who joined</span>
          <span className="block text-muted text-sm">See who signed up with your code</span>
        </span>
        <span className="font-display font-bold text-3xl">{friends.length}</span>
      </Link>
    </div>
  );
}
