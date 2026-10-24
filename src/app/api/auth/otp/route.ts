import { NextResponse } from "next/server";
import { AuthFail, requestOtp } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    return NextResponse.json({ ok: true, ...(await requestOtp(email)) });
  } catch (e) {
    if (e instanceof AuthFail) return NextResponse.json({ ok: false, error: e.message, retryIn: e.retryIn }, { status: 400 });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Couldn't send the code. Try again." }, { status: 500 });
  }
}
