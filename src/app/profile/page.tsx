"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronRight, LogOut, Pencil } from "lucide-react";
import { statsFor, useMe, useStore } from "@/lib/store";
import type { Tone } from "@/lib/types";
import { inr } from "@/lib/config";
import { Avatar, PageTitle, Sheet, toast } from "@/components/ui";

const TONES: { t: Tone; cls: string; label: string }[] = [
  { t: "red", cls: "bg-red", label: "Red" },
  { t: "green", cls: "bg-green", label: "Green" },
  { t: "yellow", cls: "bg-yellow", label: "Yellow" },
  { t: "blue", cls: "bg-blue", label: "Blue" },
];

export default function Profile() {
  const me = useMe()!;
  const router = useRouter();
  const matches = useStore((s) => s.matches);
  const wallet = useStore((s) => s.wallet);
  const { updateProfile, logout } = useStore.getState();
  const st = statsFor(matches, me.id);
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(me.name);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const filled = [me.name, me.email, me.tone].filter(Boolean).length + (st.played > 0 ? 1 : 0);
  const completion = Math.round((filled / 4) * 100);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await updateProfile({ name });
    if (!r.ok) return toast.error(r.error);
    toast.ok("Name updated.");
    setEditName(false);
  };
  const pickTone = async (t: Tone) => {
    const r = await updateProfile({ tone: t });
    if (!r.ok) toast.error(r.error);
  };
  const askNotify = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") toast.ok("Notifications are on for this browser.");
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Profile" />

      <section className="card p-5">
        <div className="flex items-center gap-4">
          <Avatar name={me.name} tone={me.tone} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold truncate">{me.name}</h2>
              <button onClick={() => { setName(me.name); setEditName(true); }} aria-label="Edit name" className="p-1 text-muted hover:text-ink">
                <Pencil size={16} />
              </button>
            </div>
            <p className="text-muted break-all">{me.email}</p>
            <p className="text-sm text-muted">Member since {new Date(me.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-muted">Profile complete</span>
            <span className="font-medium">{completion}%</span>
          </div>
          <div className="h-2 rounded-full bg-board overflow-hidden">
            <div className="h-full bg-green rounded-full" style={{ width: `${completion}%` }} />
          </div>
          {completion < 100 && <p className="text-sm text-muted mt-1.5">Play your first match to reach 100%.</p>}
        </div>

        <fieldset className="mt-5">
          <legend className="label">Token colour</legend>
          <div className="flex gap-3">
            {TONES.map(({ t, cls, label }) => (
              <button
                key={t}
                onClick={() => pickTone(t)}
                aria-pressed={me.tone === t}
                aria-label={label}
                className={`${cls} w-11 h-11 rounded-full ring-offset-2 ${me.tone === t ? "ring-[3px] ring-ink" : ""}`}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { v: st.played, l: "Matches" },
          { v: st.wins, l: "Wins" },
          { v: st.losses, l: "Losses" },
          { v: `${st.rate}%`, l: "Win rate" },
        ].map((x) => (
          <div key={x.l} className="card p-4">
            <p className="font-display font-bold text-3xl">{x.v}</p>
            <p className="text-sm text-muted">{x.l}</p>
          </div>
        ))}
      </section>

      <section className="card divide-y divide-line">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Bell size={20} className="text-muted" />
          <span className="flex-1">
            <span className="block font-medium">Browser notifications</span>
            <span className="block text-sm text-muted">
              {perm === "granted" ? "On for this browser" : perm === "denied" ? "Blocked. Allow them in your browser settings." : perm === "unsupported" ? "Not supported in this browser" : "Get told when someone joins or shares a code"}
            </span>
          </span>
          {perm === "default" && <button className="btn-ghost h-9 text-sm" onClick={askNotify}>Turn on</button>}
        </div>
        <Row href="/wallet" label="Wallet" value={inr(wallet?.balance ?? 0)} />
        <Row
          href="/profile/kyc"
          label="KYC & bank details"
          badge={
            wallet?.kyc === "approved"
              ? { t: "Verified", cls: "bg-green-soft text-green-ink" }
              : wallet?.kyc === "pending"
              ? { t: "Under review", cls: "bg-yellow-soft text-yellow-ink" }
              : wallet?.kyc === "rejected"
              ? { t: "Rejected", cls: "bg-red-soft text-red-ink" }
              : { t: "Not done", cls: "bg-blue-soft text-blue" }
          }
        />
        <Row href="/invite" label="Invite code" value={me.inviteCode} />
        <Row href="/matches" label="My matches" />
        <Row href="/rules" label="Fair-play rules" />
        <Row href="/support" label="Help & support" />
      </section>

      <div className="grid sm:grid-cols-2 gap-3">
        <button
          className="btn-danger"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut size={18} /> Log out
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            if (!confirm("Log out on every phone and browser where you're signed in?")) return;
            await logout(true);
            router.replace("/login");
          }}
        >
          Log out of all devices
        </button>
      </div>

      <Sheet open={editName} onClose={() => setEditName(false)} title="Edit name">
        <form onSubmit={saveName}>
          <label className="label" htmlFor="nm">Name friends see</label>
          <input id="nm" className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn-primary w-full mt-4">Save name</button>
        </form>
      </Sheet>
    </div>
  );
}

function Row({ href, label, value, badge }: { href: string; label: string; value?: string; badge?: { t: string; cls: string } }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-board">
      <span className="flex-1 font-medium">{label}</span>
      {value && <span className="text-muted font-display tracking-wider">{value}</span>}
      {badge && <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium ${badge.cls}`}>{badge.t}</span>}
      <ChevronRight size={18} className="text-muted" />
    </Link>
  );
}
