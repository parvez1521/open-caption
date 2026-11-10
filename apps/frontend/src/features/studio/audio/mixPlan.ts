/**
 * mixPlan — the ONE mix definition (Phase 4 Run 3, 4.8).
 *
 * The stored params live on EditorComposition (audioTracks / audioClips / audioMaster).
 * buildMixPlan flattens them into a plain, renderer-independent list of items plus the
 * master settings. Every consumer — the export mixdown (mixdown.ts) and the preview
 * graph (another worker) — builds from this plan, so what is previewed is what exports.
 * Pure: no DOM, no decoding, no Web Audio.
 */
import {
  DEFAULT_AUDIO_CLEANUP,
  DEFAULT_AUDIO_MASTER,
  NEUTRAL_AUDIO_EQ,
  type AudioBleep,
  type AudioCleanup,
  type AudioDucking,
  type AudioEq,
  type AudioMaster,
} from "@capseasy/shared";
import type { EditorComposition } from "../compositionDoc";

export interface MixItem {
  key: string;
  kind: "video" | "clip";
  /** media-bin asset id; null = the project's main source (video items only in practice) */
  assetId: string | null;
  /** project timeline position of the item's first sample */
  timelineStartMs: number;
  /** in-point into the source asset */
  sourceStartMs: number;
  /** TIMELINE duration of the item (for video items: (sourceOut - sourceIn) / rate) */
  sourceDurationMs: number;
  /** playback rate (video segments may be sped up / slowed; audio clips are always 1) */
  rate: number;
  /** overall linear gain before fades (video: master.videoVolume; clips: clip.volume * track.volume) */
  baseGain: number;
  fadeInMs: number;
  fadeOutMs: number;
  eq: AudioEq;
  cleanup: AudioCleanup;
  /** wet mix 0..1 of the generated-impulse reverb */
  reverb: number;
  /** this item counts as "voice" for ducking (video sound + voice-role tracks) */
  voice: boolean;
  /** this item is ducked under the voice (its track has ducking enabled) */
  duck: boolean;
  /** ducking params of the item's track; present only when `duck` is true */
  ducking?: AudioDucking;
  /** owning audio track id for clip items; null for video items */
  trackId: string | null;
}

export interface MixPlan {
  durationMs: number;
  items: MixItem[];
  master: AudioMaster;
  /** Phase 5 (A6): approved bleeps, clamped to the plan duration, in timeline order.
   *  Consumers mute every item inside a range and add the shared synthesised tone. */
  bleeps: AudioBleep[];
}

function masterDiffersFromDefault(master: AudioMaster): boolean {
  const d = DEFAULT_AUDIO_MASTER;
  if (master.volume !== d.volume || master.videoVolume !== d.videoVolume) return true;
  const c = master.compressor;
  const dc = d.compressor;
  return (
    c.enabled !== dc.enabled ||
    c.thresholdDb !== dc.thresholdDb ||
    c.ratio !== dc.ratio ||
    c.kneeDb !== dc.kneeDb ||
    c.attackMs !== dc.attackMs ||
    c.releaseMs !== dc.releaseMs
  );
}

/**
 * Whether the mix engine needs to run at all for this composition.
 *
 * True iff:
 * - there is at least one audio clip, OR
 * - any audio track differs from default in an AUDIBLE way — volume != 1, muted, or
 *   ducking enabled — OR
 * - the master differs from DEFAULT_AUDIO_MASTER (volume / videoVolume != 1, or the
 *   compressor is configured away from default).
 *
 * A track's `role` alone is deliberately EXCLUDED: role only labels a track for
 * ducking decisions; with no clips and no other change it does nothing audible, so
 * a role-only project keeps exactly the pre-audio-studio behaviour.
 */
export function mixIsActive(comp: EditorComposition): boolean {
  if (comp.audioClips.length > 0) return true;
  // Phase 5: an approved bleep or a derived noise-suppressed voice asset both need
  // the mix engine (they change the video's own sound, which only the mix produces).
  if ((comp.audioBleeps ?? []).length > 0) return true;
  if (comp.audioNoiseSuppressionAssetId) return true;
  for (const track of comp.audioTracks) {
    if (track.volume !== 1 || track.muted || track.ducking.enabled) return true;
  }
  return masterDiffersFromDefault(comp.audioMaster);
}

/**
 * Flatten a composition into a mix plan of `durationMs` total length.
 *
 * Video items: one per non-still video clip (the video's own sound; `voice: true`,
 * base gain = master.videoVolume, no fades/processors). ALL video items are skipped
 * when the video track is muted. Clip items: one per audio clip whose track exists
 * and is not muted (base gain = clip.volume * track.volume, processors/fades from
 * the clip, voice/duck from the track's role/ducking).
 *
 * Every item is clamped to `durationMs`: an item starting at/after the end is
 * dropped, and an item running past the end has its sourceDurationMs reduced so it
 * ends exactly at durationMs.
 */
export function buildMixPlan(comp: EditorComposition, durationMs: number): MixPlan {
  const items: MixItem[] = [];
  const total = Math.max(0, durationMs);

  if (!comp.trackState.video.muted) {
    for (const clip of comp.videoClips) {
      if (clip.still) continue;
      const rate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1;
      const timelineDurationMs = (clip.sourceOutMs - clip.sourceInMs) / rate;
      if (!(timelineDurationMs > 0)) continue;
      if (clip.startMs >= total) continue;
      const clampedDuration = Math.min(timelineDurationMs, total - clip.startMs);
      if (!(clampedDuration > 0)) continue;
      items.push({
        key: `video:${clip.id}`,
        kind: "video",
        // Phase 5 (A12): the main source's audio is read from the derived
        // noise-suppressed WAV when one is set (segments with their own asset —
        // reversed/freeze conforms — keep theirs; their audio is already conformed).
        assetId: clip.assetId ?? comp.audioNoiseSuppressionAssetId ?? null,
        timelineStartMs: clip.startMs,
        sourceStartMs: clip.sourceInMs,
        sourceDurationMs: clampedDuration,
        rate,
        baseGain: comp.audioMaster.videoVolume,
        fadeInMs: 0,
        fadeOutMs: 0,
        eq: { ...NEUTRAL_AUDIO_EQ },
        cleanup: { ...DEFAULT_AUDIO_CLEANUP },
        reverb: 0,
        voice: true,
        duck: false,
        trackId: null,
      });
    }
  }

  const tracksById = new Map(comp.audioTracks.map((t) => [t.id, t]));
  for (const clip of comp.audioClips) {
    const track = tracksById.get(clip.trackId);
    if (!track || track.muted) continue;
    const sourceDurationMs = clip.sourceOutMs - clip.sourceInMs;
    if (!(sourceDurationMs > 0)) continue;
    if (clip.startMs >= total) continue;
    const clampedDuration = Math.min(sourceDurationMs, total - clip.startMs);
    if (!(clampedDuration > 0)) continue;
    const duck = track.ducking.enabled;
    items.push({
      key: `clip:${clip.id}`,
      kind: "clip",
      assetId: clip.assetId,
      timelineStartMs: clip.startMs,
      sourceStartMs: clip.sourceInMs,
      sourceDurationMs: clampedDuration,
      rate: 1,
      baseGain: clip.volume * track.volume,
      fadeInMs: clip.fadeInMs,
      fadeOutMs: clip.fadeOutMs,
      eq: { ...clip.processors.eq },
      cleanup: { ...clip.processors.cleanup },
      reverb: clip.processors.reverb,
      voice: track.role === "voice",
      duck,
      ...(duck ? { ducking: { ...track.ducking } } : {}),
      trackId: track.id,
    });
  }

  const bleeps: AudioBleep[] = (comp.audioBleeps ?? [])
    .filter((b) => b.endMs > b.startMs && b.startMs < total)
    .map((b) => ({ ...b, startMs: Math.max(0, b.startMs), endMs: Math.min(total, b.endMs) }))
    .filter((b) => b.endMs > b.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  return { durationMs: total, items, master: comp.audioMaster, bleeps };
}
