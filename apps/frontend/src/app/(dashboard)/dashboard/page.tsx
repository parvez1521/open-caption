"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { User } from "@/services/types";
import StudioShell from "@/components/studio/StudioShell";
import ProjectsList from "@/components/workspace/ProjectsList";

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
    authService.getCurrentUser().then(setCurrentUser);
  }, [router]);

  const firstName = currentUser?.name?.split(" ")[0];

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-8 border-b border-sand-200">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink break-words">
              {firstName ? (<>Welcome back, <em className="italic text-sand-600">{firstName}.</em></>) : "Your projects"}
            </h1>
            <p className="mt-2 text-[14px] text-sand-800">Every clip you&apos;re captioning, in one place. Projects stay saved on your account — pick up where you left off.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-8 sm:grid-cols-2">
          <Link href="/exports" className="rounded-xl border border-sand-200 bg-white p-5 transition-colors hover:border-sand-500">
            <p className="font-sora text-[14px] font-bold text-ink">Exports history</p>
            <p className="mt-1 text-[13px] leading-relaxed text-sand-700">Every file you have exported, across all projects — download the ones still within their retention window.</p>
          </Link>
          <Link href="/brand" className="rounded-xl border border-sand-200 bg-white p-5 transition-colors hover:border-sand-500">
            <p className="font-sora text-[14px] font-bold text-ink">Brand presets</p>
            <p className="mt-1 text-[13px] leading-relaxed text-sand-700">Your saved colours and font from Creator Studio, applied in every project&apos;s Style panel.</p>
          </Link>
        </div>

        <div className="pt-8">{signedIn ? <ProjectsList /> : null}</div>
      </div>
    </StudioShell>
  );
}
