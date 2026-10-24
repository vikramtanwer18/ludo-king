import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, stateFor, userFromToken } from "@/server/logic";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await userFromToken(cookies().get(SESSION_COOKIE)?.value);
  return NextResponse.json(await stateFor(me));
}
