"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaptionDoc } from "@capseasy/shared";
import {
  clampClipRange,
  clipTargetCount,
  computeClipSignals,
  createClipProject,
  fmtClipRange,
  rankClipProposals,
  type RankedClipProposal,
} from "@/features/clipper/clipper";
import { elementSuggestionsFor } from "@/features/clipper/suggestions";
import { brollLicenceFor, brollQueryFor, downloadBrollFile, savedBrollKey, searchBroll, type BrollSuggestion } from "@/features/clipper/broll";
import { detectSilences } from "@/features/clipper/analysis";
import { useSceneAnalysis } from "@/features/clipper/useSceneAnalysis";
import { ClipExplanation } from "@/features/clipper/ClipExplanation";
import { PEAKS_PER_SECOND } from "../useWaveform";
import {
  ASPECT_RATIOS,
  DEFAULT_CROP_WINDOW,
  needsReframeFor,
  needsVerticalReframe,
  type ClipAspectId,
  type CropWindow,
} from "@/features/clipper/reframe";
import { Button, Section } from "../controls";
import { ClipTitleControl, ReframeControl, useClipTitleDeps, type ClipTitleState } from "./ClipCreateControls";
import { runHighlightEngine } from "@/features/clipper/highlights/engine";
import { resolveHighlightRunner } from "@/features/clipper/highlights/adapter";
import { buildSentences } from "@/features/clipper/highlights/sentences";
import { CONTENT_TYPE_RUBRICS } from "@/features/clipper/highlights/rubrics";
import type { ContentTypeId, HighlightClip, HighlightRequest, HighlightSource } from "@/features/clipper/highlights/types";
import { fetchClipAiStatus, runClipCloudModel } from "@/features/clipper/highlightAi";
import { onModelState, runLocalModel } from "@/features/create/localModel";
import { SourceBadge } from "@/features/create/SourceBadge";
import { ClipScoreBlock } from "@/features/clipper/ClipScoreBlock";
import { buildCropPath, planToWire, type CropPathPlan } from "@/features/clipper/cropPath";
import { faceAssistConsented, grantFaceAssistConsent, useFaceTrack } from "@/features/clipper/useFaceTrack";
import { captureClipThumbnails } from "@/features/clipper/clipThumbnails";
import { exportClipProject, runBatchExport } from "@/features/clipper/batchExport";

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
 * Clipper + AI Clipping Studio: turn this transcribed long video into short
 * captioned clips.
 *
 * Two ways in, one creation flow:
 *  - AI Clipping Studio (top): a semantic pass over the transcript (word-index
 *    highlight engine — free AI in the cloud when switched on, the on-device
 *    model when opted in, measured signals otherwise, always badged) returning
 *    ranked clips with an Editorial score, a verbatim hook, a reason and a
 *    model/measured breakdown. Smart crop (per-scene face-track paths) is
 *    planned on-device when the user consents to the face model.
 *  - Measured suggestions (below, the original Clipper): segment proposals
 *    from transcript gaps, waveform silence and frame-difference scene
 *    changes, ordered by their measured signals; no score.
 *
 * Both lists render the same card and create through the same flow (range
 * edits, crop, title, ticked elements, B-roll) — a created clip is a normal
 * caption project, editable and exportable in the Studio. AI-created clips
 * can also be batch-exported from here.
 */

type StageId = "transcript" | "measure" | "understand" | "moments" | "ranking" | "crops" | "previews";
interface StageRow {
  id: StageId;
  label: string;
  state: "waiting" | "active" | "done" | "skipped";
  detail?: string;
}

interface AiCropState {
  status: "path" | "centre" | "pending-consent" | "unavailable";
  plan: CropPathPlan | null;
  /** for the clip's ORIGINAL range — a later range edit retires the path (the still window takes over) */
  plannedFor: { startMs: number; endMs: number };
  note: string;
}

const DURATION_PRESETS: Record<string, { min: number; max: number }> = {
  "15-30": { min: 15, max: 30 },
  "30-60": { min: 30, max: 60 },
  "60-90": { min: 60, max: 90 },
};

export const ClipperPanel: React.FC<Props> = ({ projectId, sourceTitle, sourceVideoId, mediaDurationMs, doc, peaks, videoUrl, sourceWidth = null, sourceHeight = null, sourceUrl = null }) => {
  const router = useRouter();
  const scene = useSceneAnalysis(sourceVideoId, videoUrl, mediaDurationMs);
  const silences = useMemo(
    () => (peaks ? detectSilences(peaks, 1000 / PEAKS_PER_SECOND) : []),
    [peaks],
  );
  const visibleWords = useMemo(() => doc.words.filter((w) => !w.hidden), [doc]);
  const analysis = useMemo(
    () => ({ silences, sceneCuts: scene.cuts ?? undefined }),
    [silences, scene.cuts],
  );
  const proposals = useMemo(
    () => {
      const ranked = rankClipProposals(visibleWords, analysis);
      // Package 3 item I.2: ~1 suggestion per 6 minutes of video, min 3, max 8, and
      // never more than the signals actually produced (the ranked list IS the support)
      return ranked.slice(0, clipTargetCount(mediaDurationMs, ranked.length));
    },
    [visibleWords, analysis, mediaDurationMs],
  );
  // Per-proposal user state is keyed by the proposal's own range (the same identity the
  // article's React key uses), NOT by list position: when scene analysis lands, proposals
  // re-rank, and index-keyed edits silently attached themselves to different clips.
  const keyOf = (p: RankedClipProposal) => `${p.startMs}-${p.endMs}`;
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

  /* ---------------- AI Clipping Studio state ---------------- */
  const [clipAiOn, setClipAiOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchClipAiStatus().then((s) => {
      if (alive) setClipAiOn(!!s?.configured);
    });
    const off = onModelState((s) => setModelReady(s.status === "ready"));
    return () => {
      alive = false;
      off();
    };
  }, []);
  const faceTrack = useFaceTrack({ sourceUrl: sourceUrl ?? videoUrl ?? null, sourceWidth: sourceWidth ?? 0, sourceHeight: sourceHeight ?? 0 });

  const [contentType, setContentType] = useState<ContentTypeId>("general");
  const [countChoice, setCountChoice] = useState("5");
  const [customCount, setCustomCount] = useState(7);
  const [durChoice, setDurChoice] = useState("30-60");
  const [customDur, setCustomDur] = useState({ min: 20, max: 75 });
  const [aspect, setAspect] = useState<ClipAspectId>("9:16");
  const [aiPhase, setAiPhase] = useState<"idle" | "running" | "done">("idle");
  const [stages, setStages] = useState<StageRow[]>([]);
  const [aiClips, setAiClips] = useState<HighlightClip[]>([]);
  const [aiSource, setAiSource] = useState<HighlightSource>("signals");
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [sortByTime, setSortByTime] = useState(false);
  const [aiCrops, setAiCrops] = useState<Record<string, AiCropState>>({});
  const [stillCrop, setStillCrop] = useState<Record<string, boolean>>({});
  const [createdClips, setCreatedClips] = useState<Record<string, { projectId: string; title: string }>>({});
  const [regenBusyId, setRegenBusyId] = useState<string | null>(null);
  const [regenNotes, setRegenNotes] = useState<Record<string, string>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [exportState, setExportState] = useState<Record<string, { status: "exporting" | "done" | "failed"; fraction?: number; message?: string }>>({});
  const [batchRunning, setBatchRunning] = useState(false);

  const requestOf = (): HighlightRequest => {
    const dur = durChoice === "custom" ? customDur : DURATION_PRESETS[durChoice]!;
    return {
      contentType,
      clipCount: countChoice === "custom" ? Math.max(1, Math.min(25, Math.round(customCount) || 5)) : Number(countChoice),
      minSec: Math.max(5, Math.min(dur.min, dur.max - 5)),
      maxSec: Math.max(dur.max, dur.min + 5),
      aspect,
    };
  };

  const setStage = (id: StageId, state: StageRow["state"], detail?: string) =>
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, state, detail: detail ?? s.detail } : s)));

  /** Adapt an engine clip into the card's proposal shape (signals measured for the same range). */
  const adaptClip = (clip: HighlightClip): RankedClipProposal => {
    const seg = {
      startMs: clip.startMs,
      endMs: clip.endMs,
      durationMs: clip.endMs - clip.startMs,
      text: clip.text,
      wordCount: clip.endWord - clip.startWord + 1,
    };
    return { ...seg, rank: clip.rank, signals: computeClipSignals(visibleWords, seg, analysis), explanation: clip.reason };
  };
  const aiProposals = useMemo(() => {
    const list = aiClips.map((clip) => ({ clip, proposal: adaptClip(clip) }));
    return sortByTime ? [...list].sort((a, b) => a.proposal.startMs - b.proposal.startMs) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiClips, sortByTime, visibleWords, analysis]);
  const aiByKey = useMemo(() => {
    const map = new Map<string, HighlightClip>();
    for (const { clip, proposal } of aiProposals) map.set(keyOf(proposal), clip);
    return map;
  }, [aiProposals]);

  const resolveRunner = () =>
    resolveHighlightRunner({
      runClipCloud: clipAiOn ? runClipCloudModel : undefined,
      modelEnabled: modelReady,
      runModel: runLocalModel,
    });

  /** Plan smart crops for the given clips (face sampling on-device; consent must already exist). */
  const analyseCrops = async (clips: HighlightClip[], forAspect: ClipAspectId): Promise<void> => {
    if (!needsReframeFor(sourceWidth, sourceHeight, ASPECT_RATIOS[forAspect]) || !sourceWidth || !sourceHeight) return;
    const sentences = buildSentences(visibleWords);
    const sentenceStarts = sentences.map((s) => s.startMs);
    for (const clip of clips) {
      const samples = await faceTrack.sampleRange(clip.startMs, clip.endMs);
      if (!samples) {
        setAiCrops((prev) => ({
          ...prev,
          [clip.id]: { status: "unavailable", plan: null, plannedFor: { startMs: clip.startMs, endMs: clip.endMs }, note: "Face analysis didn't run on this device — centre crop." },
        }));
        continue;
      }
      const cutPoints = (scene.cuts ?? []).map((c) => c.atMs).filter((t) => t > clip.startMs && t < clip.endMs);
      const bounds = [clip.startMs, ...cutPoints, clip.endMs];
      const spans = bounds.slice(0, -1).map((startMs, i) => ({ startMs, endMs: bounds[i + 1]! }));
      const plan = buildCropPath({
        samples,
        scenes: spans,
        rangeStartMs: clip.startMs,
        rangeEndMs: clip.endMs,
        sourceWidth,
        sourceHeight,
        aspect: forAspect,
        sentenceStartsMs: sentenceStarts,
      });
      const sceneCount = plan?.scenes.length ?? 0;
      const following = plan?.scenes.some((s) => s.keyframes.length > 0);
      setAiCrops((prev) => ({
        ...prev,
        [clip.id]: {
          status: plan?.anyFace ? "path" : "centre",
          plan,
          plannedFor: { startMs: clip.startMs, endMs: clip.endMs },
          note: !plan
            ? "Centre crop."
            : plan.anyFace
              ? following
                ? `Smart crop — follows the speaker across ${sceneCount} scene${sceneCount === 1 ? "" : "s"}.`
                : `Smart crop — centred on the speaker across ${sceneCount} scene${sceneCount === 1 ? "" : "s"}.`
              : "No face found in this clip — centre crop.",
        },
      }));
    }
  };

  const runAi = async () => {
    const request = requestOf();
    setAiPhase("running");
    setError(null);
    setAiNotes([]);
    setStages([
      { id: "transcript", label: "Reading the transcript", state: "done", detail: `${visibleWords.length} words` },
      {
        id: "measure",
        label: "Measuring audio & scenes",
        state: "done",
        detail: `${silences.length} silences${scene.cuts ? ` · ${scene.cuts.length} scene changes` : ""}`,
      },
      { id: "understand", label: "Understanding the content", state: "active" },
      { id: "moments", label: "Finding moments", state: "waiting" },
      { id: "ranking", label: "Ranking clips", state: "waiting" },
      { id: "crops", label: "Analysing speakers & crops", state: "waiting" },
      { id: "previews", label: "Preparing previews", state: "waiting" },
    ]);
    try {
      const resolved = resolveRunner();
      const result = await runHighlightEngine({
        words: visibleWords,
        analysis,
        peaks: peaks ?? null,
        hopMs: 1000 / PEAKS_PER_SECOND,
        request,
        runner: resolved?.runner ?? null,
        runnerSource: resolved?.source ?? null,
        concurrency: resolved?.concurrency,
        onStage: (event) => {
          if (event.type === "windows") setStage("understand", "active", `${event.total} section${event.total === 1 ? "" : "s"}`);
          if (event.type === "window-done") setStage("understand", "active", `section ${event.done} of ${event.total}`);
          if (event.type === "postprocess") {
            setStage("understand", "done");
            setStage("moments", "active", `${event.rawCandidates} candidates`);
          }
          if (event.type === "ranking") {
            setStage("moments", "done");
            setStage("ranking", "active");
          }
        },
      });
      setStage("ranking", "done");
      setAiClips(result.clips);
      setAiSource(result.source);
      setAiNotes(result.notes);
      // seed the title controls with the engine's titles (editable; the source badge says who wrote them)
      setTitles((prev) => {
        const next = { ...prev };
        for (const clip of result.clips) {
          const k = `${clip.startMs}-${clip.endMs}`;
          if (!(k in next)) {
            next[k] = {
              title: clip.title,
              text: clip.title,
              source: result.source === "cloud" ? "cloud" : result.source === "model" ? "model" : "template",
              fellBack: result.fellBack,
            };
          }
        }
        return next;
      });
      // crops stage
      if (result.clips.length && needsReframeFor(sourceWidth, sourceHeight, ASPECT_RATIOS[request.aspect])) {
        if (faceAssistConsented()) {
          setStage("crops", "active");
          await analyseCrops(result.clips, request.aspect);
          setStage("crops", "done");
        } else {
          setStage("crops", "skipped", "face analysis off — centre crops");
          setAiCrops((prev) => {
            const next = { ...prev };
            for (const clip of result.clips) {
              next[clip.id] = { status: "pending-consent", plan: null, plannedFor: { startMs: clip.startMs, endMs: clip.endMs }, note: "Centre crop — smart crop needs the on-device face model." };
            }
            return next;
          });
        }
      } else {
        setStage("crops", "skipped", result.clips.length ? "no crop needed for this aspect" : "no clips");
      }
      // previews stage (thumbnails)
      if (result.clips.length) {
        setStage("previews", "active");
        const captured = await captureClipThumbnails(sourceUrl ?? videoUrl ?? null, result.clips.map((c) => ({ key: c.id, atMs: c.startMs })));
        setThumbs((prev) => ({ ...prev, ...captured }));
      }
      setStage("previews", "done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finding clips didn't work. Try again.");
      setStages((prev) => prev.map((s) => (s.state === "active" ? { ...s, state: "skipped", detail: "stopped" } : s)));
    } finally {
      setAiPhase("done");
    }
  };

  const grantConsentAndAnalyseCrops = async () => {
    grantFaceAssistConsent();
    setStage("crops", "active");
    await analyseCrops(aiClips, aspect);
    setStage("crops", "done");
  };

  const regenerate = async (clip: HighlightClip) => {
    setRegenBusyId(clip.id);
    setRegenNotes((prev) => ({ ...prev, [clip.id]: "" }));
    try {
      const resolved = resolveRunner();
      const result = await runHighlightEngine({
        words: visibleWords,
        analysis,
        peaks: peaks ?? null,
        hopMs: 1000 / PEAKS_PER_SECOND,
        request: { ...requestOf(), clipCount: 1 },
        runner: resolved?.runner ?? null,
        runnerSource: resolved?.source ?? null,
        concurrency: resolved?.concurrency,
        exclude: aiClips.map((c) => ({ startWord: c.startWord, endWord: c.endWord })),
      });
      const fresh = result.clips[0];
      if (!fresh) {
        setRegenNotes((prev) => ({ ...prev, [clip.id]: "No different moment was found for this slot." }));
        return;
      }
      const replacement: HighlightClip = { ...fresh, rank: clip.rank };
      setAiClips((prev) => prev.map((c) => (c.id === clip.id ? replacement : c)));
      setCreatedClips((prev) => {
        const next = { ...prev };
        delete next[clip.id];
        return next;
      });
      setTitles((prev) => ({
        ...prev,
        [`${replacement.startMs}-${replacement.endMs}`]: {
          title: replacement.title,
          text: replacement.title,
          source: result.source === "cloud" ? "cloud" : result.source === "model" ? "model" : "template",
          fellBack: result.fellBack,
        },
      }));
      if (faceAssistConsented()) await analyseCrops([replacement], aspect);
      const captured = await captureClipThumbnails(sourceUrl ?? videoUrl ?? null, [{ key: replacement.id, atMs: replacement.startMs }]);
      setThumbs((prev) => ({ ...prev, ...captured }));
    } catch {
      setRegenNotes((prev) => ({ ...prev, [clip.id]: "Regenerating didn't work — the clip above is unchanged." }));
    } finally {
      setRegenBusyId(null);
    }
  };

  if (doc.words.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Clipper" hint="Clip suggestions appear here once this video has captions.">
          <p className="text-sm text-st-muted">No captions yet — transcribe the video first, then come back.</p>
        </Section>
      </div>
    );
  }

  const rangeOf = (p: RankedClipProposal) => edits[keyOf(p)] ?? { startMs: p.startMs, endMs: p.endMs };
  const setRange = (p: RankedClipProposal, patch: Partial<{ startMs: number; endMs: number }>) =>
    setEdits((prev) => ({ ...prev, [keyOf(p)]: clampClipRange({ ...rangeOf(p), ...patch }, mediaDurationMs) }));

  /**
   * The one creation flow both lists use. Returns the created project id +
   * warnings, or null on failure (the error state is set either way).
   * Navigation is the CALLER's choice: the measured list keeps its original
   * open-on-create behaviour; AI cards stay put so several clips can be
   * created and batch-exported.
   */
  const doCreate = async (p: RankedClipProposal): Promise<{ id: string; warnings: string[] } | null> => {
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

      // framing: an AI clip carries its aspect; a planned crop PATH rides when the
      // range is untouched and the user didn't switch to a still crop
      const clip = aiByKey.get(k);
      let framing: { reframeWindow?: CropWindow; aspect?: ClipAspectId; cropPath?: { scenes: ReturnType<typeof planToWire> } } = {};
      if (clip) {
        framing = { aspect };
        const crop = aiCrops[clip.id];
        const rangeUntouched = range.startMs === clip.startMs && range.endMs === clip.endMs;
        if (crop?.plan && rangeUntouched && !stillCrop[clip.id]) {
          framing = { aspect, cropPath: { scenes: planToWire(crop.plan) } };
        } else if (needsReframeFor(sourceWidth, sourceHeight, ASPECT_RATIOS[aspect]) && !reframeOff[k]) {
          framing = { aspect, reframeWindow: windows[k] ?? DEFAULT_CROP_WINDOW };
        }
      } else if (canReframe && !reframeOff[k]) {
        framing = { reframeWindow: windows[k] ?? DEFAULT_CROP_WINDOW };
      }

      const { projectId: newId, warnings } = await createClipProject({
        sourceProjectId: projectId,
        sourceTitle,
        sourceVideoId,
        doc,
        startMs: range.startMs,
        endMs: range.endMs,
        // a generated title the user confirmed (blank text = never mind, plain range title)
        title: titles[k]?.text.trim() ? titles[k]!.text : undefined,
        ...framing,
        elements: elements.length ? elements : undefined,
        broll: broll.length ? broll : undefined,
      });
      setBusyKey(null);
      return { id: newId, warnings };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the clip. Try again.");
      setBusyKey(null);
      return null;
    }
  };

  const create = async (p: RankedClipProposal) => {
    const created = await doCreate(p);
    if (!created) return;
    if (created.warnings.length) {
      // the clip exists; say plainly what didn't ride along, and let the user open it
      setCreatedWithWarnings({ id: created.id, warnings: created.warnings });
    } else {
      router.push(`/projects/${created.id}`);
    }
  };

  const createAi = async (p: RankedClipProposal, clip: HighlightClip) => {
    const created = await doCreate(p);
    if (!created) return;
    const k = keyOf(p);
    setCreatedClips((prev) => ({ ...prev, [clip.id]: { projectId: created.id, title: titles[k]?.text.trim() || clip.title } }));
    if (created.warnings.length) setCreatedWithWarnings({ id: created.id, warnings: created.warnings });
  };

  const exportOne = async (clip: HighlightClip) => {
    const created = createdClips[clip.id];
    if (!created) return;
    setExportState((prev) => ({ ...prev, [clip.id]: { status: "exporting", fraction: 0 } }));
    try {
      await exportClipProject(created.projectId, {
        onProgress: (fraction) => setExportState((prev) => ({ ...prev, [clip.id]: { status: "exporting", fraction } })),
      });
      setExportState((prev) => ({ ...prev, [clip.id]: { status: "done" } }));
    } catch (e) {
      setExportState((prev) => ({
        ...prev,
        [clip.id]: { status: "failed", message: e instanceof Error ? e.message : "The export failed on this device." },
      }));
    }
  };

  const exportBatch = async () => {
    const created = aiClips.filter((c) => createdClips[c.id]);
    if (created.length === 0) return;
    setBatchRunning(true);
    const byProject = new Map(created.map((c) => [createdClips[c.id]!.projectId, c.id]));
    try {
      await runBatchExport(
        created.map((c) => createdClips[c.id]!.projectId),
        {
          onEvent: (event) => {
            const clipId = byProject.get(event.projectId);
            if (!clipId) return;
            if (event.type === "start") setExportState((prev) => ({ ...prev, [clipId]: { status: "exporting", fraction: 0 } }));
            if (event.type === "progress") setExportState((prev) => ({ ...prev, [clipId]: { status: "exporting", fraction: event.fraction } }));
            if (event.type === "done") setExportState((prev) => ({ ...prev, [clipId]: { status: "done" } }));
            if (event.type === "failed") setExportState((prev) => ({ ...prev, [clipId]: { status: "failed", message: event.message } }));
          },
        },
      );
    } finally {
      setBatchRunning(false);
    }
  };

  const findBroll = async (p: RankedClipProposal) => {
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

  const selectCls = "w-full rounded-lg border border-st-line bg-st-panel px-2 py-1.5 text-sm text-st-text outline-none focus:border-st-ink/40";
  const labelCls = "mb-1 block text-[11px] font-medium text-st-faint";

  const renderCard = (p: RankedClipProposal, i: number, clip: HighlightClip | null) => {
    const k = keyOf(p);
    const range = rangeOf(p);
    const created = clip ? createdClips[clip.id] : undefined;
    const exp = clip ? exportState[clip.id] : undefined;
    const crop = clip ? aiCrops[clip.id] : undefined;
    const showPath = !!(clip && crop?.plan && !stillCrop[clip.id]);
    return (
      <article key={clip ? `ai-${clip.id}` : k} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
        <div className="flex items-start gap-3">
          {clip ? (
            thumbs[clip.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[clip.id]} alt="" className="aspect-video w-28 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex aspect-video w-28 shrink-0 items-center justify-center rounded-lg bg-st-panel text-[10px] text-st-faint">
                No preview frame
              </div>
            )
          ) : null}
          <div className="min-w-0 flex-1">
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
          </div>
        </div>
        {clip ? <ClipScoreBlock clip={clip} source={aiSource} /> : <ClipExplanation signals={p.signals} explanation={p.explanation} />}
        {clip && sourceUrl ? (
          <video
            src={`${sourceUrl}#t=${(range.startMs / 1000).toFixed(2)},${(range.endMs / 1000).toFixed(2)}`}
            controls
            preload="metadata"
            playsInline
            className="mt-2 aspect-video w-full rounded-lg bg-black"
          />
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelCls}>Start (seconds)</span>
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
            <span className={labelCls}>End (seconds)</span>
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
        {clip ? (
          <div className="mt-3">
            <span className={labelCls}>Crop for {aspect}</span>
            {!needsReframeFor(sourceWidth, sourceHeight, ASPECT_RATIOS[aspect]) ? (
              <p className="text-xs text-st-faint">Your source already fits {aspect} — no crop needed.</p>
            ) : showPath ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-st-text">{crop!.note}</p>
                <Button onClick={() => setStillCrop((prev) => ({ ...prev, [clip.id]: true }))} className="!py-1 text-xs">
                  Use a still crop instead
                </Button>
              </div>
            ) : crop?.plan && stillCrop[clip.id] ? (
              <p className="text-xs text-st-faint">Still crop — position it below. The smart path is dropped for this clip.</p>
            ) : (
              <p className="text-xs text-st-faint">{crop?.note ?? "Centre crop."}</p>
            )}
            {!showPath && aspect === "9:16" && sourceWidth && sourceHeight ? (
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
            ) : !showPath && aspect !== "9:16" && needsReframeFor(sourceWidth, sourceHeight, ASPECT_RATIOS[aspect]) ? (
              <p className="mt-1 text-xs text-st-faint">Still centre crop for {aspect} — fine-tune it in the Studio after creating.</p>
            ) : null}
          </div>
        ) : canReframe && sourceWidth && sourceHeight ? (
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
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            tone="primary"
            disabled={busyKey !== null}
            onClick={() => void (clip ? createAi(p, clip) : create(p))}
            className="flex-1"
          >
            {busyKey === k ? "Creating clip…" : created ? "Created — create again" : "Create clip"}
          </Button>
          {clip ? (
            <Button disabled={regenBusyId !== null || aiPhase === "running"} onClick={() => void regenerate(clip)}>
              {regenBusyId === clip.id ? "Regenerating…" : "Regenerate clip"}
            </Button>
          ) : null}
        </div>
        {clip && regenNotes[clip.id] ? <p className="mt-2 text-xs text-st-muted">{regenNotes[clip.id]}</p> : null}
        {clip && created ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${created.projectId}`}
              className="inline-block font-semibold text-st-text underline decoration-emerald-accent decoration-2 underline-offset-4 text-sm"
            >
              Open in Studio
            </Link>
            <Button disabled={exp?.status === "exporting" || batchRunning} onClick={() => void exportOne(clip)} className="!py-1 text-xs">
              {exp?.status === "exporting" ? `Exporting… ${Math.round((exp.fraction ?? 0) * 100)}%` : exp?.status === "done" ? "Exported — export again" : "Export MP4"}
            </Button>
            {exp?.status === "failed" ? <span role="alert" className="text-xs text-st-text">{exp.message}</span> : null}
          </div>
        ) : null}
      </article>
    );
  };

  const cropsPendingConsent = aiClips.some((c) => aiCrops[c.id]?.status === "pending-consent");
  const createdCount = aiClips.filter((c) => createdClips[c.id]).length;

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title="Clipper"
        hint="Clips suggested from your transcript, silences and scene changes — measured on your device."
        more="The AI Clipping Studio reads the transcript and ranks moments with an Editorial score — an estimate, never a performance prediction; its breakdown shows which parts the model judged and which your device measured. The measured suggestions below are ordered by the signals on each clip. Adjust the edges, then create a clip: it becomes its own caption project, and your source video is not cut."
      >
        {/* ---------- AI Clipping Studio ---------- */}
        <div className="mb-4 rounded-xl border border-st-line bg-st-raised/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-sora text-sm font-bold text-st-text">AI Clipping Studio</h3>
            <span className="ml-auto">
              {clipAiOn ? (
                <SourceBadge source="cloud" />
              ) : modelReady ? (
                <SourceBadge source="model" />
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-sand-500" />
                  Signals only — free AI unavailable
                </span>
              )}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-st-faint">
            {sourceWidth && sourceHeight ? `${sourceWidth}×${sourceHeight} · ` : ""}
            {Math.round(mediaDurationMs / 1000)}s of video. Only transcript text is sent to the free AI — the video never leaves this device.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelCls}>Content type</span>
              <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentTypeId)} className={selectCls}>
                {CONTENT_TYPE_RUBRICS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Clips to find</span>
              <select value={countChoice} onChange={(e) => setCountChoice(e.target.value)} className={selectCls}>
                <option value="3">3 clips</option>
                <option value="5">5 clips</option>
                <option value="10">10 clips</option>
                <option value="custom">Custom…</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Clip length</span>
              <select value={durChoice} onChange={(e) => setDurChoice(e.target.value)} className={selectCls}>
                <option value="15-30">15–30 seconds</option>
                <option value="30-60">30–60 seconds</option>
                <option value="60-90">60–90 seconds</option>
                <option value="custom">Custom…</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Shape</span>
              <select value={aspect} onChange={(e) => setAspect(e.target.value as ClipAspectId)} className={selectCls}>
                <option value="9:16">9:16 vertical</option>
                <option value="1:1">1:1 square</option>
                <option value="16:9">16:9 landscape</option>
              </select>
            </label>
          </div>
          {countChoice === "custom" ? (
            <label className="mt-2 block">
              <span className={labelCls}>Number of clips</span>
              <input type="number" min={1} max={25} value={customCount} onChange={(e) => setCustomCount(Number(e.target.value))} className={selectCls} />
            </label>
          ) : null}
          {durChoice === "custom" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className={labelCls}>Shortest (seconds)</span>
                <input type="number" min={5} max={600} value={customDur.min} onChange={(e) => setCustomDur((d) => ({ ...d, min: Number(e.target.value) }))} className={selectCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Longest (seconds)</span>
                <input type="number" min={10} max={900} value={customDur.max} onChange={(e) => setCustomDur((d) => ({ ...d, max: Number(e.target.value) }))} className={selectCls} />
              </label>
            </div>
          ) : null}
          <Button tone="primary" disabled={aiPhase === "running"} onClick={() => void runAi()} className="mt-3 w-full">
            {aiPhase === "running" ? "Finding clips…" : aiClips.length ? "Run again" : "Find clips"}
          </Button>
          {stages.length > 0 && aiPhase !== "idle" ? (
            <ol className="mt-3 space-y-1">
              {stages.map((s) => (
                <li key={s.id} className="flex items-baseline gap-2 text-xs">
                  <span aria-hidden className={`inline-block w-3 text-center ${s.state === "done" ? "text-emerald-accent" : s.state === "active" ? "animate-pulse text-st-text" : "text-st-faint"}`}>
                    {s.state === "done" ? "✓" : s.state === "active" ? "•" : "–"}
                  </span>
                  <span className={s.state === "waiting" ? "text-st-faint" : "text-st-text"}>{s.label}</span>
                  {s.detail ? <span className="text-st-faint">{s.detail}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {aiNotes.map((note, i) => (
            <p key={i} className="mt-2 text-xs text-st-muted">{note}</p>
          ))}
          {cropsPendingConsent ? (
            <div className="mt-3 rounded-lg border border-st-line bg-st-panel px-3 py-2">
              <p className="text-xs text-st-text">
                Smart crop follows the speaker using an on-device face model (YuNet) — frames are analysed in your browser and never uploaded.
              </p>
              <div className="mt-2 flex gap-2">
                <Button tone="primary" onClick={() => void grantConsentAndAnalyseCrops()} className="!py-1 text-xs">Use smart crop</Button>
                <Button
                  onClick={() =>
                    setAiCrops((prev) => {
                      const next = { ...prev };
                      for (const c of aiClips) {
                        if (next[c.id]?.status === "pending-consent") next[c.id] = { ...next[c.id]!, status: "centre", note: "Centre crop — smart crop not enabled." };
                      }
                      return next;
                    })
                  }
                  className="!py-1 text-xs"
                >
                  Keep centre crops
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* ---------- AI results ---------- */}
        {aiPhase === "done" && aiClips.length > 0 ? (
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-sora text-sm font-bold text-st-text">AI clips</h3>
              <div className="flex gap-1.5 text-xs">
                <button type="button" onClick={() => setSortByTime(false)} className={`rounded-full border px-2.5 py-1 ${!sortByTime ? "border-st-ink bg-st-lav text-st-ink" : "border-st-line bg-st-panel text-st-muted"}`}>
                  By score
                </button>
                <button type="button" onClick={() => setSortByTime(true)} className={`rounded-full border px-2.5 py-1 ${sortByTime ? "border-st-ink bg-st-lav text-st-ink" : "border-st-line bg-st-panel text-st-muted"}`}>
                  By time
                </button>
              </div>
            </div>
            {createdCount > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-st-line bg-st-panel px-3 py-2">
                <span className="text-xs text-st-text">{createdCount} clip{createdCount === 1 ? "" : "s"} created</span>
                <Button tone="primary" disabled={batchRunning} onClick={() => void exportBatch()} className="!py-1 text-xs">
                  {batchRunning ? "Exporting…" : `Export all created (${createdCount})`}
                </Button>
              </div>
            ) : null}
            <div className="space-y-3">
              {aiProposals.map(({ clip, proposal }, i) => renderCard(proposal, i, clip))}
            </div>
          </div>
        ) : aiPhase === "done" && aiClips.length === 0 ? (
          <p className="mb-5 text-sm text-st-muted">No AI clips from the last run — the measured suggestions below still apply.</p>
        ) : null}

        {/* ---------- Measured suggestions (the original Clipper) ---------- */}
        <h3 className="mb-2 font-sora text-sm font-bold text-st-text">Measured suggestions</h3>
        <p className="mb-3 text-xs text-st-faint">
          Analysis on this video: {peaks ? `${silences.length} silence span${silences.length === 1 ? "" : "s"} measured from the audio` : "audio silence not measured yet (waveform still loading)"}
          {" · "}
          {scene.state === "ready" ? `${scene.cuts.length} scene change${scene.cuts.length === 1 ? "" : "s"} measured from frame differences` : "scene changes still being measured — ordering uses the signals available so far"}.
        </p>
        {proposals.length === 0 ? (
          <p className="text-sm text-st-muted">No speech segments found in these captions yet.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p, i) => renderCard(p, i, null))}
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
