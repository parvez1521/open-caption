"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { hadAccountHere, startGuestSession } from "@/services/auth/guest";
import { BrandNavProvider } from "@/components/brand/BrandNav";
import { DashboardSkeleton, StudioSkeleton } from "@/components/brand/Skeletons";
import StudioShell from "@/components/studio/StudioShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (authService.isAuthenticated()) {
        setAuthorized(true);
        return;
      }
      // First-time guest arriving on a deep link (e.g. the landing page's Clipper button):
      // run the same anonymous-session bootstrap /start performs, instead of bouncing to
      // /login before a guest session can exist. Browsers that have held a real account
      // here still go to /login — they are never handed a fresh guest account.
      if (!hadAccountHere() && (await startGuestSession()) && authService.isAuthenticated()) {
        if (live) setAuthorized(true);
        return;
      }
      router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    })();
    return () => {
      live = false;
    };
  }, [router]);

  // until the stored session is read, show the shape of the page that is about to appear (this is in the server HTML too)
  if (!authorized) {
    return pathname.startsWith("/projects/") ? (
      <StudioSkeleton />
    ) : (
      <StudioShell>
        <DashboardSkeleton />
      </StudioShell>
    );
  }

  return <BrandNavProvider>{children}</BrandNavProvider>;
}
