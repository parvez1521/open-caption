"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, FoldHorizontal, Link2, Lock, LockOpen, Magnet, Maximize2, Plus, Scissors, SlidersHorizontal, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react";
import type { AudioClip, AudioTrack, CompositionTrackKind, Page, TrackState, Word } from "@capseasy/shared";
import { fmtTime } from "./controls";
import { formatDelta, pxToMs, toggleIds } from "./dragSelect";
import { formatTimecode, parseTimecode, stepFrameMs } from "./timecode";
import { overlayClipsOf, trackOf, type Composition, type OverlayClip } from "./composition";
import { snapMove, snapValue } from "./snap";
import { canSplitAtPlayhead } from "./playheadSplit";
import type { EditorComposition, EditorVideoClip } from "./compositionDoc";
import { overlayTrackOf } from "./compositionOps";
import { resolveSegmentView, segmentBadges } from "./segmentView";
import { PEAKS_PER_SECOND } from "./useWaveform";
import { useFilmstrip } from "./useFilmstrip";

interface Props {
  pages: Page[];
  words: Word[];
  durationMs: number;
  timeMs: number;
  /** the project's frame rate (video fps, 30 when unknown): one frame-step moves exactly 1000/fps ms */
  fps?: number;
  /** exact playback time, read every animation frame so the playhead glides instead of stepping with `timeMs` */
  getTimeMs?: () => number;
  /** while playing, the view scrolls with the playhead so the words being said are always on screen */
  playing?: boolean;
  videoId?: string | null;
  videoUrl?: string | null;
  /** width / height of the video, for the filmstrip thumbnails */
  videoAspect?: number;
  selectedId: string | null;
  peaks: Float32Array | null;
  waveState: "idle" | "loading" | "ready" | "unavailable";
  onSeek: (ms: number) => void;
  onSelect: (wordId: string | null) => void;
  /** drag selection of caption words (owner correction #5), shared with the captions panel */
  selectedWordIds: Set<string>;
  onWordSelectionChange: (ids: Set<string>) => void;
  /** commit a retime of the whole word selection, once, on pointer up (shiftWordsByIds in StudioPage) */
  onShiftWords: (ids: string[], deltaMs: number) => void;
  /** commit new timing for a run of words (one word, or a whole line), once, on pointer up */
  onRetimeRun: (firstId: string, lastId: string, startMs: number, endMs: number, ripple: boolean) => void;
  onRename: (wordId: string, text: string) => void;
  /** add a word at the playhead; returns its id so the timeline can open it for typing */
  onAddWord: (atMs: number) => string | null;
  onSplit: () => void;
  onJoin: () => void;
  /** Package 2 item B: the mirror of onJoin — merge the selected word's line with the FOLLOWING one (optional: older mounts omit it and simply don't show the button) */
  onJoinNext?: () => void;
  /** Stage-A composition view: the video / captions / text rows render from these tracks */
  composition?: Composition | null;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  /** commit an overlay block's retime once, on pointer up (one patchSettings update in StudioPage) */
  onMoveOverlay: (id: string, deltaMs: number) => void;
  /** Stage-B editor composition: video segment blocks, markers and track state read from here */
  editorComp?: EditorComposition | null;
  selectedVideoClipId?: string | null;
  onSelectVideoClip?: (id: string | null) => void;
  selectedMarkerId?: string | null;
  onSelectMarker?: (id: string | null) => void;
  /** commit a video segment edge drag once, on pointer up (trimVideoClipEdge in StudioPage) */
  onTrimVideoEdge?: (clipId: string, edge: "start" | "end", targetMs: number) => void;
  /** commit an overlay edge drag once, on pointer up (trimOverlayClip in StudioPage) */
  onTrimOverlayClip?: (id: string, edge: "start" | "end", targetMs: number) => void;
  /** patch one track's state (video / captions rows) */
  onTrackPatch?: (kind: CompositionTrackKind, patch: Partial<TrackState>) => void;
  /** patch BOTH overlay track kinds (text + graphics) with the same change — the overlays row has one lock / one eye */
  onOverlayTrackPatch?: (patch: Partial<TrackState>) => void;
  /** a media-bin asset dropped on the timeline (custom MIME payload from MediaPanel) */
  onDropAsset?: (assetId: string, kind: string, atMs: number) => void;
  /** Run-2 segment assets resolved on this device (assetId → object URL): still segments show
   *  their image from here; an id with no URL renders as a labelled block instead */
  segmentAssetUrls?: Record<string, string>;
  /** assetId → media-bin name, so a segment playing a reversed conform can badge itself */
  segmentAssetNames?: Record<string, string>;
  /** Run 3 audio-studio rows: one 36px row per audio track, below the display waveform row.
   *  When omitted, the rows fall back to the editor composition's audio slice. */
  audioTracks?: AudioTrack[];
  audioClips?: AudioClip[];
  selectedAudioClipId?: string | null;
  onSelectAudioClip?: (id: string | null) => void;
  /** commit an audio clip's move once, on pointer up (moveAudioClip in StudioPage) */
  onMoveAudioClip?: (id: string, startMs: number) => void;
  /** commit an audio clip edge trim once, on pointer up (trimAudioClip in StudioPage) */
  onTrimAudioClip?: (id: string, edge: "start" | "end", targetMs: number) => void;
  /** split the caption card at the playhead (caption-engine splitCardAt via edit() in StudioPage) */
  onSplitAtPlayhead: () => void;
  onOpenSettings: () => void;
  /** extra actions for the selected word (key word, emoji, hide, undo/redo) */
  extraTools?: React.ReactNode;
  fill?: boolean;
}

type Mode = "word" | "line";
interface Block { key: string; firstId: string; lastId: string; wordIds: string[]; text: string; s: number; e: number; selected: boolean; inSelection: boolean; live: boolean }
type Drag = { key: string; firstId: string; lastId: string; kind: "move" | "start" | "end"; x0: number; s0: number; e0: number; min: number; max: number; s: number; e: number; group: string[] | null; dxMs: number; px: number; py: number };

/**
 * Track-label column tiers, by TIMELINE CONTAINER width (B-31 fix, 2026-11-11). The old
 * two-width scheme (88px, or 58px under 520px) broke in the 900–1280px window range the
 * owner actually uses: the panel column + inspector leave the centre ~400–650px, where an
 * 88px label column with full names ("Text / Elements") plus 24px lock/eye/mute buttons
 * cannot fit — names clipped under the buttons and the column ate the timeline. Three
 * tiers now: wide keeps name + buttons on one line; mid stacks the SHORT name above a
 * compact button row; narrow shows the glyph alone above the button row. No tier clips
 * a label and no control is dropped at any width.
 */
export type LabelTier = "wide" | "mid" | "narrow";
export const labelTierForWidth = (w: number): LabelTier => (w >= 880 ? "wide" : w >= 540 ? "mid" : "narrow");
export const LABEL_WIDTHS: Record<LabelTier, number> = { wide: 148, mid: 92, narrow: 60 };
/** track names per tier — mid shortens, narrow keeps only the glyph (aria-labels carry the full name) */
export const TRACK_NAMES: Record<LabelTier, { captions: string; video: string; text: string; audio: string }> = {
  wide: { captions: "𝐈 Captions", video: "▶ Video", text: "T Text / Elements", audio: "♫ Audio" },
  mid: { captions: "Captions", video: "Video", text: "Text", audio: "Audio" },
  narrow: { captions: "𝐈", video: "▶", text: "T", audio: "♫" },
};
const MIN_MS = 40;
/** fixed track heights per tier: blocks keep editor proportions however tall the panel is
 *  (no stretched cards); mid/narrow rows grow just enough to hold the stacked label cell */
const ROW = { ruler: 24, captions: 44, video: 52, text: 36, audio: 44, audioTrack: 36 };
const ROW_HEIGHTS: Record<LabelTier, typeof ROW> = {
  wide: ROW,
  mid: { ruler: 24, captions: 50, video: 58, text: 44, audio: 48, audioTrack: 42 },
  narrow: { ruler: 24, captions: 50, video: 64, text: 50, audio: 48, audioTrack: 46 },
};
const baseRowsFor = (r: typeof ROW) => `${r.ruler}px ${r.captions}px ${r.video}px ${r.text}px ${r.audio}px`;
/** video visible at the default zoom: enough room to read every word (phones ~2.5 s, desktop up to 8 s) */
const defaultWindowMs = (px: number) => (px < 420 ? Math.max(2000, px * 9) : Math.min(8000, Math.max(3000, px * 15)));

const pref = <T extends string>(k: string, fallback: T): T => {
  try { return (localStorage.getItem(k) as T) || fallback; } catch { return fallback; }
};
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** Editor timeline: one captions track (as words or as lines), video, audio. Drag to move, drag edges to retime. */
export const Timeline: React.FC<Props> = ({ pages, words, durationMs, timeMs, fps = 30, getTimeMs, playing = false, videoId, videoUrl, videoAspect = 16 / 9, selectedId, selectedWordIds, onWordSelectionChange, onShiftWords, peaks, waveState, onSeek, onSelect, onRetimeRun, onRename, onAddWord, onSplit, onJoin, onJoinNext, onOpenSettings, extraTools, composition, selectedOverlayId, onSelectOverlay, onMoveOverlay, onSplitAtPlayhead, editorComp, selectedVideoClipId, onSelectVideoClip, selectedMarkerId, onSelectMarker, onTrimVideoEdge, onTrimOverlayClip, onTrackPatch, onOverlayTrackPatch, onDropAsset, segmentAssetUrls, segmentAssetNames, audioTracks: audioTracksProp, audioClips: audioClipsProp, selectedAudioClipId, onSelectAudioClip, onMoveAudioClip, onTrimAudioClip }) => {
  const total = Math.max(1000, durationMs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(0);
  const [tier, setTier] = useState<LabelTier>("wide");
  const LABEL_W = LABEL_WIDTHS[tier];
  const R = ROW_HEIGHTS[tier];
  const NAMES = TRACK_NAMES[tier];
  const [drag, setDrag] = useState<Drag | null>(null);
  /** overlay-block drag: preview only; one commit lands on pointer up. kind "move" shifts the
   *  whole block (dxMs); "start"/"end" retime one edge (s/e hold the preview window). */
  const [oDrag, setODrag] = useState<{ id: string; x0: number; s0: number; e0: number; dxMs: number; kind: "move" | "start" | "end"; s: number; e: number } | null>(null);
  /** video-segment edge drag: preview the boundary position only; the trim commits on pointer up */
  const [vDrag, setVDrag] = useState<{ clipId: string; edge: "start" | "end"; x0: number; origMs: number; targetMs: number } | null>(null);
  /** audio-clip drag: preview only (same pattern as oDrag); move shifts dxMs, start/end hold the preview window; one commit on pointer up */
  const [aDrag, setADrag] = useState<{ id: string; x0: number; s0: number; e0: number; dxMs: number; kind: "move" | "start" | "end"; s: number; e: number } | null>(null);
  /** the ms position a drag is currently snapped to (draws the guide line), or null */
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const guideRef = useRef<number | null>(null);
  const [mode, setModeState] = useState<Mode>("word");
  const [snap, setSnap] = useState(true);
  const [ripple, setRipple] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** typed timecode while the playhead field has focus; null means "show the live playhead" */
  const [tcDraft, setTcDraft] = useState<string | null>(null);
  /** ref mirror of tcDraft: commitTc must be idempotent — Enter commits then blurs, and the blur fires commit again */
  const tcDraftRef = useRef<string | null>(null);
  const commitTc = () => {
    const d = tcDraftRef.current;
    if (d === null) return;
    tcDraftRef.current = null;
    setTcDraft(null);
    const parsed = parseTimecode(d, fps, total);
    if (parsed !== null) onSeek(parsed);
    // malformed input reverts to the playhead: the field shows formatTimecode(timeMs) again
  };
  const zoomedOnce = useRef(false);
  const frames = useFilmstrip(videoId, videoUrl, durationMs);

  useEffect(() => {
    setModeState(pref<Mode>("ce_tl_mode", "word"));
    setSnap(pref<string>("ce_tl_snap", "1") === "1");
    setRipple(pref<string>("ce_tl_ripple", "0") === "1");
  }, []);
  const setMode = (m: Mode) => { setModeState(m); save("ce_tl_mode", m); };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const t = labelTierForWidth(el.clientWidth);
      setTier(t);
      setViewW(el.clientWidth - LABEL_WIDTHS[t]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // open zoomed in to a readable window (words, not slivers) instead of squeezing the whole video in
  useEffect(() => {
    if (zoomedOnce.current || viewW < 100 || durationMs <= 0) return;
    zoomedOnce.current = true;
    setZoom(Math.min(40, Math.max(1, total / defaultWindowMs(viewW))));
  }, [viewW, durationMs, total]);

  // zoom 1 = whole video fits; up to 40x for word-level work
  const pxPerMs = (Math.max(200, viewW) / total) * zoom;
  const width = Math.ceil(total * pxPerMs);
  const x = (ms: number) => ms * pxPerMs;

  // the playhead is moved straight on the DOM (transform), every animation frame while playing or scrubbing, so it
  // glides continuously instead of jumping with the ~15 Hz time feed
  const headRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef<HTMLElement | null>(null);
  const placeHead = useCallback((ms: number) => {
    if (headRef.current) headRef.current.style.transform = `translateX(${(ms * pxPerMs).toFixed(2)}px)`;
  }, [pxPerMs]);
  const dragRef = useRef(drag);
  useEffect(() => { dragRef.current = drag; }, [drag]);

  // paused: follow the time feed; a seek outside the view brings it back in
  useLayoutEffect(() => {
    if (playing || scrubbing.current) return;
    placeHead(timeMs);
    const el = scrollRef.current;
    if (!el || drag) return;
    const px = x(timeMs);
    const view = el.clientWidth - LABEL_W;
    if (px < el.scrollLeft || px > el.scrollLeft + view - 40) el.scrollLeft = Math.max(0, px - view / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeMs, pxPerMs, playing, placeHead]);

  // playing: read the player's clock every frame; the view scrolls smoothly so the playhead stays a third of the way in
  const feed = useRef({ ms: timeMs, at: 0 });
  useEffect(() => { feed.current = { ms: timeMs, at: performance.now() }; }, [timeMs]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const f = feed.current;
      const ms = Math.min(total, getTimeMs ? getTimeMs() : f.ms + (performance.now() - f.at));
      placeHead(ms);
      const el = scrollRef.current;
      if (el && !dragRef.current && !scrubbing.current) el.scrollLeft = Math.max(0, ms * pxPerMs - (el.clientWidth - LABEL_W) / 3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, getTimeMs, placeHead, pxPerMs, total, LABEL_W]);

  // press and drag on the ruler or any track to scrub: the playhead follows the pointer, seeks are batched per frame
  const pendingSeek = useRef<number | null>(null);
  const seekRaf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(seekRaf.current), []);
  const scrubTo = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    const ms = Math.max(0, Math.min(total, (clientX - r.left) / pxPerMs));
    placeHead(ms);
    pendingSeek.current = ms;
    if (!seekRaf.current) seekRaf.current = requestAnimationFrame(() => {
      seekRaf.current = 0;
      if (pendingSeek.current !== null) onSeek(pendingSeek.current);
      pendingSeek.current = null;
    });
  };
  const scrub = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || renaming) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      scrubbing.current = e.currentTarget;
      scrubTo(e.currentTarget, e.clientX);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (scrubbing.current === e.currentTarget) scrubTo(e.currentTarget, e.clientX);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (scrubbing.current !== e.currentTarget) return;
      scrubbing.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onPointerCancel: () => { scrubbing.current = null; },
  };

  const ticks = useMemo(() => {
    const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const step = steps.find((s) => s * pxPerMs >= 70) ?? 120000;
    const out: number[] = [];
    for (let t = 0; t <= total; t += step) out.push(t);
    return out;
  }, [pxPerMs, total]);

  const visible = useMemo(() => words.filter((w) => !w.hidden), [words]);

  // overlay blocks + the main video clip, read from the Stage-A composition view
  const overlayBlocks: OverlayClip[] = useMemo(() => (composition ? overlayClipsOf(composition) : []), [composition]);
  const mainClipMs = composition ? (trackOf(composition, "video").clips[0]?.durationMs ?? total) : total;

  // Stage-B track state + segment partition + markers, read from the editor composition
  const DEFAULT_TRACK = { locked: false, visible: true, muted: false };
  const tracks = {
    video: editorComp?.trackState.video ?? DEFAULT_TRACK,
    captions: editorComp?.trackState.captions ?? DEFAULT_TRACK,
    text: editorComp?.trackState.text ?? DEFAULT_TRACK,
    graphics: editorComp?.trackState.graphics ?? DEFAULT_TRACK,
  };
  const overlayLockedFor = (c: OverlayClip) => tracks[overlayTrackOf(c.kind)].locked;
  const overlayVisibleFor = (c: OverlayClip) => tracks[overlayTrackOf(c.kind)].visible;
  const overlayAnyVisible = tracks.text.visible || tracks.graphics.visible;
  const overlayBothLocked = tracks.text.locked && tracks.graphics.locked;
  const videoClips: EditorVideoClip[] = editorComp?.videoClips ?? [];
  const markers = editorComp?.markers ?? [];

  // Run 3 audio rows: explicit props win; the editor composition is the fallback so
  // existing mounts (which already pass editorComp) gain the rows for free.
  const audioTracks: AudioTrack[] = audioTracksProp ?? editorComp?.audioTracks ?? [];
  const audioClips: AudioClip[] = audioClipsProp ?? editorComp?.audioClips ?? [];
  const audioTrackOfClip = (c: AudioClip) => audioTracks.find((t) => t.id === c.trackId);
  /** computed grid rows: the 5 base rows (at this tier's heights) + one row per audio track */
  const rowCount = 5 + audioTracks.length;
  const BASE_ROWS = baseRowsFor(R);
  const rows = audioTracks.length ? `${BASE_ROWS} ${audioTracks.map(() => `${R.audioTrack}px`).join(" ")}` : BASE_ROWS;

  // video segment blocks as displayed: while an edge drag runs, only the dragged boundary
  // moves — the prospective partition is derived from the target exactly like the ops will
  // lay it out (head trim re-bases later clips, a roll keeps everything after the shared
  // boundary's far edge in place, a tail trim moves nothing else). No drag = stored clips.
  const displayVideoClips: EditorVideoClip[] = useMemo(() => {
    if (!vDrag) return videoClips;
    const idx = videoClips.findIndex((c) => c.id === vDrag.clipId);
    if (idx < 0) return videoClips;
    const clip = videoClips[idx]!;
    const target = vDrag.targetMs;
    return videoClips.map((c, i) => {
      if (vDrag.edge === "start" && idx === 0) {
        // head trim preview: first clip shrinks from the left, later clips shift earlier
        if (i === 0) return { ...c, startMs: 0, durationMs: Math.max(MIN_MS, clip.startMs + clip.durationMs - target) };
        return { ...c, startMs: c.startMs - (target - clip.startMs) };
      }
      if (vDrag.edge === "start") {
        if (i === idx - 1) return { ...c, durationMs: Math.max(MIN_MS, target - c.startMs) };
        if (i === idx) return { ...c, startMs: target, durationMs: Math.max(MIN_MS, c.startMs + c.durationMs - target) };
        return c;
      }
      // end edge: roll with the next clip, or tail trim on the last
      if (i === idx) return { ...c, durationMs: Math.max(MIN_MS, target - c.startMs) };
      if (i === idx + 1) return { ...c, startMs: target, durationMs: Math.max(MIN_MS, c.startMs + c.durationMs - target) };
      return c;
    });
  }, [vDrag, videoClips]);

  // blocks on the captions track: one per word, or one per caption line (card) spanning its words —
  // line mode reads the composition's caption clips (the same derived blocks the view exposes)
  const blocks: Block[] = useMemo(() => {
    if (mode === "word") {
      return visible.map((w) => ({ key: w.id, firstId: w.id, lastId: w.id, wordIds: [w.id], text: w.text, s: w.startMs, e: w.endMs, selected: w.id === selectedId, inSelection: selectedWordIds.has(w.id), live: timeMs >= w.startMs && timeMs < w.endMs }));
    }
    if (composition) {
      return trackOf(composition, "captions").clips.flatMap((c) => {
        if (c.kind !== "caption" || c.wordIds.length === 0) return [];
        const firstId = c.wordIds[0]!;
        const lastId = c.wordIds[c.wordIds.length - 1]!;
        return [{ key: c.id, firstId, lastId, wordIds: c.wordIds, text: c.text, s: c.startMs, e: c.endMs, selected: c.wordIds.includes(selectedId ?? ""), inSelection: c.wordIds.some((id) => selectedWordIds.has(id)), live: timeMs >= c.startMs && timeMs < c.endMs }];
      });
    }
    return pages.filter((p) => p.words.length).map((p) => {
      const f = p.words[0]!;
      const l = p.words[p.words.length - 1]!;
      return { key: p.id, firstId: f.id, lastId: l.id, wordIds: p.words.map((w) => w.id), text: p.words.map((w) => w.text).join(" "), s: f.startMs, e: l.endMs, selected: p.words.some((w) => w.id === selectedId), inSelection: p.words.some((w) => selectedWordIds.has(w.id)), live: timeMs >= p.startMs && timeMs < p.endMs };
    });
  }, [mode, visible, pages, selectedId, selectedWordIds, timeMs, composition]);

  const snapTargets = (skip: string) => {
    const t: number[] = [0, total, timeMs];
    for (const b of blocks) if (b.key !== skip) t.push(b.s, b.e);
    return t;
  };
  // snapping via the pure helper (snap.ts); a successful snap records its target for the guide line
  const snapTo = (v: number, targets: number[]) => {
    const r = snapValue(v, targets, pxPerMs, { enabled: snap });
    if (r.snappedTo !== null) guideRef.current = r.snappedTo;
    return r.value;
  };
  const overlayTargets = (skipId: string) => {
    const t: number[] = [0, total, timeMs];
    for (const c of overlayBlocks) if (c.id !== skipId) t.push(c.startMs, c.endMs);
    for (const b of blocks) t.push(b.s, b.e);
    return t;
  };

  const beginDrag = (e: React.PointerEvent, b: Block, kind: Drag["kind"]) => {
    if (renaming) return;
    if (tracks.captions.locked) return;
    e.stopPropagation();
    // Shift+click on a block adds/removes its words from the drag selection — no drag starts.
    if (kind === "move" && e.shiftKey) {
      onWordSelectionChange(toggleIds(selectedWordIds, b.wordIds));
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const i = blocks.findIndex((v) => v.key === b.key);
    const prev = blocks[i - 1];
    const next = blocks[i + 1];
    onSelect(b.firstId);
    // Dragging a block that belongs to a larger word selection retimes the WHOLE selection
    // (owner correction #5); anything else keeps the single-run drag this timeline already had.
    const group =
      kind === "move" && b.wordIds.some((id) => selectedWordIds.has(id)) && ![...selectedWordIds].every((id) => b.wordIds.includes(id))
        ? [...selectedWordIds]
        : null;
    if (kind === "move" && !group) onWordSelectionChange(new Set(b.wordIds));
    setDrag({ key: b.key, firstId: b.firstId, lastId: b.lastId, kind, x0: e.clientX, s0: b.s, e0: b.e, min: prev ? prev.e : 0, max: ripple ? total : next ? next.s : total, s: b.s, e: b.e, group, dxMs: 0, px: e.clientX, py: e.clientY });
  };
  const beginOverlayDrag = (e: React.PointerEvent, c: OverlayClip) => {
    if (renaming) return;
    if (overlayLockedFor(c)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelectOverlay(c.id);
    setODrag({ id: c.id, x0: e.clientX, s0: c.startMs, e0: c.endMs, dxMs: 0, kind: "move", s: c.startMs, e: c.endMs });
  };
  const beginOverlayTrim = (e: React.PointerEvent, c: OverlayClip, edge: "start" | "end") => {
    if (renaming) return;
    if (overlayLockedFor(c)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelectOverlay(c.id);
    setODrag({ id: c.id, x0: e.clientX, s0: c.startMs, e0: c.endMs, dxMs: 0, kind: edge, s: c.startMs, e: c.endMs });
  };
  /** video edge handles: one per boundary — seg0's left edge, each shared boundary (dragged
   *  as the previous clip's end, the roll equivalent), and the last segment's right edge. */
  const beginVideoEdgeDrag = (e: React.PointerEvent, clipId: string, edge: "start" | "end") => {
    if (renaming) return;
    if (tracks.video.locked) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const clip = videoClips.find((c) => c.id === clipId);
    if (!clip) return;
    onSelectVideoClip?.(clipId);
    const origMs = edge === "start" ? clip.startMs : clip.startMs + clip.durationMs;
    setVDrag({ clipId, edge, x0: e.clientX, origMs, targetMs: origMs });
  };

  const beginAudioDrag = (e: React.PointerEvent, c: AudioClip) => {
    if (renaming) return;
    if (audioTrackOfClip(c)?.locked) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelectAudioClip?.(c.id);
    const span = c.sourceOutMs - c.sourceInMs;
    setADrag({ id: c.id, x0: e.clientX, s0: c.startMs, e0: c.startMs + span, dxMs: 0, kind: "move", s: c.startMs, e: c.startMs + span });
  };
  const beginAudioTrim = (e: React.PointerEvent, c: AudioClip, edge: "start" | "end") => {
    if (renaming) return;
    if (audioTrackOfClip(c)?.locked) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelectAudioClip?.(c.id);
    const span = c.sourceOutMs - c.sourceInMs;
    setADrag({ id: c.id, x0: e.clientX, s0: c.startMs, e0: c.startMs + span, dxMs: 0, kind: edge, s: c.startMs, e: c.startMs + span });
  };

  const onMove = (e: React.PointerEvent) => {
    if (aDrag) {
      const len = aDrag.e0 - aDrag.s0;
      if (aDrag.kind === "move") {
        const start = Math.max(0, aDrag.s0 + pxToMs(e.clientX - aDrag.x0, pxPerMs));
        setADrag({ ...aDrag, dxMs: Math.round(start - aDrag.s0), s: Math.round(start), e: Math.round(start + len) });
      } else if (aDrag.kind === "start") {
        const raw = aDrag.s0 + pxToMs(e.clientX - aDrag.x0, pxPerMs);
        setADrag({ ...aDrag, s: Math.round(Math.max(0, Math.min(raw, aDrag.e0 - 100))) });
      } else {
        const raw = aDrag.e0 + pxToMs(e.clientX - aDrag.x0, pxPerMs);
        setADrag({ ...aDrag, e: Math.round(Math.max(raw, aDrag.s0 + 100)) });
      }
      return;
    }
    if (vDrag) {
      // video edge: preview the boundary only — snap to 0 / end / playhead / caption edges
      const raw = vDrag.origMs + pxToMs(e.clientX - vDrag.x0, pxPerMs);
      const targets: number[] = [0, total, timeMs];
      for (const b of blocks) targets.push(b.s, b.e);
      for (const c of videoClips) if (c.id !== vDrag.clipId) targets.push(c.startMs, c.startMs + c.durationMs);
      const snapped = snapValue(raw, targets, pxPerMs, { enabled: snap });
      setSnapGuide(snapped.snappedTo);
      setVDrag({ ...vDrag, targetMs: Math.round(Math.max(0, Math.min(total, snapped.value))) });
      return;
    }
    if (oDrag) {
      if (oDrag.kind !== "move") {
        // overlay edge trim: snap the dragged edge, clamp to the 100 ms minimum window
        const raw = (oDrag.kind === "start" ? oDrag.s0 : oDrag.e0) + pxToMs(e.clientX - oDrag.x0, pxPerMs);
        const snapped = snapValue(raw, overlayTargets(oDrag.id), pxPerMs, { enabled: snap });
        setSnapGuide(snapped.snappedTo);
        if (oDrag.kind === "start") setODrag({ ...oDrag, s: Math.round(Math.max(0, Math.min(snapped.value, oDrag.e0 - 100))) });
        else setODrag({ ...oDrag, e: Math.round(Math.max(snapped.value, oDrag.s0 + 100)) });
        return;
      }
      // overlay retime: snap the moved block (playhead + neighbouring edges), clamp at 0, keep duration
      const len = oDrag.e0 - oDrag.s0;
      const raw = oDrag.s0 + pxToMs(e.clientX - oDrag.x0, pxPerMs);
      const snapped = snapMove(raw, len, overlayTargets(oDrag.id), pxPerMs, { enabled: snap });
      const start = Math.max(0, snapped.startMs);
      setSnapGuide(start === snapped.startMs ? snapped.snappedTo : null);
      setODrag({ ...oDrag, dxMs: Math.round(start - oDrag.s0) });
      return;
    }
    if (!drag) return;
    guideRef.current = null;
    if (drag.group) {
      // group retime: preview the delta only — the document is committed once, on pointer up
      setDrag({ ...drag, dxMs: pxToMs(e.clientX - drag.x0, pxPerMs), px: e.clientX, py: e.clientY });
      return;
    }
    const d = (e.clientX - drag.x0) / pxPerMs;
    const targets = snapTargets(drag.key);
    const minLen = MIN_MS;
    let s = drag.s0;
    let en = drag.e0;
    if (drag.kind === "start") s = Math.min(drag.e0 - minLen, Math.max(drag.min, snapTo(drag.s0 + d, targets)));
    else if (drag.kind === "end") en = Math.max(drag.s0 + minLen, Math.min(drag.max, snapTo(drag.e0 + d, targets)));
    else {
      const len = drag.e0 - drag.s0;
      let ns = drag.s0 + d;
      const ss = snapTo(ns, targets);
      const se = snapTo(ns + len, targets);
      ns = ss !== ns ? ss : se !== ns + len ? se - len : ns;
      s = Math.min(drag.max - len, Math.max(drag.min, ns));
      en = s + len;
    }
    setDrag({ ...drag, s: Math.round(s), e: Math.round(en) });
    setSnapGuide(guideRef.current);
  };
  const endDrag = () => {
    if (aDrag) {
      if (aDrag.kind === "start") { if (aDrag.s !== aDrag.s0) onTrimAudioClip?.(aDrag.id, "start", aDrag.s); }
      else if (aDrag.kind === "end") { if (aDrag.e !== aDrag.e0) onTrimAudioClip?.(aDrag.id, "end", aDrag.e); }
      else if (aDrag.dxMs !== 0) onMoveAudioClip?.(aDrag.id, aDrag.s0 + aDrag.dxMs);
      setADrag(null);
      setSnapGuide(null);
      return;
    }
    if (vDrag) {
      if (vDrag.targetMs !== vDrag.origMs) onTrimVideoEdge?.(vDrag.clipId, vDrag.edge, vDrag.targetMs);
      setVDrag(null);
      setSnapGuide(null);
      return;
    }
    if (oDrag) {
      if (oDrag.kind === "start") { if (oDrag.s !== oDrag.s0) onTrimOverlayClip?.(oDrag.id, "start", oDrag.s); }
      else if (oDrag.kind === "end") { if (oDrag.e !== oDrag.e0) onTrimOverlayClip?.(oDrag.id, "end", oDrag.e); }
      else if (oDrag.dxMs !== 0) onMoveOverlay(oDrag.id, oDrag.dxMs);
      setODrag(null);
      setSnapGuide(null);
      return;
    }
    if (drag?.group) {
      if (drag.dxMs !== 0) onShiftWords(drag.group, drag.dxMs);
    } else if (drag && (drag.s !== drag.s0 || drag.e !== drag.e0)) onRetimeRun(drag.firstId, drag.lastId, drag.s, drag.e, ripple);
    setDrag(null);
    setSnapGuide(null);
  };

  const addWord = () => {
    const id = onAddWord(timeMs);
    if (id) { setMode("word"); setRenaming(id); }
  };

  const icon = "h-4 w-4";
  /**
   * Toolbar buttons are 32 px on screen; the invisible `before:` expander takes
   * the tap target to 44 px (Phase 2B touch targets) without inflating the visible control.
   */
  const btn = (label: string, children: React.ReactNode, onClick: () => void, o: { disabled?: boolean; active?: boolean } = {}) => (
    <button
      onClick={onClick}
      disabled={o.disabled}
      title={label}
      aria-label={label}
      aria-pressed={o.active}
      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition before:absolute before:-inset-1.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-30 ${o.active ? "bg-st-em/30 text-st-ink" : "text-st-text/85 hover:bg-st-hover"}`}
    >
      {children}
    </button>
  );
  const trackBtn = (label: string, children: React.ReactNode, onClick: () => void, active = false) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-md transition before:absolute before:-inset-2 before:content-[''] ${active ? "bg-st-lav text-st-ink" : "text-st-muted hover:bg-st-hover hover:text-st-text"}`}
    >
      {children}
    </button>
  );
  const ticon = tier === "wide" ? "h-3.5 w-3.5" : "h-3 w-3";
  /** label-cell layout per tier: wide = name + buttons on one line; mid/narrow = name line
   *  above a compact button row (the buttons stay — no control is dropped at any width) */
  const labelCell = tier === "wide" ? "flex items-center gap-1 border-b border-st-line px-2" : "flex flex-col justify-center gap-1 border-b border-st-line px-2 py-1";
  const labelName = tier === "wide" ? "min-w-0 flex-1 truncate" : "w-full truncate leading-tight";
  const labelBtns = tier === "wide" ? "contents" : "flex flex-wrap gap-0.5";
  const sep = <span className="mx-1 h-5 w-px shrink-0 bg-st-line" aria-hidden />;
  const noSel = !selectedId;
  const trackRow = "relative h-full border-b border-st-line";
  const tileW = Math.max(24, (R.video - 8) * videoAspect);
  const tiles = frames.length ? Math.ceil(x(total) / tileW) : 0;

  const ASSET_MIME = "application/x-opencaption-asset";
  return (
    <div
      role="region"
      aria-label="Timeline"
      className="flex h-full min-h-0 flex-col bg-st-bg select-none"
      onDragOver={(e) => { if (e.dataTransfer.types.includes(ASSET_MIME)) e.preventDefault(); }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(ASSET_MIME);
        if (!raw || !onDropAsset) return;
        e.preventDefault();
        try {
          const payload = JSON.parse(raw) as { id?: string; kind?: string };
          if (!payload.id || !payload.kind) return;
          const el = scrollRef.current;
          if (!el) return;
          const px = e.clientX - el.getBoundingClientRect().left + el.scrollLeft - LABEL_W;
          onDropAsset(payload.id, payload.kind, Math.round(Math.max(0, Math.min(total, px / pxPerMs))));
        } catch { /* not an asset payload */ }
      }}
    >
      <div className="flex shrink-0 flex-nowrap items-center gap-x-1 gap-y-1 overflow-x-auto border-b border-st-line bg-st-panel px-2 py-1.5 text-xs text-st-muted [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        <div className="flex shrink-0 rounded-lg border border-st-line bg-st-raised p-0.5" role="radiogroup" aria-label="Show captions as">
          {(["word", "line"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`relative rounded-md px-3 py-1.5 text-[11px] sm:py-1 font-semibold tracking-wide transition before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[''] ${mode === m ? "bg-st-ink text-st-panel" : "text-st-muted hover:text-st-text"}`}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        {sep}
        {btn("Add a word at the playhead", <Plus className={icon} />, addWord, { disabled: tracks.captions.locked })}
        {btn("Caption timing settings", <SlidersHorizontal className={icon} />, onOpenSettings)}
        {sep}
        {btn("Split: start a new line at the selected word", <Scissors className={icon} />, onSplit, { disabled: noSel || tracks.captions.locked })}
        {btn("Split caption at playhead (S)", <Scissors className={icon} />, onSplitAtPlayhead, { disabled: tracks.captions.locked || !canSplitAtPlayhead(pages, timeMs) })}
        {btn("Join: merge the selected word's line with the previous one", <FoldHorizontal className={icon} />, onJoin, { disabled: noSel || tracks.captions.locked })}
        {onJoinNext ? btn("Join next: merge the selected word's line with the following one", <FoldHorizontal className={`${icon} -scale-x-100`} />, onJoinNext, { disabled: noSel || tracks.captions.locked }) : null}
        {extraTools}
        {sep}
        {btn(snap ? "Snapping on" : "Snapping off", <Magnet className={icon} />, () => { setSnap(!snap); save("ce_tl_snap", snap ? "0" : "1"); }, { active: snap })}
        {btn(ripple ? "Linked: moving a caption moves everything after it" : "Linked moves off", <Link2 className={icon} />, () => { setRipple(!ripple); save("ce_tl_ripple", ripple ? "0" : "1"); }, { active: ripple })}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {btn("Previous frame", <span aria-hidden className="text-base leading-none">‹</span>, () => onSeek(stepFrameMs(timeMs, fps, -1, total)), { disabled: timeMs <= 0 })}
          <input
            value={tcDraft ?? formatTimecode(timeMs, fps)}
            onChange={(e) => { tcDraftRef.current = e.target.value; setTcDraft(e.target.value); }}
            onBlur={commitTc}
            onKeyDown={(e) => {
              if (e.key === "Enter") { commitTc(); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { tcDraftRef.current = null; setTcDraft(null); (e.target as HTMLInputElement).blur(); }
            }}
            aria-label="Playhead timecode (hours:minutes:seconds:frames)"
            title="Type a timecode, e.g. 00:01:12:08, then Enter"
            spellCheck={false}
            className="w-[104px] shrink-0 rounded-md border border-st-line bg-st-panel px-2 py-1 text-center font-mono text-xs tabular-nums text-st-text outline-none focus:border-st-lav"
          />
          {btn("Next frame", <span aria-hidden className="text-base leading-none">›</span>, () => onSeek(stepFrameMs(timeMs, fps, 1, total)), { disabled: timeMs >= total })}
          <span className="whitespace-nowrap rounded-md border border-st-line bg-st-panel px-2 py-1 font-mono tabular-nums text-st-text">{fmtTime(timeMs)} <span className="text-st-faint">/ {fmtTime(total)}</span></span>
        </span>
        {btn("Zoom out", <ZoomOut className={icon} />, () => setZoom((z) => Math.max(1, z / 1.6)), { disabled: zoom <= 1 })}
        <input type="range" min={0} max={100} value={Math.round((Math.log(zoom) / Math.log(40)) * 100)} onChange={(e) => setZoom(Math.pow(40, Number(e.target.value) / 100))} className="w-24 shrink-0 accent-[#34D399] sm:w-32" aria-label="Timeline zoom" />
        {btn("Zoom in", <ZoomIn className={icon} />, () => setZoom((z) => Math.min(40, z * 1.6)), { disabled: zoom >= 40 })}
        {btn("Fit the whole video", <Maximize2 className={icon} />, () => setZoom(1), { disabled: zoom === 1 })}
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="relative grid w-max" style={{ gridTemplateColumns: `${LABEL_W}px ${width}px`, gridTemplateRows: rows }}>
          <div className="sticky left-0 z-20 grid whitespace-nowrap border-r border-st-line bg-st-panel text-[11px] text-st-muted" style={{ gridTemplateRows: rows, gridRow: `1 / span ${rowCount}` }}>
            <div />
            <div className={`${labelCell} font-semibold text-st-text`} aria-label={tier === "narrow" ? "Captions track" : undefined}>
              <span className={labelName}>{NAMES.captions}</span>
              <span className={labelBtns}>
                {trackBtn(tracks.captions.locked ? "Unlock captions track" : "Lock captions track", tracks.captions.locked ? <Lock className={ticon} /> : <LockOpen className={ticon} />, () => onTrackPatch?.("captions", { locked: !tracks.captions.locked }), tracks.captions.locked)}
                {trackBtn(tracks.captions.visible ? "Hide captions track" : "Show captions track", tracks.captions.visible ? <Eye className={ticon} /> : <EyeOff className={ticon} />, () => onTrackPatch?.("captions", { visible: !tracks.captions.visible }), !tracks.captions.visible)}
              </span>
            </div>
            <div className={`${labelCell} text-st-muted`} aria-label={tier === "narrow" ? "Video track" : undefined}>
              <span className={labelName}>{NAMES.video}</span>
              <span className={labelBtns}>
                {trackBtn(tracks.video.locked ? "Unlock video track" : "Lock video track", tracks.video.locked ? <Lock className={ticon} /> : <LockOpen className={ticon} />, () => onTrackPatch?.("video", { locked: !tracks.video.locked }), tracks.video.locked)}
                {trackBtn(tracks.video.visible ? "Hide video track" : "Show video track", tracks.video.visible ? <Eye className={ticon} /> : <EyeOff className={ticon} />, () => onTrackPatch?.("video", { visible: !tracks.video.visible }), !tracks.video.visible)}
                {trackBtn(tracks.video.muted ? "Unmute video" : "Mute video", tracks.video.muted ? <VolumeX className={ticon} /> : <Volume2 className={ticon} />, () => onTrackPatch?.("video", { muted: !tracks.video.muted }), tracks.video.muted)}
              </span>
            </div>
            <div className={`${labelCell} text-st-muted`} aria-label={tier === "narrow" ? "Text and elements tracks" : undefined}>
              <span className={labelName}>{NAMES.text}</span>
              <span className={labelBtns}>
                {trackBtn(overlayBothLocked ? "Unlock overlay tracks" : "Lock overlay tracks", overlayBothLocked ? <Lock className={ticon} /> : <LockOpen className={ticon} />, () => onOverlayTrackPatch?.({ locked: !overlayBothLocked }), overlayBothLocked)}
                {trackBtn(overlayAnyVisible ? "Hide overlay tracks" : "Show overlay tracks", overlayAnyVisible ? <Eye className={ticon} /> : <EyeOff className={ticon} />, () => onOverlayTrackPatch?.({ visible: !overlayAnyVisible }), !overlayAnyVisible)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2 text-st-muted" aria-label={tier === "narrow" ? "Audio (the video's own sound)" : undefined}>{NAMES.audio}</div>
            {audioTracks.map((t) => (
              <div key={t.id} className="flex items-center gap-1 border-b border-st-line px-2 text-st-muted">
                <span className="min-w-0 flex-1 truncate" title={t.name}>{t.name}</span>
                {t.locked ? <Lock className={ticon} aria-label="Locked" /> : null}
                {t.muted ? <VolumeX className={ticon} aria-label="Muted" /> : null}
              </div>
            ))}
          </div>

          {/* ruler */}
          <div className="relative cursor-ew-resize touch-none border-b border-st-line bg-st-panel" {...scrub}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full border-l border-st-line pl-1 text-[10px] tabular-nums text-st-faint" style={{ left: x(t) }}>{fmtTime(t)}</div>
            ))}
            {markers.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.label || "Marker"}
                aria-label={m.label || "Marker"}
                aria-pressed={m.id === selectedMarkerId}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onSelectMarker?.(m.id); }}
                className="absolute top-1/2 z-10 grid h-4 w-4 -translate-y-1/2 place-items-center"
                style={{ left: x(m.atMs) - 8 }}
              >
                <span className={`block h-2.5 w-2.5 rotate-45 rounded-[2px] ${m.id === selectedMarkerId ? "bg-st-em ring-2 ring-st-em/40" : "bg-st-muted"}`} />
              </button>
            ))}
          </div>

          {/* captions: words or lines */}
          <div className={`${trackRow} ${tracks.captions.visible ? "" : "opacity-40"}`} {...scrub} onClick={() => onSelect(null)}>
            {blocks.map((b) => {
              const live = drag?.key === b.key && !drag.group ? { s: drag.s, e: drag.e } : { s: b.s, e: b.e };
              const groupOffsetPx = drag?.group && b.wordIds.some((id) => selectedWordIds.has(id)) ? drag.dxMs * pxPerMs : 0;
              const wpx = Math.max(3, x(live.e) - x(live.s) - 1);
              return (
                <div
                  key={b.key}
                  onPointerDown={(e) => beginDrag(e, b, "move")}
                  onClick={(e) => { e.stopPropagation(); onSelect(b.firstId); onSeek(live.s + 1); }}
                  onDoubleClick={(e) => { e.stopPropagation(); if (mode === "word" && !tracks.captions.locked) setRenaming(b.firstId); }}
                  title={`${b.text}  ${fmtTime(live.s)} – ${fmtTime(live.e)}${mode === "word" ? "  (double-click to edit)" : ""}`}
                  className={`absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-md border text-[11px] leading-tight ${b.inSelection ? "ring-2 ring-st-em " : ""}${b.selected ? "border-st-ink bg-st-lav text-[#FFFFEB] ring-2 ring-st-ink/20" : b.live ? "border-st-ink/30 bg-st-or text-[#141412]" : mode === "line" ? "border-st-ink/15 bg-st-hover text-[#FFFFEB] hover:bg-st-lav/60" : "border-st-ink/10 bg-st-lav/60 text-[#FFFFEB] hover:bg-st-lav"}`}
                  style={{ left: x(live.s) + groupOffsetPx, width: wpx }}
                >
                  {renaming === b.firstId ? (
                    <input
                      autoFocus
                      defaultValue={b.text}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { onRename(b.firstId, e.target.value); setRenaming(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }}
                      className="absolute inset-0 w-full min-w-[80px] bg-st-panel px-1.5 text-[12px] text-st-ink outline-none ring-2 ring-inset ring-st-ink"
                      aria-label="Word text"
                    />
                  ) : wpx > 18 ? (
                    <span className="flex h-full flex-col justify-center px-1.5">
                      <span className="truncate font-semibold">{b.text}</span>
                      {wpx > 60 ? <span className="truncate text-[9px] opacity-60">{mode === "line" ? `${fmtTime(live.s)}` : "𝐈 Text"}</span> : null}
                    </span>
                  ) : null}
                  {wpx > 10 && renaming !== b.firstId ? (
                    <>
                      <span onPointerDown={(e) => beginDrag(e, b, "start")} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-st-ink/10 hover:bg-st-ink/40" aria-label={`Move start of ${b.text}`} />
                      <span onPointerDown={(e) => beginDrag(e, b, "end")} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-st-ink/10 hover:bg-st-ink/40" aria-label={`Move end of ${b.text}`} />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* video: filmstrip under Stage-B segment blocks (one block per video clip in the
              partition; blocks select, 6px boundary handles trim — segment bodies never move) */}
          <div className={`${trackRow} cursor-ew-resize ${tracks.video.visible ? "" : "opacity-40"}`} {...scrub}>
            <div className="absolute inset-y-1 left-0 flex overflow-hidden rounded-md bg-[#0B0B0A] ring-1 ring-st-ink/20" style={{ width: x(mainClipMs) }}>
              {Array.from({ length: tiles }, (_, i) => {
                const at = ((i + 0.5) * tileW) / pxPerMs;
                const f = frames.reduce((a, b) => (Math.abs(b.ms - at) < Math.abs(a.ms - at) ? b : a), frames[0]!);
                // eslint-disable-next-line @next/next/no-img-element
                return <img key={i} src={f.src} alt="" draggable={false} className="h-full shrink-0 border-r border-obsidian/60 object-cover" style={{ width: tileW }} />;
              })}
              <span className="absolute left-1.5 top-1 rounded bg-black/70 px-1.5 text-[10px] leading-4 text-[#FFFFEB]">{frames.length ? "Video" : "Video (loading frames)"}</span>
            </div>
            {displayVideoClips.map((c, i) => {
              // Run-2 segment dressing: stills show their image (or a labelled Freeze block
              // when the asset isn't on this device), reversed / sped-up segments badge
              // themselves, and a transitionIn chips the block's left boundary. The pure
              // badge list lives in segmentView.ts (segmentBadges) so it is unit-tested.
              const view = resolveSegmentView(c, i);
              const badges = segmentBadges(view, view.assetId ? segmentAssetNames?.[view.assetId] ?? null : null);
              const stillUrl = view.still && view.assetId ? segmentAssetUrls?.[view.assetId] : undefined;
              const transitionBadge = badges.find((b) => b.kind === "transition");
              const otherBadges = badges.filter((b) => b.kind !== "transition");
              return (
              <div
                key={c.id}
                role="button"
                aria-label={view.still ? `Freeze frame segment ${i + 1}` : `Video segment ${i + 1}`}
                aria-pressed={c.id === selectedVideoClipId}
                title={`Segment ${i + 1}  ${fmtTime(c.startMs)} – ${fmtTime(c.startMs + c.durationMs)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onSelectVideoClip?.(c.id); }}
                className={`absolute top-1 bottom-1 z-10 overflow-hidden rounded-md border text-[10px] leading-tight ${c.id === selectedVideoClipId ? "border-st-ink bg-white/15 ring-2 ring-st-ink/30" : "border-white/40 bg-black/10"}`}
                style={{ left: x(c.startMs), width: Math.max(3, x(c.startMs + c.durationMs) - x(c.startMs) - 1) }}
              >
                {view.still ? (
                  stillUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={stillUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center bg-[#1C1C1A] text-[10px] font-semibold uppercase tracking-wide text-[#FFFFEB]/80">Freeze frame</span>
                  )
                ) : null}
                {transitionBadge ? (
                  <span className="absolute left-0 top-1 z-10 rounded-r bg-st-em px-1 text-[9px] font-semibold leading-4 text-[#141412]" title={`Transition in: ${transitionBadge.label}`}>⇋ {transitionBadge.label}</span>
                ) : null}
                {otherBadges.length ? (
                  <span className="absolute right-1 top-1 z-10 flex gap-1">
                    {otherBadges.map((b) => (
                      <span key={b.kind} className="rounded bg-black/70 px-1 text-[9px] font-semibold leading-4 text-[#FFFFEB]">{b.label}</span>
                    ))}
                  </span>
                ) : null}
                <span className="absolute bottom-1 left-1.5 z-10 rounded bg-black/70 px-1 text-[10px] leading-4 text-[#FFFFEB]">{i + 1}</span>
              </div>
              );
            })}
            {!tracks.video.locked && onTrimVideoEdge
              ? displayVideoClips.flatMap((c, i) => {
                  const handles: React.ReactNode[] = [];
                  if (i === 0) {
                    handles.push(
                      <span
                        key={`${c.id}-start`}
                        role="slider"
                        aria-label="Trim start of first segment"
                        onPointerDown={(e) => beginVideoEdgeDrag(e, c.id, "start")}
                        className="absolute inset-y-0 z-20 w-1.5 cursor-ew-resize bg-st-ink/20 hover:bg-st-ink/50"
                        style={{ left: x(c.startMs) - 3 }}
                      />,
                    );
                  }
                  handles.push(
                    <span
                      key={`${c.id}-end`}
                      role="slider"
                      aria-label={`Trim end of segment ${i + 1}`}
                      onPointerDown={(e) => beginVideoEdgeDrag(e, c.id, "end")}
                      className="absolute inset-y-0 z-20 w-1.5 cursor-ew-resize bg-st-ink/20 hover:bg-st-ink/50"
                      style={{ left: x(c.startMs + c.durationMs) - 3 }}
                    />,
                  );
                  return handles;
                })
              : null}
          </div>

          {/* text / graphics: overlay items as blocks — click selects (the panel editor follows),
              drag moves the block; the retime commits once on release via onMoveOverlay */}
          <div className={trackRow} {...scrub} onClick={() => onSelectOverlay(null)}>
            {overlayBlocks.map((c) => {
              const dragging = oDrag?.id === c.id ? oDrag : null;
              const liveS = dragging ? (dragging.kind === "move" ? c.startMs + dragging.dxMs : dragging.kind === "start" ? dragging.s : c.startMs) : c.startMs;
              const liveE = dragging ? (dragging.kind === "end" ? dragging.e : c.endMs) : c.endMs;
              const wpx = Math.max(3, x(liveE) - x(liveS) - 1);
              const label = c.kind === "text" ? c.overlay.text?.trim() || "Text" : c.kind === "image" ? c.overlay.assetName ?? "Image" : c.kind === "social" ? c.overlay.variant ?? "Social" : c.overlay.shape ?? "Element";
              const selected = c.id === selectedOverlayId;
              const locked = overlayLockedFor(c);
              return (
                <div
                  key={c.id}
                  onPointerDown={(e) => beginOverlayDrag(e, c)}
                  onClick={(e) => { e.stopPropagation(); onSelectOverlay(c.id); onSeek(c.startMs + 1); }}
                  title={`${label}  ${fmtTime(c.startMs)} – ${fmtTime(c.endMs)} (drag to move)`}
                  className={`absolute top-1 bottom-1 cursor-grab touch-none overflow-hidden rounded-md border px-1.5 text-[11px] leading-tight ${overlayVisibleFor(c) ? "" : "opacity-40 "}${selected ? "border-st-ink bg-st-lav text-[#FFFFEB] ring-2 ring-st-ink/20" : "border-st-ink/15 bg-st-hover text-[#FFFFEB] hover:bg-st-lav/60"}`}
                  style={{ left: x(liveS), width: wpx }}
                >
                  {wpx > 24 ? <span className="flex h-full items-center truncate font-medium">{label}</span> : null}
                  {selected && !locked && onTrimOverlayClip && wpx > 10 ? (
                    <>
                      <span onPointerDown={(e) => beginOverlayTrim(e, c, "start")} className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-st-ink/20 hover:bg-st-ink/50" aria-label={`Move start of ${label}`} />
                      <span onPointerDown={(e) => beginOverlayTrim(e, c, "end")} className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-st-ink/20 hover:bg-st-ink/50" aria-label={`Move end of ${label}`} />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* audio waveform */}
          <div className="relative cursor-ew-resize bg-st-em/10" {...scrub}>
            <Waveform peaks={peaks} width={width} />
            {waveState !== "ready" ? <span className="absolute left-2 top-1 text-[10px] text-st-faint">{waveState === "loading" ? "Loading audio…" : waveState === "unavailable" ? "Couldn't read a waveform from this file's audio" : ""}</span> : null}
          </div>

          {/* Run 3: one row per audio track — placed clips as blocks (drag moves, the
              first/last 6px trim, click selects; a locked track's blocks do not drag) */}
          {audioTracks.map((track) => (
            <div key={track.id} className={trackRow} {...scrub} onClick={() => onSelectAudioClip?.(null)}>
              {audioClips.filter((c) => c.trackId === track.id).map((c) => {
                const span = c.sourceOutMs - c.sourceInMs;
                const dragging = aDrag?.id === c.id ? aDrag : null;
                const liveS = dragging ? (dragging.kind === "move" ? c.startMs + dragging.dxMs : dragging.kind === "start" ? dragging.s : c.startMs) : c.startMs;
                const liveE = dragging ? (dragging.kind === "move" ? c.startMs + dragging.dxMs + span : dragging.kind === "end" ? dragging.e : c.startMs + span) : c.startMs + span;
                const wpx = Math.max(3, x(liveE) - x(liveS) - 1);
                const selected = c.id === selectedAudioClipId;
                const fadeInW = Math.min(x(c.fadeInMs), wpx / 2);
                const fadeOutW = Math.min(x(c.fadeOutMs), wpx / 2);
                return (
                  <div
                    key={c.id}
                    role="button"
                    aria-label={`Audio clip ${c.assetName || c.id}`}
                    aria-pressed={selected}
                    onPointerDown={(e) => beginAudioDrag(e, c)}
                    onClick={(e) => { e.stopPropagation(); onSelectAudioClip?.(c.id); }}
                    title={`${c.assetName}  ${fmtTime(liveS)} – ${fmtTime(liveE)} (drag to move)`}
                    className={`absolute top-1 bottom-1 overflow-hidden rounded-md border px-1.5 text-[11px] leading-tight ${track.muted ? "opacity-40 " : ""}${selected ? "border-st-ink bg-st-em/50 text-[#FFFFEB] ring-2 ring-st-em" : "border-st-ink/15 bg-st-em/25 text-[#FFFFEB] hover:bg-st-em/40"} ${track.locked ? "cursor-default" : "cursor-grab touch-none"}`}
                    style={{ left: x(liveS), width: wpx }}
                  >
                    {fadeInW > 0 ? <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-full bg-black/30" style={{ width: fadeInW, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} /> : null}
                    {fadeOutW > 0 ? <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-full bg-black/30" style={{ width: fadeOutW, clipPath: "polygon(100% 0, 100% 100%, 0 0)" }} /> : null}
                    {wpx > 24 ? <span className="relative flex h-full items-center truncate font-medium">{c.assetName}</span> : null}
                    {!track.locked && onTrimAudioClip && wpx > 10 ? (
                      <>
                        <span onPointerDown={(e) => beginAudioTrim(e, c, "start")} className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-st-ink/20 hover:bg-st-ink/50" aria-label={`Move start of ${c.assetName}`} />
                        <span onPointerDown={(e) => beginAudioTrim(e, c, "end")} className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-st-ink/20 hover:bg-st-ink/50" aria-label={`Move end of ${c.assetName}`} />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}

          <div ref={headRef} className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-st-ink will-change-transform" style={{ left: LABEL_W }}>
            <div className="absolute -left-[5px] -top-0.5 h-3 w-3 rounded-sm bg-st-ink" />
          </div>

          {/* snap guide: shown while a drag is snapped to the playhead or a neighbouring edge */}
          {snapGuide !== null ? (
            <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-st-em" style={{ left: LABEL_W + x(snapGuide) }} />
          ) : null}
        </div>
      </div>

      {drag?.group ? (
        <div aria-hidden className="pointer-events-none fixed z-50 rounded-md bg-st-ink px-2 py-1 font-mono text-xs font-semibold text-st-panel shadow-lg" style={{ left: drag.px + 14, top: drag.py + 16 }}>
          {formatDelta(drag.dxMs)}
        </div>
      ) : null}
    </div>
  );
};

const Waveform: React.FC<{ peaks: Float32Array | null; width: number }> = ({ peaks, width }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks) return;
    const w = Math.min(width, 16000); // canvas size limit; CSS stretches it when zoomed far in
    const h = c.clientHeight || 40;
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.5)";
    const per = peaks.length / w;
    for (let px = 0; px < w; px++) {
      let m = 0;
      for (let i = Math.floor(px * per); i < Math.floor((px + 1) * per) || i === Math.floor(px * per); i++) m = Math.max(m, peaks[i] ?? 0);
      const bh = Math.max(1, m * (h - 4));
      g.fillRect(px, (h - bh) / 2, 1, bh);
    }
  }, [peaks, width]);
  return <canvas ref={ref} className="absolute inset-0 h-full" style={{ width }} aria-hidden />;
};

export { PEAKS_PER_SECOND };
