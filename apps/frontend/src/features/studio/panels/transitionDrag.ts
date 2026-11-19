/**
 * Drag source format for transitions (phase 2: the timeline drop target reads this).
 *   dataTransfer type: "application/x-captionit-transition"
 *   payload (JSON): { "type": "<registry id>", "durationMs": <number> }
 *   effectAllowed: "copy". A plain "text/plain" copy of the transition name is
 *   set alongside for debugging only — the drop target must read the MIME above.
 * Click-to-apply still works; dropping on a cut marker applies at that cut.
 *
 * Lives in its own module (CAP-P01): Timeline needs only this MIME + payload
 * type, so it must not import the whole TransitionsPanel component — that
 * import kept the panel (and its preview code) in the Studio's first-load
 * bundle even after the panel itself went dynamic in StudioPage.
 */
export const TRANSITION_DRAG_MIME = "application/x-captionit-transition";

export interface TransitionDragPayload {
  type: string;
  durationMs: number;
}
