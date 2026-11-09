"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last resort when the root layout itself fails: plain HTML, no app styles or fonts assumed. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#141412", color: "#FFFFEB", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>CaptionsEasy hit a snag</h1>
          <p style={{ opacity: 0.65, marginTop: 8 }}>Your work is safe. Please try again.</p>
          <button onClick={reset} style={{ marginTop: 18, border: 0, borderRadius: 999, background: "#FFFFEB", color: "#141412", padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
