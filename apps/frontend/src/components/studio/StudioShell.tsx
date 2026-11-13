"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/brand/Logo";
import { authService } from "@/services/auth";
import { User } from "@/services/types";
import { FEEDBACK_MAILTO } from "@/lib/legal";
import { NAV_GROUPS, NAV_ITEMS, isNavActive } from "./nav";

type HealthChecks = { database: boolean; queue: boolean };

// same-origin readiness probe (database + Postgres job queue)
const HEALTH_URL = "/health/ready";
/** The service-status widget is a developer aid: shown on localhost (next dev), never on the live site. */
const SHOW_HEALTH = process.env.NODE_ENV !== "production";

const iconProps = { className: "w-4 h-4 shrink-0", fill: "none", stroke: "currentColor", strokeWidth: "1.8", viewBox: "0 0 24 24" } as const;

/**
 * Navigation comes from ./nav — the single source of truth shared by the sidebar and the
 * mobile top bar. This map only attaches each entry's inline-SVG icon (same style as before);
 * labels, hrefs, grouping and active matching all live in the config.
 */
const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: (<svg {...iconProps}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>),
  create: (<svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>),
  captions: (<svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h4M7 15.5h7M14 12h3" strokeLinecap="round" /></svg>),
  editor: (<svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 5v5" strokeLinecap="round" /></svg>),
  motion: (<svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M10 9.2l5 2.8-5 2.8z" /><path strokeLinecap="round" d="M6.5 2.8v2.2M12 2.8v2.2M17.5 2.8v2.2" /></svg>),
  growth: (<svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M4 17l5-6 4 3 7-8" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 6h5v5" /></svg>),
  planner: (<svg {...iconProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4M7.5 14.5h3M13.5 14.5h3" /></svg>),
  analytics: (<svg {...iconProps}><path strokeLinecap="round" d="M4 20h16" /><path strokeLinecap="round" d="M7 20v-5M12 20V8M17 20v-8" /></svg>),
  teleprompter: (<svg {...iconProps}><rect x="3" y="4" width="18" height="13" rx="2" /><path strokeLinecap="round" d="M7 8.5h10M7 12h6M12 21l-2.5-4h5L12 21z" /></svg>),
  library: (<svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-4 4 3 3-2 6 4" /></svg>),
  brand: (<svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.1 4.6L19 9l-3.6 3.3 1 4.9L12 14.7l-4.4 2.5 1-4.9L5 9l4.9-1.4L12 3z" /></svg>),
  clipper: (<svg {...iconProps}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8.2 7.8L20 19M8.2 16.2L20 5" strokeLinecap="round" /></svg>),
  transcribe: (<svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path strokeLinecap="round" d="M7 9.5v5M10.5 7.5v9M14 9.5v5M17.5 8v8" /></svg>),
  analyzer: (<svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 12h2.5l2-3.5 2.5 6 1.8-2.5H17" /></svg>),
  exports: (<svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>),
  settings: (<svg {...iconProps}><circle cx="12" cy="12" r="3" /><path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></svg>),
};

function HealthRow({ label, ok, pending }: { label: string; ok?: boolean; pending: boolean }) {
  return (
    <div className="flex items-center justify-between font-mono text-[11px]">
      <span className="text-sand-600">{label}</span>
      <span className={`flex items-center gap-1.5 ${pending ? "text-sand-500" : ok ? "text-sand-800" : "text-obsidian"}`}>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            pending ? "bg-sand-300" : ok ? "bg-emerald-accent" : "bg-orange-accent"
          }`}
        />
        {pending ? "…" : ok ? "online" : "down"}
      </span>
    </div>
  );
}

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    authService.getCurrentUser().then(setUser);
    // A name saved in /settings fires USER_UPDATED: refresh the header
    // without waiting for a reload or a navigation.
    return authService.subscribeToUserChanges(setUser);
  }, []);

  const { data: health } = useQuery<HealthChecks | null>({
    queryKey: ["health"],
    enabled: SHOW_HEALTH,
    queryFn: async () => {
      try {
        const res = await fetch(HEALTH_URL);
        const body = await res.json();
        return body.checks as HealthChecks;
      } catch {
        return null;
      }
    },
    refetchInterval: 30000,
    retry: false,
  });

  const handleSignOut = async () => {
    try {
      await authService.logout();
    } finally {
      router.push("/login");
    }
  };

  // Guests are anonymous sessions with no email: they never signed in, so the
  // shell must not offer them a "Sign out" — it offers the account path instead.
  const isGuest = user ? !user.email : false;
  const healthy = health ? health.database && health.queue : undefined;
  return (
    <div className="min-h-screen bg-dune-white md:flex">
      {/* Mobile top bar (sidebar is hidden below md) — solid surface, no blur */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sand-200 bg-sand-50 px-4 py-3 md:hidden">
        <Link href="/dashboard" aria-label="Captionit projects">
          <Logo height={24} />
        </Link>
        <nav className="flex max-w-[62vw] items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} {...(item.newTab ? { target: "_blank", rel: "noopener" } : {})} aria-label={item.label} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 font-sora text-[12px] font-semibold ${isNavActive(pathname, item) ? "bg-sand-200 text-ink shadow-[inset_0_-2px_0_var(--color-wb-blue)]" : "text-sand-700"}`}>
              {NAV_ICONS[item.id]}
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          ))}
          {SHOW_HEALTH ? <span title={healthy === undefined ? "Checking service" : healthy ? "All systems running" : "Service problem"} className={`ml-1 h-2 w-2 rounded-full ${healthy === undefined ? "bg-sand-300" : healthy ? "bg-emerald-accent" : "bg-orange-accent"}`} /> : null}
          {isGuest ? (
            <Link href="/login?mode=signup" className="ml-1 shrink-0 rounded-lg px-2.5 py-2 font-sora text-[12px] font-semibold text-sand-700 hover:bg-sand-100 hover:text-ink">Sign up free</Link>
          ) : (
          <button onClick={handleSignOut} aria-label="Sign out" className="ml-1 rounded-lg p-2 text-sand-600 hover:bg-sand-100 hover:text-ink">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H9m4 7H7a2 2 0 01-2-2V5a2 2 0 012-2h6" /></svg>
          </button>
          )}
        </nav>
      </header>

      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sand-200 bg-sand-50 md:flex">
        <div className="px-5 py-6">
          <Link href="/dashboard" aria-label="Captionit projects">
            <Logo height={26} />
          </Link>
        </div>

        <nav className="px-3 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1">
              {group.heading ? <p className="px-3 pb-1 font-sora text-[12px] font-semibold uppercase tracking-wider text-sand-500">{group.heading}</p> : null}
              {group.items.map((item) => {
                const active = isNavActive(pathname, item);
                return (
                  <Link key={item.href} href={item.href} {...(item.newTab ? { target: "_blank", rel: "noopener" } : {})} className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 font-sora text-[13px] font-semibold transition-colors ${active ? "bg-sand-200 text-ink shadow-[inset_3px_0_0_var(--color-wb-blue)]" : "text-sand-700 hover:bg-sand-100 hover:text-ink"}`}>
                    {NAV_ICONS[item.id]}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto">
          <a href={FEEDBACK_MAILTO} className="mx-3 mb-3 flex items-center gap-3 rounded-lg px-3 py-2.5 font-sora text-[13px] font-semibold text-sand-700 transition-colors hover:bg-sand-100 hover:text-ink">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v11H8l-4 4V5z" /></svg>
            Send feedback
          </a>

          {/* Render service health (local dev only) */}
          {SHOW_HEALTH ? <div className="mx-5 mb-4 rounded-lg border border-sand-200 bg-white px-4 py-3 space-y-2">
            <p className="font-sora text-[11px] font-semibold text-sand-700">Service status</p>
            <HealthRow label="database" ok={health?.database} pending={health === undefined} />
            <HealthRow label="job queue" ok={health?.queue} pending={health === undefined} />
            {health === null && (
              <p className="pt-1 text-[11px] leading-snug text-sand-600">
                Backend unreachable — uploads and renders are paused.
              </p>
            )}
          </div> : null}

          {/* User + sign out */}
          <div className="border-t border-sand-200 px-5 py-4 flex items-center gap-3">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full border border-sand-200 bg-white"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-sand-200" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-sora text-[13px] font-semibold text-ink">
                {user?.name ?? "…"}
              </p>
              <p className="truncate text-[11px] text-sand-600">{user?.email ? user.email : user ? "Guest session" : ""}</p>
            </div>
            {isGuest ? (
              <Link
                href="/login?mode=signup"
                title="Create a free account"
                className="shrink-0 rounded-lg px-2 py-2 font-sora text-[12px] font-semibold text-sand-700 hover:bg-sand-100 hover:text-ink transition-colors"
              >
                Sign up free
              </Link>
            ) : (
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-2 rounded-lg text-sand-600 hover:text-ink hover:bg-sand-100 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H9m4 7H7a2 2 0 01-2-2V5a2 2 0 012-2h6" />
              </svg>
            </button>
            )}
          </div>
        </div>
      </aside>

      {/* Content */}
      <main id="main-content" className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
