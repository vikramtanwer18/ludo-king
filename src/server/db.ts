import "server-only";
import fs from "node:fs";
import path from "node:path";

/*
 * One tiny query function over either:
 *  - real Postgres (DATABASE_URL=postgres://...)  ← production
 *  - embedded PGlite (no DATABASE_URL)            ← local demo, stored in ./.pglite
 */

type Row = Record<string, unknown>;
export type Q = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
export interface Db {
  q: Q;
  tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>;
}

const g = globalThis as unknown as { __db?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  let close: () => Promise<unknown> = async () => {};

  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    close = () => pool.end();
    const q: Q = async (sql, params) => (await pool.query(sql, params as unknown[])).rows;
    db = {
      q,
      tx: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const out = await fn(async (sql, params) => (await c.query(sql, params as unknown[])).rows);
          await c.query("COMMIT");
          return out;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR || path.join(process.cwd(), ".pglite");
    const pg = new PGlite(dir);
    close = () => pg.close();
    const q: Q = async (sql, params) => (await pg.query(sql, params as unknown[])).rows as never;
    db = {
      q,
      tx: (fn) => pg.transaction(async (t) => fn(async (sql, params) => (await t.query(sql, params as unknown[])).rows as never)),
    };
  }

  try {
    const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    for (const stmt of schema.split(";").map((s) => s.replace(/--.*$/gm, "").trim()).filter(Boolean)) {
      await db.q(stmt);
    }
    const { seedIfEmpty } = await import("./seed");
    await seedIfEmpty(db);
  } catch (e) {
    await close().catch(() => {});
    if (url) console.error(`[db] Can't connect to DATABASE_URL (${(e as Error).message}). Check the username/password in .env, or remove DATABASE_URL to use the built-in database.`);
    throw e;
  }
  return db;
}

export function getDb() {
  // If connecting fails (wrong password, server down), forget it so the next request tries again.
  g.__db ??= connect().catch((e) => {
    g.__db = undefined;
    throw e;
  });
  return g.__db;
}
