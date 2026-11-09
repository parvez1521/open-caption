import type { Project } from "@/services/types";

export type ProjectView = "active" | "archived" | "all";

/** Pure client-side filtering for the projects list: by archive view, then by a title search. */
export function filterProjects(projects: Project[], query: string, view: ProjectView): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => {
    if (view === "active" && p.archived_at) return false;
    if (view === "archived" && !p.archived_at) return false;
    if (q && !p.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function countByView(projects: Project[]): Record<ProjectView, number> {
  const archived = projects.filter((p) => p.archived_at).length;
  return { active: projects.length - archived, archived, all: projects.length };
}
