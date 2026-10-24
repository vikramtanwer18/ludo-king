import "server-only";
import crypto from "node:crypto";
import { APP } from "@/lib/config";

/*
 * Razorpay UPI QR codes (https://razorpay.com/docs/api/qr-codes/).
 *
 *   RAZORPAY_KEY_ID=rzp_live_xxx          (Dashboard → Account & Settings → API keys)
 *   RAZORPAY_KEY_SECRET=xxxxxxxx
 *   RAZORPAY_WEBHOOK_SECRET=xxxxxxxx      (Dashboard → Webhooks → the secret you typed)
 *
 * Webhook URL: https://<your-domain>/api/webhooks/razorpay
 * Events: qr_code.credited, qr_code.closed, payment.failed
 */

export const RZP_CONFIGURED = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** Without keys, local development fakes the payment with a "Simulate payment" button. */
export const PAYMENTS_DEMO = !RZP_CONFIGURED && (process.env.NODE_ENV !== "production" || process.env.PAYMENTS_DEMO === "true");

export interface RzpQr {
  id: string;
  image_url: string;
  status: "active" | "closed";
  close_by?: number;
  close_reason?: string;
  payments_amount_received: number;
  payments_count_received: number;
  notes?: Record<string, string>;
}

export interface RzpPayment {
  id: string;
  amount: number;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  vpa?: string | null;
  email?: string;
  contact?: string;
  error_description?: string | null;
  notes?: Record<string, string> | unknown[];
  created_at: number;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export function createQr(p: { amount: number; depositId: string; userId: string; closeBy: number }) {
  return call<RzpQr>("POST", "/payments/qr_codes", {
    type: "upi_qr",
    name: APP.name.slice(0, 40),
    usage: "single_use",
    fixed_amount: true,
    payment_amount: p.amount,
    description: `Wallet top-up ${p.depositId}`,
    close_by: Math.floor(p.closeBy / 1000),
    notes: { deposit_id: p.depositId, user_id: p.userId },
  });
}

export const fetchQr = (id: string) => call<RzpQr>("GET", `/payments/qr_codes/${id}`);

export const fetchQrPayments = (id: string) =>
  call<{ items: RzpPayment[] }>("GET", `/payments/qr_codes/${id}/payments`).then((r) => r.items ?? []);

export const closeQr = (id: string) => call<RzpQr>("POST", `/payments/qr_codes/${id}/close`);

/** Razorpay signs the raw body with HMAC-SHA256 using the webhook secret. */
export function verifyWebhook(raw: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const want = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return want.length === signature.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(signature));
}
