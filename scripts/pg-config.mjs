// PostgreSQL connection settings shared by the app (src/server/db.ts) and the scripts.
//
//   DATABASE_URL               postgres://USER:PASSWORD@HOST:5432/DBNAME  (URL-encode special characters in the password)
//   PGSSL                      true = encrypted connection. Automatic for AWS RDS hosts (*.rds.amazonaws.com).
//   PGSSL_CA_FILE              CA bundle to verify the server. For RDS the bundled certs/rds-global-bundle.pem is used.
//   PGSSL_REJECT_UNAUTHORIZED  false = encrypt but don't verify the certificate (not recommended).
//
// With SSL on, the certificate and host name are verified (like sslmode=verify-full).

import fs from "node:fs";
import path from "node:path";

const RDS_HOST = /\.rds\.amazonaws\.com(\.cn)?$/i;

export function pgConfig(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set. Add your PostgreSQL connection string to .env.");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL. URL-encode special characters in the password (e.g. @ → %40, # → %23).");
  }
  if (/^endpoint\./i.test(parsed.hostname) || parsed.username === "USERNAME")
    throw new Error("DATABASE_URL still has the placeholder values. Put your RDS endpoint, username, password and database name in .env.");
  // sslmode & co in the URL would override the SSL settings below; SSL is configured with PGSSL* instead.
  for (const k of ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) parsed.searchParams.delete(k);

  const isRds = RDS_HOST.test(parsed.hostname);
  const flag = (process.env.PGSSL || "").toLowerCase();
  const sslOn = flag === "true" || flag === "require" || (isRds && flag !== "false");

  let ssl;
  if (sslOn) {
    const caFile = process.env.PGSSL_CA_FILE || (isRds ? path.join(process.cwd(), "certs", "rds-global-bundle.pem") : "");
    if (caFile && !fs.existsSync(caFile)) throw new Error(`PGSSL_CA_FILE not found: ${caFile}`);
    ssl = {
      rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false",
      ...(caFile ? { ca: fs.readFileSync(caFile, "utf8") } : {}),
    };
  }
  return { connectionString: parsed.toString(), ssl, isRds };
}

/** Host/db for log lines (never the password). */
export function describeDb(url = process.env.DATABASE_URL) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}
