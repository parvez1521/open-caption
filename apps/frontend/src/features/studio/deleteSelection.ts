/**
 * What Delete / Backspace should remove in the studio (owner bug 2026-11-10: "delete nahi ho
 * raha" — the key had no handler at all). Pure decision, kept separate from StudioPage so the
 * priority order is unit-testable:
 *
 *   1. the multi-word drag selection (caption list + timeline share it),
 *   2. the selected overlay (timeline block / Elements selection),
 *   3. the single selected word.
 *
 * `blocked` covers the states where the key must stay inert: a modal or conflict dialog is open,
 * or a transcription session is live and the captions are locked.
 */
export type DeleteAction =
  | { kind: "words"; ids: string[] }
  | { kind: "overlay"; id: string }
  | { kind: "word"; id: string };

export function resolveDeleteAction(input: {
  blocked: boolean;
  selectedWordIds: Iterable<string>;
  selectedOverlayId: string | null;
  selectedId: string | null;
}): DeleteAction | null {
  if (input.blocked) return null;
  const ids = [...input.selectedWordIds];
  if (ids.length > 0) return { kind: "words", ids };
  if (input.selectedOverlayId) return { kind: "overlay", id: input.selectedOverlayId };
  if (input.selectedId) return { kind: "word", id: input.selectedId };
  return null;
}
