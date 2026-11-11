/**
 * The doors a project starts through:
 *   "captions" — today's flow: upload → transcribe → caption → edit.
 *   "editor"   — the Normal Editor: upload → straight into the Studio on the timeline,
 *                no transcription; captions stay one click away ("Generate captions").
 *   "ai-edit"  — AI Edit: upload → transcribe (the plan needs the words) → the Studio
 *                opens with the AI Edit panel active and a one-line first-run prompt.
 *
 * The mode is a STARTING choice, recorded on this device (localStorage keyed by project
 * id) — deliberately NOT a database column (no migration): the durable truth lives in the
 * project itself (an empty caption document means "opened without captions", exactly like
 * a silent video). Projects with no recorded mode are "captions" projects — every project
 * created before this feature behaves exactly as it always did.
 */
export type ProjectStartMode = "captions" | "editor" | "ai-edit";

/** The three doors, one source for the /start chooser and the upload-panel toggle. */
export const START_DOORS: readonly { mode: ProjectStartMode; label: string; sub: string }[] = [
  { mode: "captions", label: "Captions", sub: "Transcribe & caption" },
  { mode: "editor", label: "Normal Editor", sub: "Edit only — captions later" },
  { mode: "ai-edit", label: "AI Edit", sub: "Captions, then an AI edit plan" },
];

const KEY = (projectId: string) => `oc:project-mode:${projectId}`;
export const DEFAULT_PROJECT_MODE: ProjectStartMode = "captions";

const isMode = (v: string | null): v is ProjectStartMode => v === "captions" || v === "editor" || v === "ai-edit";

export function projectModeOf(projectId: string): ProjectStartMode {
  try {
    const v = window.localStorage.getItem(KEY(projectId));
    return isMode(v) ? v : DEFAULT_PROJECT_MODE;
  } catch {
    return DEFAULT_PROJECT_MODE;
  }
}

export function setProjectMode(projectId: string, mode: ProjectStartMode): void {
  try {
    window.localStorage.setItem(KEY(projectId), mode);
  } catch {
    /* private mode / storage full: the mode just won't be remembered on this device */
  }
}

/** ?mode=editor | ?mode=captions | ?mode=ai-edit on a project URL (the doors link here with it). */
export function modeFromSearch(search: string): ProjectStartMode | null {
  try {
    const m = new URLSearchParams(search).get("mode");
    return isMode(m) ? m : null;
  } catch {
    return null;
  }
}

/* The AI Edit door's first-run moment (panel auto-activation + the one-line prompt)
 * fires exactly once per project on this device; after that the Studio behaves
 * normally for the project, whatever door it came through. */
const INTRO_KEY = (projectId: string) => `oc:ai-edit-intro:${projectId}`;

export function aiEditIntroSeen(projectId: string): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY(projectId)) === "1";
  } catch {
    return true; // storage unavailable: never nag — the panel is one rail click away
  }
}

export function markAiEditIntroSeen(projectId: string): void {
  try {
    window.localStorage.setItem(INTRO_KEY(projectId), "1");
  } catch {
    /* private mode / storage full */
  }
}
