"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayerRef } from "@remotion/player";
import { computePages } from "@capseasy/compositions";
import { CaptionDocSchema, effectiveDurationMs, translationModelFor, type CaptionDoc, type CompositionTrackKind, type TrackState } from "@capseasy/shared";
import { getLook, getTemplate, loadFontFamily } from "@capseasy/templates";
import { deleteWordsByIds, insertWordAfter, mergeWithPrevious, retimeRun, setEmphasis, setHidden, setWordText, shiftWordsByIds, splitCardAt } from "@motion-ai/caption-engine/core";
import { Copy, EyeOff, Keyboard, Redo2, Scissors, Star, Trash2, Undo2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { StudioSkeleton } from "@/components/brand/Skeletons";
import { useBrandNav } from "@/components/brand/BrandNav";
import { useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { ApiError } from "@/services/api-client";
import { Button } from "./controls";
// The export dialog pulls in the whole in-browser renderer (Remotion web-renderer + Mediabunny). Load it
// only when the creator actually opens Export — the studio's first paint (especially on a phone) should
// not carry or evaluate that machinery.
const ExportModal = dynamic(() => import("./ExportModal").then((m) => m.ExportModal), { ssr: false });
import { CaptionsPanel } from "./panels/CaptionsPanel";
import { LooksPanel } from "./panels/LooksPanel";
import { SettingsPanel, StylePanel } from "./panels/StylePanel";
import { MediaPanel } from "./panels/MediaPanel";
import { TextPanel } from "./panels/TextPanel";
import { ElementsPanel } from "./panels/ElementsPanel";
import { AdjustPanel } from "./panels/AdjustPanel";
import { AudioPanel } from "./panels/AudioPanel";
import { ClipperPanel } from "./panels/ClipperPanel";
import { TranslatePanel } from "./panels/TranslatePanel";
import { ProcessingPanel } from "./ProcessingPanel";
import { StudioPlayer } from "./StudioPlayer";
import { Timeline } from "./Timeline";
import { UploadPanel } from "./UploadPanel";
import { SignupGate } from "./SignupGate";
import { projectsService } from "@/services/projects";
import { studioService } from "@/services/studio";
import { useDeviceVideo } from "@/features/upload/useDeviceVideo";
import { useCompatCopy } from "@/features/upload/useCompatCopy";
import { etaText } from "./ProcessingPanel";
import { getSession, useSessionView } from "@/features/transcribe/session";
import { currentUserIsGuest, signInExistingWithGoogle, takeIdentityExistsError } from "@/services/auth/guest";
import { useWaveform, PEAKS_PER_SECOND } from "./useWaveform";
import { applyAutoZooms, generateAutoZoomPlan, type AutoZoomIntensity } from "./autoZooms";
import { appendTitleCardClip, transcriptTextOf } from "./titleCard";
import { toComposition } from "./composition";
import { buildEditorComposition, projectComposition, type EditorComposition } from "./compositionDoc";
import {
  addMarker, addSegmentEffect, addSegmentKeyframe, applyContentEffect, applyDocEffect,
  canRippleDeleteVideoSegment, deleteOverlayClip,
  duplicateOverlayClip, duplicateVideoSegment, insertStillSegmentAt, moveOverlayClip, moveSegmentEffect,
  overlayTrackOf,
  removeMarker, removeSegmentEffect, removeSegmentKeyframe, rippleDeleteOverlayClip,
  rippleDeleteVideoSegment, setSegmentPlaybackRate,
  setSegmentTransition, setSegmentTransform, setTrackState, splitOverlayClipAt, splitVideoClipAt,
  trimOverlayClip, trimVideoClipEdge, updateSegmentEffect, updateSegmentKeyframe, type DocEffect,
} from "./compositionOps";
import { canvasDims, canvasOf } from "./canvas";
import {
  applyReversedSegment, buildSegmentAssetUrls, pickStudioDurationMs, resolveSegmentView, type SegmentLike,
} from "./segmentView";
import { SegmentInspector, type SegmentProductionState } from "./panels/SegmentInspector";
import { getLocalVideo } from "@/features/upload/localVideos";
import { listProjectAssets } from "./mediaStore";
import { splitWordIdAtPlayhead } from "./playheadSplit";
import { resolveDeleteAction } from "./deleteSelection";
import { useMediaAssets } from "./useMediaAssets";
import { makeImageOverlay } from "./panels/overlayItems";
import {
  addAudioTrack, duplicateAudioClip, moveAudioClip, placeAudioClip, removeAudioClip, removeAudioTrack,
  setAudioDucking, splitAudioClipAt, trimAudioClip, updateAudioClip, updateAudioClipProcessors,
  updateAudioMaster, updateAudioTrack,
} from "./audioOps";
import { buildMixPlan, mixIsActive } from "./audio/mixPlan";
import { renderMixedAudio } from "./audio/mixdown";
import { muxMixedAudioIntoMp4 } from "./audio/exportMix";
import { useAudioPreview } from "./useAudioPreview";
import { useStudio, type SaveState } from "./useStudio";
import { TutorialTour } from "./TutorialTour";
import { shouldShowTutorial } from "./tutorial";

/**
 * Left-rail tool sections (owner correction #3, full-studio brief §7 layout, first instalment).
 * The rail is the growth point for the §7 layout: adding a section = one entry here + one entry in
 * the panel registry (`renderPanel` in StudioPage). Future sections (Audio, Effects, Transitions)
 * and the right inspector slot in beside these, not into a new tab row.
 */
type PanelId = "captions" | "templates" | "style" | "timing" | "media" | "text" | "elements" | "adjust" | "audio" | "clipper" | "translate";

const railIcon = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

const RAIL_SECTIONS: { id: PanelId; label: string; icon: React.ReactNode; tour?: "templates" | "style" }[] = [
  { id: "media", label: "Media", icon: railIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M3 16l5-4 4 3 3-2 6 5" /></>) },
  { id: "captions", label: "Captions", icon: railIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h6M7 14h10" /></>) },
  { id: "translate", label: "Translate", icon: railIcon(<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5s1.3-6.2 3.9-8.5z" /></>) },
  { id: "templates", label: "Templates", tour: "templates", icon: railIcon(<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>) },
  { id: "style", label: "Style", tour: "style", icon: railIcon(<text x="12" y="17" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">Aa</text>) },
  { id: "text", label: "Text", icon: railIcon(<path d="M5 5h14M12 5v14" />) },
  { id: "elements", label: "Elements", icon: railIcon(<><circle cx="8" cy="8" r="3.5" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M17.5 3.5l3 5h-6z" /></>) },
  { id: "adjust", label: "Adjust", icon: railIcon(<><path d="M4 8h9M19 8h1M4 16h3M13 16h7" /><circle cx="16" cy="8" r="2" /><circle cx="10" cy="16" r="2" /></>) },
  { id: "audio", label: "Audio", icon: railIcon(<><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></>) },
  { id: "timing", label: "Timing", icon: railIcon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>) },
  { id: "clipper", label: "Clipper", icon: railIcon(<><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8.2 7.8L20 19M8.2 16.2L20 5" /></>) },
];

const SAVE_LABEL: Record<SaveState, { text: string; dot: string }> = {
  saved: { text: "Saved", dot: "bg-st-em" },
  dirty: { text: "Unsaved", dot: "bg-st-or" },
  saving: { text: "Saving…", dot: "bg-st-or animate-pulse" },
  offline: { text: "Offline · retrying", dot: "bg-orange-accent" },
  conflict: { text: "Conflict", dot: "bg-orange-accent" },
};

/** Tracks the lg breakpoint so only ONE editor layout (and one Player) is mounted at a time. */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function StudioPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const nav = useBrandNav();
  const qc = useQueryClient();
  const s = useStudio(projectId);
  const { data, style, settings } = s;
  // captions still being written in this tab: shown in the editor as they arrive (read-only until they're all in)
  const liveView = useSessionView(projectId);
  const writing = !!liveView && (liveView.phase === "starting" || liveView.phase === "running" || liveView.phase === "saving");
  const draft = useMemo(
    () => (!s.doc && writing && liveView && liveView.words.length > 0 ? CaptionDocSchema.parse({ version: 2, words: liveView.words, language: "en" }) : null),
    [s.doc, writing, liveView],
  );
  const doc = s.doc ?? draft;
  const live = !s.doc && !!draft;
  // the server takes over the moment the run is saved (or has ended)
  const phase = liveView?.phase;
  const refetchStudio = s.refetch;
  useEffect(() => {
    if (phase === "saved" || phase === "failed" || phase === "stopped") void refetchStudio();
  }, [phase, refetchStudio]);
  // first-run mini tutorial: the first time generated captions land (the session's "saved" transition,
  // or the first adopted document with words) and the seen flag is unset, start the tour after a beat
  const tourCheckedRef = useRef(false);
  const docForTour = s.doc;
  useEffect(() => {
    if (tourCheckedRef.current) return;
    const landed = phase === "saved" || (docForTour != null && docForTour.words.length > 0);
    if (!landed) return;
    tourCheckedRef.current = true;
    if (!shouldShowTutorial()) return;
    const t = setTimeout(() => setShowTour(true), 900);
    return () => clearTimeout(t);
  }, [phase, docForTour]);
  const desktop = useIsDesktop();

  const [section, setSection] = useState<PanelId>("captions");
  const [mobileTimeline, setMobileTimeline] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** drag selection of caption words (ids, spanning cards), shared by the captions panel + timeline */
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selVideoClipId, setSelVideoClipId] = useState<string | null>(null);
  const [selMarkerId, setSelMarkerId] = useState<string | null>(null);
  const [selAudioClipId, setSelAudioClipId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // one selection kind at a time: picking a word / overlay / video segment / marker clears the
  // others, so Delete and the contextual timeline tools always act on what the user just picked
  const selectWord = (id: string | null) => {
    setSelectedId(id);
    if (id) { setSelectedOverlayId(null); setSelVideoClipId(null); setSelMarkerId(null); setSelAudioClipId(null); }
  };
  const selectOverlay = (id: string | null) => {
    setSelectedOverlayId(id);
    if (id) { setSelectedId(null); setSelectedWordIds(new Set()); setSelVideoClipId(null); setSelMarkerId(null); setSelAudioClipId(null); }
  };
  const selectVideoClip = (id: string | null) => {
    setSelVideoClipId(id);
    if (id) { setSelectedId(null); setSelectedWordIds(new Set()); setSelectedOverlayId(null); setSelMarkerId(null); setSelAudioClipId(null); }
  };
  const selectMarker = (id: string | null) => {
    setSelMarkerId(id);
    if (id) { setSelectedId(null); setSelectedWordIds(new Set()); setSelectedOverlayId(null); setSelVideoClipId(null); setSelAudioClipId(null); }
  };
  const selectAudioClip = (id: string | null) => {
    setSelAudioClipId(id);
    if (id) { setSelectedId(null); setSelectedWordIds(new Set()); setSelectedOverlayId(null); setSelVideoClipId(null); setSelMarkerId(null); }
  };
  /** selecting an audio clip on the Timeline also opens its panel (both layouts) */
  const selectAudioClipFromTimeline = (id: string | null) => {
    selectAudioClip(id);
    if (id) { setSection("audio"); setMobileTimeline(false); }
  };
  const handleWordSelectionChange = (ids: Set<string>) => {
    setSelectedWordIds(ids);
    if (ids.size > 0) { setSelectedOverlayId(null); setSelVideoClipId(null); setSelMarkerId(null); setSelAudioClipId(null); }
  };
  const [showTour, setShowTour] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [signupNotice, setSignupNotice] = useState<string | null>(null);
  // guests edit freely; exporting is the moment to create the (free) account
  const openExport = useCallback(async () => {
    if (await currentUserIsGuest()) setShowSignup(true);
    else setShowExport(true);
  }, []);
  // arriving from the /clipper launcher with ?clipper=1: open the Clipper panel straight away
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("clipper")) return;
    url.searchParams.delete("clipper");
    window.history.replaceState(null, "", url.toString());
    setSection("clipper");
  }, []);
  // back from Google sign-up with ?export=1: carry on to the export dialog
  useEffect(() => {
    // that Google account already has CaptionsEasy: sign in to it; /start moves this project over and comes back here
    if (takeIdentityExistsError()) {
      const back = new URL(window.location.href);
      back.searchParams.set("export", "1");
      void signInExistingWithGoogle(back.pathname + back.search);
      return;
    }
    const url = new URL(window.location.href);
    // Google sign-in didn't finish (cancelled or refused): say so, and let them pick again
    if (url.searchParams.has("signin")) {
      url.searchParams.delete("signin");
      window.history.replaceState(null, "", url.toString());
      setSignupNotice("Google sign-in didn't finish. Try again, or use your email below.");
      setShowSignup(true);
      return;
    }
    if (!url.searchParams.has("export")) return;
    url.searchParams.delete("export");
    window.history.replaceState(null, "", url.toString());
    void openExport();
  }, [openExport]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) router.replace(`/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
  }, [router, projectId]);

  // the video plays from this device; Supabase only stores the captions
  const device = useDeviceVideo(data?.video ?? null);
  // "captions only": this browser can't show the picture, so nothing is played (the captions still work)
  const captionsOnly = data?.video?.previewMode === "captions-only";
  const video = device.video && captionsOnly ? { ...device.video, url: null } : device.video;
  // export copy for a video the browser plays but can't read frame by frame: made after the captions are in
  const compat = useCompatCopy(data?.video?.id ?? null, !!data?.video?.needsCompat && !captionsOnly, !!s.doc);
  const width = video?.width || 1080;
  const height = video?.height || 1920;
  const fps = video?.fps || 30;
  const sourceDurationMs = video?.durationMs || (doc ? Math.max(0, ...doc.words.map((w) => w.endMs)) + 500 : 10000);
  // Run-2 duration truth: when at least one video segment is stored, the composition's own
  // duration (rate-aware timeline sum minus transition overlaps, segmentView.ts) is the truth.
  // Otherwise the pre-Run-2 path stands — clip projects: the working duration is ONLY the
  // segment (the video row still reports the full source length); the caption doc is already
  // shifted to segment time, so everything downstream (player, timeline, export modal) works
  // in clip time from this one number.
  const storedSegments = (settings.composition?.videoSegments ?? []) as SegmentLike[];
  const durationMs = pickStudioDurationMs({
    storedSegments,
    fallbackDurationMs: video?.durationMs ? effectiveDurationMs(sourceDurationMs, settings.clipRange) : sourceDurationMs,
  });
  // the canvas the preview + export are authored at: the source box, or the chosen aspect
  // fitted inside it (canvas.ts). Source width/height above stay the truth about the file.
  const canvasSettings = canvasOf(settings);
  const canvasSize = canvasDims(canvasSettings, width, height);

  // load the fonts the style needs before measuring text (same requirement as the render)
  const fontKey = style ? [style.fontId, style.hero.fontId ?? "", ...getTemplate(style.templateId).fonts].join("|") : "";
  // Font gate for page metrics — but ONLY the first load may gate. A template switch changes fontKey;
  // resetting fontsReady there emptied `pages` (captions + timeline blank) until the new template's
  // fonts downloaded, which is exactly the 1–2 s selection glitch. Now: keep rendering with the
  // current pages, and bump fontEpoch when the new fonts land so pages recompute with real metrics.
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    if (!fontKey) return;
    let alive = true;
    void Promise.all(fontKey.split("|").filter(Boolean).map(loadFontFamily)).then(() => {
      if (!alive) return;
      setFontsReady(true);
      setFontEpoch((e) => e + 1);
    });
    return () => { alive = false; };
  }, [fontKey]);

  // Caption pages are laid out on the COMPOSITION canvas (canvasSize), the same frame
  // the Player and the export render — with aspect "source" that is the source box, so
  // untouched projects are unchanged; with a chosen aspect the captions follow the frame.
  const canvas = useMemo(() => ({ width: canvasSize.width, height: canvasSize.height, fps }), [canvasSize.width, canvasSize.height, fps]);
  // the media bin (device-local assets for this project) — the panel manages it, the composition
  // rendering below resolves placed image overlays from it
  const mediaBin = useMediaAssets(projectId);
  const wave = useWaveform(video?.id, video?.url, video?.size);
  const pages = useMemo(() => (doc && style && fontsReady ? computePages(doc, settings, style, canvas) : []), [doc, style, settings, canvas, fontsReady, fontEpoch]);
  const currentPage = pages.find((p) => timeMs >= p.startMs && timeMs < p.endMs) ?? null;
  const selected = doc?.words.find((w) => w.id === selectedId) ?? null;

  const seek = useCallback((ms: number) => {
    playerRef.current?.seekTo(Math.max(0, Math.round((ms / 1000) * fps)));
    setTimeMs(ms);
  }, [fps]);

  const getPlayerMs = useCallback(() => ((playerRef.current?.getCurrentFrame() ?? 0) / fps) * 1000, [fps]);

  // Stage-A composition view (read-side only): timeline + panels read tracks/clips from this;
  // every write still goes through edit() / patchSettings / device.attach — no parallel state.
  const composition = useMemo(
    () =>
      doc && style
        ? toComposition({
            media: { videoId: data?.video?.id ?? null, filename: data?.video?.filename ?? null, size: data?.video?.size ?? null, width, height, fps, durationMs },
            doc,
            pages,
            settings,
            durationMs,
          })
        : null,
    [doc, style, pages, settings, width, height, fps, durationMs, data?.video?.id, data?.video?.filename, data?.video?.size],
  );

  // Stage-B editor composition: the partition / markers / track state the timeline edits.
  // Built from the Stage-A view + stored settings; every timeline op produces a new
  // EditorComposition which commitComposition projects back into settings (and, for a
  // headShift, a shifted caption doc) as ONE editAll step.
  const editorComp = useMemo(
    () => (composition ? buildEditorComposition({ view: composition, settings, sourceDurationMs }) : null),
    [composition, settings, sourceDurationMs],
  );
  const captionsLockedRef = useRef(false);
  captionsLockedRef.current = editorComp?.trackState.captions.locked ?? false;

  const commitComposition = (nextComp: EditorComposition, docEffect?: DocEffect) => {
    if (!editorComp) return;
    if (nextComp === editorComp && (!docEffect || docEffect.type === "none")) return;
    let comp = nextComp;
    let nextDoc: CaptionDoc | undefined;
    if (docEffect && docEffect.type !== "none") {
      // The composition's outside content (markers/overlays) and the caption doc's
      // words both follow the SAME effect — headShift (range moved), rangeRemove /
      // rangeInsert (ripple delete / still insert), rangeShift / rangeScale (speed
      // changes) — all landing in the one editAll call below (one undo step).
      comp = applyContentEffect(comp, docEffect);
      if (s.doc) {
        const shifted = applyDocEffect(s.doc, docEffect);
        if (shifted !== s.doc) nextDoc = shifted;
      }
    }
    const projected = projectComposition(comp, settings);
    s.editAll({ ...(nextDoc ? { doc: nextDoc } : {}), settings: projected });
  };

  /* ---------- Run 3 audio wiring: every AudioPanel / Timeline audio callback is an
   * audioOps call committed through commitComposition with no docEffect (one undo step) */
  const commitAudio = (next: EditorComposition) => commitComposition(next);
  const placeAudioClipFromPanel = (asset: { id: string; name: string; durationMs: number }) => {
    if (!editorComp || !asset.durationMs || asset.durationMs <= 0) return;
    let comp = editorComp;
    const selectedClip = selAudioClipId ? comp.audioClips.find((c) => c.id === selAudioClipId) : undefined;
    let track = selectedClip ? comp.audioTracks.find((t) => t.id === selectedClip.trackId) : undefined;
    track = track ?? comp.audioTracks[0];
    if (!track) {
      comp = addAudioTrack(comp, "music", "Music");
      track = comp.audioTracks[comp.audioTracks.length - 1]!;
    }
    const beforeIds = new Set(comp.audioClips.map((c) => c.id));
    const next = placeAudioClip(comp, { assetId: asset.id, assetName: asset.name, trackId: track.id, startMs: getPlayerMs(), sourceInMs: 0, sourceOutMs: asset.durationMs });
    commitAudio(next);
    const placed = next.audioClips.find((c) => !beforeIds.has(c.id));
    if (placed) selectAudioClip(placed.id);
  };

  const videoLocked = editorComp?.trackState.video.locked ?? false;
  const overlayLockedForId = (id: string | null): boolean => {
    if (!editorComp || !id) return false;
    const clip = editorComp.overlayClips.find((c) => c.id === id);
    return clip ? editorComp.trackState[overlayTrackOf(clip.kind)].locked : false;
  };

  const splitVideoAtPlayhead = () => {
    if (!editorComp || videoLocked) return;
    const r = splitVideoClipAt(editorComp, getPlayerMs());
    commitComposition(r.comp, r.docEffect);
  };
  const addMarkerAtPlayhead = () => {
    if (!editorComp) return;
    commitComposition(addMarker(editorComp, getPlayerMs()));
  };
  const toggleTrack = (kind: CompositionTrackKind, patch: Partial<TrackState>) => {
    if (!editorComp) return;
    commitComposition(setTrackState(editorComp, kind, patch));
  };
  /** the overlays row's single lock/eye: the same patch applied to BOTH overlay track kinds in one commit */
  const overlayTrackPatch = (patch: Partial<TrackState>) => {
    if (!editorComp) return;
    commitComposition(setTrackState(setTrackState(editorComp, "text", patch), "graphics", patch));
  };
  const trimVideoEdge = (clipId: string, edge: "start" | "end", targetMs: number) => {
    if (!editorComp || videoLocked) return;
    const r = trimVideoClipEdge(editorComp, clipId, edge, targetMs);
    commitComposition(r.comp, r.docEffect);
  };
  const rippleVideoSegment = (clipId: string) => {
    if (!editorComp || videoLocked) return;
    const r = rippleDeleteVideoSegment(editorComp, clipId);
    commitComposition(r.comp, r.docEffect);
  };

  /* ---------- Run-2 segment inspector: selection view + reverse/freeze production ---------- */
  // production state is tagged with the segment it belongs to: selecting another segment
  // derives back to idle (no reset effect), and a late async completion for a segment the
  // user has since left can never paint its progress/error onto the new selection
  const [segProd, setSegProd] = useState<{ clipId: string | null; state: SegmentProductionState }>({ clipId: null, state: { kind: "idle" } });
  const segProduction: SegmentProductionState = segProd.clipId === selVideoClipId ? segProd.state : { kind: "idle" };
  const setSegProduction = (clipId: string, state: SegmentProductionState) => setSegProd({ clipId, state });
  const selClipIndex = editorComp && selVideoClipId ? editorComp.videoClips.findIndex((c) => c.id === selVideoClipId) : -1;
  const selClip = selClipIndex >= 0 ? editorComp!.videoClips[selClipIndex]! : null;
  const selSegmentView = selClip
    ? resolveSegmentView(selClip, selClipIndex, storedSegments.find((sg) => sg.id === selClip.id) ?? null)
    : null;

  /** The blob a segment plays: its own media-bin asset when it has one (a reversed conform, a
   *  still's source), else the project's source video — device-local copy first, then the
   *  server URL for older uploads, exactly the order useDeviceVideo resolves them. */
  const loadSegmentSourceBlob = async (view: NonNullable<typeof selSegmentView>): Promise<{ blob: Blob; durationMs: number; name: string } | null> => {
    if (view.assetId) {
      const rec = mediaBin.assets.find((a) => a.id === view.assetId);
      if (rec) return { blob: rec.blob, durationMs: rec.durationMs ?? sourceDurationMs, name: rec.name };
    }
    if (data?.video?.id) {
      const local = await getLocalVideo(data.video.id);
      if (local) return { blob: local, durationMs: sourceDurationMs, name: data.video.filename ?? "video" };
    }
    if (video?.url) {
      try {
        const res = await fetch(video.url);
        if (res.ok) return { blob: await res.blob(), durationMs: sourceDurationMs, name: data?.video?.filename ?? "video" };
      } catch { /* fall through to the honest null */ }
    }
    return null;
  };

  /** Blob resolver for the audio mix (preview hook + export mixdown): a media-bin asset's
   *  bytes for an assetId, or the project's own video (device-local copy first, then its
   *  URL — the loadSegmentSourceBlob order) for a null assetId (the video chain). */
  const getAudioBlob = useCallback(async (assetId: string | null): Promise<Blob | null> => {
    if (assetId) {
      const rec = mediaBin.assets.find((a) => a.id === assetId);
      return rec?.blob ?? null;
    }
    if (data?.video?.id) {
      const local = await getLocalVideo(data.video.id);
      if (local) return local;
    }
    if (video?.url) {
      try {
        const res = await fetch(video.url);
        if (res.ok) return await res.blob();
      } catch { /* fall through to null */ }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaBin.assets, data?.video?.id, video?.url]);

  const reverseSelectedSegment = async () => {
    if (!editorComp || !selSegmentView || videoLocked) return;
    const view = selSegmentView;
    setSegProduction(view.id, { kind: "working", action: "reverse", progress: 0 });
    try {
      const src = await loadSegmentSourceBlob(view);
      if (!src) throw new Error("This project's video isn't on this device, so there's nothing to reverse here. Re-link the video file first.");
      const { reverseVideoBlob, remapRangeToReversed, reversedAssetName, storeSegmentAsset } = await import("./segmentAssets");
      const reversed = await reverseVideoBlob(src.blob, {
        onProgress: (f) => setSegProduction(view.id, { kind: "working", action: "reverse", progress: f }),
      });
      const rec = await storeSegmentAsset({
        projectId, kind: "video", name: reversedAssetName(src.name), blob: reversed,
        durationMs: src.durationMs, width, height,
      });
      await mediaBin.refresh();
      const remapped = remapRangeToReversed(src.durationMs, view.sourceInMs, view.sourceOutMs);
      const r = applyReversedSegment(editorComp, view.id, rec.id, remapped.sourceInMs, remapped.sourceOutMs);
      commitComposition(r.comp, r.docEffect);
      setSegProduction(view.id, { kind: "idle" });
    } catch (e) {
      setSegProduction(view.id, { kind: "error", action: "reverse", message: e instanceof Error ? e.message : "Reversing failed on this device." });
    }
  };

  const freezeSelectedSegment = async () => {
    if (!editorComp || !selSegmentView || videoLocked) return;
    const view = selSegmentView;
    const playheadMs = getPlayerMs();
    setSegProduction(view.id, { kind: "working", action: "freeze", progress: null });
    try {
      const src = await loadSegmentSourceBlob(view);
      if (!src) throw new Error("This project's video isn't on this device, so no frame can be taken here. Re-link the video file first.");
      const { extractFramePng, freezeAssetName, sourceMsAtTimeline, storeSegmentAsset } = await import("./segmentAssets");
      const sourceMs = sourceMsAtTimeline(
        { sourceInMs: view.sourceInMs, startMs: view.startMs, playbackRate: view.playbackRate },
        playheadMs,
      );
      const png = await extractFramePng(src.blob, sourceMs);
      const rec = await storeSegmentAsset({
        projectId, kind: "image", name: freezeAssetName(src.name, sourceMs), blob: png,
        durationMs: null, width, height,
      });
      await mediaBin.refresh();
      const r = insertStillSegmentAt(editorComp, playheadMs, 2000, rec.id);
      commitComposition(r.comp, r.docEffect);
      const stillClip = r.comp.videoClips.find(
        (c) => resolveSegmentView(c, 0).still && playheadMs >= c.startMs && playheadMs < c.startMs + c.durationMs,
      );
      if (stillClip) selectVideoClip(stillClip.id);
      setSegProduction(view.id, { kind: "idle" });
    } catch (e) {
      setSegProduction(view.id, { kind: "error", action: "freeze", message: e instanceof Error ? e.message : "Couldn't take a freeze frame on this device." });
    }
  };

  /* ---------- A4 (Phase 5): auto punch-in zooms — deterministic plan over the doc +
   * waveform peaks; applying threads the plan through addSegmentKeyframe and commits
   * ONCE, so the whole batch is one undo step and every keyframe stays editable. */
  const autoZoomPeaks = wave.peaks ? { peaks: wave.peaks, hopMs: 1000 / PEAKS_PER_SECOND } : null;
  const autoZoomCount = editorComp && doc
    ? generateAutoZoomPlan({ words: doc.words, clips: editorComp.videoClips, peaks: autoZoomPeaks, intensity: "medium" }).zooms.length
    : 0;
  const addAutoZooms = (intensity: AutoZoomIntensity) => {
    if (!editorComp || !doc) return;
    const plan = generateAutoZoomPlan({ words: doc.words, clips: editorComp.videoClips, peaks: autoZoomPeaks, intensity });
    const r = applyAutoZooms(editorComp, plan);
    if (r.comp !== editorComp) commitComposition(r.comp);
  };

  const segmentInspector = selSegmentView && editorComp ? (
    <SegmentInspector
      segment={selSegmentView}
      playheadMs={timeMs}
      production={segProduction}
      onTransform={(patch) => { const r = setSegmentTransform(editorComp, selSegmentView.id, patch); commitComposition(r.comp, r.docEffect); }}
      onPlaybackRate={(rate) => { const r = setSegmentPlaybackRate(editorComp, selSegmentView.id, rate); commitComposition(r.comp, r.docEffect); }}
      onTransition={(transition) => { const r = setSegmentTransition(editorComp, selSegmentView.id, transition); commitComposition(r.comp, r.docEffect); }}
      onDuplicate={() => { const r = duplicateVideoSegment(editorComp, selSegmentView.id); commitComposition(r.comp, r.docEffect); }}
      onRippleDelete={() => { rippleVideoSegment(selSegmentView.id); setSelVideoClipId(null); }}
      onReverse={() => void reverseSelectedSegment()}
      onFreeze={() => void freezeSelectedSegment()}
      keyframes={selSegmentView.keyframes}
      effects={selSegmentView.effects}
      onAddKeyframe={(property, atMs, value) => { const r = addSegmentKeyframe(editorComp, selSegmentView.id, property, atMs, value); commitComposition(r.comp, r.docEffect); }}
      onUpdateKeyframe={(id, patch) => { const r = updateSegmentKeyframe(editorComp, selSegmentView.id, id, patch); commitComposition(r.comp, r.docEffect); }}
      onRemoveKeyframe={(id) => { const r = removeSegmentKeyframe(editorComp, selSegmentView.id, id); commitComposition(r.comp, r.docEffect); }}
      onAddEffect={(type) => { const r = addSegmentEffect(editorComp, selSegmentView.id, type); commitComposition(r.comp, r.docEffect); }}
      onUpdateEffect={(id, patch) => { const r = updateSegmentEffect(editorComp, selSegmentView.id, id, patch); commitComposition(r.comp, r.docEffect); }}
      onRemoveEffect={(id) => { const r = removeSegmentEffect(editorComp, selSegmentView.id, id); commitComposition(r.comp, r.docEffect); }}
      onMoveEffect={(id, dir) => { const r = moveSegmentEffect(editorComp, selSegmentView.id, id, dir); commitComposition(r.comp, r.docEffect); }}
      onAutoZooms={addAutoZooms}
      autoZoomCount={autoZoomCount}
    />
  ) : null;
  const splitVideoRef = useRef<() => void>(() => undefined);
  splitVideoRef.current = splitVideoAtPlayhead;
  const addMarkerRef = useRef<() => void>(() => undefined);
  addMarkerRef.current = addMarkerAtPlayhead;

  // translated caption tracks (slice 5.1): loaded once per project from the translations API;
  // the track for settings.translateTo is threaded into the one input object below as
  // `translatedDoc`, so the Player preview and the in-browser export render the same bilingual
  // line (the composition itself decides whether to draw it, via settings.bilingual).
  const [translations, setTranslations] = useState<Record<string, CaptionDoc>>({});
  useEffect(() => {
    let live = true;
    studioService
      .getTranslations(projectId)
      .then((r) => {
        if (!live) return;
        const byLang: Record<string, CaptionDoc> = {};
        for (const t of r.translations) {
          const parsed = CaptionDocSchema.safeParse(t.doc);
          if (parsed.success) byLang[t.language] = parsed.data;
        }
        setTranslations(byLang);
      })
      .catch(() => { /* no tracks (or the translations table is not live yet): the panel reports it when used */ });
    return () => { live = false; };
  }, [projectId]);
  const activeTranslatedDoc = settings.translateTo ? translations[settings.translateTo] : undefined;

  // resolved URLs for placed image overlays (device-local bytes → object URLs for this session);
  // threaded into the one input object, so the Player preview and the in-browser export agree
  const [overlayAssetUrls, setOverlayAssetUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const o of settings.overlays) {
      if (o.kind !== "image" || !o.assetId || urls[o.assetId]) continue;
      const asset = mediaBin.assets.find((a) => a.id === o.assetId);
      if (asset) urls[o.assetId] = URL.createObjectURL(asset.blob);
    }
    setOverlayAssetUrls(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [settings.overlays, mediaBin.assets]);

  // resolved URLs for segment assets (reversed conforms + freeze stills referenced by a
  // segment's assetId), built exactly like overlayAssetUrls above: device-local bytes →
  // object URLs for this session, absent for assets that aren't on this device. Threaded
  // into the one input object below as `segmentAssets`, mirroring the overlayAssets flow —
  // the Player preview and the in-browser export resolve them; the server/companion path
  // leaves them unresolved, the same device-local rule as image overlays.
  const [segmentAssetUrls, setSegmentAssetUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const sources: SegmentLike[] = [
      ...storedSegments,
      ...((editorComp?.videoClips ?? []) as unknown as SegmentLike[]),
    ];
    const urls = buildSegmentAssetUrls(sources, mediaBin.assets, (a) => URL.createObjectURL(a.blob));
    setSegmentAssetUrls(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.composition, editorComp?.videoClips, mediaBin.assets]);
  const segmentAssetNames = useMemo(
    () => Object.fromEntries(mediaBin.assets.map((a) => [a.id, a.name])),
    [mediaBin.assets],
  );

  const input = useMemo(
    () =>
      doc && style
        ? {
            src: video?.url ?? null,
            // the composition is authored at the CANVAS size (source dims, or the chosen
            // aspect fitted inside them) — the Player and the export render this same object
            media: { width: canvasSize.width, height: canvasSize.height, fps, durationMs, rotation: 0 },
            doc,
            // bilingual track (slice 5.1): only spread when a saved track exists for the chosen
            // target, so projects without one build exactly the pre-5.1 input object
            ...(activeTranslatedDoc ? { translatedDoc: activeTranslatedDoc } : {}),
            style,
            settings,
            mode: "burn" as const,
            // editor elements, threaded explicitly as well as via settings: this one object feeds BOTH the
            // StudioPlayer preview and (as exportInput) the browser MP4 export, so both render identically
            videoAdjust: settings.videoAdjust,
            overlays: settings.overlays,
            overlayAssets: overlayAssetUrls,
            segmentAssets: segmentAssetUrls,
          }
        : null,
    [doc, style, settings, video?.url, canvasSize.width, canvasSize.height, fps, durationMs, overlayAssetUrls, segmentAssetUrls, activeTranslatedDoc],
  );
  // export reads frames: a video the decoder can't read uses the compatible copy instead
  const exportInput = useMemo(() => (input && compat.url ? { ...input, src: compat.url } : input), [input, compat.url]);

  /* ---------- Run 3 audio preview + export mix ----------
   * When the mix is active, the Player and the browser export render must NOT play the
   * video's own sound (the Web Audio preview / the muxed mixdown provide it instead, and
   * double sound is worse than none), so both receive a settings clone whose video track
   * is muted. `exportInput` itself stays unmuted for every non-MP4 path. */
  const mixActive = editorComp ? mixIsActive(editorComp) : false;
  const mutedSettings = useMemo(
    () => ({
      ...settings,
      composition: {
        ...settings.composition,
        tracks: { ...settings.composition.tracks, video: { ...settings.composition.tracks.video, muted: true } },
      },
    }),
    [settings],
  );
  const playerInput = useMemo(
    () => (mixActive && input ? { ...input, settings: mutedSettings } : input),
    [mixActive, input, mutedSettings],
  );
  /** the ExportModal's render input: the compat-aware export input, muted when the mix is active */
  const exportRenderInput = useMemo(
    () => (mixActive && exportInput ? { ...exportInput, settings: mutedSettings } : exportInput),
    [mixActive, exportInput, mutedSettings],
  );
  useAudioPreview({ active: mixActive, comp: editorComp, playing, timeMs, getPlayerMs, getBlob: getAudioBlob });
  const audioMix = mixActive && editorComp
    ? {
        note: "Includes your sound mix (music, audio clips and processing), mixed on this device.",
        apply: async (videoBlob: Blob): Promise<Blob> => {
          const plan = buildMixPlan(editorComp, durationMs);
          const pcm = await renderMixedAudio({ plan, getBlob: getAudioBlob });
          return muxMixedAudioIntoMp4({ videoBlob, audio: pcm });
        },
      }
    : null;
  const mp4Block = captionsOnly
    ? { reason: "This browser couldn't show this video's picture, so an MP4 can't be made here. Download the captions as an SRT file, or open this project in Chrome, Edge or Safari for the MP4." }
    : data?.video?.needsCompat && compat.state !== "ready"
      ? compat.state === "failed"
        ? { reason: "This browser can play this video but can't copy its picture for export. Download the captions as an SRT file instead." }
        : { reason: `Getting your video ready for export… ${Math.round(compat.progress * 100)}%`, progress: compat.progress }
      : null;

  // the drag selection must never point at words that no longer exist (deletes, doc replacement)
  useEffect(() => {
    if (!doc) return;
    setSelectedWordIds((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(doc.words.map((w) => w.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [doc]);

  // the audio clip selection must never point at a clip that no longer exists
  useEffect(() => {
    if (!selAudioClipId) return;
    if (editorComp && !editorComp.audioClips.some((c) => c.id === selAudioClipId)) setSelAudioClipId(null);
  }, [editorComp, selAudioClipId]);

  // split the caption card at the playhead: the word at/after the playhead starts a new card via the
  // caption-engine's splitCardAt, through edit() — one undo step, autosaves like every caption edit.
  // No word qualifies (gap, first/last word of a card) → nothing happens, honestly.
  const splitAtPlayheadRef = useRef<() => void>(() => undefined);
  splitAtPlayheadRef.current = () => {
    const wordId = splitWordIdAtPlayhead(pages, getPlayerMs());
    if (!wordId) return;
    s.edit((d) => splitCardAt(d, wordId));
    selectWord(wordId);
  };

  // Delete / Backspace target (owner bug 2026-11-10: the key had no handler at all). One code
  // path for the keyboard handler and the timeline toolbar button; the pure priority decision
  // lives in deleteSelection.ts. Every branch goes through edit()/patchSettings(), so a delete
  // is one undo step like every other edit. Inert while a dialog is open or captions are live.
  const deleteSelectionRef = useRef<() => boolean>(() => false);
  deleteSelectionRef.current = () => {
    // a locked captions track protects its words only — overlays / segments / markers still delete
    const captionsLocked = editorComp?.trackState.captions.locked ?? false;
    // a locked audio track protects its clip: the resolver never sees that selection
    const selAudioClipForDelete = editorComp && selAudioClipId ? editorComp.audioClips.find((c) => c.id === selAudioClipId) : undefined;
    const selAudioTrackLocked = selAudioClipForDelete
      ? editorComp!.audioTracks.find((t) => t.id === selAudioClipForDelete.trackId)?.locked ?? false
      : false;
    const action = resolveDeleteAction({
      blocked: live || showExport || showSignup || showShortcuts || Boolean(s.conflict),
      selectedWordIds: captionsLocked ? [] : selectedWordIds,
      selectedOverlayId,
      selectedId: captionsLocked ? null : selectedId,
      selectedVideoClipId: selVideoClipId,
      canRippleDeleteVideoSegment: editorComp && selVideoClipId ? canRippleDeleteVideoSegment(editorComp, selVideoClipId) : false,
      selectedAudioClipId: selAudioTrackLocked ? null : selAudioClipId,
      selectedMarkerId: selMarkerId,
    });
    if (!action) return false;
    if (action.kind === "words") {
      s.edit((d) => deleteWordsByIds(d, action.ids));
      setSelectedWordIds(new Set());
      setSelectedId(null);
    } else if (action.kind === "overlay") {
      if (editorComp) commitComposition(deleteOverlayClip(editorComp, action.id));
      else s.patchSettings({ overlays: settings.overlays.filter((o) => o.id !== action.id) });
      setSelectedOverlayId(null);
    } else if (action.kind === "videoSegment") {
      rippleVideoSegment(action.id);
      setSelVideoClipId(null);
    } else if (action.kind === "audioClip") {
      if (editorComp) commitComposition(removeAudioClip(editorComp, action.id));
      setSelAudioClipId(null);
    } else if (action.kind === "marker") {
      if (editorComp) commitComposition(removeMarker(editorComp, action.id));
      setSelMarkerId(null);
    } else {
      s.edit((d) => deleteWordsByIds(d, [action.id]));
      setSelectedId(null);
    }
    return true;
  };

  // keyboard: space = play/pause, ctrl/cmd+z / shift+z = undo/redo, ctrl/cmd+s = save,
  // Delete/Backspace = delete the current selection (words, timeline block, overlay),
  // S = split the caption card at the playhead, ←/→ = nudge the drag-selected words by 100 ms
  // (Shift+←/→ = 10 ms fine adjust). While typing in a field, Delete/Backspace stay native.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { if (typing && t.tagName !== "BODY") return; e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); s.redo(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void s.saveNow().catch(() => undefined); }
      else if ((e.key === "Delete" || e.key === "Backspace") && !typing && !mod && !e.altKey) { if (deleteSelectionRef.current()) e.preventDefault(); }
      else if (e.key.toLowerCase() === "s" && !typing && !mod && !e.altKey) { e.preventDefault(); splitAtPlayheadRef.current(); }
      else if (e.key.toLowerCase() === "b" && !typing && !mod && !e.altKey) { e.preventDefault(); splitVideoRef.current(); }
      else if (e.key.toLowerCase() === "m" && !typing && !mod && !e.altKey) { e.preventDefault(); addMarkerRef.current(); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !typing && !mod && !captionsLockedRef.current && selectedWordIds.size > 0) {
        e.preventDefault();
        const delta = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 100);
        const ids = [...selectedWordIds];
        s.edit((d) => shiftWordsByIds(d, ids, delta));
      }
      else if (e.code === "Space" && !typing) { e.preventDefault(); playerRef.current?.toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, selectedWordIds]);

  // Esc closes the shortcuts help dialog
  useEffect(() => {
    if (!showShortcuts) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowShortcuts(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showShortcuts]);

  if (s.query.isLoading) return <StudioSkeleton />;
  if (s.query.error instanceof ApiError && s.query.error.status === 401) {
    router.replace(`/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
    return <FullScreen>Signing in…</FullScreen>;
  }
  if (!data) return <FullScreen>This project could not be found. <Link className="ml-2 font-semibold text-st-text underline decoration-st-or decoration-2 underline-offset-4" href="/dashboard">Back to projects</Link></FullScreen>;

  const noVideoYet = !video || video.status === "uploading";
  // the project's video isn't on this device (another device, cleared storage): add a video and caption it afresh
  const videoGone = !noVideoYet && device.status === "missing";
  const hasEditor = Boolean(doc && style && input) && !videoGone;
  const save = SAVE_LABEL[s.saveState];

  // ---------- building blocks shared by both layouts
  const liveBanner = live && liveView ? (
    <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-3 border-b border-st-line bg-st-lav/50 px-3 py-2 text-sm sm:px-4">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-st-or" />
      <span className="min-w-0 flex-1 truncate">
        <b>Writing your captions… {Math.round(liveView.progress * 100)}%</b>
        <span className="hidden text-st-muted sm:inline"> · {liveView.etaSec != null ? etaText(liveView.etaSec) : "a moment"}. You can pick a template and style now; words unlock when it&apos;s done.</span>
      </span>
      <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-st-line sm:block">
        <div className="h-full rounded-full bg-st-em transition-[width] duration-500" style={{ width: `${Math.max(3, liveView.progress * 100)}%` }} />
      </div>
      <Button className="!px-2.5 !py-1 text-xs" onClick={() => getSession(projectId)?.stop()}>Stop</Button>
    </div>
  ) : null;
  const captionsOnlyBanner = captionsOnly && hasEditor ? (
    <div className="shrink-0 border-b border-st-line bg-st-or/15 px-3 py-2 text-sm sm:px-4">
      This browser can&apos;t show this video&apos;s picture, but your captions work as normal. Edit them and download an SRT file{" "}
      (an MP4 needs a browser that can read the video: Chrome, Edge or Safari).
    </div>
  ) : null;
  const headerBar = (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-st-line bg-st-panel px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link href="/dashboard" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); nav.go("/dashboard", "Back to your projects"); }} aria-label="Back to projects" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-st-muted transition hover:bg-st-raised hover:text-st-text">←</Link>
        <Link href="/dashboard" aria-label="Open Caption projects" className="hidden sm:block"><Logo height={22} /></Link>
        <span className="hidden h-5 w-px bg-st-line sm:block" />
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { setEditingTitle(false); if (title.trim() && title !== data.project.title) void s.rename(title.trim()); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingTitle(false); }}
            className="min-w-0 rounded-lg border border-st-ink/40 bg-st-panel px-2 py-1 text-sm outline-none"
          />
        ) : (
          <button onClick={() => { setTitle(data.project.title); setEditingTitle(true); }} className="truncate rounded-md px-1.5 py-1.5 text-sm font-semibold transition hover:bg-st-raised" title="Rename">{data.project.title || "Untitled project"}</button>
        )}
        {hasEditor ? (
          <span className="hidden items-center gap-1.5 text-xs text-st-muted md:inline-flex" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${save.dot}`} />{save.text}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {hasEditor ? (
          <>
            <Button onClick={s.undo} disabled={!s.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="!px-2.5">↶</Button>
            <Button onClick={s.redo} disabled={!s.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="!px-2.5">↷</Button>
          </>
        ) : null}
        <Button
          aria-label="Delete project"
          title="Delete project"
          className="!px-2.5"
          onClick={async () => {
            if (!window.confirm("Delete this project? Its captions and video are removed for good.")) return;
            // leave right away: the dashboard no longer lists it, and the server finishes in the background
            qc.setQueryData<{ id: string }[]>(["projects"], (old) => old?.filter((p) => p.id !== projectId));
            nav.go("/dashboard", "Deleting project", { replace: true });
            projectsService
              .deleteProject(projectId)
              .then(() => qc.removeQueries({ queryKey: ["studio", projectId] }))
              .catch((e) => window.alert(e instanceof Error ? e.message : "Couldn't delete the project. It is still in your list."))
              .finally(() => void qc.invalidateQueries({ queryKey: ["projects"] }));
          }}
        >
          🗑
        </Button>
        <Button data-tour="export" tone="primary" disabled={!hasEditor || live} title={live ? "Available when the captions are finished" : undefined} onClick={() => void openExport()} className="!rounded-full !px-4">Export</Button>
      </div>
    </header>
  );
  const header = (
    <>
      {headerBar}
      {liveBanner}
      {captionsOnlyBanner}
    </>
  );

  const player = hasEditor && input && style ? (
    <StudioPlayer
      ref={playerRef}
      input={playerInput ?? input}
      width={canvasSize.width}
      height={canvasSize.height}
      fps={fps}
      durationMs={durationMs}
      position={style.position}
      onMovePosition={(p) => s.patchStyle((st) => ({ ...st, position: p }))}
      onTime={setTimeMs}
      onPlayingChange={setPlaying}
      compact={!desktop}
    />
  ) : null;

  const stage = player ?? (noVideoYet || replacing || videoGone ? (
    <UploadPanel
      projectId={projectId}
      limits={data.limits}
      language={data.project.language ?? null}
      onUploaded={() => { setReplacing(false); s.resetDoc(); void s.refetch(); }}
      note={
        videoGone ? "This project's video isn't on this device anymore. Add a video and fresh captions will be written for it."
          : replacing ? "Choose the new video. Captions will be generated for it."
          : video?.status === "uploading" ? "The last upload didn't finish. Choose your video again." : undefined
      }
    />
  ) : (
    <ProcessingPanel projectId={projectId} job={data.job} canTranscribe={data.canTranscribe} onChanged={() => void s.refetch()} onReplaceVideo={() => setReplacing(true)} videoId={video?.id ?? null} local={!!data.video?.local} language={data.project.language ?? null} />
  ));

  const heroSupported = style ? getTemplate(style.templateId).layout !== "typewriter" : true;
  const captions = doc && style ? (
    <div data-tour="captions" className="flex h-full min-h-0 flex-col">
      <div className={`min-h-0 flex-1 ${live ? "pointer-events-none" : ""}`} title={live ? "You can edit the words when the captions are finished" : undefined}>
        <CaptionsPanel doc={doc} pages={pages} currentPageId={currentPage?.id ?? null} timeMs={timeMs} selectedId={selectedId} onSelect={selectWord} onSeek={seek} edit={s.edit} heroSupported={heroSupported} selectedWordIds={selectedWordIds} onWordSelectionChange={handleWordSelectionChange} />
      </div>
      {live && liveView ? (
        // the captions that haven't been written yet: shimmering placeholders with the time left
        <div className="shrink-0 border-t border-st-line bg-st-raised/50 px-4 py-3" aria-hidden>
          <style>{`@keyframes ce-shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}`}</style>
          {[78, 54].map((w) => (
            <div key={w} className="mb-2 h-3 rounded-full" style={{ width: `${w}%`, backgroundImage: "linear-gradient(90deg, var(--color-st-line, #ddd) 0, rgba(255,255,255,.6) 100px, var(--color-st-line, #ddd) 200px)", backgroundSize: "400px 100%", animation: "ce-shimmer 1.4s linear infinite" }} />
          ))}
          <p className="text-xs tabular-nums text-st-muted">{liveView.etaSec != null ? `Writing the rest… ${etaText(liveView.etaSec).toLowerCase()}` : "Writing the rest…"}</p>
        </div>
      ) : null}
    </div>
  ) : null;

  const overlayPanelProps = { settings, patch: s.patchSettings, selectedId: selectedOverlayId, onSelect: selectOverlay, getTimeMs: getPlayerMs, durationMs, composition };
  // place an imported image as a timed overlay at a given time, then open its editor in Elements
  const placeImageAt = (asset: { id: string; name: string }, atMs: number) => {
    const item = makeImageOverlay(asset, atMs, durationMs);
    s.patchSettings({ overlays: [...settings.overlays, item] });
    selectOverlay(item.id);
    setSection("elements");
    setMobileTimeline(false);
  };
  const placeImage = (asset: { id: string; name: string }) => placeImageAt(asset, getPlayerMs());
  // media-bin drop on the timeline: image -> overlay at the drop point; video -> take over as
  // the project source through the same device attach path as MediaPanel's "Use as source";
  // audio -> placed at the drop point on the first audio track (a "Music" track is created
  // when the project has none). No single-record getter exists in mediaStore, so the
  // project's assets are listed and matched by id.
  const onDropAsset = (assetId: string, _kind: string, atMs: number) => {
    void (async () => {
      const record = (await listProjectAssets(projectId)).find((a) => a.id === assetId);
      if (!record) return;
      if (record.kind === "image") placeImageAt(record, atMs);
      else if (record.kind === "video") await device.attach(new File([record.blob], record.name, { type: record.mime }));
      else if (record.kind === "audio") {
        // an unprobed file (no duration) can't be placed honestly — MediaPanel probes
        // audio at import, so durationMs should always exist here
        if (!record.durationMs || record.durationMs <= 0 || !editorComp) return;
        let comp = editorComp;
        let track = comp.audioTracks[0];
        if (!track) {
          comp = addAudioTrack(comp, "music", "Music");
          track = comp.audioTracks[comp.audioTracks.length - 1]!;
        }
        const beforeIds = new Set(comp.audioClips.map((c) => c.id));
        const next = placeAudioClip(comp, { assetId: record.id, assetName: record.name, trackId: track.id, startMs: atMs, sourceInMs: 0, sourceOutMs: record.durationMs });
        commitAudio(next);
        const placed = next.audioClips.find((c) => !beforeIds.has(c.id));
        if (placed) selectAudioClip(placed.id);
      }
    })();
  };
  // panel registry: every rail section maps to its real panel here (same props/state as before the move)
  const renderPanel = (t: PanelId) =>
    t === "captions" ? captions
    : style ? (
      t === "style" ? <StylePanel style={style} patch={s.patchStyle} lookName={s.lookId?.startsWith("user:") ? "My saved template" : getLook(s.lookId)?.name ?? null} onOpenLooks={() => setSection("templates")} />
      : t === "templates" ? <LooksPanel currentLookId={s.lookId} onChoose={s.chooseLook} currentStyle={style} currentSettings={settings} />
      : t === "media" ? <MediaPanel video={{ filename: data.video?.filename ?? null, size: data.video?.size ?? null, width, height, fps, durationMs }} composition={composition} onRelink={device.attach} assets={mediaBin.assets} importing={mediaBin.importing} onImport={mediaBin.importFiles} onDeleteAsset={mediaBin.remove} onPlaceImage={placeImage} />
      : t === "text" ? <TextPanel {...overlayPanelProps} titleCard={doc ? {
          sourceTitle: data.project.title,
          transcriptText: transcriptTextOf(doc),
          // A5: place through the composition commit path — one undo step, and the
          // item lands in settings.overlays via projectComposition like any overlay
          onPlace: (item) => {
            if (editorComp) commitComposition(appendTitleCardClip(editorComp, item));
            else s.patchSettings({ overlays: [...settings.overlays, item] });
          },
        } : undefined} />
      : t === "elements" ? <ElementsPanel {...overlayPanelProps} />
      : t === "adjust" ? <AdjustPanel settings={settings} patch={s.patchSettings} />
      : t === "audio" ? (editorComp ? (
        <AudioPanel
          comp={editorComp}
          assets={mediaBin.assets}
          selectedClipId={selAudioClipId}
          playheadMs={timeMs}
          onSelectClip={selectAudioClip}
          onAddTrack={(role) => commitAudio(addAudioTrack(editorComp, role))}
          onUpdateTrack={(id, patch) => commitAudio(updateAudioTrack(editorComp, id, patch))}
          onSetDucking={(id, patch) => commitAudio(setAudioDucking(editorComp, id, patch))}
          onRemoveTrack={(id) => { commitAudio(removeAudioTrack(editorComp, id)); }}
          onPlaceClip={placeAudioClipFromPanel}
          onMoveClip={(id, patch) => commitAudio(moveAudioClip(editorComp, id, patch))}
          onSplitClip={(id) => commitAudio(splitAudioClipAt(editorComp, id, getPlayerMs()))}
          onDuplicateClip={(id) => commitAudio(duplicateAudioClip(editorComp, id))}
          onRemoveClip={(id) => commitAudio(removeAudioClip(editorComp, id))}
          onUpdateClip={(id, patch) => commitAudio(updateAudioClip(editorComp, id, patch))}
          onUpdateProcessors={(id, patch) => commitAudio(updateAudioClipProcessors(editorComp, id, patch))}
          onUpdateMaster={(patch) => commitAudio(updateAudioMaster(editorComp, patch))}
        />
      ) : null)
      : t === "translate" ? (doc ? <TranslatePanel projectId={projectId} doc={doc} settings={settings} patch={s.patchSettings} translations={translations} onTranslated={(lang, tdoc) => setTranslations((prev) => ({ ...prev, [lang]: tdoc }))} /> : null)
      : t === "clipper" ? (doc ? <ClipperPanel projectId={projectId} sourceTitle={data.project.title} sourceVideoId={data.video?.id ?? null} mediaDurationMs={settings.clipRange ? durationMs : (data.video?.durationMs ?? 0)} doc={doc} peaks={wave.peaks} videoUrl={video?.url ?? null} sourceWidth={data.video?.width ?? null} sourceHeight={data.video?.height ?? null} sourceUrl={video?.url ?? null} /> : null)
      : <SettingsPanel settings={settings} patch={s.patchSettings} layout={getTemplate(style.templateId).layout} />
    ) : null;

  // actions for the selected word, shown in the timeline toolbar (icon buttons, like pro editors)
  const tool = (label: string, icon: React.ReactNode, onClick: () => void, opts: { disabled?: boolean; active?: boolean } = {}) => (
    <button
      key={label}
      onClick={onClick}
      disabled={opts.disabled}
      title={label}
      aria-label={label}
      aria-pressed={opts.active}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-30 ${opts.active ? "bg-st-lav text-st-ink" : "text-st-text/85 hover:bg-st-hover"}`}
    >
      {icon}
    </button>
  );
  const none = !selected;
  const ic = "h-4 w-4";
  const selOverlayClip = editorComp?.overlayClips.find((c) => c.id === selectedOverlayId) ?? null;
  const selVideoCanRipple = Boolean(editorComp && selVideoClipId && canRippleDeleteVideoSegment(editorComp, selVideoClipId));
  const extraTools = (
    <>
      {tool(selected?.emphasis === "hero" ? "Key word (click to unset)" : "Make key word", <Star className={ic} />, () => selected && s.edit((d) => setEmphasis(d, selected.id, selected.emphasis === "hero" ? "none" : "hero")), { disabled: none || !heroSupported, active: selected?.emphasis === "hero" })}
      {tool("Hide word", <EyeOff className={ic} />, () => { if (!selected) return; s.edit((d) => setHidden(d, selected.id, true)); setSelectedId(null); }, { disabled: none })}
      {tool("Delete selected (Del)", <Trash2 className={ic} />, () => { deleteSelectionRef.current(); }, { disabled: selectedWordIds.size === 0 && !selected && !selectedOverlayId && !selMarkerId && !selVideoCanRipple && !selAudioClipId })}
      {tool("Undo", <Undo2 className={ic} />, s.undo, { disabled: !s.canUndo })}
      {tool("Redo", <Redo2 className={ic} />, s.redo, { disabled: !s.canRedo })}
      {selOverlayClip && editorComp && !overlayLockedForId(selOverlayClip.id) ? (
        <>
          {tool("Split overlay at playhead", <Scissors className={ic} />, () => commitComposition(splitOverlayClipAt(editorComp, selOverlayClip.id, getPlayerMs())))}
          {tool("Duplicate overlay", <Copy className={ic} />, () => commitComposition(duplicateOverlayClip(editorComp, selOverlayClip.id)))}
          {tool("Ripple delete overlay", <Trash2 className={ic} />, () => { commitComposition(rippleDeleteOverlayClip(editorComp, selOverlayClip.id)); setSelectedOverlayId(null); })}
        </>
      ) : null}
      {selVideoClipId && editorComp && editorComp.videoClips.some((c) => c.id === selVideoClipId) && !videoLocked ? (
        <>
          {tool("Split video at playhead (B)", <Scissors className={ic} />, () => splitVideoAtPlayhead())}
          {selVideoCanRipple ? tool("Ripple delete video segment", <Trash2 className={ic} />, () => { rippleVideoSegment(selVideoClipId); setSelVideoClipId(null); }) : null}
        </>
      ) : null}
      {selMarkerId && editorComp ? tool("Delete marker", <Trash2 className={ic} />, () => { commitComposition(removeMarker(editorComp, selMarkerId)); setSelMarkerId(null); }) : null}
      {tool("Keyboard shortcuts", <Keyboard className={ic} />, () => setShowShortcuts(true))}
    </>
  );

  const addWordAt = (atMs: number): string | null => {
    let created: string | null = null;
    s.edit((d) => {
      const before = [...d.words].filter((w) => !w.hidden && w.startMs <= atMs).pop() ?? null;
      const withWord = insertWordAfter(d, before?.id ?? null, "new");
      const w = withWord.words.find((x) => !d.words.some((y) => y.id === x.id));
      if (!w) return d;
      created = w.id;
      // place it at the playhead when there is room there
      const next = withWord.words[withWord.words.indexOf(w) + 1];
      const start = Math.max(w.startMs, atMs);
      const end = Math.min(next ? next.startMs : start + 400, start + 400);
      return end - start >= 80 ? retimeRun(withWord, w.id, w.id, start, end) : withWord;
    });
    if (created) selectWord(created);
    return created;
  };

  const timeline = doc ? (
    <Timeline
      pages={pages}
      words={doc.words}
      durationMs={durationMs}
      timeMs={timeMs}
      getTimeMs={getPlayerMs}
      playing={playing}
      selectedId={selectedId}
      peaks={wave.peaks}
      videoUrl={video?.url ?? null}
      videoId={video?.id ?? null}
      videoAspect={width / height}
      waveState={wave.state}
      onSeek={seek}
      onSelect={selectWord}
      selectedWordIds={selectedWordIds}
      onWordSelectionChange={handleWordSelectionChange}
      onShiftWords={(ids, deltaMs) => s.edit((d) => shiftWordsByIds(d, ids, deltaMs))}
      onRetimeRun={(a, b, st, en, ripple) => s.edit((d) => retimeRun(d, a, b, st, en, ripple))}
      onRename={(id, text) => s.edit((d) => setWordText(d, id, text))}
      onAddWord={addWordAt}
      onSplit={() => selected && s.edit((d) => splitCardAt(d, selected.id))}
      onSplitAtPlayhead={() => splitAtPlayheadRef.current()}
      composition={composition}
      selectedOverlayId={selectedOverlayId}
      onSelectOverlay={selectOverlay}
      onMoveOverlay={(id, deltaMs) => {
        // one composition commit per drag, via the op layer (moveOverlayClip clamps at 0, duration kept)
        if (editorComp) commitComposition(moveOverlayClip(editorComp, id, deltaMs));
      }}
      editorComp={editorComp}
      selectedVideoClipId={selVideoClipId}
      onSelectVideoClip={selectVideoClip}
      selectedMarkerId={selMarkerId}
      onSelectMarker={selectMarker}
      onTrimVideoEdge={trimVideoEdge}
      onTrimOverlayClip={(id, edge, targetMs) => {
        if (editorComp) commitComposition(trimOverlayClip(editorComp, id, edge, targetMs));
      }}
      audioTracks={editorComp?.audioTracks}
      audioClips={editorComp?.audioClips}
      selectedAudioClipId={selAudioClipId}
      onSelectAudioClip={selectAudioClipFromTimeline}
      onMoveAudioClip={(id, startMs) => { if (editorComp) commitAudio(moveAudioClip(editorComp, id, { startMs })); }}
      onTrimAudioClip={(id, edge, targetMs) => { if (editorComp) commitAudio(trimAudioClip(editorComp, id, edge, targetMs)); }}
      onTrackPatch={toggleTrack}
      onOverlayTrackPatch={overlayTrackPatch}
      onDropAsset={onDropAsset}
      segmentAssetUrls={segmentAssetUrls}
      segmentAssetNames={segmentAssetNames}
      onJoin={() => selected && s.edit((d) => mergeWithPrevious(d, selected.id))}
      onOpenSettings={() => { setSection("timing"); setMobileTimeline(false); }}
      extraTools={extraTools}
      fill={!desktop}
    />
  ) : null;

  const overlays = (
    <>
      {showTour ? <TutorialTour onClose={() => setShowTour(false)} /> : null}
      {showSignup ? <SignupGate notice={signupNotice} onClose={() => { setShowSignup(false); setSignupNotice(null); }} onDone={() => { setShowSignup(false); setShowExport(true); }} /> : null}
      {showExport ? <ExportModal projectId={projectId} title={data.project.title} video={{ width, height, durationMs, fps }} renderInput={exportRenderInput} mp4Block={mp4Block} saving={s.saveState === "saving" || s.saveState === "dirty"} flushSave={s.saveNow} exportSettings={settings.exportSettings} onExportSettings={(next) => s.patchSettings({ exportSettings: next })} canvas={canvasSettings} audioMix={audioMix} translationTracks={Object.keys(translations).map((lang) => ({ lang, label: translationModelFor(lang)?.targetLabel ?? lang }))} onClose={() => setShowExport(false)} /> : null}
      {showShortcuts ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowShortcuts(false)}>
          <div role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()} className="st-rise w-full max-w-md rounded-2xl border border-st-line bg-st-panel p-6">
            <h2 className="font-display text-lg font-bold">Keyboard shortcuts</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              {[
                ["Space", "Play / pause"],
                ["Ctrl/⌘+Z", "Undo"],
                ["Ctrl/⌘+Shift+Z / Ctrl+Y", "Redo"],
                ["Ctrl/⌘+S", "Save"],
                ["S", "Split caption at playhead"],
                ["B", "Split video at playhead"],
                ["M", "Add marker at playhead"],
                ["Delete / Backspace", "Delete selection"],
                ["← / →", "Nudge selected words 100 ms (Shift: 10 ms)"],
              ].map(([keys, action]) => (
                <div key={keys} className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 rounded-md border border-st-line bg-st-raised px-2 py-0.5 font-mono text-xs text-st-text">{keys}</dt>
                  <dd className="text-right text-st-muted">{action}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end">
              <Button tone="primary" onClick={() => setShowShortcuts(false)}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
      {s.conflict ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div role="alertdialog" aria-label="Editing conflict" className="st-rise w-full max-w-md rounded-2xl border border-st-line bg-st-panel p-6">
            <h2 className="font-display text-lg font-bold">This project changed somewhere else</h2>
            <p className="mt-2 text-sm text-st-muted">You may have it open in another tab or window. Which version do you want to keep?</p>
            <div className="mt-5 flex gap-2">
              <Button tone="primary" onClick={() => s.resolveConflict("mine")}>Keep my edits</Button>
              <Button onClick={() => s.resolveConflict("theirs")}>Load the other version</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  // ---------- no editor yet: upload / processing screen, full width
  if (!hasEditor) {
    return (
      <div className="studio flex h-[100dvh] flex-col">
        {header}
        <div className="st-rise min-h-0 flex-1">{stage}</div>
        {overlays}
      </div>
    );
  }

  // ---------- left vertical rail (desktop) — the §7 growth point; the panel column opens beside it
  const rail = (
    <nav aria-label="Studio tools" className="flex w-[76px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-st-line bg-st-panel px-2 py-3">
      {RAIL_SECTIONS.map((sec) => (
        <button
          key={sec.id}
          data-tour={sec.tour}
          onClick={() => setSection(sec.id)}
          aria-pressed={section === sec.id}
          className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 ${section === sec.id ? "bg-st-lav text-st-ink" : "text-st-muted hover:bg-st-raised hover:text-st-text"}`}
        >
          {sec.icon}
          <span className="text-[11px] font-medium leading-none">{sec.label}</span>
        </button>
      ))}
    </nav>
  );
  // the active section's panel, full height; Captions keeps its title row, the rest carry their own
  const panelColumn = (
    <aside aria-label="Tool panel" className="flex min-h-0 w-[min(400px,34vw)] min-w-[300px] shrink-0 flex-col border-r border-st-line bg-st-panel">
      {section === "captions" ? <PanelTitle title="Captions" hint={`${pages.length} cards`} /> : null}
      <div key={section} className="st-rise min-h-0 flex-1">{renderPanel(section)}</div>
    </aside>
  );

  // ---------- desktop: rail | panel column | centre (preview over timeline). One layout for portrait
  // and landscape video — the player fits the centre area either way.
  if (desktop) {
    return (
      <div className="studio flex h-[100dvh] flex-col">
        {header}
        <div className="flex min-h-0 flex-1">
          {rail}
          {panelColumn}
          <div className="flex min-w-0 flex-1 flex-col">
            <section data-tour="preview" aria-label="Preview" className="min-h-0 flex-1 bg-st-bg">{stage}</section>
            <section aria-label="Timeline section" className="h-[min(300px,34%)] min-h-[215px] shrink-0 border-t border-st-line">{timeline}</section>
          </div>
          {segmentInspector ? (
            <aside aria-label="Segment inspector" className="flex min-h-0 w-[300px] shrink-0 flex-col border-l border-st-line bg-st-panel">
              {segmentInspector}
            </aside>
          ) : null}
        </div>
        {overlays}
      </div>
    );
  }

  // ---------- phone / tablet: preview on top, one panel at a time, and the rail collapsed to a
  // single-row horizontal icon bar at the bottom (scrolls sideways — never wraps into a second row)
  return (
    <div className="studio flex h-[100dvh] flex-col">
      {header}
      <section data-tour="preview" aria-label="Preview" className="h-[40dvh] min-h-[250px] shrink-0 border-b border-st-line bg-st-bg">{stage}</section>
      {segmentInspector ? (
        <div className="h-[min(38dvh,360px)] shrink-0 overflow-hidden border-b border-st-line bg-st-panel">{segmentInspector}</div>
      ) : null}
      <div key={mobileTimeline ? "timeline" : section} className="st-rise min-h-0 flex-1 bg-st-panel">
        {mobileTimeline ? timeline : renderPanel(section)}
      </div>
      <nav className="flex shrink-0 flex-nowrap gap-1 overflow-x-auto border-t border-st-line bg-st-panel px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [scrollbar-width:none]" aria-label="Editor sections">
        {RAIL_SECTIONS.map((sec) => (
          <button
            key={sec.id}
            data-tour={sec.tour}
            onClick={() => { setSection(sec.id); setMobileTimeline(false); }}
            aria-pressed={!mobileTimeline && section === sec.id}
            className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 ${!mobileTimeline && section === sec.id ? "bg-st-lav text-st-ink" : "text-st-muted"}`}
          >
            {sec.icon}
            <span className="text-[11px] font-medium leading-none">{sec.label}</span>
          </button>
        ))}
        <button
          onClick={() => setMobileTimeline(true)}
          aria-pressed={mobileTimeline}
          className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 ${mobileTimeline ? "bg-st-lav text-st-ink" : "text-st-muted"}`}
        >
          {railIcon(<><path d="M3 9h18M3 15h18" /><path d="M8 5v14M15 5v14" /></>)}
          <span className="text-[11px] font-medium leading-none">Timeline</span>
        </button>
      </nav>
      {overlays}
    </div>
  );
}

const PanelTitle: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="flex shrink-0 items-baseline justify-between border-b border-st-line px-4 py-3">
    <h2 className="font-display text-lg font-bold">{title}</h2>
    {hint ? <span className="text-xs text-st-faint">{hint}</span> : null}
  </div>
);


const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="studio flex h-[100dvh] items-center justify-center text-st-muted">{children}</div>
);
