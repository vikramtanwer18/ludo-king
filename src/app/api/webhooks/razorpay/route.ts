import { NextResponse } from "next/server";
import { verifyWebhook } from "@/server/razorpay";
import { handleRazorpayEvent } from "@/server/wallet";

export const dynamic = "force-dynamic";

/*
 * Razorpay → Dashboard → Webhooks → Add new webhook
 *   URL:     https://<your-domain>/api/webhooks/razorpay
 *   Secret:  same value as RAZORPAY_WEBHOOK_SECRET
 *   Events:  qr_code.credited, qr_code.closed, payment.failed
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature"))) {
    console.warn("[razorpay] webhook with a bad or missing signature was ignored");
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 400 });
  }
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON." }, { status: 400 });
  }
  try {
    const result = await handleRazorpayEvent(req.headers.get("x-razorpay-event-id"), raw, ev);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    // 5xx makes Razorpay retry the event later.
    console.error("[razorpay] webhook failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
