/**
 * Shell navigation — the single source of truth for the studio sidebar and the mobile top bar.
 * Pure data (no JSX): the shell maps `id` to its inline-SVG icon, so this module stays testable
 * and nothing can drift between the two renderings.
 *
 * Honesty rule: every entry is a real, existing route. Sections enter the nav only
 * when their first real slice ships — no placeholder entries, no dead links.
 * The pinning test in __tests__/nav.test.ts asserts both halves of that rule.
 * (Growth Studio + Reel Analyzer entered with Phase 6, Content Planner + Teleprompter
 * with Phase 7, Creator Analytics with Phase 8, Motion Studio with the Motion Studio
 * surfaces slice — every entry is backed by a real page.)
 *
 * Hidden for now (owner order 2026-11-13, "abhi ke liye"): Creator Studio (/create),
 * Clipper (/clipper), AI Clipper (/ai-clipper), Reel Analyzer (/analyzer) and
 * Teleprompter (/prompter) are NOT listed here, but their routes and pages stay live
 * and unlinked. To restore one, re-add its entry below (and its row in the nav test's
 * pinned IA list); nothing else needs to change.
 *
 * Hidden for now (owner order 2026-11-25): AI Edit (/editor) is NOT listed
 * here while AI_EDIT_ENABLED is false (features/studio/aiEditEnabled.ts) —
 * its route stays live but redirects to /dashboard, and the entry comes
 * back with a single flag flip (plus its row in the nav test's pinned IA
 * list). The per-project editor itself (/projects/[id]) is unaffected.
 *
 * Owner order 2026-11-15: Clipper is additionally gone from the editor itself —
 * the left-rail "Clipper" tab and its launch card were removed from StudioPage,
 * so no surface in the app links to /clipper or /ai-clipper any more.
 */

import { AI_EDIT_ENABLED } from "@/features/studio/aiEditEnabled";

export type NavGroupId = "primary" | "supporting";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  group: NavGroupId;
  /** Path prefixes that mark this item active (segment-aware: "/projects" matches "/projects/abc"). */
  activeMatch: string[];
  /** Package 3 item I.1: the entry opens its surface in a NEW browser tab (a
   *  standalone workspace — leaving the current page would lose editor state). */
  newTab?: boolean;
}

export interface NavGroup {
  id: NavGroupId;
  heading: string | null;
  items: NavItem[];
}

export const NAV_ITEMS: NavItem[] = (
  [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", group: "primary", activeMatch: ["/dashboard"] },
  { id: "captions", label: "Caption Studio", href: "/captions", group: "primary", activeMatch: ["/captions"] },
  // The editor itself is per-project at /projects/[id], so the editor entry stays active there too.
  { id: "editor", label: "AI Edit", href: "/editor", group: "primary", activeMatch: ["/editor", "/projects"] },
  { id: "motion", label: "Motion Studio", href: "/motion", group: "primary", activeMatch: ["/motion"] },
  { id: "growth", label: "Growth Studio", href: "/growth", group: "primary", activeMatch: ["/growth"] },
  { id: "planner", label: "Content Planner", href: "/planner", group: "primary", activeMatch: ["/planner"] },
  { id: "analytics", label: "Creator Analytics", href: "/analytics", group: "primary", activeMatch: ["/analytics"] },
  { id: "library", label: "Media Library", href: "/library", group: "supporting", activeMatch: ["/library"] },
  { id: "brand", label: "Brand Kit", href: "/brand", group: "supporting", activeMatch: ["/brand"] },
  { id: "transcribe", label: "Transcribe", href: "/transcribe", group: "supporting", activeMatch: ["/transcribe"] },
  { id: "exports", label: "Export History", href: "/exports", group: "supporting", activeMatch: ["/exports"] },
  { id: "settings", label: "Settings", href: "/settings", group: "supporting", activeMatch: ["/settings"] },
  ] as NavItem[]
).filter((i) => AI_EDIT_ENABLED || i.id !== "editor");

export const NAV_GROUPS: NavGroup[] = [
  { id: "primary", heading: null, items: NAV_ITEMS.filter((i) => i.group === "primary") },
  { id: "supporting", heading: "Supporting", items: NAV_ITEMS.filter((i) => i.group === "supporting") },
];

/** Segment-aware prefix match: "/projects" matches "/projects" and "/projects/abc", not "/projects-old". */
export function isNavActive(pathname: string, item: NavItem): boolean {
  return item.activeMatch.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
