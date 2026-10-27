#!/usr/bin/env node
// Applies db/migrations/*.sql in order (each once, in a transaction) and creates the first admin.
//
//   npm run db:migrate
//
// Runs automatically before the app starts in Docker. Safe to run many times and from several
// instances at once (a Postgres advisory lock makes them take turns).
//
// Env: DATABASE_URL (required; SSL settings in scripts/pg-config.mjs, automatic for AWS RDS),
//      ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME to create the first admin if it doesn't exist.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { describeDb, pgConfig } from "./pg-config.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "db", "migrations");
const LOCK_ID = 74_211_903; // any constant shared by all instances

let cfg;
try {
  cfg = pgConfig();
} catch (e) {
  console.error(`[migrate] ${e.message}`);
  process.exit(1);
}
console.log(`[migrate] database ${describeDb()}${cfg.ssl ? ` (SSL${cfg.ssl.ca ? ", certificate verified" : ""})` : ""}`);

const client = new pg.Client({ connectionString: cfg.connectionString, ssl: cfg.ssl, connectionTimeoutMillis: 15000 });

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(pw, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  await client.connect();
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)`);
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    let applied = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [f, Date.now()]);
        await client.query("COMMIT");
        console.log(`[migrate] applied ${f}`);
        applied++;
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`${f}: ${e.message}`);
      }
    }
    if (!applied) console.log("[migrate] database is up to date");

    // First admin from env (never overwrites an existing admin's password).
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "";
    if (email && password) {
      const exists = (await client.query("SELECT 1 FROM admins WHERE email=$1", [email])).rowCount;
      if (!exists) {
        if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
        await client.query(
          "INSERT INTO admins (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)",
          ["adm-" + crypto.randomBytes(4).toString("hex"), email, process.env.ADMIN_NAME || "Admin", hashPassword(password), Date.now()]
        );
        console.log(`[migrate] created admin ${email}`);
      }
    } else {
      const { rows } = await client.query("SELECT COUNT(*)::int n FROM admins");
      if (!rows[0].n) console.warn("[migrate] no admin exists: set ADMIN_EMAIL and ADMIN_PASSWORD and run again.");
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

main().catch((e) => {
  console.error("[migrate] failed:", e.message);
  process.exit(1);
});
