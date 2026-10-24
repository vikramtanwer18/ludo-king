"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "../actions";
import { LogoMark } from "@/components/ui";
import { APP } from "@/lib/config";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full mt-2" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>;
}

export default function AdminLogin() {
  const [state, action] = useFormState(loginAction, undefined);
  return (
    <div className="min-h-screen grid place-items-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6 text-white">
          <LogoMark size={34} />
          <span className="font-display font-bold text-xl">{APP.name} admin</span>
        </div>
        <form action={action} className="bg-white rounded-3xl p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Sign in</h1>
            <p className="text-muted text-[15px]">For the support team only.</p>
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="field" autoComplete="username" required autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="field" autoComplete="current-password" required />
          </div>
          {state?.error && <p className="text-red text-sm" role="alert">{state.error}</p>}
          <Submit />
        </form>
        <p className="text-white/60 text-sm mt-4">5 wrong attempts lock the account for 15 minutes.</p>
      </div>
    </div>
  );
}
