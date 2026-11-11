/**
 * Low-spec safety checks (Phase 2B). Every check reuses the existing
 * constrained-device signal — `isConstrainedDevice()` in
 * features/transcribe/runtime.ts (phone UA, or `navigator.deviceMemory <= 4`),
 * the same signal that already forces single-thread WASM transcription.
 * No new heuristic is invented here.
 */
import { isConstrainedDevice } from "../transcribe/runtime";

/** The device's reported memory in GB, or null when the browser does not report it (e.g. iOS Safari). */
export function deviceMemoryGb(): number | null {
  if (typeof navigator === "undefined") return null;
  const m = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof m === "number" ? m : null;
}

/**
 * One-line reason 4K export is unavailable on this device, or null when 4K is
 * available. Names the reported memory when the browser reports it; phones
 * without a memory signal get the phone wording.
 */
export function fourKBlockReason(): string | null {
  if (!isConstrainedDevice()) return null;
  const mem = deviceMemoryGb();
  if (mem !== null) return `4K is off on this device — it reports ${mem} GB of memory and a 4K export needs more. 2K is the highest available here.`;
  return "4K is off on phones — a 4K export needs more memory than a phone tab can rely on. 2K is the highest available here.";
}

/** A clip longer than this gets a warning before transcription starts on a constrained device. */
export const LONG_CLIP_WARN_MS = 2 * 60 * 1000;

/**
 * One-line warning before transcribing a long clip on a constrained device, or
 * null when no warning is needed. The caller shows it with a proceed-anyway
 * choice; this function never blocks on its own.
 */
export function transcribePreflightWarning(durationMs: number): string | null {
  if (!isConstrainedDevice() || durationMs <= LONG_CLIP_WARN_MS) return null;
  const mins = Math.round(durationMs / 60000);
  return `This device has limited memory — a ${mins}-minute clip may run slowly or stop part-way. Captions save as they are written, so you can pick up where it stops.`;
}

/** One-line note before a 2K export on a constrained device, or null. */
export function exportPreflightNote(resolution: string): string | null {
  if (!isConstrainedDevice() || resolution !== "2k") return null;
  return "2K may be slow on this device — 1080p is the faster choice here.";
}
