/**
 * Client helper for the Cloudflare Whisper-large-v3-turbo route
 * (POST /api/v1/transcribe/whisper-turbo).
 *
 * NOT WIRED into the Studio flow: the turbo `words[]` response field is unverified live
 * (the documented turbo output lists `segments`, not `words`), so no call site exists yet.
 * When the route's live shape is verified, the Studio can call `requestCloudTranscription`
 * per chunk and merge with `mergeCloudChunkWords`; until then the in-browser Whisper-base
 * path is the only transcription path, and this module is chunk planning + merge only.
 *
 * Chunking: Whisper works in 30 s windows, so audio is cut into 28 s chunks with a 2 s
 * overlap. A naive cut splits words at the boundary — the overlap plus the midpoint rule
 * in mergeCloudChunkWords keeps each word exactly once, from the chunk whose side of the
 * overlap midpoint the word starts on.
 */

import { apiClient } from "@/services/api-client";

export const CLOUD_CHUNK_MS = 28_000;
export const CLOUD_OVERLAP_MS = 2_000;

/** One 28 s window of the clip (absolute ms on the clip clock). */
export interface CloudChunk {
  startMs: number;
  endMs: number;
}

/** A timed word on the clip clock (the route's wire shape). */
export interface CloudWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CloudTranscription {
  configured: boolean;
  text: string;
  words: CloudWord[];
  segments: { text: string; startMs: number; endMs: number }[];
  wordTimestamps: boolean;
  segmentTimestamps: boolean;
}

/** Cut `durationMs` of audio into 28 s chunks with a 2 s overlap (no chunk for no audio). */
export function planCloudChunks(durationMs: number): CloudChunk[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  const chunks: CloudChunk[] = [];
  let start = 0;
  while (start < durationMs) {
    const end = Math.min(start + CLOUD_CHUNK_MS, durationMs);
    chunks.push({ startMs: start, endMs: end });
    if (end >= durationMs) break;
    start = end - CLOUD_OVERLAP_MS;
  }
  return chunks;
}

/**
 * Merge per-chunk word lists into one timeline. For each overlap, the boundary sits at
 * its midpoint: a word belongs to the earlier chunk when it starts before the midpoint,
 * to the later chunk otherwise. Exact duplicates are dropped, the result is sorted by
 * start, and a word that would overlap the previous one is dropped (monotonicity).
 */
export function mergeCloudChunkWords(
  chunks: { startMs: number; endMs: number; words: CloudWord[] }[],
): CloudWord[] {
  const kept: CloudWord[] = [];
  chunks.forEach((chunk, i) => {
    const next = chunks[i + 1];
    const boundary = next ? next.startMs + CLOUD_OVERLAP_MS / 2 : Infinity;
    for (const w of chunk.words) {
      if (w.startMs >= boundary) continue;
      kept.push(w);
    }
  });
  kept.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const out: CloudWord[] = [];
  const seen = new Set<string>();
  for (const w of kept) {
    const key = `${w.startMs}|${w.text}`;
    if (seen.has(key)) continue;
    const prev = out[out.length - 1];
    if (prev && w.startMs < prev.endMs) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export interface CloudTranscriptionRequest {
  /** Base64 audio for ONE chunk (up to ~30 s). */
  audioBase64: string;
  language?: string;
  /** Offset (ms) of this chunk inside the full clip. */
  chunkStartMs?: number;
  /** Length (ms) of this chunk's audio, when known. */
  chunkDurationMs?: number;
}

/** One chunk through the turbo route (authed apiClient call). No call site yet — see above. */
export async function requestCloudTranscription(req: CloudTranscriptionRequest): Promise<CloudTranscription> {
  return apiClient.post<CloudTranscription>("/transcribe/whisper-turbo", { json: req });
}
