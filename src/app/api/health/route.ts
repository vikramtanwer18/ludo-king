import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** Used by the Docker health check and load balancers: 200 when the app can reach its database. */
export async function GET() {
  try {
    const db = await getDb();
    await db.q("SELECT 1");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
