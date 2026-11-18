"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayerRef } from "@remotion/player";
import { computePages } from "@capseasy/compositions";
import { CaptionDocSchema, effectiveDurationMs, TRANSITION_REGISTRY_IDS, translationModelFor, type CaptionDoc, type CompositionTrackKind, type SegmentTransition, type TrackState } from "@capseasy/shared";
import { getLook, getTemplate, loadFontFamily } from "@capseasy/templates";
import { defaultVoiceMemberAvatars } from "@capseasy/motion";
import { deleteWordsByIds, insertWordAfter, mergeWithNext, mergeWithPrevious, retimeRun, retimeRunGiveWay, setEmphasis, setHidden, setWordText, shiftWordsByIds, splitCardAt } from "@motion-ai/caption-engine/core";
import { Copy, EyeOff, Keyboard, Redo2, Scissors, Star, Trash2, Undo2 } from "@/components/ui/icons";
import { Logo } from "@/components/brand/Logo";
import { StudioSkeleton } from "@/components/brand/Skeletons";
import { useBrandNav } from "@/components/brand/BrandNav";
import { useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { ApiError } from "@/services/api-client";
import { Button } from "./controls";
import { anyModalOpen } from "./modalGuard";
// The export dialog pulls in the whole in-browser renderer (Remotion web-renderer + Mediabunny). Load it
// only when the creator actually opens Export — the studio's first paint (especially on a phone) should
// not carry or evaluate that machinery.
const ExportModal = dynamic(() => import("./ExportModal").then((m) => m.ExportModal), { ssr: false });
import { CaptionsPanel } from "./panels/CaptionsPanel";
import { LooksPanel } from "./panels/LooksPanel";
import { SettingsPanel, StylePanel } from "./panels/StylePanel";
import { MediaPanel } from "./panels/MediaPanel";
import { AiGeneratePanel, type AiEditTranscriptState } from "./panels/AiGeneratePanel";
import { SoundEffectsPanel } from "./panels/SoundEffectsPanel";
import { ElementsPanel } from "./panels/ElementsPanel";
import { MotionStudioPanel } from "./panels/MotionStudioPanel";
import { TitlesPanel } from "./panels/TitlesPanel";
import { StickersPanel } from "./panels/StickersPanel";
import { NewGraphicsPanel } from "./panels/NewGraphicsPanel";
import { TransitionsPanel } from "./panels/TransitionsPanel";
import { AdjustPanel } from "./panels/AdjustPanel";
import { AudioPanel } from "./panels/AudioPanel";
import { TranslatePanel } from "./panels/TranslatePanel";
import { ProcessingPanel } from "./ProcessingPanel";
import { StudioPlayer } from "./StudioPlayer";
import { OverlayStageLayer } from "./OverlayStageLayer";
import { Timeline } from "./Timeline";
import { UploadPanel } from "./UploadPanel";
import { SignupGate } from "./SignupGate";
import { projectsService } from "@/services/projects";
import { studioService } from "@/services/studio";
import { useDeviceVideo } from "@/features/upload/useDeviceVideo";
import { syncStatusFor, syncVideoToCloud, type VideoSyncStatus as SyncStatus } from "@/features/upload/videoSync";
import { VideoSyncStatus } from "./VideoSyncStatus";
import { useCompatCopy } from "@/features/upload/useCompatCopy";
import { etaText } from "./ProcessingPanel";
import { getSession, startSession, useSessionView } from "@/features/transcribe/session";
import { modeFromSearch, projectModeOf, setProjectMode, type ProjectStartMode } from "./projectMode";
import { currentUserIsGuest, signInExistingWithGoogle, takeIdentityExistsError } from "@/services/auth/guest";
import { useWaveform, PEAKS_PER_SECOND } from "./useWaveform";
import { applyAutoZooms, generateAutoZoomPlan, type AutoZoomIntensity } from "./autoZooms";
import { toComposition } from "./composition";
import { captionBoxFractions, captionFontPx, clampCaptionPosition, effectiveCardPosition, setSelectedCardsPosition, shiftCardPositionsByGlobalDelta, shiftSelectedCardsByDelta, applyPositionToAllCards, clearAllCardPositions } from "./captionPosition";
import { buildEditorComposition, projectComposition, type EditorComposition } from "./compositionDoc";
import {
  addMarker, addSegmentEffect, addSegmentKeyframe, applyContentEffect, applyDocEffect,
  canRippleDeleteVideoSegment, deleteOverlayClip,
  duplicateOverlayClip, duplicateVideoSegment, insertStillSegmentAt, insertVideoSegmentAt, moveOverlayClip, moveSegmentEffect,
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
import type { PreparedVideo } from "@/features/upload/prepareVideo";
import { resolveUploadOutcome } from "./footageSwap";
import { listProjectAssets, saveAsset } from "./mediaStore";
import { isAiEditProject } from "./aiEditFlow";
import { transcribeVideoForPlanning } from "./aiEditTranscribe";
import type { ImportError } from "./useMediaAssets";
import { splitWordIdAtPlayhead } from "./playheadSplit";
import { resolveDeleteAction } from "./deleteSelection";
import { useMediaAssets } from "./useMediaAssets";
import { makeImageOverlay } from "./panels/overlayItems";
import {
  addAudioBleeps, addAudioTrack, duplicateAudioClip, moveAudioClip, placeAudioClip, removeAudioBleep, removeAudioClip, removeAudioTrack,
  setAudioDucking, setNoiseSuppressionAsset, splitAudioClipAt, trimAudioClip, updateAudioBleep, updateAudioClip, updateAudioClipProcessors,
  updateAudioMaster, updateAudioTrack,
} from "./audioOps";
import { makeNoiseSuppressedWav, noiseSuppressedAssetRecord } from "./audio/denoise";
import { extractAudioWav, extractedAudioAssetRecord, extractedAudioName } from "./audio/extract";
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
type PanelId = "captions" | "templates" | "style" | "timing" | "media" | "aiedit" | "elements" | "adjust" | "audio" | "sfx" | "translate";

const railIcon = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

/** The left-rail sections. Exported for the rail pin in __tests__/railSections.test.ts. */
export const RAIL_SECTIONS: { id: PanelId; label: string; icon: React.ReactNode; tour?: "templates" | "style" }[] = [
  { id: "media", label: "Media", icon: railIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M3 16l5-4 4 3 3-2 6 5" /></>) },
  { id: "aiedit", label: "Generate Image/Video", icon: railIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" /></>) },
  { id: "captions", label: "Captions", icon: railIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h6M7 14h10" /></>) },
  { id: "translate", label: "Translate", icon: railIcon(<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.2-3.9-8.5s1.3-6.2 3.9-8.5z" /></>) },
  { id: "templates", label: "Templates", tour: "templates", icon: railIcon(<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>) },
  { id: "style", label: "Style", tour: "style", icon: railIcon(<text x="12" y="17" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">Aa</text>) },
  { id: "elements", label: "Elements", icon: railIcon(<><circle cx="8" cy="8" r="3.5" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M17.5 3.5l3 5h-6z" /></>) },
  { id: "adjust", label: "Adjust", icon: railIcon(<><path d="M4 8h9M19 8h1M4 16h3M13 16h7" /><circle cx="16" cy="8" r="2" /><circle cx="10" cy="16" r="2" /></>) },
  { id: "audio", label: "Audio", icon: railIcon(<><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></>) },
  { id: "sfx", label: "Sound FX", icon: railIcon(<><path d="M9 18.5V7l10-2v10.5" /><circle cx="6.5" cy="18.5" r="2.5" /><circle cx="16.5" cy="15.5" r="2.5" /></>) },
  { id: "timing", label: "Timing", icon: railIcon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>) },
];

/**
 * Right-side options (desktop): the vertical side rail beside the panel
 * content. No "reels" tab — ReelTemplatesPanel stays on disk unlinked
 * (same precedent as titleCard.ts). The Inspector entry only renders when a
 * segment is selected (segmentInspector exists); the rest are always there.
 */
export type RightTabId = "motion" | "inspector" | "titles" | "stickers" | "sfx" | "graphics" | "transitions";
export const RIGHT_TABS: { id: RightTabId; label: string; icon: React.ReactNode }[] = [
  { id: "motion", label: "Motion", icon: railIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" /></>) },
  { id: "inspector", label: "Inspector", icon: railIcon(<><path d="M4 8h9M19 8h1M4 16h3M13 16h7" /><circle cx="16" cy="8" r="2" /><circle cx="10" cy="16" r="2" /></>) },
  { id: "titles", label: "Titles", icon: railIcon(<text x="12" y="17" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">Aa</text>) },
  { id: "stickers", label: "Stickers", icon: railIcon(<><path d="M12 3l2.5 5.3 5.5.7-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.5-.7z" /></>) },
  { id: "sfx", label: "Sounds", icon: railIcon(<><path d="M9 18.5V7l10-2v10.5" /><circle cx="6.5" cy="18.5" r="2.5" /><circle cx="16.5" cy="15.5" r="2.5" /></>) },
  { id: "graphics", label: "Graphics", icon: railIcon(<><circle cx="8" cy="8" r="3.5" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M17.5 3.5l3 5h-6z" /></>) },
  { id: "transitions", label: "Transitions", icon: railIcon(<><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /><path d="M11 12h2" /></>) },
];

/** Drag payloads are untrusted JSON: the dropped type is a plain string, so
 * narrow it to a real transition type (5 legacy + 100 registry ids) before
 * applying. Unknown ids surface a note instead of a silent no-op. */
const LEGACY_TRANSITION_TYPES = ["fade", "wipe", "slide", "zoom", "blur"] as const;
function isSegmentTransitionType(t: string): t is SegmentTransition["type"] {
  return (
    (LEGACY_TRANSITION_TYPES as readonly string[]).includes(t) ||
    (TRANSITION_REGISTRY_IDS as readonly string[]).includes(t)
  );
}

/**
 * Why a transition apply would silently do nothing (setSegmentTransition's
 * own no-op rules, mirrored here so the UI can say so instead): the clip is
 * unknown, the first clip (index < 1), a neighbour too short to fit even
 * 100 ms, or the exact same type + clamped duration already applied.
 * Clearing (transition null) on an already-plain cut is the same kind of
 * no-op. Null = it can go ahead.
 */
export function transitionApplyBlocker(
  comp: EditorComposition | null,
  clipId: string,
  transition: SegmentTransition | null,
): string | null {
  if (!comp) return "There's no timeline to apply a transition to yet.";
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return "That cut is gone — pick another cut in the timeline.";
  if (idx < 1) return "Can't apply here — this is the first clip.";
  const clip = comp.videoClips[idx]!;
  const prev = comp.videoClips[idx - 1]!;
  if (transition) {
    const cap = Math.min(prev.durationMs, clip.durationMs) - 1;
    if (cap < 100) return "Neighbouring clip too short for a transition.";
    const durationMs = Math.max(100, Math.min(Math.round(transition.durationMs), cap));
    if ((clip.transitionIn?.type ?? null) === transition.type && (clip.transitionIn?.durationMs ?? 0) === durationMs) {
      return "Already applied.";
    }
  } else if (!clip.transitionIn) {
    return "Already a plain cut.";
  }
  return null;
}

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
  // the server takes over the moment the run is saved (or has ended — "detached" means the
  // job was finished/taken elsewhere, so the server's transcript is the one to fetch)
  const phase = liveView?.phase;
  const refetchStudio = s.refetch;
  useEffect(() => {
    if (phase === "saved" || phase === "failed" || phase === "stopped" || phase === "detached") void refetchStudio();
  }, [phase, refetchStudio]);
  // first-run mini tutorial: the first time generated captions land (the session's "saved" transition,
  // or the first adopted document with words) and the seen flag is unset, start the tour after a beat
  const tourCheckedRef = useRef(false);
  const docForTour = s.doc;
  useEffect(() => {
    if (tourCheckedRef.current) return;
    // a blank AI-Edit project never gets the captions tutorial
    if (isAiEditProject(projectId)) { tourCheckedRef.current = true; return; }
    const landed = phase === "saved" || (docForTour != null && docForTour.words.length > 0);
    if (!landed) return;
    tourCheckedRef.current = true;
    if (!shouldShowTutorial()) return;
    const t = setTimeout(() => setShowTour(true), 900);
    return () => clearTimeout(t);
  }, [phase, docForTour]);
  const desktop = useIsDesktop();

  // A blank AI-Edit project opens on its own rail section (never the
  // captions section, and no caption session or tutorial is started for it).
  const [section, setSection] = useState<PanelId>(() => (isAiEditProject(projectId) ? "aiedit" : "captions"));
  // Package 2 item G — the door this project started through (?mode= wins, then the
  // device record, then the captions default). Persisted the moment it's known/chosen.
  const [startMode, setStartMode] = useState<ProjectStartMode>(() => (typeof window !== "undefined" ? modeFromSearch(window.location.search) : null) ?? projectModeOf(projectId));
  useEffect(() => { if (!isAiEditProject(projectId)) setProjectMode(projectId, startMode); }, [projectId, startMode]);
  // right column (desktop): Motion Studio lives there permanently; the segment inspector
  // shares the column as a second tab that takes focus when a segment is selected. The
  // column collapses to a slim strip so the centre can reclaim the width on demand.
  const [rightTab, setRightTab] = useState<RightTabId>("motion");
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobileTimeline, setMobileTimeline] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * The SELECTED JOIN (cut): the id of the clip AFTER the cut. There is no
   * "selected cut" in the code — a transition applies to the clip after the
   * cut, so the join is stored as that clip. Null = no join selected; the
   * Transitions panel then offers the first cut instead of applying blind.
   */
  const [selectedJoinClipId, setSelectedJoinClipId] = useState<string | null>(null);
  /** A join click sets this so the segment-selection effect opens the
   * Transitions tab instead of the Inspector for that one selection. */
  const joinSelectRef = useRef(false);
  /** The last transition message (a refused apply, never a silent no-op). */
  const [transitionNote, setTransitionNote] = useState<string | null>(null);
  /** drag selection of caption words (ids, spanning cards), shared by the captions panel + timeline */
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  /**
   * Multi-select of caption CARDS (page ids, picked on the timeline in line
   * mode) — for position only, separate from selectedWordIds, which is for
   * retiming. Empty (or exactly one) = the global behaviour: a drag moves
   * style.position, so ALL captions move together. 2+ = only those cards
   * move, as per-card overrides. Switching word/line mode keeps it.
   */
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  /**
   * Live drag ghost: while a selective drag moves cards the playhead card is
   * NOT in, the caption under the pointer cannot move on screen (it must not
   * visibly move and then snap back), so the dragged spot is shown as a
   * translucent preview instead. Null when the playhead card itself is moving
   * (it follows live) or no drag is on.
   */
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number } | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selVideoClipId, setSelVideoClipId] = useState<string | null>(null);
  const [selMarkerId, setSelMarkerId] = useState<string | null>(null);
  const [selAudioClipId, setSelAudioClipId] = useState<string | null>(null);
  /** Phase 5 (A12): noise-suppression production state (the derived-asset build is async) */
  const [noiseBusy, setNoiseBusy] = useState(false);
  const [noiseError, setNoiseError] = useState<string | null>(null);
  // Package 4 item J1: extract-audio state (the produced WAV is held until the user
  // adds it to the bin or downloads it — both are explicit outcomes, neither automatic)
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<{ blob: Blob; name: string; durationMs: number; inBin: boolean } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // one selection kind at a time: picking a word / overlay / video segment / marker clears the
  // others, so Delete and the contextual timeline tools always act on what the user just picked
  const selectWord = (id: string | null) => {
    setSelectedId(id);
    if (id) { setSelectedOverlayId(null); setSelVideoClipId(null); setSelMarkerId(null); setSelAudioClipId(null); }
  };
  /**
   * A user CLICK on a caption opens the Captions section (owner 2026-11-16) —
   * so the Edit word panel is right there. Only user clicks do this:
   * programmatic selection (split-at-playhead, adding a word) keeps calling
   * selectWord and never yanks the user out of Templates while the video
   * plays. Switching when already there is a no-op; deselecting (null) never
   * switches. Follows the selectAudioClipFromTimeline precedent below.
   */
  const selectWordFromUserClick = (id: string | null) => {
    selectWord(id);
    if (id) { setSection("captions"); setMobileTimeline(false); }
  };
  const selectOverlay = (id: string | null) => {
    setSelectedOverlayId(id);
    if (id) { setSelectedId(null); setSelectedWordIds(new Set()); setSelVideoClipId(null); setSelMarkerId(null); setSelAudioClipId(null); }
  };
  const selectVideoClip = (id: string | null, opts?: { keepJoin?: boolean }) => {
    setSelVideoClipId(id);
    if (id) { setSelectedId(null); setSelectedWordIds(new Set()); setSelectedOverlayId(null); setSelMarkerId(null); setSelAudioClipId(null); }
    // a plain segment pick drops the join: the Transitions panel must not
    // keep applying to a cut the user has moved away from
    if (!opts?.keepJoin) setSelectedJoinClipId(null);
  };
  /**
   * Clicking a cut marker in the timeline selects that join: the selected
   * segment becomes the clip AFTER the cut (so the Inspector and the
   * Transitions panel both read the join's clip), and the Transitions tab
   * comes forward instead of the Inspector.
   */
  const selectJoin = (clipId: string) => {
    joinSelectRef.current = true;
    setSelectedJoinClipId(clipId);
    setTransitionNote(null);
    selectVideoClip(clipId, { keepJoin: true });
    setRightTab("transitions");
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
  /** replace dialog choice: keep the caption timeline (default) or start fresh */
  const [replaceMode, setReplaceMode] = useState<"keep" | "fresh">("keep");
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) router.replace(`/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
  }, [router, projectId]);

  // the video plays from this device first; a synced cloud copy (or an old server upload) streams when it isn't here
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
  // Caption position (owner 2026-11-16, third correction): the DEFAULT is the
  // old behaviour — a drag moves the GLOBAL style.position, so all captions
  // move together and a new user is never confused by one caption moving and
  // the rest staying. Only when 2+ cards are picked on the timeline does a
  // drag write per-card overrides to just those cards (same absolute position
  // on each, one undo step for the whole drag, same coalesce pattern as the
  // old per-card move). Exactly one card picked still counts as "no
  // multi-selection" and moves globally.
  //
  // DELTA RULE: a global move moves EVERYTHING together. Cards that already
  // have an override do NOT stay behind — they shift by the same delta as
  // the global position (shiftCardPositionsByGlobalDelta), keeping their
  // relative offset. The delta is computed from the POINTER's displacement
  // since the drag started, never from an absolute pointer position: the
  // pointer grabs the caption where it sits (its override spot), so an
  // absolute conversion would jump the caption by (override - global) on
  // the first tick. dragPointerRef is that start point, set by the player's
  // onPositionDragStart (hit box + grip pointerdown) and cleared on drag
  // end; a move without a drag start falls back to the current card's
  // effective position as the reference, so the move still works. The live
  // global position only exists inside patchStyle's updater (drag/slider
  // ticks can batch before a re-render, so `style.position` in a closure
  // may lag), so applyGlobalMove captures {old, next} there and the doc
  // shift uses the same delta as the style change. patchStyle + edit share
  // the "caption-position:global" coalesce key, so the whole move — style
  // plus every shifted override — is ONE undo step. The Style panel
  // sliders stay global always and go through the same applyGlobalMove.
  // The grip arrow keys are nudges (one step, relative): with 2+ cards
  // picked they shift just those cards by the step
  // (shiftSelectedCardsByDelta), else they are a global move by the step.
  const currentCardPosition = currentPage && style ? effectiveCardPosition(currentPage, style) : null;
  const captionBox = currentPage && style ? captionBoxFractions(currentPage, style, canvas) : null;
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const applyGlobalMove = useCallback((computeNext: (old: { x: number; y: number }) => { x: number; y: number }) => {
    if (!style) return;
    const captured: { old: { x: number; y: number }; next: { x: number; y: number } } = { old: style.position, next: style.position };
    s.patchStyle((st) => {
      const next = clampCaptionPosition(computeNext(st.position));
      captured.old = st.position;
      captured.next = next;
      return { ...st, position: next };
    }, { coalesceKey: "caption-position:global" });
    if (captured.next.x === captured.old.x && captured.next.y === captured.old.y) return;
    const { old, next } = captured;
    // No overrides anywhere = today's behaviour: only style.position changes,
    // no doc edit at all (and no undo step). The override set cannot change
    // mid-drag — a global move only shifts existing overrides, never creates
    // or removes one — so the render-time doc answers this safely even when
    // ticks batch before a re-render. The edit itself still takes an updater
    // so it reads the LIVE doc (batched ticks shift from the previous tick's
    // result, not from a stale render-time doc).
    if (!s.doc || !Object.values(s.doc.cards).some((c) => c?.position != null)) return;
    s.edit((d) => shiftCardPositionsByGlobalDelta(d, old, next), { coalesceKey: "caption-position:global" });
  }, [s, style]);
  const moveCaptionPosition = useCallback((p: { x: number; y: number }) => {
    if (!style) return;
    if (selectedCardIds.size >= 2) {
      if (!s.doc) return;
      const next = clampCaptionPosition(p);
      s.edit((d) => setSelectedCardsPosition(d, pages, style, selectedCardIds, next), { coalesceKey: `card-position:multi:${[...selectedCardIds].sort().join(",")}` });
      // honest live feedback: the playhead card only moves on screen when it
      // is in the selection; otherwise show the dragged spot as a ghost.
      if (currentPage && !selectedCardIds.has(currentPage.id)) setDragGhost(next);
      else setDragGhost(null);
      return;
    }
    // global move by pointer displacement since the drag started (see the
    // delta-rule comment above): the caption tracks the pointer's movement
    // exactly, and overridden cards keep their offset.
    const ref = dragPointerRef.current ?? currentCardPosition ?? style.position;
    const dx = p.x - ref.x;
    const dy = p.y - ref.y;
    dragPointerRef.current = p;
    if (dx === 0 && dy === 0) return;
    applyGlobalMove((old) => ({ x: old.x + dx, y: old.y + dy }));
    setDragGhost(null);
  }, [s, style, pages, selectedCardIds, currentPage, currentCardPosition, applyGlobalMove]);
  const nudgeCaptionPosition = useCallback((d: { dx: number; dy: number }) => {
    if (!style || (d.dx === 0 && d.dy === 0)) return;
    if (selectedCardIds.size >= 2) {
      if (!s.doc) return;
      s.edit((dd) => shiftSelectedCardsByDelta(dd, pages, style, selectedCardIds, d), { coalesceKey: `card-position:multi:${[...selectedCardIds].sort().join(",")}` });
      return;
    }
    applyGlobalMove((old) => ({ x: old.x + d.dx, y: old.y + d.dy }));
  }, [s, style, pages, selectedCardIds, applyGlobalMove]);
  const endCaptionPositionDrag = useCallback(() => {
    dragPointerRef.current = null;
    setDragGhost(null);
  }, []);
  // Bulk caption position (owner 2026-11-16): the Style panel's Position
  // section is the "all captions" home. "Apply to all" copies the current
  // card's effective position onto every card; "Reset all" clears every
  // override so all cards follow the global style position again. Both go
  // through s.edit as one undo step, like every other caption edit.
  const applyPositionToAll = useCallback(() => {
    if (!style || !currentCardPosition) return;
    s.edit((d) => applyPositionToAllCards(d, pages, style, currentCardPosition));
  }, [s, pages, style, currentCardPosition]);
  const resetAllPositions = useCallback(() => {
    s.edit((d) => clearAllCardPositions(d));
  }, [s]);
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

  const commitComposition = (nextComp: EditorComposition, docEffect?: DocEffect | DocEffect[]) => {
    if (!editorComp) return;
    // Phase 5 (A3): an ARRAY of effects is supported for multi-range applies
    // (trim fillers & pauses) — effects apply sequentially, in the caller's
    // order (trim passes them descending so coordinates never shift under
    // later effects), and still land in the one editAll below (one undo step).
    const effects = (docEffect ? (Array.isArray(docEffect) ? docEffect : [docEffect]) : []).filter((e) => e.type !== "none");
    if (nextComp === editorComp && effects.length === 0) return;
    let comp = nextComp;
    let nextDoc: CaptionDoc | undefined;
    if (effects.length > 0) {
      // The composition's outside content (markers/overlays, placed audio
      // clips and bleeps) and the caption doc's
      // words both follow the SAME effect — headShift (range moved), rangeRemove /
      // rangeInsert (ripple delete / still insert), rangeShift / rangeScale (speed
      // changes) — all landing in the one editAll call below (one undo step).
      let currentDoc = s.doc;
      for (const effect of effects) {
        comp = applyContentEffect(comp, effect);
        if (currentDoc) {
          const shifted = applyDocEffect(currentDoc, effect);
          if (shifted !== currentDoc) {
            nextDoc = shifted;
            currentDoc = shifted;
          }
        }
      }
    }
    const projected = projectComposition(comp, settings);
    s.editAll({ ...(nextDoc ? { doc: nextDoc } : {}), settings: projected });
  };

  /* ---------- Run 3 audio wiring: every AudioPanel / Timeline audio callback is an
   * audioOps call committed through commitComposition with no docEffect (one undo step) */
  const commitAudio = (next: EditorComposition) => commitComposition(next);
  // A locked audio track protects its clips everywhere — the Timeline drag already checks,
  // and the AudioPanel now disables its controls; this guard is the chokepoint that makes
  // the promise true for every caller (audit B-13).
  const audioClipLocked = (clipId: string): boolean => {
    if (!editorComp) return false;
    const clip = editorComp.audioClips.find((c) => c.id === clipId);
    return clip ? editorComp.audioTracks.find((t) => t.id === clip.trackId)?.locked ?? false : false;
  };
  const guardAudioClip =
    <A extends unknown[]>(fn: (id: string, ...rest: A) => void) =>
    (id: string, ...rest: A) => {
      if (!audioClipLocked(id)) fn(id, ...rest);
    };
  const placeAudioClipFromPanel = (asset: { id: string; name: string; durationMs: number }) => {
    if (!editorComp || !asset.durationMs || asset.durationMs <= 0) return;
    let comp = editorComp;
    const selectedClip = selAudioClipId ? comp.audioClips.find((c) => c.id === selAudioClipId) : undefined;
    let track = selectedClip ? comp.audioTracks.find((t) => t.id === selectedClip.trackId) : undefined;
    // never place into a locked track: fall back to the first unlocked one, else a new track
    if (track?.locked) track = undefined;
    track = track ?? comp.audioTracks.find((t) => !t.locked) ?? comp.audioTracks[0];
    if (!track || track.locked) {
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

  /* Phase 5 (A12): build the noise-suppressed derived WAV once (decode → RNNoise →
   * WAV in the media bin) and point the composition's audio slice at it; turning it
   * off just clears the reference. The mix (preview + export) reads the derived
   * asset through the ONE mix plan — RNNoise never runs live in either consumer. */
  const toggleNoiseSuppression = async (enable: boolean) => {
    if (!editorComp) return;
    if (!enable) {
      setNoiseError(null);
      commitAudio(setNoiseSuppressionAsset(editorComp, null));
      return;
    }
    if (editorComp.audioNoiseSuppressionAssetId) return;
    setNoiseBusy(true);
    setNoiseError(null);
    try {
      const srcBlob = await getAudioBlob(null);
      if (!srcBlob) throw new Error("This project's video isn't on this device, so its sound can't be cleaned here.");
      const wav = await makeNoiseSuppressedWav(srcBlob);
      if (!wav) throw new Error("That video has no audio track to clean.");
      const rec = noiseSuppressedAssetRecord({ projectId, blob: wav, durationMs: sourceDurationMs || durationMs || null });
      await saveAsset(rec);
      await mediaBin.refresh();
      commitAudio(setNoiseSuppressionAsset(editorComp, rec.id));
    } catch (e) {
      setNoiseError(e instanceof Error ? e.message : "Noise suppression failed on this device.");
    } finally {
      setNoiseBusy(false);
    }
  };

  // Package 4 item J1 — extract the video's audio track to a WAV, on this device.
  const runExtractAudio = async () => {
    setExtractBusy(true);
    setExtractError(null);
    try {
      const srcBlob = await getAudioBlob(null);
      if (!srcBlob) throw new Error("This project's video isn't on this device, so its audio can't be extracted here.");
      const out = await extractAudioWav(srcBlob);
      if (!out) throw new Error("That video has no audio track to extract.");
      setExtractResult({ blob: out.blob, name: extractedAudioName(data?.video?.filename ?? data?.project.title ?? ""), durationMs: out.durationMs, inBin: false });
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraction failed on this device.");
    } finally {
      setExtractBusy(false);
    }
  };
  const addExtractToBin = async () => {
    if (!extractResult || extractResult.inBin) return;
    try {
      const rec = extractedAudioAssetRecord({ projectId, blob: extractResult.blob, durationMs: extractResult.durationMs, name: extractResult.name });
      await saveAsset(rec);
      await mediaBin.refresh();
      setExtractResult({ ...extractResult, inBin: true });
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Couldn't add the audio to the media bin.");
    }
  };
  const downloadExtract = () => {
    if (!extractResult) return;
    const url = URL.createObjectURL(extractResult.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = extractResult.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

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
  // selecting a timeline segment brings its inspector forward in the right column —
  // except a join click, which brings the Transitions tab forward instead
  const selSegId = selSegmentView?.id ?? null;
  useEffect(() => {
    if (!selSegId) return;
    if (joinSelectRef.current) {
      joinSelectRef.current = false;
      setRightTab("transitions");
      return;
    }
    setRightTab("inspector");
  }, [selSegId]);
  // the selected join, as the Transitions panel sees it: the clip after the
  // cut is "Clip <index>" (0-based index, so the first join is "Cut after
  // Clip 1"); a stale id (the clip was ripple-deleted) reads as no join
  const selectedJoinIndex = editorComp && selectedJoinClipId ? editorComp.videoClips.findIndex((c) => c.id === selectedJoinClipId) : -1;
  const selectedJoinLabel = selectedJoinIndex >= 1 ? `Cut after Clip ${selectedJoinIndex}` : null;
  const hasJoins = Boolean(editorComp && editorComp.videoClips.length > 1);
  const joinClip = selectedJoinIndex >= 1 ? editorComp!.videoClips[selectedJoinIndex]! : null;
  const selectFirstJoin = () => {
    if (editorComp && editorComp.videoClips.length > 1) selectJoin(editorComp.videoClips[1]!.id);
  };
  useEffect(() => {
    if (selectedJoinClipId && editorComp && !editorComp.videoClips.some((c) => c.id === selectedJoinClipId)) {
      setSelectedJoinClipId(null);
    }
  }, [editorComp, selectedJoinClipId]);
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

  // resolved URLs for placed image overlays + social avatar/QR assets (device-local bytes → object URLs for this session);
  // threaded into the one input object, so the Player preview and the in-browser export agree
  const [overlayAssetUrls, setOverlayAssetUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const o of settings.overlays) {
      // image overlays draw the asset itself; social overlays use it in their avatar/QR slot —
      // CaptionedVideo resolves both from this same map (item.assetId -> object URL)
      if ((o.kind !== "image" && o.kind !== "social") || !o.assetId || urls[o.assetId]) continue;
      const asset = mediaBin.assets.find((a) => a.id === o.assetId);
      if (asset) urls[o.assetId] = URL.createObjectURL(asset.blob);
    }
    setOverlayAssetUrls(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [settings.overlays, mediaBin.assets]);

  // voice-card member photos for placed items (default avatars, 2026-11-12): the
  // voice card has no image field, so its members never carry a media-bin asset —
  // the bundled default photos (Alex / Priya / Sam) are threaded here instead, so
  // the Studio preview and the project export show real photos, not initials.
  const voiceMemberAssetsByItemId = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const o of settings.overlays) {
      if (o.kind === "social" && o.variant === "voice-card") out[o.id] = defaultVoiceMemberAvatars();
    }
    return out;
  }, [settings.overlays]);

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
            // voice-card members: the bundled default member photos (Alex / Priya / Sam),
            // so a placed voice card shows real photos, not initials — same defaults the
            // template previews use. Single-avatar items carry their photo as a real
            // media-bin asset (see addToProject), so they need nothing here.
            overlayMemberAssets: voiceMemberAssetsByItemId,
            segmentAssets: segmentAssetUrls,
          }
        : null,
    [doc, style, settings, video?.url, canvasSize.width, canvasSize.height, fps, durationMs, overlayAssetUrls, voiceMemberAssetsByItemId, segmentAssetUrls, activeTranslatedDoc],
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
    ? { reason: "This browser couldn't show this video's picture. So an MP4 can't be made here. Download the captions as an SRT file. Or open this project in Chrome, Edge or Safari for the MP4." }
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
    // Slice 5.5 (a): splitting a caption card is a caption edit — a locked captions track blocks it
    if (captionsLockedRef.current) return;
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

  // While any dialog is open (export, sign-up nudge, shortcuts help, a save conflict), the
  // editor's keys must not act on the project behind it. A ref, because the key handler's
  // closure does not re-bind on those state changes. The ref alone missed dialogs that
  // live outside this component's state (Motion picker, tutorial tour, "video ready") —
  // deep-audit B3 — so the handler ALSO consults `anyModalOpen`, which sees every
  // conditionally-mounted role="dialog"/"alertdialog" surface.
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current = showExport || showSignup || showShortcuts || Boolean(s.conflict);

  // keyboard: space = play/pause, ctrl/cmd+z / shift+z = undo/redo, ctrl/cmd+s = save,
  // Delete/Backspace = delete the current selection (words, timeline block, overlay),
  // S = split the caption card at the playhead, ←/→ = nudge the drag-selected words by 100 ms
  // (Shift+←/→ = 10 ms fine adjust). While typing in a field, Delete/Backspace stay native.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpenRef.current || anyModalOpen()) return;
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { if (typing && t.tagName !== "BODY") return; e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); }
      else if (mod && e.key.toLowerCase() === "y") { if (typing && t.tagName !== "BODY") return; e.preventDefault(); s.redo(); }
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

  // OC-001: these two hooks MUST live above the loading/401/not-found early
  // returns below. They used to sit ~150 lines past the `isLoading` gate, so
  // a fresh project's first render (loading → skeleton) ran two fewer hooks
  // than the render after the query resolved — React error #310 ("Rendered
  // more hooks than during the previous render") on every cold first load,
  // both doors. No hook may ever be added below that gate.
  // Package 2 item G — "Generate captions" for a Normal-Editor project: run the same
  // in-browser transcription the upload flow uses, from the video file on this device.
  // The session's own machinery takes it from there (progress in the panel's empty state,
  // the saved document replaces the empty one via the phase-change refetch above).
  const [genCapNote, setGenCapNote] = useState<string | null>(null);
  const generateCaptions = useCallback(async () => {
    if (!video) return;
    const blob = await getLocalVideo(video.id);
    if (!blob) {
      setGenCapNote("The video isn't on this device — captions are written here, from the file on this device. Open this project on the device you uploaded from.");
      return;
    }
    setGenCapNote(null);
    startSession({ projectId, videoId: video.id, file: blob, language: data?.project.language ?? null });
  }, [video, projectId, data?.project.language]);

  // AI Edit (Task 9): planning-only transcript, owned by this page. It
  // transcribes the uploaded video in this tab for the planner and never
  // starts a caption session or writes a caption document (no startSession).
  const [aiEditTranscript, setAiEditTranscript] = useState<AiEditTranscriptState>({ state: "idle", words: [] });
  const transcribeAiEditVideo = useCallback(async () => {
    if (!video) {
      setAiEditTranscript({ state: "error", words: [], error: "Add a video to the project first." });
      return;
    }
    const blob = await getLocalVideo(video.id);
    if (!blob) {
      setAiEditTranscript({ state: "error", words: [], error: "The video isn't on this device — open this project on the device you uploaded from." });
      return;
    }
    setAiEditTranscript({ state: "transcribing", words: [], progress: 0 });
    try {
      const words = await transcribeVideoForPlanning(blob, {
        onProgress: (p) => setAiEditTranscript((prev) => ({ ...prev, state: "transcribing", progress: p.progress })),
      });
      setAiEditTranscript({ state: "ready", words });
    } catch (e) {
      setAiEditTranscript({ state: "error", words: [], error: e instanceof Error ? e.message : "The video could not be listened to." });
    }
  }, [video]);

  // AI Edit video upload: the same device attach path MediaPanel uses for
  // "Use as source" — the file lands under the project's video id on this
  // device. A project with no video row yet has nothing to attach to; its
  // first upload goes through the start screen instead.
  const uploadAiEditVideo = useCallback(async (files: File[]): Promise<ImportError[]> => {
    const file = files[0];
    if (!file) return [];
    if (!data?.video?.id) {
      return [{ name: file.name, error: "This project has no video yet — upload one from the start screen first." }];
    }
    try {
      await device.attach(file);
      return [];
    } catch (e) {
      return [{ name: file.name, error: e instanceof Error ? e.message : "The video could not be added." }];
    }
  }, [data?.video?.id, device]);

  // Cloud video sync: a ≤50 MB copy of the video goes to the account's storage
  // so the project opens on a second device. A video uploaded in this session
  // syncs itself in the background once its local save lands; a video from
  // before sync existed waits for the explicit button (no silent backfill).
  // A failed sync changes nothing here — the local copy keeps working.
  const [sync, setSync] = useState<{ videoId: string | null; status: SyncStatus }>({ videoId: null, status: "unsynced" });
  const [justUploadedId, setJustUploadedId] = useState<string | null>(null);
  const runSync = useCallback(async (videoId: string) => {
    const blob = await getLocalVideo(videoId);
    if (!blob) {
      setSync({ videoId, status: "failed" });
      return;
    }
    setSync({ videoId, status: "syncing" });
    try {
      await syncVideoToCloud({ videoId, file: blob });
      setSync({ videoId, status: "synced" });
      void refetchStudio();
    } catch {
      setSync({ videoId, status: "failed" });
    }
  }, [refetchStudio]);
  useEffect(() => {
    const v = data?.video;
    if (!v || v.id !== justUploadedId || v.cloudSynced || sync.videoId === v.id) return;
    if (v.size != null && data?.limits?.syncMaxBytes != null && v.size > data.limits.syncMaxBytes) {
      setSync({ videoId: v.id, status: "too-large" });
      return;
    }
    void runSync(v.id);
  }, [data?.video, data?.limits?.syncMaxBytes, justUploadedId, runSync, sync.videoId]);

  // Replace footage, keep captions: the new bytes land in IndexedDB under the SAME video id
  // (device.attach) and the video row is updated in place — the caption doc, look and
  // settings are never touched, no re-transcription. The cloud copy (if any) was cleared
  // by the replace call, so the header Sync flow re-uploads the new footage.
  // (Declared before the early returns below: hooks must run on every render, loaded or not.)
  const handleKeepFootage = useCallback(async (ready: PreparedVideo) => {
    const v = data?.video;
    if (!v) throw new Error("This project has no video to replace.");
    await device.attach(ready.file);
    const mime =
      ready.file.type ||
      (ready.file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : ready.file.name.toLowerCase().endsWith(".mkv") ? "video/x-matroska" : "video/mp4");
    await studioService.replaceVideoFootage(v.id, {
      filename: ready.file.name,
      size: ready.file.size,
      mime,
      probe: {
        durationMs: ready.durationMs,
        width: ready.width,
        height: ready.height,
        rotation: ready.rotation,
        videoCodec: ready.videoCodec,
        audioCodec: ready.audioCodec,
        hasAudio: ready.hasAudio,
        previewMode: ready.previewMode,
        needsCompat: ready.needsCompat,
      },
    });
  }, [data?.video, device]);

  if (s.query.isLoading) return <StudioSkeleton />;
  if (s.query.error instanceof ApiError && s.query.error.status === 401) {
    router.replace(`/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
    return <FullScreen>Signing in…</FullScreen>;
  }
  if (!data) return <FullScreen>This project could not be found. <Link className="ml-2 font-semibold text-st-text underline decoration-st-or decoration-2 underline-offset-4" href="/dashboard">Back to projects</Link></FullScreen>;

  const noVideoYet = !video || video.status === "uploading";
  // a blank AI-Edit project is its own flow: its first upload must never
  // start a caption session, so it always opens through the editor door
  const isAiEdit = isAiEditProject(projectId);
  // the project's video isn't on this device (another device, cleared storage): add a video and caption it afresh
  const videoGone = !noVideoYet && device.status === "missing";
  const hasEditor = Boolean(doc && style && input) && !videoGone;
  const save = SAVE_LABEL[s.saveState];
  // cloud sync state for this video: the header shows it next to "Saved" —
  // local videos only (a server upload already plays everywhere)
  const showSync = hasEditor && !!video && video.local === true;
  const syncStatus: SyncStatus = !showSync || !video
    ? "synced"
    : sync.videoId === video.id
      ? sync.status
      : syncStatusFor({ cloudSynced: video.cloudSynced, size: video.size, syncMaxBytes: data?.limits?.syncMaxBytes });

  // ---------- building blocks shared by both layouts
  const liveBanner = live && liveView ? (
    <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-3 border-b border-st-line bg-st-lav/50 px-3 py-2 text-sm sm:px-4">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-st-or" />
      <span className="min-w-0 flex-1 truncate">
        <b>Writing your captions… {Math.round(liveView.progress * 100)}%</b>
        <span className="hidden text-st-muted sm:inline"> · {liveView.etaSec != null ? etaText(liveView.etaSec) : "a moment"}. You can pick a template and style now; words unlock when it&apos;s done.</span>
      </span>
      <div className="relative hidden h-1.5 w-32 rounded-full bg-st-line sm:block">
        <div className="h-full rounded-full bg-st-em transition-[width] duration-500" style={{ width: `${Math.max(3, liveView.progress * 100)}%` }} />
        <span aria-hidden className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-[#FFA946] transition-[left] duration-500" style={{ left: `${Math.max(3, liveView.progress * 100)}%` }} />
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
        <Link href="/dashboard" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); nav.go("/dashboard", "Back to your projects"); }} aria-label="Back to projects" className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-st-muted transition before:absolute before:-inset-1 before:content-[''] hover:bg-st-raised hover:text-st-text">←</Link>
        <Link href="/dashboard" aria-label="Captionit projects" className="hidden sm:block"><Logo height={22} /></Link>
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
          <>
            <h1 className="sr-only">{data.project.title || "Untitled project"}</h1>
            <button onClick={() => { setTitle(data.project.title); setEditingTitle(true); }} className="truncate rounded-md px-1.5 py-1.5 text-sm font-semibold transition hover:bg-st-raised" title="Rename">{data.project.title || "Untitled project"}</button>
          </>
        )}
        {hasEditor ? (
          <span className="hidden items-center gap-1.5 text-xs text-st-muted md:inline-flex" aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${save.dot}`} />{save.text}
          </span>
        ) : null}
        {showSync && video ? (
          <VideoSyncStatus status={syncStatus} onSync={() => void runSync(video.id)} />
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {hasEditor ? (
          <>
            {/* 32 px on screen; the invisible before: expander takes the tap target to 44 px (Phase 2B touch targets) */}
            <Button onClick={s.undo} disabled={!s.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="relative !px-2.5 before:absolute before:-inset-2 before:content-['']">↶</Button>
            <Button onClick={s.redo} disabled={!s.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="relative !px-2.5 before:absolute before:-inset-2 before:content-['']">↷</Button>
          </>
        ) : null}
        <Button
          aria-label="Delete project"
          title="Delete project"
          className="relative !px-2.5 before:absolute before:-inset-2 before:content-['']"
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
          🗑 Delete
        </Button>
        <Button data-tour="export" tone="primary" disabled={!hasEditor || live} title={live ? "Available when the captions are finished" : undefined} onClick={() => void openExport()} className="relative !rounded-full !px-4 before:absolute before:-inset-2 before:content-['']">Export</Button>
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
      position={currentCardPosition ?? style.position}
      onMovePosition={moveCaptionPosition}
      onPositionDragStart={(p) => { dragPointerRef.current = p; }}
      onNudgePosition={nudgeCaptionPosition}
      captionBox={captionBox}
      showPositionGrip={currentPage != null}
      onCaptionTap={() => { const id = currentPage?.words[0]?.id; if (id) selectWordFromUserClick(id); }}
      onPositionDragEnd={endCaptionPositionDrag}
      dragGhost={dragGhost}
      dragGhostText={currentPage ? currentPage.words.map((w) => w.text).join(" ") : ""}
      dragGhostFontPx={style ? captionFontPx(style, canvas) : undefined}
      onTime={setTimeMs}
      onPlayingChange={setPlaying}
      compact={!desktop}
      platform={settings.platform}
      stageOverlay={settings.overlays.length ? (
        <OverlayStageLayer
          overlays={settings.overlays}
          timeMs={timeMs}
          selectedId={selectedOverlayId}
          onSelect={selectOverlay}
          onPatch={(item) => s.patchSettings({ overlays: settings.overlays.map((o) => (o.id === item.id ? item : o)) })}
        />
      ) : null}
    />
  ) : null;

  // keep is only possible for a video stored on this device: a server upload still
  // streams its old bytes elsewhere, so swapping its local copy would leave two truths
  const keepAllowed = data?.video?.local === true;
  const effectiveReplaceMode = keepAllowed ? replaceMode : "fresh";

  const stage = player ?? (noVideoYet || replacing || videoGone ? (
    <UploadPanel
      projectId={projectId}
      limits={data.limits}
      language={data.project.language ?? null}
      mode={isAiEdit ? "editor" : startMode}
      onModeChange={isAiEdit ? undefined : setStartMode}
      onUploaded={(videoId) => {
        setJustUploadedId(videoId);
        setReplacing(false);
        // same video id = footage swap, captions stay; a new id = fresh upload, old captions go
        if (resolveUploadOutcome({ uploadedVideoId: videoId, currentVideoId: data?.video?.id ?? null }) === "reset") s.resetDoc();
        void s.refetch();
      }}
      note={
        videoGone ? "Video isn't on this device. Upload again — captions start fresh."
          : replacing
            ? effectiveReplaceMode === "keep"
              ? "Choose the new version of your video. Your captions stay on the same timeline."
              : "Choose the new video. Captions will be generated for it."
            : video?.status === "uploading" ? "The last upload didn't finish. Choose your video again." : undefined
      }
      videoId={data?.video?.id ?? null}
      replaceMode={replacing ? effectiveReplaceMode : undefined}
      onReplaceModeChange={setReplaceMode}
      previousDurationMs={data?.video?.durationMs ?? null}
      keepAllowed={keepAllowed}
      onKeepFootage={handleKeepFootage}
    />
  ) : (
    <ProcessingPanel projectId={projectId} job={data.job} canTranscribe={data.canTranscribe} onChanged={() => void s.refetch()} onReplaceVideo={() => setReplacing(true)} videoId={video?.id ?? null} local={!!data.video?.local} language={data.project.language ?? null} />
  ));

  const heroSupported = style ? getTemplate(style.templateId).layout !== "typewriter" : true;
  const generatingEmpty = writing && !!s.doc && s.doc.words.length === 0;
  const captions = doc && style ? (
    <div data-tour="captions" className="flex h-full min-h-0 flex-col">
      <div className={`min-h-0 flex-1 ${live || generatingEmpty ? "pointer-events-none" : ""}`} title={live ? "You can edit the words when the captions are finished" : undefined}>
        <CaptionsPanel doc={doc} pages={pages} currentPageId={currentPage?.id ?? null} timeMs={timeMs} selectedId={selectedId} onSelect={selectWordFromUserClick} onSeek={seek} edit={s.edit} heroSupported={heroSupported} selectedWordIds={selectedWordIds} onWordSelectionChange={handleWordSelectionChange} locked={editorComp?.trackState.captions.locked ?? false} onGenerateCaptions={doc.words.length === 0 && video && !videoGone ? () => void generateCaptions() : undefined} generateBusy={generatingEmpty} generateProgress={liveView?.progress ?? 0} generateNote={genCapNote} />
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

  const overlayPanelProps = { settings, patch: s.patchSettings, selectedId: selectedOverlayId, onSelect: selectOverlay, getTimeMs: getPlayerMs, durationMs, composition, mediaAssets: mediaBin.assets, onImportMedia: mediaBin.importFiles };
  // place an imported image as a timed overlay at a given time, then open its editor in Elements
  const placeImageAt = (asset: { id: string; name: string }, atMs: number) => {
    const item = makeImageOverlay(asset, atMs, durationMs);
    s.patchSettings({ overlays: [...settings.overlays, item] });
    selectOverlay(item.id);
    setSection("elements");
    setMobileTimeline(false);
  };
  const placeImage = (asset: { id: string; name: string }) => placeImageAt(asset, getPlayerMs());
  // AI Edit: insert a Puter-generated clip as a B-roll segment at the playhead — the
  // op splits the clip under the playhead and the rangeInsert effect shifts later
  // captions / markers / overlays / audio along, so nothing drifts out of sync.
  const insertAiVideoAt = (asset: { id: string; name: string; durationMs: number }, atMs: number): boolean => {
    if (!editorComp || videoLocked) return false;
    const r = insertVideoSegmentAt(editorComp, atMs, asset.durationMs, asset.id);
    if (r.comp === editorComp) return false;
    commitComposition(r.comp, r.docEffect);
    return true;
  };

  /* ---------- Transitions: apply at the SELECTED JOIN, never silently ---------- */
  // The target is the join's clip (selectedJoinClipId, or an explicit id
  // from a drop — the drop selects the join first, but state hasn't
  // re-rendered yet, so the drop passes its clip id straight through).
  // A refused apply is surfaced in the note above the panel; a tap apply
  // (new type, or first transition on the join) seeks the preview to the
  // join and plays through it so the effect is visible at the join moment.
  // A duration-only change (the slider) does not yank the playhead.
  const applyTransitionAtJoin = (transition: SegmentTransition, targetId: string | null = selectedJoinClipId) => {
    if (!editorComp || !targetId) {
      setTransitionNote("Select a cut in the timeline first — click a cut marker, or pick the first cut above.");
      return;
    }
    const blocked = transitionApplyBlocker(editorComp, targetId, transition);
    if (blocked) {
      setTransitionNote(blocked);
      return;
    }
    const current = editorComp.videoClips.find((c) => c.id === targetId)?.transitionIn ?? null;
    const r = setSegmentTransition(editorComp, targetId, transition);
    if (r.comp === editorComp) {
      setTransitionNote("That transition could not be applied here.");
      return;
    }
    commitComposition(r.comp, r.docEffect);
    setTransitionNote(null);
    if (!current || current.type !== transition.type) {
      const nextClip = r.comp.videoClips.find((c) => c.id === targetId);
      if (nextClip) {
        seek(Math.max(0, nextClip.startMs - 500));
        playerRef.current?.play();
      }
    }
  };
  const clearTransitionAtJoin = () => {
    if (!editorComp || !selectedJoinClipId) {
      setTransitionNote("Select a cut in the timeline first — click a cut marker, or pick the first cut above.");
      return;
    }
    const blocked = transitionApplyBlocker(editorComp, selectedJoinClipId, null);
    if (blocked) {
      setTransitionNote(blocked);
      return;
    }
    const r = setSegmentTransition(editorComp, selectedJoinClipId, null);
    if (r.comp === editorComp) {
      setTransitionNote("That cut is already plain.");
      return;
    }
    commitComposition(r.comp, r.docEffect);
    setTransitionNote(null);
  };
  // Dropping a transition card on a cut marker selects that join and applies there.
  const onDropTransition = (clipId: string, payload: { type: string; durationMs: number }) => {
    if (!isSegmentTransitionType(payload.type)) {
      setTransitionNote("That transition isn't recognised.");
      return;
    }
    selectJoin(clipId);
    applyTransitionAtJoin({ type: payload.type, durationMs: payload.durationMs }, clipId);
  };
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
      t === "style" ? <StylePanel style={style} patch={s.patchStyle} onGlobalPositionChange={(fn) => applyGlobalMove(fn)} lookName={s.lookId?.startsWith("user:") ? "My saved template" : getLook(s.lookId)?.name ?? null} onOpenLooks={() => setSection("templates")} currentCardPosition={currentCardPosition} hasPositionOverrides={pages.some((p) => p.position != null)} onApplyPositionToAll={applyPositionToAll} onResetAllPositions={resetAllPositions} />
      : t === "templates" ? <LooksPanel currentLookId={s.lookId} onChoose={s.chooseLook} currentStyle={style} currentSettings={settings} />
      : t === "media" ? <MediaPanel video={{ filename: data.video?.filename ?? null, size: data.video?.size ?? null, width, height, fps, durationMs }} composition={composition} onRelink={device.attach} assets={mediaBin.assets} importing={mediaBin.importing} onImport={mediaBin.importFiles} onDeleteAsset={mediaBin.remove} onPlaceImage={placeImage} />
      : t === "sfx" ? <SoundEffectsPanel projectId={projectId} onAdded={() => void mediaBin.refresh()} />
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
          onMoveClip={guardAudioClip((id, patch) => commitAudio(moveAudioClip(editorComp, id, patch)))}
          onSplitClip={guardAudioClip((id) => commitAudio(splitAudioClipAt(editorComp, id, getPlayerMs())))}
          onDuplicateClip={guardAudioClip((id) => commitAudio(duplicateAudioClip(editorComp, id)))}
          onRemoveClip={guardAudioClip((id) => commitAudio(removeAudioClip(editorComp, id)))}
          onUpdateClip={guardAudioClip((id, patch) => commitAudio(updateAudioClip(editorComp, id, patch)))}
          onUpdateProcessors={guardAudioClip((id, patch) => commitAudio(updateAudioClipProcessors(editorComp, id, patch)))}
          onUpdateMaster={(patch) => commitAudio(updateAudioMaster(editorComp, patch))}
          words={doc?.words ?? []}
          onApplyBleeps={(ranges) => commitAudio(addAudioBleeps(editorComp, ranges))}
          onRemoveBleep={(id) => commitAudio(removeAudioBleep(editorComp, id))}
          onUpdateBleep={(id, patch) => commitAudio(updateAudioBleep(editorComp, id, patch))}
          noiseSuppression={{
            active: Boolean(editorComp.audioNoiseSuppressionAssetId),
            busy: noiseBusy,
            error: noiseError,
            onToggle: (enable) => { void toggleNoiseSuppression(enable); },
          }}
          audioExtract={{
            busy: extractBusy,
            error: extractError,
            result: extractResult ? { name: extractResult.name, durationMs: extractResult.durationMs, inBin: extractResult.inBin } : null,
            onExtract: () => { void runExtractAudio(); },
            onAddToBin: () => { void addExtractToBin(); },
            onDownload: downloadExtract,
          }}
        />
      ) : null)
      : t === "translate" ? (doc ? <TranslatePanel projectId={projectId} doc={doc} settings={settings} patch={s.patchSettings} translations={translations} onTranslated={(lang, tdoc) => setTranslations((prev) => ({ ...prev, [lang]: tdoc }))} /> : null)
      : t === "aiedit" ? (
        <AiGeneratePanel
          projectId={projectId}
          getTimeMs={getPlayerMs}
          hasVideo={Boolean(video) && !videoGone}
          videoLocked={videoLocked}
          onImportMedia={mediaBin.importFiles}
          onPlaceImage={placeImage}
          onPlaceImageAt={placeImageAt}
          onInsertVideo={insertAiVideoAt}
          onUploadVideo={uploadAiEditVideo}
          transcript={aiEditTranscript}
          onTranscribe={() => void transcribeAiEditVideo()}
          durationMs={video?.durationMs ?? undefined}
        />
      )
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
      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition before:absolute before:-inset-1.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-30 ${opts.active ? "bg-st-lav text-st-ink" : "text-st-text/85 hover:bg-st-hover"}`}
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
    // Slice 5.5 (a): adding a word is a caption edit — a locked captions track blocks it
    if (editorComp?.trackState.captions.locked) return null;
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
      fps={fps}
      getTimeMs={getPlayerMs}
      playing={playing}
      selectedId={selectedId}
      peaks={wave.peaks}
      videoUrl={video?.url ?? null}
      videoId={video?.id ?? null}
      videoAspect={width / height}
      waveState={wave.state}
      onSeek={seek}
      onSelect={selectWordFromUserClick}
      selectedWordIds={selectedWordIds}
      onWordSelectionChange={handleWordSelectionChange}
      selectedCardIds={selectedCardIds}
      onCardSelectionChange={setSelectedCardIds}
      onShiftWords={(ids, deltaMs) => { if (!captionsLockedRef.current) s.edit((d) => shiftWordsByIds(d, ids, deltaMs)); }}
      onRetimeRun={(a, b, st, en, ripple) => { if (!captionsLockedRef.current) s.edit((d) => retimeRunGiveWay(d, a, b, st, en, ripple)); }}
      onRename={(id, text) => { if (!captionsLockedRef.current) s.edit((d) => setWordText(d, id, text)); }}
      onAddWord={addWordAt}
      onSplit={() => selected && !captionsLockedRef.current && s.edit((d) => splitCardAt(d, selected.id))}
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
      selectedJoinClipId={selectedJoinClipId}
      onSelectJoin={selectJoin}
      onDropTransition={onDropTransition}
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
      onJoin={() => selected && !captionsLockedRef.current && s.edit((d) => mergeWithPrevious(d, selected.id))}
      onJoinNext={() => selected && !captionsLockedRef.current && s.edit((d) => mergeWithNext(d, selected.id))}
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
                ["Enter / Space", "Select focused timeline word"],
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
      <main id="main-content" className="studio flex h-[100dvh] flex-col">
        {header}
        <div className="st-rise min-h-0 flex-1">{stage}</div>
        {overlays}
      </main>
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
    <aside aria-label="Tool panel" className="flex min-h-0 w-[min(340px,30vw)] min-w-[264px] shrink-0 flex-col border-r border-st-line bg-st-panel 2xl:w-[400px]">
      {section === "captions" ? <PanelTitle title="Captions" hint={`${pages.length} cards`} /> : null}
      <div key={section} className="st-rise min-h-0 flex-1">{renderPanel(section)}</div>
    </aside>
  );

  // ---------- desktop: rail | panel column | centre (preview over timeline). One layout for portrait
  // and landscape video — the player fits the centre area either way.
  if (desktop) {
    return (
      <main id="main-content" className="studio flex h-[100dvh] flex-col">
        {header}
        <div className="flex min-h-0 flex-1">
          {rail}
          {panelColumn}
          <div className="flex min-w-0 flex-1 flex-col">
            <section data-tour="preview" aria-label="Preview" className="min-h-0 flex-1 bg-st-bg">{stage}</section>
            <section aria-label="Timeline section" className="h-[min(300px,34%)] min-h-[215px] shrink-0 border-t border-st-line">{timeline}</section>
          </div>
          {rightCollapsed ? (
            <aside aria-label="Right panel" className="flex min-h-0 w-[44px] shrink-0 flex-col items-center gap-2 border-l border-st-line bg-st-panel py-2">
              <button
                type="button"
                aria-label="Expand right panel"
                onClick={() => setRightCollapsed(false)}
                className="relative rounded-lg px-2 py-1.5 text-st-muted before:absolute before:-inset-2 before:content-[''] hover:bg-st-hover hover:text-st-text"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Open Motion Studio panel"
                onClick={() => { setRightTab("motion"); setRightCollapsed(false); }}
                className="relative rounded-lg px-1 py-2 text-[11px] font-semibold text-st-muted before:absolute before:-inset-2 before:content-[''] [writing-mode:vertical-rl] hover:bg-st-hover hover:text-st-text"
              >
                Motion
              </button>
            </aside>
          ) : (
            <aside aria-label="Right panel" className="flex min-h-0 w-[340px] shrink-0 flex-row border-l border-st-line bg-st-panel 2xl:w-[376px]">
              <nav role="tablist" aria-label="Right panel tabs" className="flex w-[76px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-st-line bg-st-panel px-2 py-3">
                {RIGHT_TABS.filter((tab) => tab.id !== "inspector" || segmentInspector).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={rightTab === tab.id}
                    onClick={() => setRightTab(tab.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 ${rightTab === tab.id ? "bg-st-lav text-st-ink" : "text-st-muted hover:bg-st-raised hover:text-st-text"}`}
                  >
                    {tab.icon}
                    <span className="text-[11px] font-medium leading-none">{tab.label}</span>
                  </button>
                ))}
              </nav>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center justify-end border-b border-st-line px-2 py-1.5">
                  <button
                    type="button"
                    aria-label="Collapse right panel"
                    onClick={() => setRightCollapsed(true)}
                    className="relative rounded-lg px-2 py-2.5 text-st-muted before:absolute before:-inset-2 before:content-[''] hover:bg-st-hover hover:text-st-text"
                  >
                    ›
                  </button>
                </div>
                {transitionNote && rightTab === "transitions" ? (
                  <p role="status" className="shrink-0 border-b border-st-line bg-st-or/15 px-3 py-2 text-[12px] leading-snug text-st-text">{transitionNote}</p>
                ) : null}
                <div className="flex min-h-0 flex-1 flex-col">
                  {rightTab === "inspector" && segmentInspector ? segmentInspector
                    : rightTab === "titles" ? <TitlesPanel {...overlayPanelProps} />
                    : rightTab === "stickers" ? <StickersPanel {...overlayPanelProps} />
                    : rightTab === "sfx" ? <SoundEffectsPanel projectId={projectId} onAdded={() => void mediaBin.refresh()} />
                    : rightTab === "graphics" ? <NewGraphicsPanel {...overlayPanelProps} />
                    : rightTab === "transitions" ? (
                      <TransitionsPanel
                        currentTransition={joinClip?.transitionIn ?? null}
                        onApplyTransition={applyTransitionAtJoin}
                        onClearTransition={clearTransitionAtJoin}
                        onSplitAtPlayhead={splitVideoAtPlayhead}
                        splitDisabled={!editorComp || videoLocked}
                        selectedJoinLabel={selectedJoinLabel}
                        hasJoins={hasJoins}
                        onSelectFirstJoin={selectFirstJoin}
                      />
                    )
                    : <MotionStudioPanel {...overlayPanelProps} />}
                </div>
              </div>
            </aside>
          )}
        </div>
        {overlays}
      </main>
    );
  }

  // ---------- phone / tablet: preview on top, one panel at a time, and the rail collapsed to a
  // single-row horizontal icon bar at the bottom (scrolls sideways — never wraps into a second row)
  return (
    <main id="main-content" className="studio flex h-[100dvh] flex-col">
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
            className={`relative flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 before:absolute before:-inset-2 before:content-[''] ${!mobileTimeline && section === sec.id ? "bg-st-lav text-st-ink" : "text-st-muted"}`}
          >
            {sec.icon}
            <span className="text-[11px] font-medium leading-none">{sec.label}</span>
          </button>
        ))}
        <button
          onClick={() => setMobileTimeline(true)}
          aria-pressed={mobileTimeline}
          className={`relative flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 before:absolute before:-inset-2 before:content-[''] ${mobileTimeline ? "bg-st-lav text-st-ink" : "text-st-muted"}`}
        >
          {railIcon(<><path d="M3 9h18M3 15h18" /><path d="M8 5v14M15 5v14" /></>)}
          <span className="text-[11px] font-medium leading-none">Timeline</span>
        </button>
      </nav>
      {overlays}
    </main>
  );
}

const PanelTitle: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="flex shrink-0 items-baseline justify-between border-b border-st-line px-4 py-3">
    <h2 className="font-display text-lg font-bold">{title}</h2>
    {hint ? <span className="text-xs text-st-faint">{hint}</span> : null}
  </div>
);


const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main id="main-content" className="studio flex h-[100dvh] items-center justify-center text-st-muted">{children}</main>
);
