"use client";

import type { CaptionDoc } from "@capseasy/shared";
import { clipDocForSegment } from "@motion-ai/caption-engine/core";
import { studioService } from "@/services/studio";
import { getLocalVideo, saveLocalVideo } from "@/features/upload/localVideos";
import { clampCropWindow, type CropWindow } from "./reframe";

/** The shortest clip a user can dial in by hand (proposals themselves target 15–60s). */
export const CLIP_MIN_MS = 3000;

/** m:ss for a millisecond instant (0:32, 1:05, 12:40). */
export function fmtClipTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

/** "0:32–1:05" — the range label used in lists and in the clip project's title. */
export function fmtClipRange(startMs: number, endMs: number): string {
  return `${fmtClipTime(startMs)}–${fmtClipTime(endMs)}`;
}

/**
 * Clamp a hand-adjusted range to the media: both edges inside [0, mediaDurationMs] (an unknown
 * duration, 0, only clamps at 0), start before end, and at least CLIP_MIN_MS long where the
 * media leaves room for that.
 */
export function clampClipRange(range: { startMs: number; endMs: number }, mediaDurationMs: number): { startMs: number; endMs: number } {
  const max = mediaDurationMs > 0 ? Math.round(mediaDurationMs) : Number.POSITIVE_INFINITY;
  let startMs = Math.min(Math.max(0, Math.round(range.startMs)), max);
  let endMs = Math.min(Math.max(0, Math.round(range.endMs)), max);
  if (endMs <= startMs) endMs = Math.min(max, startMs + CLIP_MIN_MS);
  if (endMs - startMs < CLIP_MIN_MS) {
    // widen the end first, then pull the start back — whichever the media leaves room for
    endMs = Math.min(max, startMs + CLIP_MIN_MS);
    if (endMs - startMs < CLIP_MIN_MS) startMs = Math.max(0, endMs - CLIP_MIN_MS);
  }
  return { startMs, endMs };
}

/** The clip project's title: the source title plus its range, capped at the 120-char project limit. */
export function clipProjectTitle(sourceTitle: string, startMs: number, endMs: number): string {
  const suffix = ` · Clip ${fmtClipRange(startMs, endMs)}`;
  const base = (sourceTitle || "Untitled project").trim();
  return `${base.slice(0, Math.max(1, 120 - suffix.length))}${suffix}`;
}

/**
 * Create the clip project for one segment of a transcribed source project:
 * the shifted caption doc + clip range go to the clips API (which copies the project and its
 * video row), then the source video's on-device bytes are copied to the new video id so the
 * clip project opens with its video attached — same file, never re-encoded or cut; the range
 * is metadata. When the source video is not on this device there is nothing to copy and the
 * clip project will ask for the file again, exactly like a duplicated project does.
 */
export async function createClipProject(input: {
  sourceProjectId: string;
  sourceTitle: string;
  sourceVideoId: string | null;
  doc: CaptionDoc;
  startMs: number;
  endMs: number;
  /**
   * A title already generated for this clip (clipTitle.ts, via the Phase-3 routing) and
   * confirmed by the user in the creation flow. When absent, the plain range title is
   * used — exactly the pre-Phase-5 behaviour.
   */
  title?: string;
  /**
   * The 9:16 crop window the user chose for this clip (reframe.ts), when the clip is
   * being reframed vertical. The clips API re-derives the stored transform from the
   * window and the video row's own dimensions; when absent, no reframing is stored.
   */
  reframeWindow?: CropWindow;
}): Promise<{ projectId: string; videoCopied: boolean }> {
  const doc = clipDocForSegment(input.doc, { startMs: input.startMs, endMs: input.endMs });
  const chosenTitle = input.title?.trim().slice(0, 120).trim();
  const created = await studioService.createClip(input.sourceProjectId, {
    title: chosenTitle || clipProjectTitle(input.sourceTitle, input.startMs, input.endMs),
    startMs: input.startMs,
    endMs: input.endMs,
    doc,
    ...(input.reframeWindow ? { reframe: clampCropWindow(input.reframeWindow) } : {}),
  });
  let videoCopied = false;
  if (created.videoId && input.sourceVideoId && created.videoId !== input.sourceVideoId) {
    const blob = await getLocalVideo(input.sourceVideoId);
    if (blob) {
      await saveLocalVideo(created.videoId, blob);
      videoCopied = true;
    }
  }
  return { projectId: created.project.id, videoCopied };
}
