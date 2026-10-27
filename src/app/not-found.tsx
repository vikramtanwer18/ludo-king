import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="card p-8 text-center max-w-md mx-auto mt-10">
      <p className="font-display font-bold text-5xl text-muted">404</p>
      <h1 className="text-2xl font-bold mt-2">Page not found</h1>
      <p className="text-muted mt-1">The link may be old, or the page was moved.</p>
      <Link href="/" className="btn-primary mt-5">Go home</Link>
    </div>
  );
}
