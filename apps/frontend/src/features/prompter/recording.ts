/**
 * Teleprompter recording (Phase 7, A13) — pure model.
 *
 * Everything testable about record mode lives here: the MediaRecorder
 * format candidates, capability detection with plain-word reasons, take
 * naming / labelling, the media-bin record for a finished take, and the
 * plain-word mapping for camera errors.
 *
 * Pure module: no DOM access except `gatherRecorderCaps`, which only READS
 * the browser globals and is SSR-guarded. The browser machinery itself
 * (getUserMedia, MediaRecorder, the mirror canvas) lives in
 * usePrompterRecorder.ts; the section UI lives in PrompterRecorder.tsx.
 *
 * Honesty rules:
 * - Recording is on-device only. Nothing in this feature uploads a take;
 *   the take only leaves this module when the user explicitly opens it as
 *   a project (through the existing prepare/upload pipeline) or downloads
 *   / discards it.
 * - `mirroredRecording` on a take is the flag that was actually used for
 *   that take's capture, recorded at stop time — never assumed from the
 *   toggle's current position.
 */
import type { MediaAssetRecord } from "@/features/studio/mediaStore";

/* ------------------------------ mime selection ----------------------------- */

/**
 * MediaRecorder formats to try, best first. WebM (VP9, then VP8) is what
 * Chrome/Edge/Firefox record natively; plain WebM and MP4 (Safari) are the
 * fallbacks. The first candidate `MediaRecorder.isTypeSupported` accepts
 * wins — see pickRecorderMime.
 */
export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

/** First candidate the predicate accepts, else null (no usable format). */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (isSupported(candidate)) return candidate;
  }
  return null;
}

/** Human label for a recording mime: "WebM video", "MP4 video", else the raw mime string. */
export function formatLabelForMime(mime: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("webm")) return "WebM video";
  if (m.includes("mp4")) return "MP4 video";
  return mime;
}

/* --------------------------- capability detection -------------------------- */

export interface RecorderCaps {
  mediaDevices: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  secureContext: boolean;
}

/**
 * Whether recording can work at all, plus the plain-word reason when it
 * can't. Supported only when every capability is present; the reason names
 * the FIRST missing piece, checked in this order: secure context, camera
 * access API (mediaDevices / getUserMedia), MediaRecorder.
 */
export function recorderSupport(caps: RecorderCaps): { supported: boolean; reason: string | null } {
  if (!caps.secureContext) return { supported: false, reason: "Recording needs a secure (https) page" };
  if (!caps.mediaDevices || !caps.getUserMedia) return { supported: false, reason: "This browser has no camera access API" };
  if (!caps.mediaRecorder) return { supported: false, reason: "This browser can't record video (no MediaRecorder)" };
  return { supported: true, reason: null };
}

/** Read the real browser capabilities. All false during SSR (no window). */
export function gatherRecorderCaps(): RecorderCaps {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { mediaDevices: false, getUserMedia: false, mediaRecorder: false, secureContext: false };
  }
  return {
    mediaDevices: Boolean(navigator.mediaDevices),
    getUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    mediaRecorder: typeof MediaRecorder !== "undefined",
    secureContext: window.isSecureContext === true,
  };
}

/* ---------------------------------- takes ---------------------------------- */

export interface PrompterTake {
  blob: Blob;
  mime: string;
  /** True when this take was captured through the mirror canvas pipeline. */
  mirroredRecording: boolean;
  durationMs: number;
  fileName: string;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** File extension for a recording mime: "mp4" for mp4, otherwise "webm" (the fallback for anything else). */
function extensionForMime(mime: string): string {
  return (mime ?? "").toLowerCase().includes("mp4") ? "mp4" : "webm";
}

/** `prompter-take-YYYYMMDD-HHmm.<ext>` from the take's local time. */
export function buildTakeFileName(at: Date, mime: string): string {
  const ymd = `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}`;
  const hm = `${pad2(at.getHours())}${pad2(at.getMinutes())}`;
  return `prompter-take-${ymd}-${hm}.${extensionForMime(mime)}`;
}

/**
 * The media-bin record for a finished take, so it also sits in the
 * project's media bin (visible in the Media Library). Dimensions/duration
 * come from the prepared video (the pipeline's probe), not from the raw
 * recorder stamps.
 */
export function buildTakeAssetRecord(
  projectId: string,
  take: PrompterTake,
  dims: { durationMs: number; width: number; height: number },
  id: string,
  createdAt: number,
): MediaAssetRecord {
  return {
    id,
    projectId,
    kind: "video",
    name: take.fileName,
    mime: take.blob.type || take.mime,
    size: take.blob.size,
    durationMs: dims.durationMs,
    width: dims.width,
    height: dims.height,
    blob: take.blob,
    thumb: null,
    peaks: null,
    createdAt,
  };
}

/* ---------------------------------- errors --------------------------------- */

/**
 * Plain-word message for a recording failure. Camera permission failures
 * arrive as DOMExceptions whose `name` carries the cause; anything else
 * falls back to naming the error so the user (and a bug report) can see
 * what actually happened.
 */
export function recorderErrorMessage(err: unknown): string {
  const name =
    err !== null && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string"
      ? (err as { name: string }).name
      : null;
  switch (name) {
    case "NotAllowedError":
      return "Camera and microphone access was blocked. Allow it in your browser's site settings and try again — the prompter above keeps working without recording.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera could be found on this device.";
    case "NotReadableError":
      return "The camera is busy in another app or tab.";
    case "SecurityError":
      return "The browser blocked camera access on this page.";
    default:
      return `Recording couldn't start (${name ?? "unknown error"}).`;
  }
}
