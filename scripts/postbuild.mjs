// After `next build`: put static files next to the standalone server so `npm start` works
// without Docker (the Dockerfile copies them itself).
import fs from "node:fs";

const out = ".next/standalone";
if (fs.existsSync(out)) {
  fs.cpSync(".next/static", `${out}/.next/static`, { recursive: true });
  if (fs.existsSync("public")) fs.cpSync("public", `${out}/public`, { recursive: true });
}
