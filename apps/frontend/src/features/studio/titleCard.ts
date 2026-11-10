import type { CaptionDoc, OverlayItem } from "@capseasy/shared";
import { generateClipTitle, type ClipTitleResult } from "../clipper/clipTitle";
import type { GenerationDeps } from "../create/service";
import type { EditorComposition } from "./compositionDoc";
import { makeTextOverlay } from "./panels/overlayItems";

/**
 * A5 (editor half) — one-click Auto title card (Phase 5).
 *
 * The title text comes from the project's transcript through the SAME Phase-3
 * routing the clipper title uses: this module REUSES `generateClipTitle`
 * (features/clipper/clipTitle.ts) directly — its generation core imports
 * cleanly into the studio (it is a pure wrapper over `generateContent`), so
 * there is no second routing implementation to keep in sync. The project's
 * whole transcript is the "segment text", the project title is the fallback
 * topic, and the range is the whole project. The returned `source` is the
 * routing outcome's source and the confirmation UI shows it with the existing
 * `SourceBadge` — a template-engine title is badged "Template engine", never
 * presented as AI, exactly like the clipper half.
 *
 * Placement is a NORMAL editable text overlay at the project start, built by
 * the existing overlay creation path (`makeTextOverlay`, the same factory the
 * Text panel's "Add text" uses — same kind, same default styling family, with
 * a larger font size as the only title treatment), and appended to the editor
 * composition with {@link appendTitleCardClip}. From there it is
 * indistinguishable from any other overlay: it projects to
 * `settings.overlays` through `projectComposition`, it can be moved, retimed,
 * restyled and deleted with the ordinary overlay tools, and the add commits
 * as ONE undo step (the StudioPage commit path) — undo removes it like any
 * overlay add.
 */

export type TitleCardResult = ClipTitleResult;

/** The transcript text offered to the routing: visible words in doc order, whitespace collapsed. */
export function transcriptTextOf(doc: Pick<CaptionDoc, "words">): string {
  return doc.words
    .filter((w) => !w.hidden)
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate the title-card title for a project through the Phase-3 routing
 * (cloud free AI → on-device model → template engine, first success wins,
 * source reported honestly — see clipTitle.ts). `deps` is assembled by the
 * caller exactly as the clipper assembles it (`useClipTitleDeps`).
 */
export async function generateTitleCardTitle(
  input: { sourceTitle: string; transcriptText: string; durationMs: number },
  deps: GenerationDeps,
): Promise<TitleCardResult> {
  return generateClipTitle(
    {
      sourceTitle: input.sourceTitle,
      segmentText: input.transcriptText,
      startMs: 0,
      endMs: Math.max(0, Math.round(input.durationMs)),
    },
    deps,
  );
}

/** Title-card type treatment: the text overlay's default font size is 64; a title card reads at 84. */
export const TITLE_CARD_FONT_SIZE = 84;

/**
 * Build the title-card overlay: a normal `makeTextOverlay` item placed at the
 * project start (t=0, the factory's standard 3 s window, clamped to the
 * project duration by the factory), carrying the (confirmed, possibly edited)
 * title text. An empty/whitespace title yields the factory's placeholder text
 * rather than an invisible overlay.
 */
export function makeTitleCardOverlay(title: string, durationMs: number): OverlayItem {
  const item = makeTextOverlay(0, durationMs);
  const text = title.trim().replace(/\s+/g, " ").slice(0, 500).trim();
  return { ...item, text: text || item.text!, fontSize: TITLE_CARD_FONT_SIZE };
}

/**
 * Append a title-card overlay to the editor composition as an overlay clip —
 * the same clip shape `overlayClipsOf` builds from a stored item (clip id ==
 * overlay id, window synced), inserted in timeline order (startMs, then id;
 * a title card at t=0 sorts first among same-start clips only by id, matching
 * the Stage-A ordering). Pure: the input composition is not mutated, and
 * `projectComposition` on the result writes the item into
 * `settings.overlays` like any overlay add. Removing it is the ordinary
 * `deleteOverlayClip` op.
 */
export function appendTitleCardClip(comp: EditorComposition, item: OverlayItem): EditorComposition {
  const clip = {
    id: item.id,
    kind: item.kind,
    startMs: item.startMs,
    endMs: item.endMs,
    durationMs: Math.max(0, item.endMs - item.startMs),
    overlay: item,
  };
  const overlayClips = [...comp.overlayClips, clip].sort(
    (a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { ...comp, overlayClips };
}
