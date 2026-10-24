import { NextResponse } from "next/server";
import { AuthFail, SESSION_COOKIE, verifyOtp } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { token, maxAge } = await verifyOtp(await req.json());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
      path: "/",
      maxAge,
    });
    return res;
  } catch (e) {
    if (e instanceof AuthFail) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Couldn't log you in. Try again." }, { status: 500 });
  }
}
