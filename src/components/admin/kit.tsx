import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchStatus, Tone } from "@/lib/types";

export const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

export const fmtDate = (t: number | null | undefined) =>
  t ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "—";
export const fmtDateTime = (t: number | null | undefined) =>
  t
    ? new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ })
    : "—";
export function ago(t: number | null | undefined) {
  if (!t) return "never";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function PageHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-[28px] font-bold">{title}</h1>
        {sub && <p className="text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "red" | "green" | "blue" | "yellow" }) {
  const bar = { red: "bg-red", green: "bg-green", blue: "bg-blue", yellow: "bg-yellow" }[tone ?? "blue"];
  const body = (
    <div className="card p-4 h-full relative overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} aria-hidden />
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display font-bold text-3xl leading-tight mt-0.5">{value}</p>
      {hint && <p className="text-sm text-muted mt-0.5">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block hover:-translate-y-0.5 transition-transform">{body}</Link> : body;
}

const toneBg: Record<Tone, string> = { red: "bg-red", green: "bg-green", yellow: "bg-yellow text-yellow-ink", blue: "bg-blue" };
export function Dot({ name, tone, size = 32 }: { name: string; tone: Tone; size?: number }) {
  return (
    <span className={`${toneBg[tone]} inline-grid place-items-center rounded-full text-white font-display font-bold shrink-0`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const statusCls: Record<MatchStatus, string> = {
  open: "bg-blue-soft text-blue",
  requested: "bg-yellow-soft text-yellow-ink",
  running: "bg-green-soft text-green-ink",
  completed: "bg-board text-muted",
  cancelled: "bg-red-soft text-red-ink",
  disputed: "bg-red text-white",
};
const statusLabel: Record<MatchStatus, string> = {
  open: "Open", requested: "Join request", running: "Live", completed: "Finished", cancelled: "Cancelled", disputed: "Disputed",
};
export function MatchStatusBadge({ s }: { s: MatchStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap ${statusCls[s]}`}>{statusLabel[s]}</span>;
}
export function UserStatusBadge({ s }: { s: "active" | "suspended" }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium ${s === "active" ? "bg-green-soft text-green-ink" : "bg-red-soft text-red-ink"}`}>
      {s === "active" ? "Active" : "Suspended"}
    </span>
  );
}

const moneyStatus: Record<string, { l: string; cls: string }> = {
  // deposits
  "dep:pending": { l: "In process", cls: "bg-yellow-soft text-yellow-ink" },
  "dep:success": { l: "Success", cls: "bg-green-soft text-green-ink" },
  "dep:failed": { l: "Failed", cls: "bg-red-soft text-red-ink" },
  "dep:expired": { l: "Expired", cls: "bg-board text-muted" },
  // withdrawals
  "wd:pending": { l: "Needs review", cls: "bg-yellow-soft text-yellow-ink" },
  "wd:approved": { l: "Approved · to pay", cls: "bg-blue-soft text-blue" },
  "wd:paid": { l: "Paid", cls: "bg-green-soft text-green-ink" },
  "wd:declined": { l: "Declined", cls: "bg-red-soft text-red-ink" },
  "wd:cancelled": { l: "Cancelled by player", cls: "bg-board text-muted" },
  // kyc
  "kyc:pending": { l: "Needs review", cls: "bg-yellow-soft text-yellow-ink" },
  "kyc:approved": { l: "Approved", cls: "bg-green-soft text-green-ink" },
  "kyc:rejected": { l: "Rejected", cls: "bg-red-soft text-red-ink" },
  "kyc:none": { l: "Not submitted", cls: "bg-board text-muted" },
};
export function MoneyBadge({ kind, s }: { kind: "dep" | "wd" | "kyc"; s: string }) {
  const m = moneyStatus[`${kind}:${s}`] ?? { l: s, cls: "bg-board text-muted" };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap ${m.cls}`}>{m.l}</span>;
}

export function Tabs({ base, current, items, params }: { base: string; current: string; items: { v: string; l: string }[]; params: Record<string, string | undefined> }) {
  const href = (v: string) => {
    const p = new URLSearchParams(Object.entries({ ...params, status: v, page: "" }).filter(([, x]) => x) as [string, string][]);
    return `${base}${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
      {items.map((s) => (
        <Link key={s.v} href={href(s.v)} className={`shrink-0 rounded-full px-4 h-9 grid place-items-center text-[15px] font-medium border ${current === s.v ? "bg-ink text-white border-ink" : "bg-white border-line text-muted"}`}>
          {s.l}
        </Link>
      ))}
    </div>
  );
}

export function Table({ head, children, empty, compact }: { head: ReactNode[]; children: ReactNode; empty?: string; compact?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className={`w-full text-[15px] ${compact ? "" : "min-w-[640px]"}`}>
        <thead>
          <tr className="text-left text-sm text-muted border-b border-line">
            {head.map((h, i) => (
              <th key={i} className="font-medium px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-3 [&_tr:hover]:bg-board/60">{children}</tbody>
      </table>
      {empty && <p className="text-center text-muted py-10">{empty}</p>}
    </div>
  );
}

export function Pager({ page, per, total, base, params }: { page: number; per: number; total: number; base: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages === 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    sp.set("page", String(p));
    return `${base}?${sp}`;
  };
  return (
    <nav className="flex items-center justify-between mt-4 text-sm" aria-label="Pages">
      <span className="text-muted">
        {(page - 1) * per + 1}–{Math.min(page * per, total)} of {total}
      </span>
      <span className="flex gap-2">
        {page > 1 && <Link className="btn-ghost h-9 text-sm" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn-ghost h-9 text-sm" href={href(page + 1)}>Next</Link>}
      </span>
    </nav>
  );
}

/** Small bar chart drawn with SVG; no chart library needed. */
export function Bars({ data, label }: { data: { date: number; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const W = 560, H = 160, gap = 6;
  const bw = (W - gap * (data.length - 1)) / data.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full h-auto" role="img" aria-label={label}>
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - H * f} y2={H - H * f} stroke="#D9DEEB" strokeDasharray="3 4" />
        ))}
        {data.map((d, i) => {
          const h = Math.max(2, (d.n / max) * (H - 18));
          const x = i * (bw + gap);
          const last = i === data.length - 1;
          return (
            <g key={d.date}>
              <title>{`${fmtDate(d.date)}: ${d.n}`}</title>
              <rect x={x} y={H - h} width={bw} height={h} rx="5" fill={last ? "#16834F" : "#2559D6"} opacity={last ? 1 : 0.85} />
              {(d.n === max || last) && (
                <text x={x + bw / 2} y={H - h - 5} textAnchor="middle" fontSize="12" fill="#1B2142" fontWeight="600">{d.n}</text>
              )}
              {i % 2 === 1 && (
                <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="#5B6385">
                  {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: TZ })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
