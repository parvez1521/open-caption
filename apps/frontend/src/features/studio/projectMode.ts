/**
 * The doors a project starts through:
 *   "captions" — today's flow: upload → transcribe → caption → edit.
 *   "editor"   — the Normal Editor: upload → straight into the Studio on the timeline,
 *                no transcription; captions stay one click away ("Generate captions").
 *
 * The "ai-edit" door was removed from the surface (owner order 2026-11-14): old
 * ?mode=ai-edit links and stored "ai-edit" records fall back to captions (see
 * isMode below) — the feature's code stays, unlinked, reversible from git.
 *
 * The mode is a STARTING choice, recorded on this device (localStorage keyed by project
 * id) — deliberately NOT a database column (no migration): the durable truth lives in the
 * project itself (an empty caption document means "opened without captions", exactly like
 * a silent video). Projects with no recorded mode are "captions" projects — every project
 * created before this feature behaves exactly as it always did.
 */
export type ProjectStartMode = "captions" | "editor";

/** The two doors, one source for the /start chooser, the dashboard create modal and the upload-panel toggle. */
export const START_DOORS: readonly { mode: ProjectStartMode; label: string; sub: string }[] = [
  { mode: "captions", label: "Captions", sub: "We transcribe it and style the captions" },
  { mode: "editor", label: "Normal Editor", sub: "Just the editor — captions later, if wanted" },
];

const KEY = (projectId: string) => `oc:project-mode:${projectId}`;
export const DEFAULT_PROJECT_MODE: ProjectStartMode = "captions";

// "ai-edit" is deliberately not a mode anymore: old links and stored records fall back to captions.
const isMode = (v: string | null): v is ProjectStartMode => v === "captions" || v === "editor";

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

/** ?mode=editor | ?mode=captions on a project URL (the doors link here with it). A retired ?mode=ai-edit answers null, so the caller falls back to the default. */
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
