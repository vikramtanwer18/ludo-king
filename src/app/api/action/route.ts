import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Fail, SESSION_COOKIE, run, stateFor, userFromToken, type Action } from "@/server/logic";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await userFromToken(cookies().get(SESSION_COOKIE)?.value);
  if (!me) return NextResponse.json({ ok: false, error: "Log in to continue." }, { status: 401 });
  let body: Action;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  try {
    const out = await run(me, body);
    return NextResponse.json({ ok: true, ...out, state: await stateFor(me) });
  } catch (e) {
    if (e instanceof Fail) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
