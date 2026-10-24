"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMe, useStore } from "@/lib/store";
import { APP } from "@/lib/config";
import { LogoMark, mmss, toast, useNow } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

type Step = "email" | "otp";

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { requestOtp, login, refresh } = useStore.getState();
  const ready = useStore((s) => s.ready);
  const me = useMe();
  const now = useNow(1000);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState(params.get("invite") ?? "");
  const [isNew, setIsNew] = useState(false);
  const [devCode, setDevCode] = useState<string>();
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (ready && me) router.replace(next);
  }, [ready, me, next, router]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return setErr("Enter a valid email address.");
    setEmail(clean);
    setBusy(true);
    setErr("");
    const r = await requestOtp(clean);
    setBusy(false);
    if (!r.ok) {
      if (r.retryIn) setResendAt(Date.now() + r.retryIn);
      return setErr(r.error);
    }
    setIsNew(r.isNew);
    setDevCode(r.devCode);
    setResendAt(Date.now() + r.resendIn);
    setExpiresAt(Date.now() + r.expiresIn);
    setOtp("");
    setStep("otp");
    setTimeout(() => otpRef.current?.focus(), 50);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return setErr("Enter the 6-digit code.");
    if (isNew && name.trim().length < 2) return setErr("Enter a name with at least 2 letters.");
    setBusy(true);
    setErr("");
    const r = await login({ email, otp, name: isNew ? name : undefined, invite: isNew && invite ? invite : undefined });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.ok(isNew ? `Welcome, ${name.trim()}` : "Logged in");
    router.replace(next);
  };

  const resendLeft = resendAt - now;
  const expiresLeft = expiresAt - now;

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:block bg-ink overflow-hidden">
        <div className="absolute inset-10 grid grid-cols-2 grid-rows-2 gap-4">
          <div className="rounded-[28px] bg-red" />
          <div className="rounded-[28px] bg-green" />
          <div className="rounded-[28px] bg-blue" />
          <div className="rounded-[28px] bg-yellow" />
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <div className="bg-white rounded-3xl p-8 w-[min(80%,360px)] rotate-[-3deg] shadow-2xl">
            <p className="font-display text-muted text-lg">Room code</p>
            <p className="font-display font-bold text-5xl tracking-wider mt-1">0482 1157</p>
            <p className="text-muted mt-3">Share it with a friend, open Ludo King, play.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex items-center gap-2.5 mb-8">
            <LogoMark size={36} />
            <span className="font-display font-bold text-2xl">{APP.name}</span>
          </div>

          {step === "email" ? (
            <form onSubmit={send} noValidate>
              <h1 className="text-[32px] font-bold">Play Ludo with your friends</h1>
              <p className="text-muted mt-1 mb-7">Log in or sign up with your email. We&apos;ll email you a 6-digit code, no password needed.</p>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="field"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, 254))}
                placeholder="you@gmail.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />
              {err && <p className="text-red text-sm mt-2" role="alert">{err}</p>}
              <button className="btn-primary w-full mt-5" disabled={busy || (resendLeft > 0 && !!err)}>
                {busy ? "Sending…" : "Send code"}
              </button>
              <p className="text-sm text-muted mt-4">By continuing you agree to the <a className="text-blue underline" href="/terms">terms</a> and <a className="text-blue underline" href="/privacy">privacy policy</a>.</p>
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <h1 className="text-[32px] font-bold">{isNew ? "Create your account" : "Enter the code"}</h1>
              <p className="text-muted mt-1 mb-6">
                We emailed a 6-digit code to <b className="text-ink font-medium break-all">{email}</b>. Check your inbox and spam folder.{" "}
                <button type="button" className="text-blue font-medium" onClick={() => { setStep("email"); setErr(""); }}>
                  Change
                </button>
              </p>

              <label className="label" htmlFor="otp">Verification code</label>
              <input
                id="otp"
                ref={otpRef}
                className="field text-center text-2xl tracking-[0.5em] font-display"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
              />
              <div className="flex justify-between text-sm mt-2">
                <span className={expiresLeft < 60000 ? "text-red" : "text-muted"}>
                  {expiresLeft > 0 ? `Expires in ${mmss(expiresLeft)}` : "Code expired"}
                </span>
                {resendLeft > 0 ? (
                  <span className="text-muted">Resend in {Math.ceil(resendLeft / 1000)}s</span>
                ) : (
                  <button type="button" className="text-blue font-medium" onClick={() => send()} disabled={busy}>
                    Resend code
                  </button>
                )}
              </div>
              {devCode && (
                <p className="mt-3 rounded-xl bg-yellow-soft text-yellow-ink px-3 py-2 text-sm">
                  Demo mode, no email sent. Your code is <b className="tracking-widest">{devCode}</b>.
                </p>
              )}

              {isNew && (
                <div className="mt-5 space-y-4">
                  <div>
                    <label className="label" htmlFor="name">Your name</label>
                    <input id="name" className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="What friends call you" />
                  </div>
                  <div>
                    <label className="label" htmlFor="invite">Invite code <span className="font-normal">(optional)</span></label>
                    <input id="invite" className="field uppercase" value={invite} maxLength={6} onChange={(e) => setInvite(e.target.value)} placeholder="From a friend" />
                  </div>
                </div>
              )}

              {err && <p className="text-red text-sm mt-3" role="alert">{err}</p>}
              <button className="btn-primary w-full mt-5" disabled={busy}>
                {busy ? "Checking…" : isNew ? "Create account" : "Log in"}
              </button>
            </form>
          )}

          <p className="text-sm text-muted mt-10">
            Testing alone? Open a private window (or another browser) and log in with a different email. That window is your second player.
          </p>
        </div>
      </div>
    </div>
  );
}
