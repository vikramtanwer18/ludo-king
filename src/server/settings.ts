import "server-only";
import type { Q } from "./db";
import { GAMES, WALLET, type GameSlug } from "@/lib/config";

export interface AppSettings {
  announcement: { text: string; active: boolean };
  games: Record<GameSlug, boolean>; // true = open for play
  maintenance: { active: boolean; text: string };
  wallet: { commissionPct: number };
}

export const DEFAULT_SETTINGS: AppSettings = {
  announcement: { text: "", active: false },
  games: Object.fromEntries(GAMES.map((g) => [g.slug, g.live])) as Record<GameSlug, boolean>,
  maintenance: { active: false, text: "We're making a few improvements. Back shortly." },
  wallet: { commissionPct: WALLET.defaultCommissionPct },
};

export async function getSettings(q: Q): Promise<AppSettings> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const s = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
  for (const r of rows) {
    const v = typeof r.value === "string" ? JSON.parse(r.value) : r.value;
    s[r.key] = typeof v === "object" && v && !Array.isArray(v) ? { ...(s[r.key] as object), ...(v as object) } : v;
  }
  return s as unknown as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(q: Q, key: K, value: AppSettings[K]) {
  await q(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)]
  );
}
