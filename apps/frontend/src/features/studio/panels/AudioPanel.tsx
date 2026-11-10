"use client";

import React from "react";
import type { AudioDucking, AudioMaster, AudioTrack } from "@capseasy/shared";
import { Button, Section, Select, Slider, Toggle } from "../controls";
import type { EditorComposition } from "../compositionDoc";
import type { MediaAssetRecord } from "../mediaStore";
import { approvedBleepRanges, findProfanityMatches, type BleepWordInput } from "../audio/bleep";

/**
 * Audio panel (Phase 4 Run 3, slice 4.8): the presentational half of the
 * audio studio. ALL state lives in the `comp` passed in (StudioPage owns it
 * through the audioOps + commitComposition path); every edit below is a
 * callback, so what the panel shows is always the stored mix, never local
 * state. Trimming is deliberately NOT here — it is timeline-driven.
 */
export interface AudioPanelProps {
  comp: EditorComposition;
  assets: MediaAssetRecord[];
  selectedClipId: string | null;
  playheadMs: number;
  onSelectClip: (id: string | null) => void;
  onAddTrack: (role: "voice" | "music" | "other") => void;
  onUpdateTrack: (id: string, patch: Partial<Pick<AudioTrack, "name" | "role" | "volume" | "muted" | "locked">>) => void;
  onSetDucking: (id: string, patch: Partial<AudioDucking>) => void;
  onRemoveTrack: (id: string) => void;
  /** the panel is dumb about placement: StudioPage decides the track and the playhead position */
  onPlaceClip: (asset: { id: string; name: string; durationMs: number }) => void;
  onMoveClip: (id: string, patch: { startMs?: number; trackId?: string }) => void;
  onSplitClip: (id: string) => void;
  onDuplicateClip: (id: string) => void;
  onRemoveClip: (id: string) => void;
  onUpdateClip: (id: string, patch: { volume?: number; fadeInMs?: number; fadeOutMs?: number }) => void;
  onUpdateProcessors: (
    id: string,
    patch: {
      eq?: Partial<{ lowDb: number; midDb: number; highDb: number }>;
      cleanup?: Partial<{ enabled: boolean; highPassHz: number; gateDb: number }>;
      reverb?: number;
    },
  ) => void;
  onUpdateMaster: (patch: { volume?: number; videoVolume?: number; compressor?: Partial<AudioMaster["compressor"]> }) => void;
  /** Phase 5 (A6): the caption document's words, for the profanity review list */
  words?: BleepWordInput[];
  /** Phase 5 (A6): store approved bleep ranges as mix params (one undo step) */
  onApplyBleeps?: (ranges: { startMs: number; endMs: number; wordText: string }[]) => void;
  onRemoveBleep?: (id: string) => void;
  onUpdateBleep?: (id: string, patch: { toneHz?: number; level?: number }) => void;
  /** Phase 5 (A12): noise suppression derived-asset control (StudioPage owns the async work) */
  noiseSuppression?: {
    active: boolean;
    busy: boolean;
    error: string | null;
    onToggle: (enable: boolean) => void;
  };
}

const fmtTime = (ms: number): string => {
  const totalSec = Math.max(0, ms) / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

const ROLE_OPTIONS = [
  { value: "voice", label: "Voice" },
  { value: "music", label: "Music" },
  { value: "other", label: "Other" },
];

export const AudioPanel: React.FC<AudioPanelProps> = ({
  comp, assets, selectedClipId, playheadMs, onSelectClip,
  onAddTrack, onUpdateTrack, onSetDucking, onRemoveTrack, onPlaceClip,
  onMoveClip, onSplitClip, onDuplicateClip, onRemoveClip, onUpdateClip, onUpdateProcessors, onUpdateMaster,
  words, onApplyBleeps, onRemoveBleep, onUpdateBleep, noiseSuppression,
}) => {
  // Phase 5 (A6): profanity review state — which listed matches the user has ticked.
  // NOTHING is approved by default and nothing is altered until a button below
  // sends the approved ranges up; unapproved matches are never touched.
  const matches = React.useMemo(() => findProfanityMatches(words ?? []), [words]);
  const [approvedIds, setApprovedIds] = React.useState<ReadonlySet<string>>(new Set());
  const bleeps = comp.audioBleeps ?? [];
  const isBleeped = (m: { startMs: number; endMs: number }) =>
    bleeps.some((b) => b.startMs <= m.startMs && b.endMs >= m.endMs);
  const pendingMatches = matches.filter((m) => !isBleeped(m));
  const toggleApproved = (wordId: string, on: boolean) =>
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(wordId); else next.delete(wordId);
      return next;
    });
  const applyApproved = (ids: ReadonlySet<string>) => {
    if (!onApplyBleeps || ids.size === 0) return;
    onApplyBleeps(approvedBleepRanges(matches, ids));
    setApprovedIds(new Set());
  };
  const master = comp.audioMaster;
  const compOn = master.compressor.enabled;
  const audioAssets = assets.filter((a) => a.kind === "audio");
  const selectedClip = selectedClipId ? comp.audioClips.find((c) => c.id === selectedClipId) ?? null : null;
  const selectedTrackLocked = selectedClip ? comp.audioTracks.find((t) => t.id === selectedClip.trackId)?.locked ?? false : false;
  const spanMs = selectedClip ? selectedClip.sourceOutMs - selectedClip.sourceInMs : 0;
  void playheadMs; // split-at-playhead is resolved by StudioPage's onSplitClip handler

  return (
    <div className="h-full overflow-y-auto">
      <Section title="Sound" hint="The whole mix: the video's own sound, your audio clips, and the master level they are all mixed at.">
        <Slider label="Video sound" value={master.videoVolume} min={0} max={2} step={0.05} onChange={(v) => onUpdateMaster({ videoVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Master volume" value={master.volume} min={0} max={2} step={0.05} onChange={(v) => onUpdateMaster({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Toggle label="Compressor" checked={compOn} onChange={(v) => onUpdateMaster({ compressor: { enabled: v } })} hint="Evens out loud and quiet parts of the finished mix." />
        {compOn ? (
          <>
            <Slider label="Threshold" value={master.compressor.thresholdDb} min={-60} max={0} step={1} unit=" dB" onChange={(v) => onUpdateMaster({ compressor: { thresholdDb: v } })} />
            <Slider label="Ratio" value={master.compressor.ratio} min={1} max={20} step={0.5} onChange={(v) => onUpdateMaster({ compressor: { ratio: v } })} format={(v) => `${v}:1`} />
          </>
        ) : null}
      </Section>

      <Section title="Bleep profanity" hint="Words from the built-in list that appear in your transcript. A word is only silenced — with a tone over it — after you approve it here; the original audio is never edited, and removing a bleep restores it.">
        <p className="text-xs text-st-faint">This matches listed words in the transcript; it can miss slang or mis-transcribed words.</p>
        {matches.length === 0 ? (
          <p className="text-xs text-st-faint">No listed words found in the transcript.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {matches.map((m) => {
                const done = isBleeped(m);
                return (
                  <div key={`${m.wordId}-${m.startMs}`} className="flex items-center gap-2 rounded-lg bg-st-raised/60 px-2.5 py-2">
                    {done ? (
                      <span className="text-xs font-medium text-st-text/80">Bleeped</span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Approve bleep for ${m.wordText}`}
                        checked={approvedIds.has(m.wordId)}
                        onChange={(e) => toggleApproved(m.wordId, e.target.checked)}
                        className="h-4 w-4 shrink-0 accent-[#34D399]"
                      />
                    )}
                    <p className="min-w-0 flex-1 truncate text-sm text-st-text" title={m.wordText}>{m.wordText}</p>
                    <span className="text-xs text-st-faint">{fmtTime(m.startMs)}</span>
                  </div>
                );
              })}
            </div>
            {pendingMatches.length > 0 && onApplyBleeps ? (
              <div className="flex flex-wrap gap-1.5">
                <Button disabled={approvedIds.size === 0} onClick={() => applyApproved(approvedIds)}>
                  {`Bleep selected (${approvedIds.size})`}
                </Button>
                <Button onClick={() => applyApproved(new Set(pendingMatches.map((m) => m.wordId)))}>
                  Bleep all
                </Button>
              </div>
            ) : null}
          </>
        )}
        {bleeps.length > 0 ? (
          <div className="space-y-1.5">
            {bleeps.map((b) => (
              <div key={b.id} className="space-y-2 rounded-lg border border-st-line bg-st-raised/40 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-st-text" title={b.wordText || "Bleep"}>
                    {b.wordText || "Bleep"} <span className="text-xs text-st-faint">{fmtTime(b.startMs)} – {fmtTime(b.endMs)}</span>
                  </p>
                  {onRemoveBleep ? <Button tone="danger" className="!px-2 !py-1 text-xs" onClick={() => onRemoveBleep(b.id)}>Remove</Button> : null}
                </div>
                {onUpdateBleep ? (
                  <>
                    <Slider label="Tone" value={b.toneHz} min={200} max={4000} step={50} unit=" Hz" onChange={(v) => onUpdateBleep(b.id, { toneHz: v })} />
                    <Slider label="Tone level" value={b.level} min={0} max={1} step={0.05} onChange={(v) => onUpdateBleep(b.id, { level: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {noiseSuppression ? (
        <Section title="Noise suppression" hint="Removes steady background noise (fans, hiss, hum) from the video's sound, on this device.">
          <p className="text-xs text-st-faint">
            It works on a cleaned copy — your original recording is untouched, and turning this off goes back to it. Best on steady noise; different from the per-clip basic cleanup.
          </p>
          {noiseSuppression.active ? (
            <>
              <p className="text-xs text-st-text/85">Noise suppression is on for this project.</p>
              <Button disabled={noiseSuppression.busy} onClick={() => noiseSuppression.onToggle(false)}>Turn off</Button>
            </>
          ) : (
            <Button disabled={noiseSuppression.busy} onClick={() => noiseSuppression.onToggle(true)}>
              {noiseSuppression.busy ? "Cleaning the audio…" : "Create noise-suppressed copy"}
            </Button>
          )}
          {noiseSuppression.error ? <p className="text-xs text-red-300">{noiseSuppression.error}</p> : null}
        </Section>
      ) : null}

      <Section title="Tracks" hint="Each track is a lane on the timeline. Locking a track protects its clips from edits.">
        {comp.audioTracks.length === 0 ? <p className="text-xs text-st-faint">No audio tracks yet. Add one below, then place audio from the media bin.</p> : null}
        {comp.audioTracks.map((track) => (
          <div key={track.id} className="space-y-3 rounded-xl border border-st-line bg-st-raised/40 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-st-text/90">
              <span>Name</span>
              <input
                value={track.name}
                aria-label="Track name"
                onChange={(e) => onUpdateTrack(track.id, { name: e.target.value })}
                className="w-36 rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm text-st-text outline-none focus:border-st-lav"
              />
            </label>
            <Select label="Role" value={track.role} options={ROLE_OPTIONS} onChange={(v) => onUpdateTrack(track.id, { role: v as AudioTrack["role"] })} />
            <Slider label="Volume" value={track.volume} min={0} max={2} step={0.05} onChange={(v) => onUpdateTrack(track.id, { volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Toggle label="Mute" checked={track.muted} onChange={(v) => onUpdateTrack(track.id, { muted: v })} />
            <Toggle label="Lock" checked={track.locked} onChange={(v) => onUpdateTrack(track.id, { locked: v })} />
            <Toggle label="Ducking" checked={track.ducking.enabled} onChange={(v) => onSetDucking(track.id, { enabled: v })} />
            {track.ducking.enabled ? (
              <>
                <Slider label="Duck amount" value={track.ducking.amountDb} min={0} max={24} step={1} unit=" dB" onChange={(v) => onSetDucking(track.id, { amountDb: v })} />
                <p className="text-xs text-st-faint">Music gets quieter while the voice is speaking.</p>
              </>
            ) : null}
            <div>
              <Button tone="danger" disabled={track.locked} onClick={() => onRemoveTrack(track.id)}>Remove track</Button>
              {track.locked ? <p className="mt-1 text-[11px] text-st-faint">Unlock the track to remove it.</p> : null}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => onAddTrack("voice")}>Add voice track</Button>
          <Button onClick={() => onAddTrack("music")}>Add music track</Button>
          <Button onClick={() => onAddTrack("other")}>Add track</Button>
        </div>
      </Section>

      <Section title="Add audio" hint="Audio from this project's media bin, placed at the playhead.">
        {audioAssets.length === 0 ? (
          <p className="text-xs text-st-faint">Import an audio file in the Media panel first.</p>
        ) : (
          <div className="space-y-1.5">
            {audioAssets.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg bg-st-raised/60 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-st-text" title={a.name}>{a.name}</p>
                  {!a.durationMs ? <p className="text-[11px] text-st-faint">This file&apos;s length couldn&apos;t be read, so it can&apos;t be placed.</p> : null}
                </div>
                <Button className="!px-2 !py-1 text-xs" disabled={!a.durationMs} onClick={() => onPlaceClip({ id: a.id, name: a.name, durationMs: a.durationMs ?? 0 })}>Place</Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {selectedClip ? (
        <Section title="Selected clip" hint={selectedClip.assetName || "Audio clip"}>
          {selectedTrackLocked ? (
            <p className="text-xs font-medium text-st-text">This clip&apos;s track is locked — its clips can&apos;t be edited. Unlock the track under Tracks to change it.</p>
          ) : null}
          <fieldset disabled={selectedTrackLocked} className="space-y-3">
          <Select
            label="Track"
            value={selectedClip.trackId}
            options={comp.audioTracks.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(v) => onMoveClip(selectedClip.id, { trackId: v })}
          />
          <Slider label="Volume" value={selectedClip.volume} min={0} max={2} step={0.05} onChange={(v) => onUpdateClip(selectedClip.id, { volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Fade in" value={selectedClip.fadeInMs} min={0} max={5000} step={50} unit=" ms" onChange={(v) => onUpdateClip(selectedClip.id, { fadeInMs: Math.min(v, spanMs) })} />
          <Slider label="Fade out" value={selectedClip.fadeOutMs} min={0} max={5000} step={50} unit=" ms" onChange={(v) => onUpdateClip(selectedClip.id, { fadeOutMs: Math.min(v, spanMs) })} />
          <Slider label="EQ low" value={selectedClip.processors.eq.lowDb} min={-15} max={15} step={1} unit=" dB" onChange={(v) => onUpdateProcessors(selectedClip.id, { eq: { lowDb: v } })} />
          <Slider label="EQ mid" value={selectedClip.processors.eq.midDb} min={-15} max={15} step={1} unit=" dB" onChange={(v) => onUpdateProcessors(selectedClip.id, { eq: { midDb: v } })} />
          <Slider label="EQ high" value={selectedClip.processors.eq.highDb} min={-15} max={15} step={1} unit=" dB" onChange={(v) => onUpdateProcessors(selectedClip.id, { eq: { highDb: v } })} />
          <Toggle label="Basic cleanup" checked={selectedClip.processors.cleanup.enabled} onChange={(v) => onUpdateProcessors(selectedClip.id, { cleanup: { enabled: v } })} />
          {selectedClip.processors.cleanup.enabled ? (
            <>
              <Slider label="High-pass" value={selectedClip.processors.cleanup.highPassHz} min={20} max={400} step={5} unit=" Hz" onChange={(v) => onUpdateProcessors(selectedClip.id, { cleanup: { highPassHz: v } })} />
              <Slider label="Noise gate" value={selectedClip.processors.cleanup.gateDb} min={-80} max={-20} step={1} unit=" dB" onChange={(v) => onUpdateProcessors(selectedClip.id, { cleanup: { gateDb: v } })} />
              <p className="text-xs text-st-faint">A high-pass filter and a noise gate. It tidies rumble and pauses; it does not remove noise from the recording.</p>
            </>
          ) : null}
          <Slider label="Reverb" value={selectedClip.processors.reverb} min={0} max={1} step={0.01} onChange={(v) => onUpdateProcessors(selectedClip.id, { reverb: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={() => onSplitClip(selectedClip.id)}>Split at playhead</Button>
            <Button onClick={() => onDuplicateClip(selectedClip.id)}>Duplicate</Button>
            <Button tone="danger" onClick={() => { onRemoveClip(selectedClip.id); onSelectClip(null); }}>Delete</Button>
          </div>
          </fieldset>
        </Section>
      ) : null}

      <div className="px-4 py-4">
        <p className="text-xs text-st-faint">Audio files and this mix live on this device. The mix is included when you export an MP4 in this browser; a render made on another device includes only the video&apos;s own sound.</p>
      </div>
    </div>
  );
};
