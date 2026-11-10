import type { Project } from "@/services/types";

export type ProjectView = "active" | "archived" | "all";

/** A15 organisation filter: a folder label, the unfiled sentinel, and/or one tag. */
export interface ProjectOrgFilter {
  /** A folder label, or "unfiled" for projects with no folder; undefined/null = any. */
  folder?: string | "unfiled" | null;
  /** One tag the project must carry; undefined/null/"" = any. */
  tag?: string | null;
}

export function matchesOrgFilter(p: Project, org?: ProjectOrgFilter): boolean {
  if (!org) return true;
  if (org.folder === "unfiled") {
    if (p.folder) return false;
  } else if (org.folder) {
    if ((p.folder ?? null) !== org.folder) return false;
  }
  const tag = org.tag?.trim().toLowerCase();
  if (tag && !(p.tags ?? []).some((t) => t.toLowerCase() === tag)) return false;
  return true;
}

/** Pure client-side filtering for the projects list: by archive view, then by a title search, then by folder/tag. */
export function filterProjects(projects: Project[], query: string, view: ProjectView, org?: ProjectOrgFilter): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => {
    if (view === "active" && p.archived_at) return false;
    if (view === "archived" && !p.archived_at) return false;
    if (q && !p.title.toLowerCase().includes(q)) return false;
    if (!matchesOrgFilter(p, org)) return false;
    return true;
  });
}

export function countByView(projects: Project[]): Record<ProjectView, number> {
  const archived = projects.filter((p) => p.archived_at).length;
  return { active: projects.length - archived, archived, all: projects.length };
}

/** Distinct folder labels in use, sorted; projects with no folder are not a "folder". */
export function distinctFolders(projects: Project[]): string[] {
  return [...new Set(projects.map((p) => p.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
}

/** Distinct tags in use, sorted case-insensitively (first-seen casing kept). */
export function distinctTags(projects: Project[]): string[] {
  const byKey = new Map<string, string>();
  for (const p of projects) for (const t of p.tags ?? []) byKey.set(t.toLowerCase(), byKey.get(t.toLowerCase()) ?? t);
  return [...byKey.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
