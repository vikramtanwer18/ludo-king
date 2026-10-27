"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page crashes. Details go to the browser console, not the screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card p-8 text-center max-w-md mx-auto mt-10">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted mt-1">Please try again. If it keeps happening, contact support.</p>
      {error.digest && <p className="text-xs text-muted mt-2 font-mono">Ref: {error.digest}</p>}
      <div className="mt-5 flex justify-center gap-3">
        <button className="btn-primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn-ghost">Go home</Link>
      </div>
    </div>
  );
}
