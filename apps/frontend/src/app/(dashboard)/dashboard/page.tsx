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
    // A name saved in /settings fires USER_UPDATED: refresh the greeting
    // without waiting for a reload or a navigation.
    return authService.subscribeToUserChanges(setCurrentUser);
  }, [router]);

  // Guests (anonymous sessions) have no email and no real name: greet them as
  // what they are instead of "Welcome back" to an account they never made.
  const isGuest = currentUser ? !currentUser.email : false;
  const firstName = isGuest ? undefined : currentUser?.name?.split(" ")[0];

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-8 border-b border-sand-200">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink break-words">
              {firstName ? (<>Welcome back, <em className="italic text-sand-600">{firstName}.</em></>) : "Your projects"}
            </h1>
            <p className="mt-2 text-[14px] text-sand-800">{isGuest ? "Every clip you're captioning, in one place. You're exploring as a guest — projects are saved to this guest session, and a free account keeps them under your name." : "Every clip you're captioning, in one place. Projects stay saved on your account — pick up where you left off."}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-8 sm:grid-cols-2">
          <Link href="/exports" className="wb-panel block p-5 transition-colors hover:border-sand-300">
            <p className="wb-eyebrow">Library</p>
            <p className="mt-2 font-sora text-[14px] font-bold text-ink">Export History</p>
            <p className="mt-1 text-[13px] leading-relaxed text-sand-700">Every file you have exported, across all projects.</p>
          </Link>
          <Link href="/brand" className="wb-panel block p-5 transition-colors hover:border-sand-300">
            <p className="wb-eyebrow">Identity</p>
            <p className="mt-2 font-sora text-[14px] font-bold text-ink">Brand Kit</p>
            <p className="mt-1 text-[13px] leading-relaxed text-sand-700">Your saved colours, font and voice — used by the generators and every project&apos;s Style panel.</p>
          </Link>
        </div>

        <div className="pt-8">{signedIn ? <ProjectsList /> : null}</div>
      </div>
    </StudioShell>
  );
}
