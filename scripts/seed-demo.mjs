#!/usr/bin/env node
// Fills an EMPTY database with demo players and ~30 days of matches, for local development only.
//
//   npm run db:seed
//
// Refuses to run when NODE_ENV=production or when the database already has players.

import pg from "pg";
import { pgConfig } from "./pg-config.mjs";

if (process.env.NODE_ENV === "production") {
  console.error("[seed] Refusing to add demo data with NODE_ENV=production.");
  process.exit(1);
}
let cfg;
try {
  cfg = pgConfig();
} catch (e) {
  console.error(`[seed] ${e.message}`);
  process.exit(1);
}
const db = new pg.Client({ connectionString: cfg.connectionString, ssl: cfg.ssl });

// Small deterministic random so the demo looks the same every time.
function rng(seed) {
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

function screenshot(winner, loser) {
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

async function main() {
  await db.connect();
  const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n > 0) {
    console.log(`[seed] Database already has ${rows[0].n} players. Nothing added.`);
    return;
  }

  const r = rng(20261023);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const DAY = 86400000;
  const id = () => Math.random().toString(36).slice(2, 10);
  const STAKES = [5000, 10000, 20000, 50000];

  await db.query("BEGIN");
  const users = NAMES.map((name, i) => ({
    id: "seed-" + name.toLowerCase(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    tone: TONES[i % 4],
    code: (name.slice(0, 3) + (100 + i)).toUpperCase(),
    skill: 0.25 + r() * 0.6,
    joined: now - Math.floor((45 - i * 1.5) * DAY),
    invitedBy: i > 3 && r() < 0.55 ? "seed-" + NAMES[Math.floor(r() * Math.min(i, 8))].toLowerCase() : null,
  }));
  for (const u of users) {
    await db.query(
      `INSERT INTO users (id,name,email,tone,invite_code,invited_by,created_at,last_seen_at,status,suspended_reason,balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        u.id, u.name, u.email, u.tone, u.code, u.invitedBy, u.joined,
        now - Math.floor(r() * 5 * DAY),
        u.name === "Manav" ? "suspended" : "active",
        u.name === "Manav" ? "Posted edited win screenshots" : null,
        100000,
      ]
    );
  }

  const insert = (m) =>
    db.query(
      `INSERT INTO matches (id,game,created_by,joined_by,status,room_code,room_code_deadline,started_at,first_result_at,results,winner_id,ended_reason,amount,fee_pct,prize,fee,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,10,$14,$15,$16,$17)`,
      [m.id, m.game, m.createdBy, m.joinedBy ?? null, m.status, m.roomCode ?? null, m.roomCodeDeadline ?? null,
       m.startedAt ?? null, m.firstResultAt ?? null, JSON.stringify(m.results ?? {}), m.winnerId ?? null, m.endedReason ?? null,
       m.amount, m.prize ?? null, m.fee ?? null, m.createdAt, m.updatedAt]
    );
  const code = () => "0" + String(Math.floor(1e6 + r() * 8.9e6)).padStart(7, "0");
  const active = users.filter((u) => u.name !== "Manav");

  for (let d = 30; d >= 1; d--) {
    const perDay = 3 + Math.floor(r() * 7) + (d < 8 ? 3 : 0);
    for (let k = 0; k < perDay; k++) {
      const a = pick(users);
      let b = pick(users);
      while (b.id === a.id) b = pick(users);
      if (a.joined > now - d * DAY || b.joined > now - d * DAY) continue;
      const t = now - d * DAY + Math.floor(r() * DAY * 0.9);
      const game = r() < 0.75 ? "ludo-classic" : "snakes";
      const amount = pick(STAKES);
      if (r() < 0.08) {
        await insert({
          id: id(), game, createdBy: a.id, joinedBy: b.id, status: "cancelled", roomCode: r() < 0.5 ? code() : null, amount,
          results: { [a.id]: { outcome: "cancel", reason: "not-played", at: t }, [b.id]: { outcome: "cancel", reason: "not-played", at: t } },
          endedReason: "Both players cancelled.", createdAt: t - 900000, updatedAt: t,
        });
        continue;
      }
      const w = r() < a.skill / (a.skill + b.skill) ? a : b;
      const l = w === a ? b : a;
      const fee = Math.floor((amount * 2 * 10) / 100);
      await insert({
        id: id(), game, createdBy: a.id, joinedBy: b.id, status: "completed", roomCode: code(), amount, fee, prize: amount * 2 - fee,
        results: { [w.id]: { outcome: "won", screenshot: screenshot(w.name, l.name), at: t }, [l.id]: { outcome: "lost", at: t + 60000 } },
        winnerId: w.id, startedAt: t - 1500000, firstResultAt: t, createdAt: t - 1800000, updatedAt: t + 60000,
      });
    }
  }

  for (let k = 0; k < 4; k++) {
    const a = pick(active);
    let b = pick(active);
    while (b.id === a.id) b = pick(active);
    const t = now - Math.floor((k + 1) * 3.3 * 3600000);
    const second = k % 2 === 0
      ? { outcome: "won", screenshot: screenshot(b.name, a.name), at: t + 120000 }
      : { outcome: "cancel", reason: "wrong-room-code", at: t + 120000 };
    await insert({
      id: id(), game: "ludo-classic", createdBy: a.id, joinedBy: b.id, status: "disputed", roomCode: code(), amount: 10000,
      results: { [a.id]: { outcome: "won", screenshot: screenshot(a.name, b.name), at: t }, [b.id]: second },
      endedReason: "Results don't match. Support will review the screenshots.",
      startedAt: t - 1500000, firstResultAt: t, createdAt: t - 1800000, updatedAt: t + 120000,
    });
  }

  for (const [by, game, amount, mins] of [
    ["seed-kabir", "ludo-classic", 10000, 4],
    ["seed-meera", "ludo-classic", 20000, 11],
    ["seed-aarav", "snakes", 5000, 7],
    ["seed-ishita", "ludo-classic", 50000, 2],
  ]) {
    const t = now - mins * 60000;
    await insert({ id: id(), game, createdBy: by, status: "open", amount, results: {}, createdAt: t, updatedAt: t });
  }
  // Stakes still held in open and disputed rooms come out of the demo balances, so the books add up.
  await db.query(
    `UPDATE users u SET balance = balance - h.held FROM (
       SELECT uid, SUM(amount) held FROM (
         SELECT created_by uid, amount FROM matches WHERE status IN ('open','disputed')
         UNION ALL SELECT joined_by, amount FROM matches WHERE status = 'disputed'
       ) x GROUP BY uid) h
     WHERE u.id = h.uid`
  );
  await db.query("COMMIT");
  console.log(`[seed] Added ${users.length} demo players (₹1,000 each) and their match history.`);
}

main()
  .catch(async (e) => {
    await db.query("ROLLBACK").catch(() => {});
    console.error("[seed] failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
