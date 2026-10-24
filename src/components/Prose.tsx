import type { ReactNode } from "react";

export default function Prose({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="card p-5 sm:p-7 max-w-[68ch]">
      <h1 className="text-[30px] font-bold">{title}</h1>
      {updated && <p className="text-sm text-muted mt-1">Last updated {updated}</p>}
      <div className="mt-5 space-y-4 text-[16px] leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-7 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-blue [&_a]:font-medium">
        {children}
      </div>
    </article>
  );
}
