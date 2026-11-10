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
 */

export type NavGroupId = "primary" | "supporting";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  group: NavGroupId;
  /** Path prefixes that mark this item active (segment-aware: "/projects" matches "/projects/abc"). */
  activeMatch: string[];
}

export interface NavGroup {
  id: NavGroupId;
  heading: string | null;
  items: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", group: "primary", activeMatch: ["/dashboard"] },
  { id: "create", label: "Creator Studio", href: "/create", group: "primary", activeMatch: ["/create"] },
  { id: "captions", label: "Caption Studio", href: "/captions", group: "primary", activeMatch: ["/captions"] },
  // The editor itself is per-project at /projects/[id], so the editor entry stays active there too.
  { id: "editor", label: "Video Editor", href: "/editor", group: "primary", activeMatch: ["/editor", "/projects"] },
  { id: "motion", label: "Motion Studio", href: "/motion", group: "primary", activeMatch: ["/motion"] },
  { id: "growth", label: "Growth Studio", href: "/growth", group: "primary", activeMatch: ["/growth"] },
  { id: "planner", label: "Content Planner", href: "/planner", group: "primary", activeMatch: ["/planner"] },
  { id: "analytics", label: "Creator Analytics", href: "/analytics", group: "primary", activeMatch: ["/analytics"] },
  { id: "library", label: "Media Library", href: "/library", group: "supporting", activeMatch: ["/library"] },
  { id: "brand", label: "Brand Kit", href: "/brand", group: "supporting", activeMatch: ["/brand"] },
  { id: "clipper", label: "Clipper", href: "/clipper", group: "supporting", activeMatch: ["/clipper"] },
  { id: "analyzer", label: "Reel Analyzer", href: "/analyzer", group: "supporting", activeMatch: ["/analyzer"] },
  { id: "teleprompter", label: "Teleprompter", href: "/prompter", group: "supporting", activeMatch: ["/prompter"] },
  { id: "exports", label: "Export History", href: "/exports", group: "supporting", activeMatch: ["/exports"] },
  { id: "settings", label: "Settings", href: "/settings", group: "supporting", activeMatch: ["/settings"] },
];

export const NAV_GROUPS: NavGroup[] = [
  { id: "primary", heading: null, items: NAV_ITEMS.filter((i) => i.group === "primary") },
  { id: "supporting", heading: "Supporting", items: NAV_ITEMS.filter((i) => i.group === "supporting") },
];

/** Segment-aware prefix match: "/projects" matches "/projects" and "/projects/abc", not "/projects-old". */
export function isNavActive(pathname: string, item: NavItem): boolean {
  return item.activeMatch.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
