"use client";

import { create } from "zustand";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { MatchStatus, Tone } from "@/lib/types";

/* ---------- Logo: a tiny ludo board ---------- */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="14" height="14" rx="4" fill="#C83737" />
      <rect x="17" y="1" width="14" height="14" rx="4" fill="#16834F" />
      <rect x="1" y="17" width="14" height="14" rx="4" fill="#2559D6" />
      <rect x="17" y="17" width="14" height="14" rx="4" fill="#F2B01E" />
      <rect x="11" y="11" width="10" height="10" rx="2" fill="#fff" transform="rotate(45 16 16)" />
    </svg>
  );
}

/* ---------- Avatar: a token in the player's colour ---------- */
const toneBg: Record<Tone, string> = {
  red: "bg-red",
  green: "bg-green",
  yellow: "bg-yellow",
  blue: "bg-blue",
};
export function Avatar({ name, tone, size = 40 }: { name: string; tone: Tone; size?: number }) {
  return (
    <span
      className={`${toneBg[tone]} relative inline-grid place-items-center rounded-full text-white font-display font-bold shrink-0 ring-2 ring-white`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      <span className="absolute inset-[18%] rounded-full border-2 border-white/40" />
      <span className={tone === "yellow" ? "text-yellow-ink" : ""}>{name.charAt(0).toUpperCase()}</span>
    </span>
  );
}

/* ---------- Status ---------- */
const statusMeta: Record<MatchStatus, { label: string; cls: string }> = {
  open: { label: "Waiting for a player", cls: "bg-blue-soft text-blue" },
  requested: { label: "Join request", cls: "bg-yellow-soft text-yellow-ink" },
  running: { label: "Live", cls: "bg-green-soft text-green-ink" },
  completed: { label: "Finished", cls: "bg-board text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-red-soft text-red-ink" },
  disputed: { label: "Under review", cls: "bg-red-soft text-red-ink" },
};
export function StatusPill({ status }: { status: MatchStatus }) {
  const m = statusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${m.cls}`}>
      {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" aria-hidden />}
      {m.label}
    </span>
  );
}

/* ---------- Page header ---------- */
export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h1 className="text-[28px] font-bold">{title}</h1>
        {sub && <p className="text-muted mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="mx-auto mb-4 grid grid-cols-2 gap-1 w-12 opacity-80">
        <span className="h-5 rounded-md bg-red-soft" />
        <span className="h-5 rounded-md bg-green-soft" />
        <span className="h-5 rounded-md bg-blue-soft" />
        <span className="h-5 rounded-md bg-yellow-soft" />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-muted mt-1 max-w-sm mx-auto">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; tone: "ok" | "error" };
const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, "id">) => void; drop: (id: number) => void }>(
  (set) => ({
    list: [],
    push: (t) => {
      const id = Date.now() + Math.random();
      set((s) => ({ list: [...s.list, { ...t, id }] }));
      setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), 3200);
    },
    drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
  })
);
export const toast = {
  ok: (text: string) => useToasts.getState().push({ text, tone: "ok" }),
  error: (text: string) => useToasts.getState().push({ text, tone: "error" }),
};
export function Toaster() {
  const { list, drop } = useToasts();
  return (
    <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 w-[min(92vw,420px)] space-y-2" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-xl px-4 py-3 text-[15px] shadow-lift ${
            t.tone === "ok" ? "bg-ink text-white" : "bg-red text-white"
          }`}
        >
          <span className="flex-1">{t.text}</span>
          <button onClick={() => drop(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Bottom sheet / dialog ---------- */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal aria-label={title}>
      <button className="absolute inset-0 bg-ink/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 max-h-[90vh] overflow-y-auto">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-ink" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Room code tiles (the match page's centrepiece) ---------- */
const tileTones = ["bg-red", "bg-green", "bg-yellow text-yellow-ink", "bg-blue"];
export function RoomCode({ code }: { code: string }) {
  return (
    <div className="flex justify-center gap-1.5 sm:gap-2" aria-label={`Room code ${code.split("").join(" ")}`}>
      {code.split("").map((d, i) => (
        <span
          key={i}
          className={`tile-drop ${tileTones[i % 4]} grid place-items-center w-9 h-12 sm:w-11 sm:h-14 rounded-tile text-white font-display font-bold text-2xl sm:text-3xl shadow-[inset_0_-4px_0_rgba(0,0,0,.18)]`}
          style={{ animationDelay: `${i * 45}ms` }}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

/* ---------- Time helpers ---------- */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
export function timeAgo(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
export function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
