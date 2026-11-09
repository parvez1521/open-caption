"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import ProjectsList from "@/components/workspace/ProjectsList";

/** Captions home: the project list — each project opens the studio where its captions are made and styled. */
export default function CaptionsPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Your <em className="italic text-sand-600">captions</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">Open a project to generate, edit and style its captions. Search, duplicate or archive projects from the actions menu on each card.</p>
        </div>
        <div className="pt-8">{signedIn ? <ProjectsList /> : null}</div>
      </div>
    </StudioShell>
  );
}
