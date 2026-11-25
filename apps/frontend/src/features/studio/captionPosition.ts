import { setCardPosition } from "@motion-ai/caption-engine/core";
import type { CaptionDoc, CaptionStyleV2, Page } from "@capseasy/shared";
import { layoutBox, scaleOf, type Canvas } from "@capseasy/templates";

/**
 * Caption position (owner 2026-11-16): where captions sit on screen.
 *
 * DEFAULT (owner 2026-11-16, second correction): moving a caption moves ALL
 * of them — the drag writes the GLOBAL style.position, never an override, so
 * a new user is never confused by one caption moving and the rest staying.
 * Per-card overrides are the SELECTIVE mechanism only: when ANY caption
 * cards are picked (Select All, multi drag-select, or Shift-click on the
 * timeline), a drag writes the same override onto just those cards; every
 * other card keeps its position. (Owner 2026-11-25: the old "2+ cards"
 * threshold is gone — exactly one picked card moves on its own now, and an
 * empty selection is the only thing that moves globally.)
 *
 * Storage: the override lives on the card in the project doc
 * (`doc.cards[firstWordId].position`, via the engine's setCardPosition) — the
 * SAME field the render path already reads. derivePages copies it onto the
 * derived Page, and layoutBox resolves `page.position ?? style.position`, so
 * the preview Player, the browser export and the server render all show the
 * override with no render-path change. Unset (null/absent) = the project's
 * global style.position (the platform default for that project), so existing
 * projects and exports are unchanged when no override is set.
 *
 * Clamping: the caption CENTRE is clamped to [0.05, 0.95] of the frame on both
 * axes (the same range as the StudioPlayer position grip) — the centre can
 * never leave the frame. The caption is NOT forced inside the platform safe
 * zone: the owner may want a caption anywhere, and the safe-zone guide stays
 * a preview-only guide.
 *
 * Third correction (owner 2026-11-16): a global move moves EVERYTHING
 * together. A card with an override keeps its relative offset — the move
 * shifts the override by the same delta as the global position
 * (shiftCardPositionsByGlobalDelta), clamped to the frame band. No
 * overrides means only style.position changes, exactly as before.
 */

export interface CaptionPosition {
  x: number;
  y: number;
}

/** The caption centre can never leave this band of the frame. */
export const CAPTION_POSITION_MIN = 0.05;
export const CAPTION_POSITION_MAX = 0.95;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Clamp a position to the frame band, rounded to 3 decimals (overlay-drag convention). */
export function clampCaptionPosition(p: CaptionPosition): CaptionPosition {
  const clamp = (v: number) => Math.min(CAPTION_POSITION_MAX, Math.max(CAPTION_POSITION_MIN, v));
  return { x: round3(clamp(p.x)), y: round3(clamp(p.y)) };
}

/** Where this card's caption actually sits: its override, else the global style position. */
export function effectiveCardPosition(page: Page | null, style: CaptionStyleV2): CaptionPosition {
  return page?.position ?? style.position;
}

/**
 * Set the current card's override, as a pure doc transform. Returns the SAME
 * doc reference when there is nothing to do (no card, no first word, or the
 * rounded position already equals the card's effective position) — so the
 * editor's edit() no-ops and records no undo step for a clamped-to-zero drag.
 */
export function setCurrentCardPosition(doc: CaptionDoc, page: Page | null, style: CaptionStyleV2, p: CaptionPosition): CaptionDoc {
  const firstWordId = page?.words[0]?.id;
  if (!page || !firstWordId) return doc;
  const next = clampCaptionPosition(p);
  const cur = page.position ?? style.position;
  if (next.x === cur.x && next.y === cur.y) return doc;
  return setCardPosition(doc, firstWordId, next);
}

/** Clear the current card's override (back to the global position). Same no-op rule. */
export function clearCurrentCardPosition(doc: CaptionDoc, page: Page | null): CaptionDoc {
  const firstWordId = page?.words[0]?.id;
  if (!page || !firstWordId || page.position == null) return doc;
  return setCardPosition(doc, firstWordId, null);
}

/**
 * Selective move (owner 2026-11-16): put the SELECTED cards at one position —
 * the same absolute position on each, as its own override. Cards outside the
 * selection are untouched. A pure doc transform: one s.edit call is one undo
 * step. Returns the SAME doc reference when every selected card is already
 * there, so a clamped-to-zero drag records no undo step.
 */
export function setSelectedCardsPosition(doc: CaptionDoc, pages: Page[], style: CaptionStyleV2, selectedPageIds: ReadonlySet<string>, p: CaptionPosition): CaptionDoc {
  const next = clampCaptionPosition(p);
  let out = doc;
  for (const page of pages) {
    if (!selectedPageIds.has(page.id)) continue;
    const firstWordId = page.words[0]?.id;
    if (!firstWordId) continue;
    const cur = out.cards[firstWordId]?.position ?? style.position;
    if (cur.x === next.x && cur.y === next.y) continue;
    out = setCardPosition(out, firstWordId, next);
  }
  return out;
}

/**
 * Delta rule (owner 2026-11-16, third correction): a global move moves
 * EVERYTHING together. `oldGlobal` -> `newGlobal` is the global position
 * change (already clamped to the frame band); every card WITH an override
 * shifts by the SAME delta, so its relative offset to the group is kept.
 * Cards without an override follow the new global position on their own
 * (style.position) and are not touched here. Returns the SAME doc when
 * nothing changes — no overrides, a zero delta, or every shift clamped to
 * a no-op — so a plain global move writes no overrides at all.
 */
export function shiftCardPositionsByGlobalDelta(
  doc: CaptionDoc,
  oldGlobal: { x: number; y: number },
  newGlobal: { x: number; y: number },
): CaptionDoc {
  const delta = { x: round3(newGlobal.x - oldGlobal.x), y: round3(newGlobal.y - oldGlobal.y) };
  if (delta.x === 0 && delta.y === 0) return doc;
  const cards = { ...doc.cards };
  let changed = false;
  for (const [id, card] of Object.entries(doc.cards)) {
    const pos = card?.position;
    if (!pos) continue;
    const shifted = clampCaptionPosition({ x: pos.x + delta.x, y: pos.y + delta.y });
    if (shifted.x === pos.x && shifted.y === pos.y) continue;
    cards[id] = { ...card, position: shifted };
    changed = true;
  }
  if (!changed) return doc;
  return { ...doc, cards };
}

/**
 * Selection nudge (owner 2026-11-16, third correction): the grip arrow keys
 * move by one STEP, not to an absolute spot, so a nudge shifts each selected
 * card by the step (relative), keeping their offsets — unlike the drag,
 * which writes one absolute position onto all selected cards. A selected
 * card with no override gets one at its effective position + the step.
 * Returns the SAME doc when the selection is empty, the step is zero, or
 * every shift clamps to a no-op.
 */
export function shiftSelectedCardsByDelta(
  doc: CaptionDoc,
  pages: Page[],
  style: CaptionStyleV2,
  selectedPageIds: ReadonlySet<string>,
  delta: { dx: number; dy: number },
): CaptionDoc {
  if (selectedPageIds.size === 0) return doc;
  if (delta.dx === 0 && delta.dy === 0) return doc;
  const cards = { ...doc.cards };
  let changed = false;
  for (const page of pages) {
    if (!selectedPageIds.has(page.id)) continue;
    const firstWord = page.words[0];
    if (!firstWord) continue;
    // the doc is the source of truth (the page is derived from it) — the
    // same read setSelectedCardsPosition uses
    const current = doc.cards[firstWord.id]?.position;
    const effective = current ?? style.position;
    const shifted = clampCaptionPosition({ x: effective.x + delta.dx, y: effective.y + delta.dy });
    if (current && shifted.x === current.x && shifted.y === current.y) continue;
    if (!current && shifted.x === style.position.x && shifted.y === style.position.y) continue;
    cards[firstWord.id] = { ...doc.cards[firstWord.id], position: shifted };
    changed = true;
  }
  if (!changed) return doc;
  return { ...doc, cards };
}

/**
 * Bulk (owner 2026-11-16): put EVERY caption at one position — the current
 * card's effective position, copied onto every card as its own override. The
 * cards are the derived pages (each page's first word is its card key). A
 * pure doc transform: one s.edit call is one undo step. Returns the SAME doc
 * reference when every card is already there, so a no-op click records no
 * undo step.
 */
export function applyPositionToAllCards(doc: CaptionDoc, pages: Page[], style: CaptionStyleV2, p: CaptionPosition): CaptionDoc {
  const next = clampCaptionPosition(p);
  let out = doc;
  for (const page of pages) {
    const firstWordId = page.words[0]?.id;
    if (!firstWordId) continue;
    const cur = out.cards[firstWordId]?.position ?? style.position;
    if (cur.x === next.x && cur.y === next.y) continue;
    out = setCardPosition(out, firstWordId, next);
  }
  return out;
}

/**
 * Bulk reset: clear EVERY card's override so all cards follow the global
 * style position again. Same no-op rule — cards without an entry have no
 * override to clear.
 */
export function clearAllCardPositions(doc: CaptionDoc): CaptionDoc {
  let out = doc;
  for (const [firstWordId, card] of Object.entries(doc.cards)) {
    if (card?.position == null) continue;
    out = setCardPosition(out, firstWordId, null);
  }
  return out;
}

/**
 * Scoped reset (owner 2026-11-25): clear the overrides of the SELECTED
 * cards only, so all of them follow the global style position again, while
 * every unselected card keeps its override. A pure doc transform: one s.edit
 * call is one undo step. Returns the SAME doc reference when no selected card
 * has an override to clear, so a no-op click records no undo step.
 */
export function clearSelectedCardPositions(doc: CaptionDoc, pages: Page[], selectedPageIds: ReadonlySet<string>): CaptionDoc {
  if (selectedPageIds.size === 0) return doc;
  let out = doc;
  for (const page of pages) {
    if (!selectedPageIds.has(page.id)) continue;
    const firstWordId = page.words[0]?.id;
    if (!firstWordId) continue;
    if (out.cards[firstWordId]?.position == null) continue;
    out = setCardPosition(out, firstWordId, null);
  }
  return out;
}

/**
 * The current card's caption box as frame fractions (centre + size), for the
 * preview drag hit box. Width comes from layoutBox (the real laid-out box);
 * height is an estimate from the line count × font size, padded — the box
 * only places the hit area and catches the pointer, it is never a render input.
 */
export function captionBoxFractions(
  page: Page,
  style: CaptionStyleV2,
  canvas: Canvas,
): { x: number; y: number; w: number; h: number } {
  const box = layoutBox(style, canvas, page.position);
  const sc = scaleOf(canvas);
  const lineH = style.fontSize * sc * 1.6;
  const hPx = Math.max(lineH, page.lines.length * lineH) + 24 * sc;
  return {
    x: box.cx / canvas.width,
    y: box.cy / canvas.height,
    w: Math.min(1, box.width / canvas.width),
    h: Math.min(1, hPx / canvas.height),
  };
}

/** Pointer position as frame fractions (the StudioPlayer grip's conversion). */
export function fractionFromPointer(clientX: number, clientY: number, rect: DOMRect): CaptionPosition {
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

/** The caption's font size in frame pixels — the drag ghost's text size. */
export function captionFontPx(style: CaptionStyleV2, canvas: Canvas): number {
  return style.fontSize * scaleOf(canvas);
}
