import "server-only";
import { APP } from "@/lib/config";

/*
 * Login codes go out by email through Resend (https://resend.com).
 *
 * Set in .env:
 *   RESEND_API_KEY=re_xxxxxxxx
 *   EMAIL_FROM=Goti Rooms <noreply@yourdomain.com>   (domain must be verified in Resend)
 *
 * Without RESEND_API_KEY the app runs in demo mode: no email is sent, and the code is shown
 * on the login screen and printed in the server log.
 */

export const EMAIL_CONFIGURED = !!process.env.RESEND_API_KEY;
export const DEMO_CODE_ON_SCREEN = !EMAIL_CONFIGURED;

const from = () => process.env.EMAIL_FROM || `${APP.name} <onboarding@resend.dev>`;

async function sendWithResend(msg: { to: string; subject: string; text: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: from(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

export async function sendLoginCode(to: string, code: string, minutes: number) {
  const subject = `${code} is your ${APP.name} login code`;
  const text = [
    `Your ${APP.name} login code is ${code}.`,
    ``,
    `It expires in ${minutes} minutes and works once.`,
    `If you didn't ask for this code, you can ignore this email. Nobody can log in without it.`,
  ].join("\n");

  if (!EMAIL_CONFIGURED) {
    console.log(`[mail:demo] to ${to}: ${subject}`);
    return;
  }

  const html = `<!doctype html><html><body style="margin:0;background:#EEF1F8;font-family:Arial,Helvetica,sans-serif;color:#1B2142">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:28px">
      <tr><td style="font-size:18px;font-weight:bold">${APP.name}</td></tr>
      <tr><td style="padding-top:18px;font-size:16px">Your login code is</td></tr>
      <tr><td style="padding:10px 0 6px;font-size:36px;font-weight:bold;letter-spacing:8px">${code}</td></tr>
      <tr><td style="font-size:14px;color:#5B6385">It expires in ${minutes} minutes and works once.</td></tr>
      <tr><td style="padding-top:22px;font-size:13px;color:#5B6385">If you didn't ask for this code, ignore this email. Nobody can log in without it.</td></tr>
    </table>
  </td></tr></table></body></html>`;

  await sendWithResend({ to, subject, text, html });
}
