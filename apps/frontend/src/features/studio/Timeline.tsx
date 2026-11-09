"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FoldHorizontal, Link2, Magnet, Maximize2, Plus, Scissors, SlidersHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import type { Page, Word } from "@capseasy/shared";
import { fmtTime } from "./controls";
import { formatDelta, pxToMs, toggleIds } from "./dragSelect";
import { PEAKS_PER_SECOND } from "./useWaveform";
import { useFilmstrip } from "./useFilmstrip";

interface Props {
  pages: Page[];
  words: Word[];
  durationMs: number;
  timeMs: number;
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
  onOpenSettings: () => void;
  /** extra actions for the selected word (key word, emoji, hide, undo/redo) */
  extraTools?: React.ReactNode;
  fill?: boolean;
}

type Mode = "word" | "line";
interface Block { key: string; firstId: string; lastId: string; wordIds: string[]; text: string; s: number; e: number; selected: boolean; inSelection: boolean; live: boolean }
type Drag = { key: string; firstId: string; lastId: string; kind: "move" | "start" | "end"; x0: number; s0: number; e0: number; min: number; max: number; s: number; e: number; group: string[] | null; dxMs: number; px: number; py: number };

const LABEL_WIDE = 88;
const LABEL_NARROW = 58;
const MIN_MS = 40;
const SNAP_PX = 7;
/** fixed track heights: blocks keep editor proportions however tall the panel is (no stretched cards) */
const ROW = { ruler: 24, captions: 44, video: 52, audio: 44 };
const ROWS = `${ROW.ruler}px ${ROW.captions}px ${ROW.video}px ${ROW.audio}px`;
/** video visible at the default zoom: enough room to read every word (phones ~2.5 s, desktop up to 8 s) */
const defaultWindowMs = (px: number) => (px < 420 ? Math.max(2000, px * 9) : Math.min(8000, Math.max(3000, px * 15)));

const pref = <T extends string>(k: string, fallback: T): T => {
  try { return (localStorage.getItem(k) as T) || fallback; } catch { return fallback; }
};
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** Editor timeline: one captions track (as words or as lines), video, audio. Drag to move, drag edges to retime. */
export const Timeline: React.FC<Props> = ({ pages, words, durationMs, timeMs, getTimeMs, playing = false, videoId, videoUrl, videoAspect = 16 / 9, selectedId, selectedWordIds, onWordSelectionChange, onShiftWords, peaks, waveState, onSeek, onSelect, onRetimeRun, onRename, onAddWord, onSplit, onJoin, onOpenSettings, extraTools }) => {
  const total = Math.max(1000, durationMs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const LABEL_W = narrow ? LABEL_NARROW : LABEL_WIDE;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [mode, setModeState] = useState<Mode>("word");
  const [snap, setSnap] = useState(true);
  const [ripple, setRipple] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
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
      const n = el.clientWidth < 520;
      setNarrow(n);
      setViewW(el.clientWidth - (n ? LABEL_NARROW : LABEL_WIDE));
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

  // blocks on the captions track: one per word, or one per caption line (card) spanning its words
  const blocks: Block[] = useMemo(() => {
    if (mode === "word") {
      return visible.map((w) => ({ key: w.id, firstId: w.id, lastId: w.id, wordIds: [w.id], text: w.text, s: w.startMs, e: w.endMs, selected: w.id === selectedId, inSelection: selectedWordIds.has(w.id), live: timeMs >= w.startMs && timeMs < w.endMs }));
    }
    return pages.filter((p) => p.words.length).map((p) => {
      const f = p.words[0]!;
      const l = p.words[p.words.length - 1]!;
      return { key: p.id, firstId: f.id, lastId: l.id, wordIds: p.words.map((w) => w.id), text: p.words.map((w) => w.text).join(" "), s: f.startMs, e: l.endMs, selected: p.words.some((w) => w.id === selectedId), inSelection: p.words.some((w) => selectedWordIds.has(w.id)), live: timeMs >= p.startMs && timeMs < p.endMs };
    });
  }, [mode, visible, pages, selectedId, selectedWordIds, timeMs]);

  const snapTargets = (skip: string) => {
    const t: number[] = [0, total, timeMs];
    for (const b of blocks) if (b.key !== skip) t.push(b.s, b.e);
    return t;
  };
  const snapTo = (v: number, targets: number[]) => {
    if (!snap) return v;
    let best = v;
    let bd = SNAP_PX / pxPerMs;
    for (const t of targets) if (Math.abs(t - v) < bd) { bd = Math.abs(t - v); best = t; }
    return best;
  };

  const beginDrag = (e: React.PointerEvent, b: Block, kind: Drag["kind"]) => {
    if (renaming) return;
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
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
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
  };
  const endDrag = () => {
    if (drag?.group) {
      if (drag.dxMs !== 0) onShiftWords(drag.group, drag.dxMs);
    } else if (drag && (drag.s !== drag.s0 || drag.e !== drag.e0)) onRetimeRun(drag.firstId, drag.lastId, drag.s, drag.e, ripple);
    setDrag(null);
  };

  const addWord = () => {
    const id = onAddWord(timeMs);
    if (id) { setMode("word"); setRenaming(id); }
  };

  const icon = "h-4 w-4";
  const btn = (label: string, children: React.ReactNode, onClick: () => void, o: { disabled?: boolean; active?: boolean } = {}) => (
    <button
      onClick={onClick}
      disabled={o.disabled}
      title={label}
      aria-label={label}
      aria-pressed={o.active}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-30 ${o.active ? "bg-st-em/30 text-st-ink" : "text-st-text/85 hover:bg-st-hover"}`}
    >
      {children}
    </button>
  );
  const sep = <span className="mx-1 h-5 w-px shrink-0 bg-st-line" aria-hidden />;
  const noSel = !selectedId;
  const trackRow = "relative h-full border-b border-st-line";
  const rows = ROWS;
  const tileW = Math.max(24, (ROW.video - 8) * videoAspect);
  const tiles = frames.length ? Math.ceil(x(total) / tileW) : 0;

  return (
    <div role="region" aria-label="Timeline" className="flex h-full min-h-0 flex-col bg-st-bg select-none">
      <div className="flex shrink-0 flex-nowrap items-center gap-x-1 gap-y-1 overflow-x-auto border-b border-st-line bg-st-panel px-2 py-1.5 text-xs text-st-muted [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        <div className="flex shrink-0 rounded-lg border border-st-line bg-st-raised p-0.5" role="radiogroup" aria-label="Show captions as">
          {(["word", "line"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1.5 text-[11px] sm:py-1 font-semibold tracking-wide transition ${mode === m ? "bg-st-ink text-st-panel" : "text-st-muted hover:text-st-text"}`}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        {sep}
        {btn("Add a word at the playhead", <Plus className={icon} />, addWord)}
        {btn("Caption timing settings", <SlidersHorizontal className={icon} />, onOpenSettings)}
        {sep}
        {btn("Split: start a new line at the selected word", <Scissors className={icon} />, onSplit, { disabled: noSel })}
        {btn("Join: merge the selected word's line with the previous one", <FoldHorizontal className={icon} />, onJoin, { disabled: noSel })}
        {extraTools}
        {sep}
        {btn(snap ? "Snapping on" : "Snapping off", <Magnet className={icon} />, () => { setSnap(!snap); save("ce_tl_snap", snap ? "0" : "1"); }, { active: snap })}
        {btn(ripple ? "Linked: moving a caption moves everything after it" : "Linked moves off", <Link2 className={icon} />, () => { setRipple(!ripple); save("ce_tl_ripple", ripple ? "0" : "1"); }, { active: ripple })}
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-md border border-st-line bg-st-panel px-2 py-1 font-mono tabular-nums text-st-text">{fmtTime(timeMs)} <span className="text-st-faint">/ {fmtTime(total)}</span></span>
        {btn("Zoom out", <ZoomOut className={icon} />, () => setZoom((z) => Math.max(1, z / 1.6)), { disabled: zoom <= 1 })}
        <input type="range" min={0} max={100} value={Math.round((Math.log(zoom) / Math.log(40)) * 100)} onChange={(e) => setZoom(Math.pow(40, Number(e.target.value) / 100))} className="w-24 shrink-0 accent-[#34D399] sm:w-32" aria-label="Timeline zoom" />
        {btn("Zoom in", <ZoomIn className={icon} />, () => setZoom((z) => Math.min(40, z * 1.6)), { disabled: zoom >= 40 })}
        {btn("Fit the whole video", <Maximize2 className={icon} />, () => setZoom(1), { disabled: zoom === 1 })}
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="relative grid w-max" style={{ gridTemplateColumns: `${LABEL_W}px ${width}px`, gridTemplateRows: rows }}>
          <div className="sticky left-0 z-20 row-span-4 grid whitespace-nowrap border-r border-st-line bg-st-panel text-[11px] text-st-muted" style={{ gridTemplateRows: rows }}>
            <div />
            <div className="flex items-center gap-1.5 border-b border-st-line px-2 font-semibold text-st-text">𝐈 {narrow ? "Text" : "Captions"}</div>
            <div className="flex items-center gap-1.5 border-b border-st-line px-2 text-st-muted">▶ Video</div>
            <div className="flex items-center gap-1.5 px-2 text-st-muted">♫ Audio</div>
          </div>

          {/* ruler */}
          <div className="relative cursor-ew-resize touch-none border-b border-st-line bg-st-panel" {...scrub}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full border-l border-st-line pl-1 text-[10px] tabular-nums text-st-faint" style={{ left: x(t) }}>{fmtTime(t)}</div>
            ))}
          </div>

          {/* captions: words or lines */}
          <div className={trackRow} {...scrub} onClick={() => onSelect(null)}>
            {blocks.map((b) => {
              const live = drag?.key === b.key && !drag.group ? { s: drag.s, e: drag.e } : { s: b.s, e: b.e };
              const groupOffsetPx = drag?.group && b.wordIds.some((id) => selectedWordIds.has(id)) ? drag.dxMs * pxPerMs : 0;
              const wpx = Math.max(3, x(live.e) - x(live.s) - 1);
              return (
                <div
                  key={b.key}
                  onPointerDown={(e) => beginDrag(e, b, "move")}
                  onClick={(e) => { e.stopPropagation(); onSelect(b.firstId); onSeek(live.s + 1); }}
                  onDoubleClick={(e) => { e.stopPropagation(); if (mode === "word") setRenaming(b.firstId); }}
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

          {/* video */}
          <div className={`${trackRow} cursor-ew-resize`} {...scrub}>
            <div className="absolute inset-y-1 left-0 flex overflow-hidden rounded-md bg-[#0B0B0A] ring-1 ring-st-ink/20" style={{ width: x(total) }}>
              {Array.from({ length: tiles }, (_, i) => {
                const at = ((i + 0.5) * tileW) / pxPerMs;
                const f = frames.reduce((a, b) => (Math.abs(b.ms - at) < Math.abs(a.ms - at) ? b : a), frames[0]!);
                // eslint-disable-next-line @next/next/no-img-element
                return <img key={i} src={f.src} alt="" draggable={false} className="h-full shrink-0 border-r border-obsidian/60 object-cover" style={{ width: tileW }} />;
              })}
              <span className="absolute left-1.5 top-1 rounded bg-black/70 px-1.5 text-[10px] leading-4 text-[#FFFFEB]">{frames.length ? "Video" : "Video (loading frames)"}</span>
            </div>
          </div>

          {/* audio waveform */}
          <div className="relative cursor-ew-resize bg-st-em/10" {...scrub}>
            <Waveform peaks={peaks} width={width} />
            {waveState !== "ready" ? <span className="absolute left-2 top-1 text-[10px] text-st-faint">{waveState === "loading" ? "Loading audio…" : waveState === "unavailable" ? "Waveform unavailable for this file" : ""}</span> : null}
          </div>

          <div ref={headRef} className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-st-ink will-change-transform" style={{ left: LABEL_W }}>
            <div className="absolute -left-[5px] -top-0.5 h-3 w-3 rounded-sm bg-st-ink" />
          </div>
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
