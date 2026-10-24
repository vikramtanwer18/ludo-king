"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Home,
  LifeBuoy,
  Menu,
  LogOut,
  Swords,
  Trophy,
  User as UserIcon,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { useMe, useStore } from "@/lib/store";
import { APP, inr } from "@/lib/config";
import { Avatar, LogoMark, Toaster } from "./ui";

const PUBLIC = ["/admin", "/login", "/rules", "/terms", "/privacy", "/about", "/support"];

const MAIN = [
  { href: "/", label: "Home", icon: Home },
  { href: "/matches", label: "My matches", icon: Swords },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserIcon },
];
const MORE = [
  { href: "/invite", label: "Invite", icon: UserPlus },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/rules", label: "Fair-play rules", icon: BookOpen },
  { href: "/support", label: "Help & support", icon: LifeBuoy },
];
const LEGAL = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

const isOn = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const ready = useStore((s) => s.ready);
  const refresh = useStore((s) => s.refresh);
  const logout = useStore((s) => s.logout);
  const me = useMe();
  const unread = useStore((s) => s.notices.filter((n) => n.userId === s.meId && !n.read).length);
  const [drawer, setDrawer] = useState(false);
  const settings = useStore((s) => s.settings);
  const balance = useStore((s) => s.wallet?.balance ?? 0);

  // Keep in sync with the other player: poll while the tab is visible, and refresh on focus.
  const isAdminArea = path.startsWith("/admin");
  useEffect(() => {
    if (isAdminArea) return;
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 3000);
    const f = () => refresh();
    window.addEventListener("focus", f);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", f);
    };
  }, [refresh, isAdminArea]);

  useEffect(() => setDrawer(false), [path]);

  const isPublic = PUBLIC.some((p) => path.startsWith(p));
  useEffect(() => {
    if (ready && !me && !isPublic) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, me, isPublic, path, router]);

  if (path.startsWith("/admin")) return <>{children}</>;

  if (path.startsWith("/login")) {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  if (!ready || (!me && !isPublic)) {
    return (
      <div className="min-h-screen grid place-items-center">
        <LogoMark size={44} />
      </div>
    );
  }

  const nav = (
    <nav className="space-y-6">
      <ul className="space-y-1">
        {[...MAIN, ...MORE].map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 h-11 font-medium ${
                isOn(path, href) ? "bg-white text-ink shadow-lift" : "text-muted hover:text-ink hover:bg-white/60"
              }`}
            >
              <Icon size={20} />
              {label}
              {href === "/notifications" && unread > 0 && (
                <span className="ml-auto rounded-full bg-red text-white text-xs px-2 py-0.5">{unread}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="px-3 text-sm text-muted space-x-3">
        {LEGAL.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-ink">
            {l.label}
          </Link>
        ))}
      </div>
      {me && (
        <button
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          className="flex items-center gap-2 px-3 text-sm text-muted hover:text-red"
        >
          <LogOut size={15} /> Log out
        </button>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col gap-8 sticky top-0 h-screen p-5 border-r border-line">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-display font-bold text-xl">{APP.name}</span>
        </Link>
        {nav}
      </aside>

      <div className="min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-board/90 backdrop-blur border-b border-line lg:border-none">
          <div className="mx-auto max-w-3xl flex items-center gap-3 px-4 h-16">
            <button className="lg:hidden -ml-1 p-1.5" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu size={24} />
            </button>
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <LogoMark size={28} />
              <span className="font-display font-bold text-lg">{APP.name}</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              {me ? (
                <>
                  <Link
                    href="/wallet"
                    className="flex items-center gap-1.5 rounded-full bg-white border border-line h-9 pl-2.5 pr-3 font-display font-semibold text-[15px] hover:bg-board"
                    aria-label={`Wallet balance ${inr(balance)}`}
                  >
                    <Wallet size={17} className="text-green" />
                    {inr(balance)}
                  </Link>
                  <Link href="/notifications" className="relative p-2 rounded-full hover:bg-white" aria-label={`Notifications, ${unread} unread`}>
                    <Bell size={22} />
                    {unread > 0 && (
                      <span className="absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full bg-red text-white text-[11px] grid place-items-center px-1">
                        {unread}
                      </span>
                    )}
                  </Link>
                  <Link href="/profile" aria-label="Your profile">
                    <Avatar name={me.name} tone={me.tone} size={36} />
                  </Link>
                </>
              ) : (
                <Link href="/login" className="btn-primary h-10">
                  Log in
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 pt-5 pb-28 lg:pb-12">
          {settings.maintenance && (
            <p role="status" className="mb-4 rounded-xl bg-red-soft text-red px-4 py-3 text-[15px]">
              {settings.maintenance}
            </p>
          )}
          {settings.announcement && (
            <p role="status" className="mb-4 rounded-xl bg-yellow-soft text-yellow-ink px-4 py-3 text-[15px]">
              {settings.announcement}
            </p>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      {me && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-line pb-[env(safe-area-inset-bottom)]">
          <ul className="grid grid-cols-5">
            {MAIN.map(({ href, label, icon: Icon }) => {
              const on = isOn(path, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-medium ${on ? "text-ink" : "text-muted"}`}
                  >
                    <Icon size={22} strokeWidth={on ? 2.4 : 1.8} />
                    {label === "My matches" ? "Matches" : label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {/* Mobile drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} aria-label="Close menu" />
          <div className="absolute left-0 top-0 bottom-0 w-[82%] max-w-xs bg-board p-5 flex flex-col gap-6 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <LogoMark />
                <span className="font-display font-bold text-xl">{APP.name}</span>
              </span>
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="p-1">
                <X size={22} />
              </button>
            </div>
            {me && (
              <Link href="/profile" className="flex items-center gap-3 card p-3">
                <Avatar name={me.name} tone={me.tone} />
                <span>
                  <span className="block font-semibold">{me.name}</span>
                  <span className="block text-sm text-muted">Invite code {me.inviteCode}</span>
                </span>
              </Link>
            )}
            {nav}
          </div>
        </div>
      )}
      <Toaster />
    </div>
  );
}
