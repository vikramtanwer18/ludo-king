import type { Db } from "./db";
import { hashPassword } from "./security";

/*
 * Runs on first start.
 * - ensureAdmin: creates the admin from ADMIN_EMAIL / ADMIN_PASSWORD if that email doesn't exist yet.
 * - seedIfEmpty: demo players and ~30 days of matches (skip with SEED_DEMO=false).
 */

// Real values come from ADMIN_EMAIL / ADMIN_PASSWORD in .env. These are only for local demos.
const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = "change-me-123";

export async function ensureAdmin(db: Db) {
  if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === "production") {
    console.warn("[admin] ADMIN_PASSWORD isn't set, so no admin account was created.");
    return;
  }
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase();
  const [exists] = await db.q("SELECT 1 FROM admins WHERE email=$1", [email]);
  if (exists) return;
  await db.q("INSERT INTO admins (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)", [
    "adm-" + Math.random().toString(36).slice(2, 8),
    email,
    process.env.ADMIN_NAME || "Admin",
    hashPassword(process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD),
    Date.now(),
  ]);
}

// Small deterministic random so the demo looks the same every time.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "Aarav", "Meera", "Kabir", "Ananya", "Rohan", "Ishita", "Vivaan", "Diya", "Arjun", "Saanvi",
  "Kunal", "Priya", "Aditya", "Neha", "Yash", "Pooja", "Karan", "Riya", "Siddharth", "Tanvi",
  "Harsh", "Sneha", "Manav", "Kavya",
];
const TONES = ["red", "green", "yellow", "blue"];

function screenshot(winner: string, loser: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
<rect width="360" height="640" fill="#1B2142"/>
<rect x="30" y="140" width="300" height="300" rx="24" fill="#fff"/>
<text x="180" y="220" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#5B6385">Demo screenshot</text>
<text x="180" y="290" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="#1F9D63">${winner}</text>
<text x="180" y="335" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#1B2142">wins</text>
<text x="180" y="390" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#5B6385">vs ${loser}</text>
</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

export async function seedIfEmpty(db: Db) {
  await ensureAdmin(db);
  if (process.env.SEED_DEMO === "false") return;
  const [{ n }] = await db.q<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
  if (n > 0) return;

  const r = rng(20261023);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const DAY = 86400000;
  const id = () => Math.random().toString(36).slice(2, 10);

  // ---- players ----
  const users = NAMES.map((name, i) => ({
    id: "seed-" + name.toLowerCase(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    tone: TONES[i % 4],
    code: (name.slice(0, 3) + (100 + i)).toUpperCase(),
    skill: 0.25 + r() * 0.6, // hidden strength so some players win more
    joined: now - Math.floor((45 - i * 1.5) * DAY),
    invitedBy: i > 3 && r() < 0.55 ? "seed-" + NAMES[Math.floor(r() * Math.min(i, 8))].toLowerCase() : null,
  }));
  for (const u of users) {
    await db.q(
      `INSERT INTO users (id,name,email,tone,invite_code,invited_by,is_seed,created_at,last_seen_at,status,suspended_reason)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9,$10)`,
      [
        u.id, u.name, u.email, u.tone, u.code, u.invitedBy, u.joined,
        now - Math.floor(r() * 5 * DAY),
        u.name === "Manav" ? "suspended" : "active",
        u.name === "Manav" ? "Posted edited win screenshots" : null,
      ]
    );
  }

  const insert = (m: Record<string, unknown>) =>
    db.q(
      `INSERT INTO matches (id,game,note,created_by,joined_by,status,room_code,room_code_deadline,started_at,first_result_at,results,winner_id,ended_reason,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [m.id, m.game, m.note ?? null, m.createdBy, m.joinedBy ?? null, m.status, m.roomCode ?? null, m.roomCodeDeadline ?? null,
       m.startedAt ?? null, m.firstResultAt ?? null, JSON.stringify(m.results ?? {}), m.winnerId ?? null, m.endedReason ?? null,
       m.createdAt, m.updatedAt]
    );
  const code = () => "0" + String(Math.floor(1e6 + r() * 8.9e6)).padStart(7, "0");
  const active = users.filter((u) => u.name !== "Manav");

  // ---- 30 days of finished matches ----
  for (let d = 30; d >= 1; d--) {
    const perDay = 3 + Math.floor(r() * 7) + (d < 8 ? 3 : 0);
    for (let k = 0; k < perDay; k++) {
      const a = pick(users);
      let b = pick(users);
      while (b.id === a.id) b = pick(users);
      if (a.joined > now - d * DAY || b.joined > now - d * DAY) continue;
      const t = now - d * DAY + Math.floor(r() * DAY * 0.9);
      const game = r() < 0.75 ? "ludo-classic" : "snakes";
      const roll = r();
      if (roll < 0.08) {
        await insert({
          id: id(), game, createdBy: a.id, joinedBy: b.id, status: "cancelled", roomCode: r() < 0.5 ? code() : null,
          results: { [a.id]: { outcome: "cancel", reason: "not-played", at: t }, [b.id]: { outcome: "cancel", reason: "not-played", at: t } },
          endedReason: "Both players cancelled.", createdAt: t - 900000, updatedAt: t,
        });
        continue;
      }
      const aWins = r() < a.skill / (a.skill + b.skill);
      const w = aWins ? a : b;
      const l = aWins ? b : a;
      await insert({
        id: id(), game, createdBy: a.id, joinedBy: b.id, status: "completed", roomCode: code(),
        results: { [w.id]: { outcome: "won", screenshot: screenshot(w.name, l.name), at: t }, [l.id]: { outcome: "lost", at: t + 60000 } },
        winnerId: w.id, startedAt: t - 1500000, firstResultAt: t, createdAt: t - 1800000, updatedAt: t + 60000,
      });
    }
  }

  // ---- disputes waiting for an admin ----
  for (let k = 0; k < 4; k++) {
    const a = pick(active);
    let b = pick(active);
    while (b.id === a.id) b = pick(active);
    const t = now - Math.floor((k + 1) * 3.3 * 3600000);
    const second = k % 2 === 0
      ? { outcome: "won", screenshot: screenshot(b.name, a.name), at: t + 120000 }
      : { outcome: "cancel", reason: "wrong-room-code", at: t + 120000 };
    await insert({
      id: id(), game: "ludo-classic", createdBy: a.id, joinedBy: b.id, status: "disputed", roomCode: code(),
      results: { [a.id]: { outcome: "won", screenshot: screenshot(a.name, b.name), at: t }, [b.id]: second },
      endedReason: "Results don't match. Support will review the screenshots.",
      startedAt: t - 1500000, firstResultAt: t, createdAt: t - 1800000, updatedAt: t + 120000,
    });
  }

  // ---- happening now ----
  const [p1, p2, p3, p4] = active.slice(4, 8);
  await insert({ id: id(), game: "ludo-classic", note: "Quick one", createdBy: p1.id, joinedBy: p2.id, status: "running",
    roomCode: code(), results: {}, startedAt: now - 600000, createdAt: now - 720000, updatedAt: now - 540000 });
  await insert({ id: id(), game: "snakes", createdBy: p3.id, joinedBy: p4.id, status: "running",
    roomCodeDeadline: now + 4 * 60000, results: {}, startedAt: now - 60000, createdAt: now - 300000, updatedAt: now - 60000 });
  const opens: [string, string, string | null, number][] = [
    ["seed-kabir", "ludo-classic", "Quick game, no breaks", 4],
    ["seed-meera", "ludo-classic", "Best of one", 11],
    ["seed-aarav", "snakes", null, 7],
    ["seed-ishita", "ludo-classic", "Evening game", 2],
  ];
  for (const [by, game, note, mins] of opens) {
    const t = now - mins * 60000;
    await insert({ id: id(), game, note, createdBy: by, status: "open", results: {}, createdAt: t, updatedAt: t });
  }
}
