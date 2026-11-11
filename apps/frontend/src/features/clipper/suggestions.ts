import type { OverlayItem } from "@capseasy/shared";
import { makeSocialOverlay, makeTextOverlay } from "../studio/panels/overlayItems";
import type { RankedClipProposal } from "./clipper";

/**
 * Package 3 item I.3 — ELEMENT SUGGESTIONS for a clip proposal.
 *
 * Deterministic rules over the proposal's measured signals — no AI, no scores:
 *   1. Hook text — ALWAYS: the clip's first four spoken words as a text overlay at 0s.
 *   2. Lower third — when the clip has a (generated/confirmed) title: the title on the
 *      lower-third-bar social graphic at 1.2s.
 *   3. Subscribe cursor card — when the clip runs ≥ 20 s: the cursor-subscribe graphic
 *      near the end (6 s before the end, or 11 s when a follow card takes the end slot).
 *   4. Follow card — when the proposal ends within 5 s of the source's end (an outro
 *      position): the follow-card graphic in the last 5 s.
 *   5. Like pop — fills up to a minimum of two suggestions (short/quiet clips), and is
 *      also offered when a hook was detected in the first 3 s (signals.hook).
 * The list is capped at four. Every item's times are CLIP-RELATIVE (the new project's
 * timeline starts at 0). Suggestions are only ever PLACED when the user ticks them —
 * this module merely builds the candidates.
 */
export interface ElementSuggestion {
  id: string;
  label: string;
  item: OverlayItem;
}

const LONG_CLIP_MS = 20_000;
const OUTRO_WINDOW_MS = 5_000;

export function elementSuggestionsFor(
  p: RankedClipProposal,
  opts: { mediaDurationMs: number; title?: string | null },
): ElementSuggestion[] {
  const dur = Math.max(1, p.endMs - p.startMs);
  const out: ElementSuggestion[] = [];
  const place = (item: OverlayItem, startMs: number, lengthMs: number): OverlayItem => ({
    ...item,
    startMs: Math.max(0, Math.min(startMs, Math.max(0, dur - 500))),
    endMs: Math.max(Math.min(startMs + lengthMs, dur), Math.min(startMs + 500, dur)),
  });

  // 1 — hook text (always)
  const hookText = p.text.split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  if (hookText) {
    const item = makeTextOverlay(0, dur);
    out.push({ id: "hook", label: `Hook text — “${hookText}”`, item: place({ ...item, text: hookText, y: 0.3 }, 0, 2600) });
  }

  // 2 — lower third with the clip's title
  const title = opts.title?.trim();
  if (title) {
    const item = makeSocialOverlay("lower-third-bar", 1200, dur);
    out.push({ id: "lower-third", label: "Lower third with the clip title", item: place({ ...item, text: title }, 1200, 4000) });
  }

  // 4 is computed before 3: a follow card in the end slot pushes subscribe earlier
  const isOutro = opts.mediaDurationMs > 0 && opts.mediaDurationMs - p.endMs <= OUTRO_WINDOW_MS;

  // 3 — subscribe cursor card on longer clips
  if (dur >= LONG_CLIP_MS) {
    const item = makeSocialOverlay("cursor-subscribe", 0, dur);
    out.push({ id: "subscribe", label: "Subscribe button with cursor", item: place(item, dur - (isOutro ? 11_000 : 6_000), 4500) });
  }

  // 4 — follow card at an outro
  if (isOutro && dur >= 6_000) {
    const item = makeSocialOverlay("follow-banner", 0, dur);
    out.push({ id: "follow", label: "Follow card at the end", item: place(item, dur - 5_000, 4_000) });
  }

  // 5 — like pop: hook-detected clips, and any clip that would otherwise have < 2
  if ((p.signals.hook.detected || out.length < 2) && dur >= 4_000) {
    const item = makeSocialOverlay("like-pop", 0, dur);
    out.push({ id: "like", label: "Like pop mid-clip", item: place(item, Math.floor(dur / 2), 3000) });
  }

  return out.slice(0, 4);
}
