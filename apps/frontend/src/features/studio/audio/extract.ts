import { newId } from "@capseasy/shared";
import { decodeAudioRange } from "./decode";
import { encodeWavBlob } from "./denoise";
import { MIX_SAMPLE_RATE } from "./mixdown";
import type { MediaAssetRecord } from "../mediaStore";

/**
 * Package 4 item J1 — EXTRACT AUDIO: the project's video sound as a real WAV file.
 *
 * Pipeline (all on-device, all existing machinery): decodeAudioRange decodes the
 * source blob's primary audio track to 48 kHz stereo f32 PCM (Mediabunny), and
 * encodeWavBlob — the same Mediabunny WAV writer the noise-suppression derived
 * asset uses — writes it out. Returns null when the source has NO decodable audio
 * track: the caller surfaces that honestly and offers nothing.
 *
 * WAV is the format the stack supports losslessly end-to-end (decode + encode both
 * proven by the A12 denoise asset); no lossy encoder is wired in this codebase, so
 * none is faked here.
 */
export interface ExtractedAudio {
  blob: Blob;
  durationMs: number;
  sampleRate: number;
}

export async function extractAudioWav(sourceBlob: Blob): Promise<ExtractedAudio | null> {
  const decoded = await decodeAudioRange(sourceBlob, null, MIX_SAMPLE_RATE);
  if (!decoded || decoded.channels[0].length === 0) return null;
  const blob = await encodeWavBlob(decoded.channels, decoded.sampleRate);
  return {
    blob,
    durationMs: Math.round((decoded.channels[0].length / decoded.sampleRate) * 1000),
    sampleRate: decoded.sampleRate,
  };
}

/** The extracted file's name: the source's base name + " — audio.wav". */
export function extractedAudioName(sourceName: string): string {
  const base = (sourceName || "").replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  return base ? `${base} — audio.wav` : "Extracted audio.wav";
}

/** The media-bin record for an extracted WAV (the derived-asset record pattern). */
export function extractedAudioAssetRecord(input: {
  projectId: string;
  blob: Blob;
  durationMs: number | null;
  name: string;
}): MediaAssetRecord {
  return {
    id: newId(),
    projectId: input.projectId,
    kind: "audio",
    name: input.name,
    mime: input.blob.type || "audio/wav",
    size: input.blob.size,
    durationMs: input.durationMs,
    width: null,
    height: null,
    blob: input.blob,
    thumb: null,
    peaks: null,
    createdAt: Date.now(),
  };
}
