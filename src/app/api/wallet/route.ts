import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, userFromToken } from "@/server/auth";
import { Fail } from "@/server/errors";
import { LIMITS, rateLimit, tooMany } from "@/server/ratelimit";
import {
  cancelWithdrawal,
  checkDeposit,
  createDeposit,
  requestWithdrawal,
  saveKyc,
  simulateDeposit,
  walletFor,
} from "@/server/wallet";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ ok: false, error: "Log in to continue." }, { status: 401 });

/** Balance, KYC and full history for the wallet page. */
export async function GET() {
  const me = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!me) return unauthorized();
  return NextResponse.json({ ok: true, ...(await walletFor(me)) });
}

type Body =
  | { type: "deposit"; amount: number }
  | { type: "checkDeposit"; id: string }
  | { type: "simulateDeposit"; id: string }
  | { type: "withdraw"; amount: number; method: "bank" | "upi" }
  | { type: "cancelWithdraw"; id: string }
  | { type: "saveKyc"; [k: string]: unknown };

export async function POST(req: Request) {
  const me = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!me) return unauthorized();
  const rl = await rateLimit(`wallet:${me}`, ...LIMITS.walletPerUser);
  if (!rl.ok) return NextResponse.json({ ok: false, error: tooMany(rl.retryIn) }, { status: 429 });
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  try {
    switch (b.type) {
      case "deposit":
        return NextResponse.json({ ok: true, deposit: await createDeposit(me, b.amount) });
      case "checkDeposit":
        return NextResponse.json({ ok: true, ...(await checkDeposit(me, b.id)) });
      case "simulateDeposit":
        return NextResponse.json({ ok: true, ...(await simulateDeposit(me, b.id)) });
      case "withdraw":
        await requestWithdrawal(me, b.amount, b.method);
        break;
      case "cancelWithdraw":
        await cancelWithdrawal(me, b.id);
        break;
      case "saveKyc":
        await saveKyc(me, b);
        break;
      default:
        return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await walletFor(me)) });
  } catch (e) {
    if (e instanceof Fail) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ ok: false, error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
