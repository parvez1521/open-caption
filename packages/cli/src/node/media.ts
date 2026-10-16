import { spawn } from "node:child_process";
// Remotion ships ffmpeg/ffprobe with @remotion/renderer, so users need nothing installed (same helpers as the Companion)
import { ffmpegPath, ffprobePath, run } from "@capseasy/companion/src/ffmpeg";
import { CaptionsEasyError } from "../errors";

export const SAMPLE_RATE = 16_000;

export interface MediaInfo {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

const fraction = (s?: string) => {
  if (!s) return 0;
  const [a, b] = s.split("/").map(Number);
  return b ? a! / b : a ?? 0;
};

/** Size (as displayed, rotation applied), frame rate, duration and tracks of a local media file. */
export async function probeMedia(path: string): Promise<MediaInfo> {
  const json = await run(ffprobePath(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]).catch((e) => {
    throw new CaptionsEasyError("NO_VIDEO", `Could not read ${path} as a video: ${e instanceof Error ? e.message : e}`);
  });
  type Stream = {
    codec_type: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    duration?: string;
    tags?: { rotate?: string };
    side_data_list?: { rotation?: number }[];
    disposition?: { attached_pic?: number };
  };
  const j = JSON.parse(json) as { format?: { duration?: string }; streams?: Stream[] };
  const v = j.streams?.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const rotation = Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  const sideways = Math.abs(rotation) % 180 === 90;
  const fps = fraction(v?.avg_frame_rate) || fraction(v?.r_frame_rate) || 30;
  return {
    width: (sideways ? v?.height : v?.width) ?? 0,
    height: (sideways ? v?.width : v?.height) ?? 0,
    fps: Math.min(120, Math.max(1, fps)),
    durationMs: Math.round(Number(j.format?.duration ?? v?.duration ?? 0) * 1000),
    hasAudio: Boolean(j.streams?.some((s) => s.codec_type === "audio")),
    hasVideo: Boolean(v),
  };
}

/** The audio track as 16 kHz mono float samples (what Whisper expects), decoded by Remotion's bundled ffmpeg. */
export function decodeAudio(path: string): Promise<Float32Array> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpegPath(), ["-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s16le", "-f", "wav", "pipe:1"], { windowsHide: true });
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new CaptionsEasyError("NO_AUDIO", `Could not decode the audio of ${path}: ${err.trim() || `ffmpeg exited with ${code}`}`));
      resolvePromise(wavToFloat(Buffer.concat(chunks)));
    });
  });
}

/** 16-bit PCM WAV bytes -> float samples. (Remotion's minimal ffmpeg has the wav muxer but no raw f32le one.) */
export function wavToFloat(buf: Buffer): Float32Array {
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      // piped WAVs carry a placeholder size: the data runs to the end
      const end = size && off + 8 + size <= buf.length ? off + 8 + size : buf.length;
      const n = Math.floor((end - off - 8) / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return out;
    }
    off += 8 + size + (size % 2);
  }
  return new Float32Array(0);
}
