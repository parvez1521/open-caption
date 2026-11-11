"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import { modeFromSearch, START_DOORS, type ProjectStartMode } from "@/features/studio/projectMode";
import { claimPendingGuest, clearPendingGuestClaim, hadAccountHere, isGuestUser, startGuestSession, takeAfterSignIn } from "@/services/auth/guest";
import type { Project } from "@/services/types";
import { LogoWave } from "@/components/brand/LogoWave";

/**
 * The hub every "Start free" click and every sign-in (password, Google, email confirmation) lands on:
 * - signed-in account: moves a pending guest project over (see guest.ts), then the page they were headed to, else the dashboard
 * - guest coming back: their latest project
 * - signed out on a browser that had an account: sign in (never a guest account)
 * - brand-new visitor: a guest account and a fresh project
 * Homepage "Get Started" carries ?choose=1: a brand-new visitor first picks a door
 * (Captions / Normal Editor / AI Edit — START_DOORS) and the fresh project starts
 * through it. An explicit ?mode= link skips the chooser, as does a returning guest.
 * `replace`, never `push`, so Back doesn't bounce through here.
 */

function nextUntitled(projects: Project[]) {
  const used = projects.map((p) => /^Untitled (\d+)$/i.exec(p.title.trim())?.[1]).filter(Boolean).map(Number);
  return `Untitled ${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

/** The session can still be arriving (OAuth / confirmation links carry it in the URL): wait briefly for it. */
async function waitForSession(ms = 6000) {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  return new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>((resolve) => {
    const t = setTimeout(() => {
      sub.subscription.unsubscribe();
      resolve(null);
    }, ms);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) return;
      clearTimeout(t);
      sub.subscription.unsubscribe();
      resolve(session);
    });
  });
}

export default function StartPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  // ?choose=1 (homepage Get Started) with no project yet: the visitor picks a door first
  const [chooser, setChooser] = useState<{ projects: Project[] } | null>(null);
  const once = useRef(false);

  const createAndRoute = useCallback(
    async (projects: Project[], mode: ProjectStartMode | null) => {
      try {
        const project = await projectsService.createProject(nextUntitled(projects));
        router.replace(mode ? `/projects/${project.id}?mode=${mode}` : `/projects/${project.id}`);
      } catch {
        setChooser(null);
        setFailed(true);
      }
    },
    [router],
  );

  // fetch the speech model files while the person is on their way to the studio (idle, and not on a metered connection)
  useEffect(() => { void import("@/features/transcribe/browserWhisper").then((m) => m.warmSpeechModel()); }, []);

  useEffect(() => {
    if (once.current) return; // Strict Mode runs effects twice: never create two projects
    once.current = true;
    void (async () => {
      // No Supabase backend connected: guest sessions and projects live in that
      // backend, so there is no session to wait for and no sign-in to bounce to.
      // Show the honest notice instead of calling the placeholder auth client.
      if (!isSupabaseConfigured()) {
        setNotConfigured(true);
        return;
      }
      const fromAuth = /[?&]code=|access_token=|token_hash=/.test(window.location.search + window.location.hash);
      const fromAuthError = /[?&#]error(_code|_description)?=/.test(window.location.search + window.location.hash);
      let session = await waitForSession(fromAuth ? 6000 : 400);
      if (session && !isGuestUser(session.user)) {
        await claimPendingGuest();
        return router.replace(takeAfterSignIn() ?? "/dashboard");
      }
      // still a guest after a Google round trip (they cancelled, or Google/Supabase refused): back to the project
      // they came from, without reopening the sign-up box, so nothing loops
      if (session && fromAuthError) {
        clearPendingGuestClaim();
        const back = takeAfterSignIn();
        if (back) {
          const u = new URL(back, window.location.origin);
          u.searchParams.delete("export");
          u.searchParams.set("signin", "cancelled");
          return router.replace(u.pathname + u.search);
        }
      }
      if (!session) {
        if (hadAccountHere()) return router.replace("/login");
        session = (await startGuestSession()) ? (await supabase.auth.getSession()).data.session : null;
        if (!session) return router.replace("/login?mode=signup");
      }
      try {
        const projects = await projectsService.getProjects();
        const live = projects.filter((p) => !p.archived_at && !p.deleted_at).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
        // a guest continues where they left off
        const existing = live[0];
        if (existing) return router.replace(`/projects/${existing.id}`);
        // The mode is a STARTING choice, forwarded only for a project created by this
        // visit: an explicit door link (?mode=) goes straight through; ?choose=1 (the
        // homepage's Get Started) asks first, with the three doors.
        const doorMode = modeFromSearch(window.location.search);
        if (!doorMode && new URLSearchParams(window.location.search).get("choose") === "1") {
          setChooser({ projects });
          return;
        }
        await createAndRoute(projects, doorMode);
      } catch {
        setFailed(true);
      }
    })();
  }, [router, createAndRoute]);

  return (
    <div className="grid min-h-[100svh] place-items-center bg-[#141412] px-6 text-center">
      {notConfigured ? (
        <div className="flex max-w-sm flex-col items-center gap-4">
          <LogoWave height={40} />
          <p className="text-[15px] font-semibold text-[#FFFFEB]">Accounts are coming soon — no sign-up needed to make captions.</p>
          <p className="text-[13px] font-medium text-[#FFFFEB]/70">We&apos;re finishing the studio setup. Check back shortly — your clips and captions will be made right in your browser, free.</p>
          <a href="/" className="mt-2 rounded-full bg-[#FFFFEB] px-5 py-2.5 text-sm font-semibold text-[#141412]">
            Back to home
          </a>
        </div>
      ) : chooser ? (
        <div className="flex w-full max-w-md flex-col items-center gap-5">
          <LogoWave height={40} />
          <h1 className="text-xl font-bold text-[#FFFFEB]">How do you want to start?</h1>
          <div className="grid w-full gap-2" role="radiogroup" aria-label="How this project starts">
            {START_DOORS.map((door) => (
              <button
                key={door.mode}
                role="radio"
                aria-checked={false}
                onClick={() => void createAndRoute(chooser.projects, door.mode)}
                className="rounded-2xl border border-[#FFFFEB]/12 bg-[#1E1E1B] px-5 py-4 text-left transition hover:border-[#FFFFEB]/35"
              >
                <span className="block text-[15px] font-semibold text-[#FFFFEB]">{door.label}</span>
                <span className="mt-0.5 block text-[13px] text-[#FFFFEB]/65">{door.sub}</span>
              </button>
            ))}
          </div>
          <p className="text-[13px] text-[#FFFFEB]/55">You can switch later — this only sets how the first project opens.</p>
        </div>
      ) : failed ? (
        <div>
          <p className="text-[15px] font-semibold text-[#FFFFEB]">We couldn&apos;t open your studio.</p>
          <button onClick={() => router.replace("/dashboard")} className="mt-4 rounded-full bg-[#FFFFEB] px-5 py-2.5 text-sm font-semibold text-[#141412]">
            Go to your dashboard
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <LogoWave height={40} />
          <p className="text-[13px] font-semibold text-[#FFFFEB]/70">Opening your studio…</p>
        </div>
      )}
    </div>
  );
}
