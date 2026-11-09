"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * The editor is the heaviest screen in the app (video + speech model + player). If anything in it
 * crashes — most often a phone browser running out of memory — the project must not look lost: the
 * project and its captions live on the account, and this screen is the way back into them.
 */
export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : null;
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
        <h1 className="text-2xl font-bold tracking-tight">The editor hit a snag</h1>
        <p className="mt-2 text-[15px] text-[#FFFFEB]/65">
          Nothing you made is lost — this project and its captions are saved on your account. On phones this
          usually means the browser ran low on memory; closing other tabs first can help.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="rounded-full bg-[#FFFFEB] px-5 py-2.5 text-sm font-semibold text-[#141412]">Resume your project</button>
          {projectId ? (
            <a href={`/projects/${projectId}`} className="rounded-full border border-[#FFFFEB]/15 px-5 py-2.5 text-sm font-semibold">Reload the editor</a>
          ) : null}
          <Link href="/dashboard" className="rounded-full border border-[#FFFFEB]/15 px-5 py-2.5 text-sm font-semibold">All your projects</Link>
        </div>
        {error.digest ? <p className="mt-6 font-mono text-[11px] text-[#FFFFEB]/60">Reference: {error.digest}</p> : null}
      </div>
    </main>
  );
}
