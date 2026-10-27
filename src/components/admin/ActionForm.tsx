"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { FormState } from "@/app/admin/actions";

type Action = (prev: FormState, f: FormData) => Promise<FormState>;

function Submit({ label, cls, confirm }: { label: string; cls?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={cls ?? "btn-primary"}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/** Form wired to a server action, with inline success / error text. */
export default function ActionForm({
  action,
  children,
  submit,
  submitClass,
  confirm,
  className,
}: {
  action: Action;
  children?: ReactNode;
  submit: string;
  submitClass?: string;
  confirm?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={submit} cls={submitClass} confirm={confirm} />
        {state?.error && <p className="text-red text-sm" role="alert">{state.error}</p>}
        {state?.ok && <p className="text-green text-sm" role="status">{state.message ?? "Saved."}</p>}
      </div>
    </form>
  );
}

/** One-click button for a server action that takes FormData (no inline result). */
export function ConfirmButton({ action, fields, label, cls, confirm }: { action: (f: FormData) => Promise<void>; fields: Record<string, string>; label: string; cls?: string; confirm?: string }) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit label={label} cls={cls ?? "btn-ghost"} confirm={confirm} />
    </form>
  );
}
