/**
 * AI Edit panel logic (pure): prompt validation, generated-file naming and
 * the media-bin handoff for a Puter result. Kept free of React and the Puter
 * SDK so it can be unit-tested; the panel component (`AiGeneratePanel.tsx`)
 * owns the SDK calls and the Studio wiring.
 *
 * The panel generates media with Puter.js (visitor's own free Puter account,
 * User-Pays — never the owner's cost) and places it on the timeline through
 * the existing systems: images as overlays (makeImageOverlay), videos as
 * segments (insertVideoSegmentAt). No new export pipeline: both render
 * through the existing Remotion composition paths.
 */

import type { MediaAssetRecord } from "./mediaStore";

export type AiGenerateMode = "image" | "video";

/** Same modest video defaults as /ai-generator: 5 s at 720P keeps a visitor's free allowance lasting. */
export const AI_VIDEO_SECONDS = 5;
export const AI_VIDEO_SIZE = "720P";
export const AI_VIDEO_FALLBACK_MS = AI_VIDEO_SECONDS * 1000;

/** Prompts are short descriptions, not documents. */
export const AI_PROMPT_MAX_LENGTH = 1000;

/** The prompt error to show, or null when the prompt is usable. */
export function validateAiGeneratePrompt(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (!trimmed) return "Describe what you want first.";
  if (trimmed.length > AI_PROMPT_MAX_LENGTH) return "Keep the prompt under 1000 characters.";
  return null;
}

/** A unique media-bin name for a generated file, so the stored record can be found again after import. */
export function aiGenerateFileName(mode: AiGenerateMode, nowMs: number): string {
  return mode === "image" ? `AI image ${nowMs}.png` : `AI video ${nowMs}.mp4`;
}

/** The File to import for a generated result, or null when the bytes are empty. */
export function aiGenerateFile(mode: AiGenerateMode, blob: Blob, nowMs: number): File | null {
  if (blob.size <= 0) return null;
  const fallbackType = mode === "image" ? "image/png" : "video/mp4";
  return new File([blob], aiGenerateFileName(mode, nowMs), { type: blob.type || fallbackType });
}

/** The stored record for a just-imported generated file, matched by its unique name. */
export function findImportedAsset(records: readonly MediaAssetRecord[], fileName: string): MediaAssetRecord | null {
  return records.find((r) => r.name === fileName) ?? null;
}

/** How long the inserted video segment plays: the probed length when known, else the requested clip length. */
export function aiVideoInsertDurationMs(record: Pick<MediaAssetRecord, "durationMs">, fallbackMs: number = AI_VIDEO_FALLBACK_MS): number {
  return record.durationMs && record.durationMs > 0 ? record.durationMs : fallbackMs;
}

/** Playhead time as m:ss for the "Added at …" confirmation. */
export function formatAtMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}
