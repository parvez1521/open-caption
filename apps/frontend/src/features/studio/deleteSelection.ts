/**
 * What Delete / Backspace should remove in the studio (owner bug 2026-11-10: "delete nahi ho
 * raha" — the key had no handler at all). Pure decision, kept separate from StudioPage so the
 * priority order is unit-testable:
 *
 *   1. the multi-word drag selection (caption list + timeline share it),
 *   2. the selected overlay (timeline block / Elements selection),
 *   3. the selected video segment — ONLY when it can ripple-delete (any segment of a
 *      multi-segment composition, middle ones included since Run 2; the only segment of a
 *      single-segment composition cannot, so the key stays inert rather than falling
 *      through to a selection the user isn't looking at),
 *   4. the selected marker,
 *   5. the single selected word.
 *
 * `blocked` covers the states where the key must stay inert: a modal or conflict dialog is open,
 * or a transcription session is live and the captions are locked.
 */
export type DeleteAction =
  | { kind: "words"; ids: string[] }
  | { kind: "overlay"; id: string }
  | { kind: "videoSegment"; id: string }
  | { kind: "marker"; id: string }
  | { kind: "word"; id: string };

export function resolveDeleteAction(input: {
  blocked: boolean;
  selectedWordIds: Iterable<string>;
  selectedOverlayId: string | null;
  selectedId: string | null;
  selectedVideoClipId?: string | null;
  canRippleDeleteVideoSegment?: boolean;
  selectedMarkerId?: string | null;
}): DeleteAction | null {
  if (input.blocked) return null;
  const ids = [...input.selectedWordIds];
  if (ids.length > 0) return { kind: "words", ids };
  if (input.selectedOverlayId) return { kind: "overlay", id: input.selectedOverlayId };
  if (input.selectedVideoClipId) {
    return input.canRippleDeleteVideoSegment ? { kind: "videoSegment", id: input.selectedVideoClipId } : null;
  }
  if (input.selectedMarkerId) return { kind: "marker", id: input.selectedMarkerId };
  if (input.selectedId) return { kind: "word", id: input.selectedId };
  return null;
}
