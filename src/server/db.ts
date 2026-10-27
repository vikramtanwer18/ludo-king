import "server-only";
import pg from "pg";
import { pgConfig } from "../../scripts/pg-config.mjs";

/*
 * PostgreSQL connection pool (AWS RDS in production).
 *
 *   DATABASE_URL=postgres://user:password@host:5432/dbname   (required)
 *   SSL: automatic and certificate-verified for RDS hosts; see scripts/pg-config.mjs.
 *   PG_POOL_MAX=10                connections per app instance (keep instances × this below RDS max_connections)
 *
 * The schema is created by `npm run db:migrate` (db/migrations), which Docker runs before start.
 */

type Row = Record<string, unknown>;
export type Q = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
export interface Db {
  q: Q;
  tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>;
}

// BIGINT columns hold millisecond times and paise; they fit safely in a JS number.
pg.types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { __pool?: pg.Pool; __db?: Db };

function pool() {
  if (!g.__pool) {
    const { connectionString, ssl } = pgConfig();
    g.__pool = new pg.Pool({
      connectionString,
      ssl,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Stop runaway queries instead of holding a connection forever.
      statement_timeout: 15_000,
      application_name: "goti-rooms",
    });
    g.__pool.on("error", (e) => console.error("[db] idle client error:", e.message));
  }
  return g.__pool;
}

export async function getDb(): Promise<Db> {
  if (g.__db) return g.__db;
  const p = pool();
  const q: Q = async (sql, params) => (await p.query(sql, params as unknown[])).rows;
  g.__db = {
    q,
    tx: async (fn) => {
      const c = await p.connect();
      try {
        await c.query("BEGIN");
        const out = await fn(async (sql, params) => (await c.query(sql, params as unknown[])).rows);
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
  return g.__db;
}
