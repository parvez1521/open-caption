import {
  DEFAULT_AUDIO_CLIP_PROCESSORS,
  DEFAULT_AUDIO_DUCKING,
  newId,
  type AudioCleanup,
  type AudioClip,
  type AudioDucking,
  type AudioEq,
  type AudioMaster,
  type AudioTrack,
} from "@capseasy/shared";
import type { EditorComposition } from "./compositionDoc";

/**
 * Phase 4 Run 3 (slice 4.8): pure, immutable ops over the EditorComposition's
 * AUDIO slice (audioTracks / audioClips / audioMaster), following the same
 * conventions as compositionOps.ts:
 * - PURE + IMMUTABLE. An op never mutates its input (nor anything reachable
 *   from it); untouched parts are carried over by reference.
 * - NO-OP = SAME REFERENCE. When an op cannot or need not change anything it
 *   returns the input composition itself, so callers can skip history with a
 *   single `===` check.
 * - IDS come from `newId()` (@capseasy/shared).
 * - TIMES are milliseconds; float inputs are rounded at the op boundary.
 * - A placed clip's used source span is at least {@link MIN_AUDIO_MS}.
 *
 * LOCK RULE (uniform, documented here because every op below follows it):
 * every CLIP op refuses (same-reference no-op) when the clip's own track is
 * locked; `moveAudioClip` additionally refuses when the TARGET track is
 * locked, and `placeAudioClip` refuses when its target track is locked.
 * TRACK ops are NOT blocked by the track's lock — a locked track can still
 * be renamed / re-roled / volume-edited / ducking-edited / unlocked — EXCEPT
 * `removeAudioTrack`, which refuses on a locked track.
 *
 * Audio ops NEVER touch `videoClips` (nor markers / overlays / captions), so
 * the composition's video partition is unaffected by construction and a
 * projectComposition round-trip carries the audio slice verbatim.
 */

export const MIN_AUDIO_MS = 100;

const roundMs = (ms: number): number => Math.round(ms);
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const trackOf = (comp: EditorComposition, trackId: string): AudioTrack | undefined =>
  comp.audioTracks.find((t) => t.id === trackId);
const clipOf = (comp: EditorComposition, clipId: string): AudioClip | undefined =>
  comp.audioClips.find((c) => c.id === clipId);
/** true when the clip exists and its track is locked — the uniform clip-op refusal */
const clipLocked = (comp: EditorComposition, clip: AudioClip): boolean =>
  trackOf(comp, clip.trackId)?.locked ?? false;
export const audioClipSpanMs = (clip: Pick<AudioClip, "sourceInMs" | "sourceOutMs">): number =>
  clip.sourceOutMs - clip.sourceInMs;

const freshProcessors = (): AudioClip["processors"] => ({
  eq: { ...DEFAULT_AUDIO_CLIP_PROCESSORS.eq },
  cleanup: { ...DEFAULT_AUDIO_CLIP_PROCESSORS.cleanup },
  reverb: DEFAULT_AUDIO_CLIP_PROCESSORS.reverb,
});
const copyProcessors = (p: AudioClip["processors"]): AudioClip["processors"] => ({
  eq: { ...p.eq },
  cleanup: { ...p.cleanup },
  reverb: p.reverb,
});

function replaceClip(comp: EditorComposition, next: AudioClip): EditorComposition {
  return { ...comp, audioClips: comp.audioClips.map((c) => (c.id === next.id ? next : c)) };
}
function replaceTrack(comp: EditorComposition, next: AudioTrack): EditorComposition {
  return { ...comp, audioTracks: comp.audioTracks.map((t) => (t.id === next.id ? next : t)) };
}

/* ------------------------------------------------------------------ */
/* track ops                                                           */
/* ------------------------------------------------------------------ */

/**
 * Append a new audio track. The default name is the role's plain name
 * ("Music" / "Voice") or `Audio ${n}` for "other", where n is the track
 * count after adding (so the first "other" track is "Audio 1").
 */
export function addAudioTrack(
  comp: EditorComposition,
  role: AudioTrack["role"] = "other",
  name?: string,
): EditorComposition {
  const track: AudioTrack = {
    id: newId(),
    name: name ?? (role === "music" ? "Music" : role === "voice" ? "Voice" : `Audio ${comp.audioTracks.length + 1}`),
    role,
    volume: 1,
    muted: false,
    locked: false,
    ducking: { ...DEFAULT_AUDIO_DUCKING },
  };
  return { ...comp, audioTracks: [...comp.audioTracks, track] };
}

/** Patch a track's name / role / volume / muted / locked. Volume clamps to
 *  the schema range 0..2. Unknown id, or a patch that changes nothing, is a
 *  same-reference no-op. Not blocked by the track's lock (see header). */
export function updateAudioTrack(
  comp: EditorComposition,
  trackId: string,
  patch: Partial<Pick<AudioTrack, "name" | "role" | "volume" | "muted" | "locked">>,
): EditorComposition {
  const track = trackOf(comp, trackId);
  if (!track) return comp;
  const next: AudioTrack = { ...track };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.role !== undefined) next.role = patch.role;
  if (patch.volume !== undefined && Number.isFinite(patch.volume)) next.volume = clamp(patch.volume, 0, 2);
  if (patch.muted !== undefined) next.muted = patch.muted;
  if (patch.locked !== undefined) next.locked = patch.locked;
  if (
    next.name === track.name && next.role === track.role && next.volume === track.volume &&
    next.muted === track.muted && next.locked === track.locked
  ) return comp;
  return replaceTrack(comp, next);
}

/** Patch a track's ducking params, clamped to the schema ranges
 *  (amountDb 0..24, thresholdDb −60..−20). Unknown id / no change: no-op. */
export function setAudioDucking(
  comp: EditorComposition,
  trackId: string,
  patch: Partial<AudioDucking>,
): EditorComposition {
  const track = trackOf(comp, trackId);
  if (!track) return comp;
  const cur = track.ducking;
  const ducking: AudioDucking = {
    enabled: patch.enabled ?? cur.enabled,
    amountDb: patch.amountDb !== undefined && Number.isFinite(patch.amountDb) ? clamp(patch.amountDb, 0, 24) : cur.amountDb,
    thresholdDb: patch.thresholdDb !== undefined && Number.isFinite(patch.thresholdDb) ? clamp(patch.thresholdDb, -60, -20) : cur.thresholdDb,
  };
  if (ducking.enabled === cur.enabled && ducking.amountDb === cur.amountDb && ducking.thresholdDb === cur.thresholdDb) return comp;
  return replaceTrack(comp, { ...track, ducking });
}

/** Remove a track AND every clip placed on it (one undo step — the caller
 *  commits the single returned composition). Refused on a locked track and
 *  for an unknown id. */
export function removeAudioTrack(comp: EditorComposition, trackId: string): EditorComposition {
  const track = trackOf(comp, trackId);
  if (!track || track.locked) return comp;
  return {
    ...comp,
    audioTracks: comp.audioTracks.filter((t) => t.id !== trackId),
    audioClips: comp.audioClips.filter((c) => c.trackId !== trackId),
  };
}

/* ------------------------------------------------------------------ */
/* clip ops                                                            */
/* ------------------------------------------------------------------ */

/**
 * Place a clip of a media-bin asset on a track. `startMs` clamps at 0, the
 * source range clamps at 0 and is extended when needed so the used span is
 * at least MIN_AUDIO_MS. The clip starts with volume 1, no fades and the
 * default processors. Unknown or locked target track: no-op.
 */
export function placeAudioClip(
  comp: EditorComposition,
  input: { assetId: string; assetName: string; trackId: string; startMs: number; sourceInMs: number; sourceOutMs: number },
): EditorComposition {
  const track = trackOf(comp, input.trackId);
  if (!track || track.locked) return comp;
  const sourceInMs = Math.max(0, roundMs(input.sourceInMs));
  const sourceOutMs = Math.max(roundMs(input.sourceOutMs), sourceInMs + MIN_AUDIO_MS);
  const clip: AudioClip = {
    id: newId(),
    assetId: input.assetId,
    assetName: input.assetName ?? "",
    trackId: input.trackId,
    startMs: Math.max(0, roundMs(input.startMs)),
    sourceInMs,
    sourceOutMs,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    processors: freshProcessors(),
  };
  return { ...comp, audioClips: [...comp.audioClips, clip] };
}

/**
 * Move a clip to a new timeline start and/or another track. `startMs`
 * clamps at 0. Refused when the clip's own track is locked, when the target
 * track is locked, or when the target track does not exist; a move that
 * changes nothing is a no-op.
 */
export function moveAudioClip(
  comp: EditorComposition,
  clipId: string,
  patch: { startMs?: number; trackId?: string },
): EditorComposition {
  const clip = clipOf(comp, clipId);
  if (!clip || clipLocked(comp, clip)) return comp;
  let trackId = clip.trackId;
  if (patch.trackId !== undefined && patch.trackId !== clip.trackId) {
    const target = trackOf(comp, patch.trackId);
    if (!target || target.locked) return comp;
    trackId = patch.trackId;
  }
  const startMs = patch.startMs !== undefined && Number.isFinite(patch.startMs) ? Math.max(0, roundMs(patch.startMs)) : clip.startMs;
  if (startMs === clip.startMs && trackId === clip.trackId) return comp;
  return replaceClip(comp, { ...clip, startMs, trackId });
}

/**
 * Trim one edge of a clip to the PROJECT-TIMELINE position `targetMs`:
 * - start edge: `startMs` and `sourceInMs` move together by the same delta
 *   (the source start follows the timeline start), clamped so startMs ≥ 0,
 *   sourceInMs ≥ 0 and the span keeps at least MIN_AUDIO_MS;
 * - end edge: `sourceOutMs += targetMs − (startMs + span)` — the timeline
 *   end lands on `targetMs`, clamped so the span keeps MIN_AUDIO_MS.
 */
export function trimAudioClip(
  comp: EditorComposition,
  clipId: string,
  edge: "start" | "end",
  targetMs: number,
): EditorComposition {
  const clip = clipOf(comp, clipId);
  if (!clip || clipLocked(comp, clip)) return comp;
  if (!Number.isFinite(targetMs)) return comp;
  const target = roundMs(targetMs);
  const span = audioClipSpanMs(clip);
  if (edge === "start") {
    const delta = clamp(target - clip.startMs, -Math.min(clip.startMs, clip.sourceInMs), span - MIN_AUDIO_MS);
    if (delta === 0) return comp;
    return replaceClip(comp, { ...clip, startMs: clip.startMs + delta, sourceInMs: clip.sourceInMs + delta });
  }
  const delta = target - (clip.startMs + span);
  const clamped = Math.max(delta, -(span - MIN_AUDIO_MS));
  if (clamped === 0) return comp;
  return replaceClip(comp, { ...clip, sourceOutMs: clip.sourceOutMs + clamped });
}

/**
 * Split a clip at the PROJECT-TIMELINE position `atMs`, strictly inside
 * with at least MIN_AUDIO_MS on each side. The first half keeps the id and
 * the original fadeIn (its fadeOut becomes 0); the second half gets a fresh
 * id, fadeIn 0 and the original fadeOut. Processors are deep-copied to both
 * halves. Anything outside / too close to an edge is a no-op.
 */
export function splitAudioClipAt(comp: EditorComposition, clipId: string, atMs: number): EditorComposition {
  const idx = comp.audioClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return comp;
  const clip = comp.audioClips[idx]!;
  if (clipLocked(comp, clip)) return comp;
  const at = roundMs(atMs);
  const leftMs = at - clip.startMs;
  const span = audioClipSpanMs(clip);
  const rightMs = span - leftMs;
  if (leftMs < MIN_AUDIO_MS || rightMs < MIN_AUDIO_MS) return comp;
  const first: AudioClip = { ...clip, sourceOutMs: clip.sourceInMs + leftMs, fadeOutMs: 0, processors: copyProcessors(clip.processors) };
  const second: AudioClip = {
    ...clip,
    id: newId(),
    startMs: at,
    sourceInMs: clip.sourceInMs + leftMs,
    fadeInMs: 0,
    processors: copyProcessors(clip.processors),
  };
  return { ...comp, audioClips: [...comp.audioClips.slice(0, idx), first, second, ...comp.audioClips.slice(idx + 1)] };
}

/** Duplicate a clip immediately after the original (its start is the
 *  original's timeline end), with a fresh id and copied processors. */
export function duplicateAudioClip(comp: EditorComposition, clipId: string): EditorComposition {
  const idx = comp.audioClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return comp;
  const clip = comp.audioClips[idx]!;
  if (clipLocked(comp, clip)) return comp;
  const copy: AudioClip = {
    ...clip,
    id: newId(),
    startMs: clip.startMs + audioClipSpanMs(clip),
    processors: copyProcessors(clip.processors),
  };
  return { ...comp, audioClips: [...comp.audioClips.slice(0, idx + 1), copy, ...comp.audioClips.slice(idx + 1)] };
}

/** Remove a clip. Unknown id / locked track: no-op. */
export function removeAudioClip(comp: EditorComposition, clipId: string): EditorComposition {
  const clip = clipOf(comp, clipId);
  if (!clip || clipLocked(comp, clip)) return comp;
  return { ...comp, audioClips: comp.audioClips.filter((c) => c.id !== clipId) };
}

/** Patch a clip's volume (0..2) and/or fades (each clamped to [0, span]). */
export function updateAudioClip(
  comp: EditorComposition,
  clipId: string,
  patch: { volume?: number; fadeInMs?: number; fadeOutMs?: number },
): EditorComposition {
  const clip = clipOf(comp, clipId);
  if (!clip || clipLocked(comp, clip)) return comp;
  const span = audioClipSpanMs(clip);
  const next: AudioClip = { ...clip };
  if (patch.volume !== undefined && Number.isFinite(patch.volume)) next.volume = clamp(patch.volume, 0, 2);
  if (patch.fadeInMs !== undefined && Number.isFinite(patch.fadeInMs)) next.fadeInMs = clamp(roundMs(patch.fadeInMs), 0, span);
  if (patch.fadeOutMs !== undefined && Number.isFinite(patch.fadeOutMs)) next.fadeOutMs = clamp(roundMs(patch.fadeOutMs), 0, span);
  if (next.volume === clip.volume && next.fadeInMs === clip.fadeInMs && next.fadeOutMs === clip.fadeOutMs) return comp;
  return replaceClip(comp, next);
}

/** Patch a clip's processors: EQ gains (−15..+15 dB), cleanup (high-pass
 *  20..400 Hz, gate −80..−20 dB) and reverb wet mix (0..1), all clamped to
 *  the shared schema ranges. */
export function updateAudioClipProcessors(
  comp: EditorComposition,
  clipId: string,
  patch: { eq?: Partial<AudioEq>; cleanup?: Partial<AudioCleanup>; reverb?: number },
): EditorComposition {
  const clip = clipOf(comp, clipId);
  if (!clip || clipLocked(comp, clip)) return comp;
  const cur = clip.processors;
  const eq: AudioEq = {
    lowDb: patch.eq?.lowDb !== undefined && Number.isFinite(patch.eq.lowDb) ? clamp(patch.eq.lowDb, -15, 15) : cur.eq.lowDb,
    midDb: patch.eq?.midDb !== undefined && Number.isFinite(patch.eq.midDb) ? clamp(patch.eq.midDb, -15, 15) : cur.eq.midDb,
    highDb: patch.eq?.highDb !== undefined && Number.isFinite(patch.eq.highDb) ? clamp(patch.eq.highDb, -15, 15) : cur.eq.highDb,
  };
  const cleanup: AudioCleanup = {
    enabled: patch.cleanup?.enabled ?? cur.cleanup.enabled,
    highPassHz: patch.cleanup?.highPassHz !== undefined && Number.isFinite(patch.cleanup.highPassHz) ? clamp(patch.cleanup.highPassHz, 20, 400) : cur.cleanup.highPassHz,
    gateDb: patch.cleanup?.gateDb !== undefined && Number.isFinite(patch.cleanup.gateDb) ? clamp(patch.cleanup.gateDb, -80, -20) : cur.cleanup.gateDb,
  };
  const reverb = patch.reverb !== undefined && Number.isFinite(patch.reverb) ? clamp(patch.reverb, 0, 1) : cur.reverb;
  if (
    eq.lowDb === cur.eq.lowDb && eq.midDb === cur.eq.midDb && eq.highDb === cur.eq.highDb &&
    cleanup.enabled === cur.cleanup.enabled && cleanup.highPassHz === cur.cleanup.highPassHz && cleanup.gateDb === cur.cleanup.gateDb &&
    reverb === cur.reverb
  ) return comp;
  return replaceClip(comp, { ...clip, processors: { eq, cleanup, reverb } });
}

/* ------------------------------------------------------------------ */
/* master                                                              */
/* ------------------------------------------------------------------ */

/** Patch the master: overall volume / the video chain's volume inside the
 *  mix (both 0..2) and the compressor params (schema ranges: threshold
 *  −60..0 dB, ratio 1..20, knee 0..40 dB, attack 0..100 ms, release
 *  10..1000 ms). A patch that changes nothing is a no-op. */
export function updateAudioMaster(
  comp: EditorComposition,
  patch: { volume?: number; videoVolume?: number; compressor?: Partial<AudioMaster["compressor"]> },
): EditorComposition {
  const cur = comp.audioMaster;
  const c = patch.compressor;
  const compressor: AudioMaster["compressor"] = {
    enabled: c?.enabled ?? cur.compressor.enabled,
    thresholdDb: c?.thresholdDb !== undefined && Number.isFinite(c.thresholdDb) ? clamp(c.thresholdDb, -60, 0) : cur.compressor.thresholdDb,
    ratio: c?.ratio !== undefined && Number.isFinite(c.ratio) ? clamp(c.ratio, 1, 20) : cur.compressor.ratio,
    kneeDb: c?.kneeDb !== undefined && Number.isFinite(c.kneeDb) ? clamp(c.kneeDb, 0, 40) : cur.compressor.kneeDb,
    attackMs: c?.attackMs !== undefined && Number.isFinite(c.attackMs) ? clamp(c.attackMs, 0, 100) : cur.compressor.attackMs,
    releaseMs: c?.releaseMs !== undefined && Number.isFinite(c.releaseMs) ? clamp(c.releaseMs, 10, 1000) : cur.compressor.releaseMs,
  };
  const next: AudioMaster = {
    volume: patch.volume !== undefined && Number.isFinite(patch.volume) ? clamp(patch.volume, 0, 2) : cur.volume,
    videoVolume: patch.videoVolume !== undefined && Number.isFinite(patch.videoVolume) ? clamp(patch.videoVolume, 0, 2) : cur.videoVolume,
    compressor,
  };
  if (
    next.volume === cur.volume && next.videoVolume === cur.videoVolume &&
    (Object.keys(compressor) as Array<keyof AudioMaster["compressor"]>).every((k) => compressor[k] === cur.compressor[k])
  ) return comp;
  return { ...comp, audioMaster: next };
}
