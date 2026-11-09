"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

/** Any page that crashes shows this instead of a blank screen or a raw stack trace. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="grid min-h-[100svh] place-items-center bg-[#141412] px-6 text-center text-[#FFFFEB]">
      <div className="max-w-md">
        <div className="mx-auto mb-5 flex h-9 items-end justify-center gap-[5px]" aria-hidden>
          {["#FFFFEB", "#FFA946", "#34D399"].map((c, i) => (
            <span key={c} className="block w-2 rounded-full" style={{ background: c, height: ["60%", "100%", "80%"][i] }} />
          ))}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong on this page</h1>
        <p className="mt-2 text-[15px] text-[#FFFFEB]/65">Your projects and captions are safe. Try again, and if it keeps happening, refresh the page.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="rounded-full bg-[#FFFFEB] px-5 py-2.5 text-sm font-semibold text-[#141412]">Try again</button>
          <Link href="/dashboard" className="rounded-full border border-[#FFFFEB]/15 px-5 py-2.5 text-sm font-semibold">Go to dashboard</Link>
        </div>
        {error.digest ? <p className="mt-6 font-mono text-[11px] text-[#FFFFEB]/60">Reference: {error.digest}</p> : null}
      </div>
    </main>
  );
}
