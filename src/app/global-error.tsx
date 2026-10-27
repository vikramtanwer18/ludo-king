"use client";

/** Last-resort error screen when the root layout itself fails. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#EEF1F8", color: "#1B2142", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 380 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#5B6385" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ background: "#1B2142", color: "#fff", border: 0, borderRadius: 12, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
