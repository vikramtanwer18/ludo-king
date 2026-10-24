import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, logoutSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let everywhere = false;
  try {
    everywhere = !!(await req.json()).everywhere;
  } catch {}
  await logoutSession(cookies().get(SESSION_COOKIE)?.value, everywhere);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
