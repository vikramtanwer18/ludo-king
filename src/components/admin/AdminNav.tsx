"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Gauge, IndianRupee, KeyRound, ListChecks, Scale, Settings, ShieldCheck, Swords, Trophy, Users } from "lucide-react";

export type NavCounts = { disputes: number; withdrawals: number; kyc: number };

const ITEMS: { href: string; label: string; icon: typeof Gauge; badge?: keyof NavCounts }[] = [
  { href: "/admin", label: "Dashboard", icon: Gauge },
  { href: "/admin/users", label: "Players", icon: Users },
  { href: "/admin/matches", label: "Matches", icon: Swords },
  { href: "/admin/matches?status=disputed", label: "Disputes", icon: Scale, badge: "disputes" },
  { href: "/admin/payments", label: "Payments", icon: IndianRupee },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpRight, badge: "withdrawals" },
  { href: "/admin/kyc", label: "KYC", icon: ShieldCheck, badge: "kyc" },
  { href: "/admin/leaderboard", label: "Winners", icon: Trophy },
  { href: "/admin/settings", label: "Settings & broadcast", icon: Settings },
  { href: "/admin/audit", label: "Activity log", icon: ListChecks },
  { href: "/admin/account", label: "My account", icon: KeyRound },
];

export default function AdminNav({ counts, mobile }: { counts: NavCounts; mobile?: boolean }) {
  const path = usePathname();
  const on = (href: string) => {
    const p = href.split("?")[0];
    if (href.includes("?")) return false;
    return p === "/admin" ? path === "/admin" : path.startsWith(p);
  };
  const n = (k?: keyof NavCounts) => (k ? counts[k] : 0);
  if (mobile)
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 -mt-1">
        {ITEMS.map(({ href, label, badge }) => (
          <Link key={href} href={href} className={`shrink-0 rounded-full px-3 h-9 grid place-items-center text-sm font-medium ${on(href) ? "bg-white text-ink" : "text-white/80 bg-white/10"}`}>
            <span>
              {label}
              {n(badge) > 0 && <span className="ml-1.5 rounded-full bg-red text-white text-xs px-1.5">{n(badge)}</span>}
            </span>
          </Link>
        ))}
      </nav>
    );
  return (
    <ul className="space-y-1">
      {ITEMS.map(({ href, label, icon: Icon, badge }) => (
        <li key={href}>
          <Link
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 h-10 font-medium ${on(href) ? "bg-white text-ink" : "text-white/75 hover:text-white hover:bg-white/10"}`}
          >
            <Icon size={19} />
            {label}
            {n(badge) > 0 && <span className="ml-auto rounded-full bg-red text-white text-xs px-2 py-0.5">{n(badge)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
