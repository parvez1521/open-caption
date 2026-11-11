/**
 * Package 2 item G — the two doors a project starts through:
 *   "captions" — today's flow: upload → transcribe → caption → edit.
 *   "editor"   — the Normal Editor: upload → straight into the Studio on the timeline,
 *                no transcription; captions stay one click away ("Generate captions").
 *
 * The mode is a STARTING choice, recorded on this device (localStorage keyed by project
 * id) — deliberately NOT a database column (no migration): the durable truth lives in the
 * project itself (an empty caption document means "opened without captions", exactly like
 * a silent video). Projects with no recorded mode are "captions" projects — every project
 * created before this feature behaves exactly as it always did.
 */
export type ProjectStartMode = "captions" | "editor";

const KEY = (projectId: string) => `oc:project-mode:${projectId}`;
export const DEFAULT_PROJECT_MODE: ProjectStartMode = "captions";

export function projectModeOf(projectId: string): ProjectStartMode {
  try {
    return window.localStorage.getItem(KEY(projectId)) === "editor" ? "editor" : DEFAULT_PROJECT_MODE;
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

/** ?mode=editor | ?mode=captions on a project URL (the doors link here with it). */
export function modeFromSearch(search: string): ProjectStartMode | null {
  try {
    const m = new URLSearchParams(search).get("mode");
    return m === "editor" || m === "captions" ? m : null;
  } catch {
    return null;
  }
}
