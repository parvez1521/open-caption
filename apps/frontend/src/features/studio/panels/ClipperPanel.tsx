"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptionDoc } from "@capseasy/shared";
import { clampClipRange, clipTargetCount, createClipProject, fmtClipRange, rankClipProposals } from "@/features/clipper/clipper";
import { elementSuggestionsFor } from "@/features/clipper/suggestions";
import { brollLicenceFor, brollQueryFor, downloadBrollFile, savedBrollKey, searchBroll, type BrollSuggestion } from "@/features/clipper/broll";
import { detectSilences } from "@/features/clipper/analysis";
import { useSceneAnalysis } from "@/features/clipper/useSceneAnalysis";
import { ClipExplanation } from "@/features/clipper/ClipExplanation";
import { PEAKS_PER_SECOND } from "../useWaveform";
import { DEFAULT_CROP_WINDOW, needsVerticalReframe, type CropWindow } from "@/features/clipper/reframe";
import { Button, Section } from "../controls";
import { ClipTitleControl, ReframeControl, useClipTitleDeps, type ClipTitleState } from "./ClipCreateControls";

interface Props {
  projectId: string;
  sourceTitle: string;
  sourceVideoId: string | null;
  /** the SOURCE video's full duration (not a clip project's clamped duration) */
  mediaDurationMs: number;
  doc: CaptionDoc;
  /** waveform peaks for the source video (useWaveform pipeline), when decoded */
  peaks?: Float32Array | null;
  /** playable source-video URL, for on-device frame-difference scene sampling */
  videoUrl?: string | null;
  /** Phase 5 (5.4): the source video's real dimensions + playable URL, for the 9:16 crop window */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  sourceUrl?: string | null;
}

/**
 * Clipper: turn this transcribed long video into short captioned clips. Proposals are
 * segment suggestions measured on-device by deterministic checks — transcript gaps,
 * audio-energy silence from the waveform peaks, and frame-difference scene changes —
 * sized 15–60s, edges always on word boundaries, never a black box. Each suggestion
 * shows the measured signals behind its order (A7); there is no score. Adjust a
 * proposal's edges, then Create clip makes a normal caption project for just that
 * segment and opens it in the studio.
 */
export const ClipperPanel: React.FC<Props> = ({ projectId, sourceTitle, sourceVideoId, mediaDurationMs, doc, peaks, videoUrl, sourceWidth = null, sourceHeight = null, sourceUrl = null }) => {
  const router = useRouter();
  const scene = useSceneAnalysis(sourceVideoId, videoUrl, mediaDurationMs);
  const silences = useMemo(
    () => (peaks ? detectSilences(peaks, 1000 / PEAKS_PER_SECOND) : []),
    [peaks],
  );
  const proposals = useMemo(
    () => {
      const ranked = rankClipProposals(doc.words.filter((w) => !w.hidden), { silences, sceneCuts: scene.cuts });
      // Package 3 item I.2: ~1 suggestion per 6 minutes of video, min 3, max 8, and
      // never more than the signals actually produced (the ranked list IS the support)
      return ranked.slice(0, clipTargetCount(mediaDurationMs, ranked.length));
    },
    [doc, silences, scene.cuts, mediaDurationMs],
  );
  // Per-proposal user state is keyed by the proposal's own range (the same identity the
  // article's React key uses), NOT by list position: when scene analysis lands, proposals
  // re-rank, and index-keyed edits silently attached themselves to different clips.
  const keyOf = (p: (typeof proposals)[number]) => `${p.startMs}-${p.endMs}`;
  const [edits, setEdits] = useState<Record<string, { startMs: number; endMs: number }>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phase 5 (5.4): per-proposal crop windows + generated titles, keyed like `edits`.
  // Reframing defaults ON (centred window) exactly when the source is wider than 9:16;
  // the user can position the window or switch it off per clip.
  const canReframe = needsVerticalReframe(sourceWidth, sourceHeight);
  const [reframeOff, setReframeOff] = useState<Record<string, boolean>>({});
  const [windows, setWindows] = useState<Record<string, CropWindow>>({});
  const [titles, setTitles] = useState<Record<string, ClipTitleState | null>>({});
  const titleDeps = useClipTitleDeps();
  // Package 3 item I.3/I.4: per-proposal suggestion state, keyed like `edits`.
  // `ticked` starts EMPTY for every clip — an element is placed only when ticked.
  const [ticked, setTicked] = useState<Record<string, string[]>>({});
  const [brollState, setBrollState] = useState<Record<string, { status: "idle" | "loading" | "ready" | "error"; results: BrollSuggestion[]; selected: number[]; error?: string }>>({});
  const [createdWithWarnings, setCreatedWithWarnings] = useState<{ id: string; warnings: string[] } | null>(null);
  const brollKey = savedBrollKey();

  if (doc.words.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Clipper" hint="Clip suggestions appear here once this video has captions.">
          <p className="text-sm text-st-muted">No captions yet — transcribe the video first, then come back.</p>
        </Section>
      </div>
    );
  }

  const rangeOf = (p: (typeof proposals)[number]) => edits[keyOf(p)] ?? { startMs: p.startMs, endMs: p.endMs };
  const setRange = (p: (typeof proposals)[number], patch: Partial<{ startMs: number; endMs: number }>) =>
    setEdits((prev) => ({ ...prev, [keyOf(p)]: clampClipRange({ ...rangeOf(p), ...patch }, mediaDurationMs) }));

  const create = async (p: (typeof proposals)[number]) => {
    const k = keyOf(p);
    const range = clampClipRange(rangeOf(p), mediaDurationMs);
    setBusyKey(k);
    setError(null);
    setCreatedWithWarnings(null);
    try {
      // B-roll downloads happen BEFORE anything is created: a failed download aborts
      // the whole creation with the reason shown, instead of a half-loaded clip.
      const bs = brollState[k];
      const chosenBroll = (bs?.results ?? []).filter((r) => (bs?.selected ?? []).includes(r.id));
      const broll: { file: File; licence: ReturnType<typeof brollLicenceFor> }[] = [];
      for (const s of chosenBroll) {
        broll.push({ file: await downloadBrollFile(s), licence: brollLicenceFor(s, new Date().toISOString().slice(0, 10)) });
      }
      // only the TICKED suggestions are built into elements (unticked = never placed)
      const suggestions = elementSuggestionsFor(p, { mediaDurationMs, title: titles[k]?.text });
      const elements = suggestions.filter((s) => (ticked[k] ?? []).includes(s.id)).map((s) => s.item);
      const { projectId: newId, warnings } = await createClipProject({
        sourceProjectId: projectId,
        sourceTitle,
        sourceVideoId,
        doc,
        startMs: range.startMs,
        endMs: range.endMs,
        // a generated title the user confirmed (blank text = never mind, plain range title)
        title: titles[k]?.text.trim() ? titles[k]!.text : undefined,
        // the chosen crop window, only when reframing is on for this clip
        reframeWindow: canReframe && !reframeOff[k] ? (windows[k] ?? DEFAULT_CROP_WINDOW) : undefined,
        elements: elements.length ? elements : undefined,
        broll: broll.length ? broll : undefined,
      });
      if (warnings.length) {
        // the clip exists; say plainly what didn't ride along, and let the user open it
        setCreatedWithWarnings({ id: newId, warnings });
        setBusyKey(null);
      } else {
        router.push(`/projects/${newId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the clip. Try again.");
      setBusyKey(null);
    }
  };

  const findBroll = async (p: (typeof proposals)[number]) => {
    const k = keyOf(p);
    if (!brollKey) return;
    setBrollState((prev) => ({ ...prev, [k]: { status: "loading", results: [], selected: [] } }));
    try {
      const results = await searchBroll(brollQueryFor(p.text), brollKey);
      setBrollState((prev) => ({ ...prev, [k]: { status: "ready", results, selected: [] } }));
    } catch (e) {
      setBrollState((prev) => ({ ...prev, [k]: { status: "error", results: [], selected: [], error: e instanceof Error ? e.message : "Search failed." } }));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title="Clipper"
        hint="Clips suggested from your transcript, silences and scene changes — measured on your device."
        more="Clips are ordered by the signals on each clip; no score is assigned. Adjust the edges, then create a clip: it becomes its own caption project, and your source video is not cut."
      >
        <p className="mb-3 text-xs text-st-faint">
          Analysis on this video: {peaks ? `${silences.length} silence span${silences.length === 1 ? "" : "s"} measured from the audio` : "audio silence not measured yet (waveform still loading)"}
          {" · "}
          {scene.state === "ready" ? `${scene.cuts.length} scene change${scene.cuts.length === 1 ? "" : "s"} measured from frame differences` : "scene changes still being measured — ordering uses the signals available so far"}.
        </p>
        {proposals.length === 0 ? (
          <p className="text-sm text-st-muted">No speech segments found in these captions yet.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p, i) => {
              const k = keyOf(p);
              const range = rangeOf(p);
              return (
                <article key={k} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-st-text">
                      <span className="mr-2 text-st-faint">#{p.rank}</span>
                      {fmtClipRange(range.startMs, range.endMs)}
                    </span>
                    <span className="text-xs tabular-nums text-st-faint">
                      {Math.round((range.endMs - range.startMs) / 1000)}s · {p.wordCount} words
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-st-muted">&ldquo;{p.text}&hellip;&rdquo;</p>
                  <ClipExplanation signals={p.signals} explanation={p.explanation} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-st-faint">Start (seconds)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={Math.round(range.startMs / 100) / 10}
                        onChange={(e) => setRange(p, { startMs: Number(e.target.value) * 1000 })}
                        className="w-full rounded-lg border border-st-line bg-st-panel px-2 py-1.5 text-sm tabular-nums outline-none focus:border-st-ink/40"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-st-faint">End (seconds)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={Math.round(range.endMs / 100) / 10}
                        onChange={(e) => setRange(p, { endMs: Number(e.target.value) * 1000 })}
                        className="w-full rounded-lg border border-st-line bg-st-panel px-2 py-1.5 text-sm tabular-nums outline-none focus:border-st-ink/40"
                      />
                    </label>
                  </div>
                  <input
                    type="range"
                    aria-label={`Adjust start of clip ${i + 1}`}
                    min={0}
                    max={Math.max(1, Math.round(mediaDurationMs / 1000))}
                    step={1}
                    value={Math.round(range.startMs / 1000)}
                    onChange={(e) => setRange(p, { startMs: Number(e.target.value) * 1000 })}
                    className="mt-2 w-full"
                  />
                  {canReframe && sourceWidth && sourceHeight ? (
                    <ReframeControl
                      sourceUrl={sourceUrl}
                      sourceWidth={sourceWidth}
                      sourceHeight={sourceHeight}
                      startMs={range.startMs}
                      endMs={range.endMs}
                      enabled={!reframeOff[k]}
                      onEnabledChange={(on) => setReframeOff((prev) => ({ ...prev, [k]: !on }))}
                      window={windows[k] ?? DEFAULT_CROP_WINDOW}
                      onWindowChange={(win) => setWindows((prev) => ({ ...prev, [k]: win }))}
                    />
                  ) : null}
                  <ClipTitleControl
                    sourceTitle={sourceTitle}
                    segmentText={p.text}
                    startMs={range.startMs}
                    endMs={range.endMs}
                    deps={titleDeps}
                    state={titles[k] ?? null}
                    onState={(next) => setTitles((prev) => ({ ...prev, [k]: next }))}
                  />
                  {/* Package 3 item I.3: suggested elements — ticked ones only are placed */}
                  {(() => {
                    const suggestions = elementSuggestionsFor(p, { mediaDurationMs, title: titles[k]?.text });
                    return (
                      <div className="mt-3">
                        <span className="mb-1.5 block text-[11px] font-medium text-st-faint">Suggested elements — only ticked ones are added</span>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.map((s) => {
                            const on = (ticked[k] ?? []).includes(s.id);
                            return (
                              <label key={s.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-st-ink bg-st-lav text-st-ink" : "border-st-line bg-st-panel text-st-muted"}`}>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={(e) => setTicked((prev) => ({ ...prev, [k]: e.target.checked ? [...(prev[k] ?? []), s.id] : (prev[k] ?? []).filter((id) => id !== s.id) }))}
                                  className="h-3.5 w-3.5 accent-[#34D399]"
                                />
                                {s.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Package 3 item I.4: B-roll suggestions from Pixabay (your own key) */}
                  <div className="mt-3">
                    <span className="mb-1.5 block text-[11px] font-medium text-st-faint">B-roll suggestions</span>
                    {!brollKey ? (
                      <p className="text-xs text-st-faint">Add your free Pixabay key in the Sound Effects panel to get B-roll suggestions here.</p>
                    ) : !brollState[k] || brollState[k]!.status === "idle" ? (
                      <Button onClick={() => void findBroll(p)} className="!py-1 text-xs">Find B-roll for this clip</Button>
                    ) : brollState[k]!.status === "loading" ? (
                      <p className="text-xs text-st-faint">Searching Pixabay…</p>
                    ) : brollState[k]!.status === "error" ? (
                      <p className="text-xs text-st-text">{brollState[k]!.error}</p>
                    ) : brollState[k]!.results.length === 0 ? (
                      <p className="text-xs text-st-faint">No B-roll found for this clip&apos;s words.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {brollState[k]!.results.map((r) => {
                          const on = brollState[k]!.selected.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              aria-pressed={on}
                              title={on ? "Selected — added to the clip's media bin on create" : "Select this B-roll"}
                              onClick={() => setBrollState((prev) => ({ ...prev, [k]: { ...prev[k]!, selected: on ? prev[k]!.selected.filter((id) => id !== r.id) : [...prev[k]!.selected, r.id] } }))}
                              className={`relative overflow-hidden rounded-lg border-2 ${on ? "border-st-em" : "border-transparent"}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r.previewUrl} alt={r.tags || "B-roll suggestion"} className="aspect-video w-full object-cover" loading="lazy" />
                              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">{r.durationSec}s</span>
                              {on ? <span className="absolute left-1 top-1 rounded bg-st-em px-1 text-[10px] font-bold text-black">Added on create</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <Button tone="primary" disabled={busyKey !== null} onClick={() => void create(p)} className="mt-2 w-full">
                    {busyKey === k ? "Creating clip…" : "Create clip"}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
        {error ? <p role="alert" className="mt-3 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{error}</p> : null}
        {createdWithWarnings ? (
          <div role="alert" className="mt-3 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">
            <p>The clip was created, but {createdWithWarnings.warnings.join("; ")}.</p>
            <Button tone="primary" className="mt-2" onClick={() => router.push(`/projects/${createdWithWarnings.id}`)}>Open the clip</Button>
          </div>
        ) : null}
      </Section>
    </div>
  );
};
