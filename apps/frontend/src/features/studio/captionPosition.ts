import { setCardPosition } from "@motion-ai/caption-engine/core";
import type { CaptionDoc, CaptionStyleV2, Page } from "@capseasy/shared";
import { layoutBox, scaleOf, type Canvas } from "@capseasy/templates";

/**
 * Per-card caption position (owner 2026-11-16): move one card's caption to a
 * different place on screen, without moving the rest.
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
