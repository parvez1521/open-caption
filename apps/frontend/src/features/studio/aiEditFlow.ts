/**
 * AI Edit blank-project flow (Studio revision, Task 9): AI Edit is its own
 * flow, never mixed with caption projects.
 *
 * A blank AI-Edit project is a real project (same backend record as any
 * other — `projectsService.createProject`) with NO transcribe/caption
 * pipeline attached: no session is started, no caption document is created,
 * nothing is transcribed until the user asks the planner to listen to the
 * uploaded video. The mode is recorded in TWO places at creation:
 *
 *   1. this device (localStorage keyed by project id) — immediate, and the
 *      fallback when the server record cannot be read;
 *   2. the server, as the "ai-edit" tag on the project record
 *      (`updateProjectOrg`) — so the project is recognised as AI Edit on
 *      ANY device or browser. Tagging is best-effort and never fails
 *      creation: if the tag write fails, the local flag still holds on
 *      this device.
 *
 * No database migration was needed for the tag: the folder/tags columns
 * exist since APPLY-PROJECT-FOLDERS-TAGS.sql (applied live 2026-11-10).
 * A project with no AI-Edit record is a caption project.
 *
 * Separation rule: the AI Edit section lists ONLY projects flagged here
 * (`filterAiEditProjects`); every caption surface lists only the rest
 * (`filterCaptionProjects`). Never show one list in the other surface.
 */

export const AI_EDIT_MODE = "ai-edit" as const;

/** Default title for a project started from AI Edit. */
export const AI_EDIT_BLANK_TITLE = "Untitled AI Edit";

/** Server-side flag: the tag marking a project as AI Edit. */
export const AI_EDIT_PROJECT_TAG = "ai-edit" as const;

const KEY = (projectId: string) => `oc:ai-edit-project:${projectId}`;

/** True when this project was started as a blank AI-Edit project on this device. */
export function isAiEditProject(projectId: string): boolean {
  try {
    return window.localStorage.getItem(KEY(projectId)) === "1";
  } catch {
    return false;
  }
}

/** True when a project's server tags carry the AI-Edit flag (any device). Case-insensitive; null-safe. */
export function hasAiEditTag(tags: readonly string[] | null | undefined): boolean {
  if (!tags) return false;
  return tags.some((t) => typeof t === "string" && t.trim().toLowerCase() === AI_EDIT_PROJECT_TAG);
}

export interface ProjectLike {
  id: string;
  /** Server tags when the caller has the project record; absent for id-only checks. */
  tags?: readonly string[] | null;
}

/** True when a project record is AI Edit — local flag on this device OR the server tag. */
export function isAiEditProjectRecord(project: ProjectLike): boolean {
  return isAiEditProject(project.id) || hasAiEditTag(project.tags);
}

/** Record a project as an AI-Edit project (called once, at creation). */
export function markAiEditProject(projectId: string): void {
  try {
    window.localStorage.setItem(KEY(projectId), "1");
  } catch {
    /* private mode / storage full: the flag just won't survive on this device */
  }
}

/** Clear the AI-Edit record (project deleted, or converted by hand). */
export function clearAiEditProject(projectId: string): void {
  try {
    window.localStorage.removeItem(KEY(projectId));
  } catch {
    /* nothing to clear */
  }
}

export interface BlankAiEditProject {
  id: string;
  title: string;
  /** The Studio timeline URL phase 2 opens after creation. */
  timelineUrl: string;
}

/** The Studio timeline URL for a project: `/projects/<id>`. Phase 2 opens
 *  this and activates the AI Edit rail section for AI-Edit projects. */
export function aiEditTimelineUrl(projectId: string): string {
  return `/projects/${projectId}`;
}

export interface CreateBlankAiEditProjectDeps {
  /** The real project creator (projectsService.createProject in the app; injected so tests never touch the network). */
  createProject: (title: string) => Promise<{ id: string; title: string }>;
  /** The server-side flag writer (projectsService.updateProjectOrg in the app). Best-effort: a failed tag write never fails creation. */
  tagProject?: (projectId: string, tags: string[]) => Promise<unknown>;
}

/**
 * Create a BLANK project in AI-Edit mode and flag it: no video, no
 * transcript, no captions — the user uploads a video inside the Studio
 * timeline next, after signing in to Puter. The caption flow is untouched:
 * this never starts a transcription session and never writes a caption doc.
 * The flag is recorded locally AND as the server tag, so the project lists
 * under AI Edit on any device.
 */
export async function createBlankAiEditProject(
  deps: CreateBlankAiEditProjectDeps,
  title: string = AI_EDIT_BLANK_TITLE,
): Promise<BlankAiEditProject> {
  const project = await deps.createProject(title.trim() || AI_EDIT_BLANK_TITLE);
  markAiEditProject(project.id);
  if (deps.tagProject) {
    try {
      await deps.tagProject(project.id, [AI_EDIT_PROJECT_TAG]);
    } catch {
      /* the local flag still holds on this device; the project just won't be recognised as AI Edit elsewhere until it is tagged */
    }
  }
  return { id: project.id, title: project.title, timelineUrl: aiEditTimelineUrl(project.id) };
}

/** The AI Edit list: ONLY AI-Edit projects, never caption projects. */
export function filterAiEditProjects<T extends ProjectLike>(
  projects: readonly T[],
  isAiEdit: (project: T) => boolean = isAiEditProjectRecord,
): T[] {
  return projects.filter((p) => isAiEdit(p));
}

/** Every other surface (caption project lists): everything EXCEPT AI-Edit projects. */
export function filterCaptionProjects<T extends ProjectLike>(
  projects: readonly T[],
  isAiEdit: (project: T) => boolean = isAiEditProjectRecord,
): T[] {
  return projects.filter((p) => !isAiEdit(p));
}
