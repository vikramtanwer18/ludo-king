"use client";

import { create } from "zustand";
import type { GameSlug } from "./config";
import type { Match, Notice, Outcome, Tone, User, WalletSummary } from "./types";

/*
 * Client state = a mirror of what the server returns from GET /api/state.
 * All rules live on the server (src/server/logic.ts); actions here just POST and refresh.
 */

export type Result = { ok: true; id?: string } | { ok: false; error: string };

export interface PublicSettings {
  announcement: string;
  maintenance: string;
  games: Record<string, boolean>;
  commissionPct: number;
}

interface Snapshot {
  meId: string | null;
  wallet: WalletSummary | null;
  settings: PublicSettings;
  users: User[];
  matches: Match[];
  notices: Notice[];
}

interface State extends Snapshot {
  ready: boolean;
  refresh: () => Promise<void>;
  requestOtp: (email: string) => Promise<
    { ok: true; isNew: boolean; resendIn: number; expiresIn: number; devCode?: string } | { ok: false; error: string; retryIn?: number }
  >;
  login: (p: { email: string; otp: string; name?: string; invite?: string }) => Promise<Result>;
  logout: (everywhere?: boolean) => Promise<void>;
  updateProfile: (p: { name?: string; tone?: Tone }) => Promise<Result>;
  createMatch: (game: GameSlug, amount: number) => Promise<Result>;
  deleteMatch: (id: string) => Promise<Result>;
  requestJoin: (id: string) => Promise<Result>;
  withdrawRequest: (id: string) => Promise<Result>;
  acceptRequest: (id: string) => Promise<Result>;
  rejectRequest: (id: string) => Promise<Result>;
  setRoomCode: (id: string, code: string) => Promise<Result>;
  submitResult: (id: string, outcome: Outcome, extra?: { reason?: string; screenshot?: string }) => Promise<Result>;
  markRead: (id?: string) => Promise<Result>;
}

const NET = "Can't reach the server. Check your connection and try again.";

export const useStore = create<State>((set, get) => {
  const act = async (body: Record<string, unknown>): Promise<Result> => {
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.state) set(j.state);
      if (r.status === 401) set({ meId: null });
      return j.ok ? { ok: true, id: j.id } : { ok: false, error: j.error };
    } catch {
      return { ok: false, error: NET };
    }
  };

  return {
    meId: null,
    wallet: null,
    settings: { announcement: "", maintenance: "", games: {}, commissionPct: 0 },
    users: [],
    matches: [],
    notices: [],
    ready: false,

    refresh: async () => {
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        if (r.ok) set({ ...(await r.json()), ready: true });
      } catch {
        set({ ready: true });
      }
    },

    requestOtp: async (email) => {
      try {
        const r = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        return await r.json();
      } catch {
        return { ok: false, error: NET };
      }
    },

    login: async (p) => {
      try {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        const j = await r.json();
        if (!j.ok) return { ok: false, error: j.error };
        await get().refresh();
        return { ok: true };
      } catch {
        return { ok: false, error: NET };
      }
    },

    logout: async (everywhere) => {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ everywhere: !!everywhere }),
      }).catch(() => {});
      set({ meId: null, wallet: null, notices: [] });
    },

    updateProfile: (p) => act({ type: "updateProfile", ...p }),
    createMatch: (game, amount) => act({ type: "createMatch", game, amount }),
    deleteMatch: (id) => act({ type: "deleteMatch", id }),
    requestJoin: (id) => act({ type: "requestJoin", id }),
    withdrawRequest: (id) => act({ type: "withdrawRequest", id }),
    acceptRequest: (id) => act({ type: "acceptRequest", id }),
    rejectRequest: (id) => act({ type: "rejectRequest", id }),
    setRoomCode: (id, code) => act({ type: "setRoomCode", id, code }),
    submitResult: (id, outcome, extra) => act({ type: "submitResult", id, outcome, ...extra }),
    markRead: (id) => act({ type: "markRead", id }),
  };
});

export const useMe = () => {
  const meId = useStore((s) => s.meId);
  const users = useStore((s) => s.users);
  return users.find((u) => u.id === meId) ?? null;
};

export function statsFor(matches: Match[], userId: string) {
  const mine = matches.filter(
    (m) => (m.createdBy === userId || m.joinedBy === userId) && m.status === "completed"
  );
  const wins = mine.filter((m) => m.winnerId === userId).length;
  return {
    played: mine.length,
    wins,
    losses: mine.length - wins,
    rate: mine.length ? Math.round((wins / mine.length) * 100) : 0,
  };
}

/** Calls /api/wallet. On success the header balance is refreshed too. */
export async function walletApi<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.status === 401) useStore.setState({ meId: null });
    if (j.ok && typeof j.balance === "number") {
      const w = useStore.getState().wallet;
      useStore.setState({ wallet: { balance: j.balance, kyc: j.kyc?.status ?? w?.kyc ?? null } });
    }
    return j;
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection and try again." };
  }
}
