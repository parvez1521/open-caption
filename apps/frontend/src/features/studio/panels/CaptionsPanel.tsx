"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CaptionDoc, Page } from "@capseasy/shared";
import { deleteWordsByIds, findMatches, findReplace, importSubtitles, mergeWithPrevious, setEmphasis, setHidden, setWordText, shiftAllWords, shiftWordsByIds, splitCardAt } from "@motion-ai/caption-engine/core";
import { Button, fmtTime } from "../controls";
import { EmphasisSuggestions } from "./EmphasisSuggestions";
import { PANEL_PX_PER_MS, formatDelta, isPastThreshold, pxToMs, rangeSelection } from "../dragSelect";

interface Props {
  doc: CaptionDoc;
  pages: Page[];
  currentPageId: string | null;
  /** playhead, so the word being said right now is marked */
  timeMs: number;
  selectedId: string | null;
  onSelect: (wordId: string | null) => void;
  onSeek: (ms: number) => void;
  edit: (fn: (d: CaptionDoc) => CaptionDoc, opts?: { coalesceKey?: string }) => void;
  /** false for layouts that cannot show a key word differently (typewriter) */
  heroSupported: boolean;
  /**
   * Drag selection (owner correction #5): a Set of word ids spanning cards, built by dragging
   * across word chips. Owned by StudioPage so the timeline track shares the same selection.
   */
  selectedWordIds: Set<string>;
  onWordSelectionChange: (ids: Set<string>) => void;
  /**
   * Slice 5.5 (a): the captions track's lock (Timeline track controls). When true, EVERY
   * caption edit in this panel is blocked — word text, find/replace, shift-all, group
   * shift/delete, split/join/hide, subtitle import and drag-retime — while selecting and
   * seeking stay available. Before this prop existed the panel ignored the lock entirely,
   * so a "locked" captions track could still be edited from here.
   */
  locked?: boolean;
}

/**
 * An in-progress press on a word chip. It becomes a drag-select (press started on an unselected
 * word) or a drag-retime (press started on a word that is part of the current selection) once the
 * pointer passes the threshold; below the threshold it stays a plain click (select/edit the word).
 * Timing is NEVER written to the document during the drag — the delta is previewed visually and
 * committed once, on release, through edit() + shiftWordsByIds, so undo/redo and autosave see a
 * single step.
 */
type Gesture =
  | { kind: "select"; anchorId: string; startX: number; startY: number; active: boolean }
  | { kind: "retime"; ids: string[]; startX: number; startY: number; active: boolean; dx: number };

export const CaptionsPanel: React.FC<Props> = ({ doc, pages, currentPageId, timeMs, selectedId, onSelect, onSeek, edit: editProp, heroSupported, selectedWordIds, onWordSelectionChange, locked = false }) => {
  // The lock guard lives at this ONE chokepoint: every edit this panel makes (its own
  // controls and the EmphasisSuggestions child) goes through `edit`, so wrapping it here
  // blocks them all at once — no call site can forget the check.
  const edit: Props["edit"] = (fn, opts) => {
    if (!locked) editProp(fn, opts);
  };
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [shiftSec, setShiftSec] = useState("");

  // the flat visible word order (page order) — drag ranges are computed over this, across cards
  const flatIds = useMemo(() => pages.flatMap((p) => p.words.map((w) => w.id)), [pages]);
  const selIds = useMemo(() => flatIds.filter((id) => selectedWordIds.has(id)), [flatIds, selectedWordIds]);

  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);
  const [dragDeltaMs, setDragDeltaMs] = useState<number | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const applyShiftInput = () => {
    const v = Number.parseFloat(shiftSec);
    if (!Number.isFinite(v) || v === 0) return;
    edit((d) => shiftAllWords(d, Math.round(v * 1000)));
    setShiftSec("");
  };

  const selected = useMemo(() => doc.words.find((w) => w.id === selectedId) ?? null, [doc, selectedId]);
  const matchIds = useMemo(() => new Set(findMatches(doc, find)), [doc, find]);
  const hidden = useMemo(() => doc.words.filter((w) => w.hidden), [doc.words]);
  const lowConfidence = (c?: number) => c !== undefined && c < 0.5;

  // ---------- drag-select + drag-retime on the word chips
  const onChipPointerDown = (e: React.PointerEvent, wordId: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported: container handlers still receive the moves */
    }
    if (!locked && selectedWordIds.has(wordId) && selectedWordIds.size > 0) {
      gestureRef.current = { kind: "retime", ids: [...selectedWordIds], startX: e.clientX, startY: e.clientY, active: false, dx: 0 };
    } else {
      gestureRef.current = { kind: "select", anchorId: wordId, startX: e.clientX, startY: e.clientY, active: false };
    }
  };

  const onListPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.kind === "select") {
      if (!g.active) {
        if (!isPastThreshold(dx, dy)) return;
        g.active = true;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-word-id]");
      const focusId = el?.dataset.wordId;
      if (focusId) onWordSelectionChange(rangeSelection(flatIds, g.anchorId, focusId));
    } else {
      // retime is a horizontal gesture: it takes over once horizontal movement clearly dominates
      if (!g.active) {
        if (!isPastThreshold(dx, dy) || Math.abs(dx) < Math.abs(dy)) return;
        g.active = true;
      }
      g.dx = dx;
      setDragDx(dx);
      setDragDeltaMs(pxToMs(dx, PANEL_PX_PER_MS));
      setDragPos({ x: e.clientX, y: e.clientY });
    }
  };

  const endGesture = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.active) suppressClickRef.current = true;
    if (g.kind === "retime") {
      if (g.active) {
        const delta = pxToMs(g.dx, PANEL_PX_PER_MS);
        const ids = g.ids;
        if (delta !== 0) edit((d) => shiftWordsByIds(d, ids, delta));
      }
      setDragDx(0);
      setDragDeltaMs(null);
      setDragPos(null);
    }
  };

  const onChipClick = (wordId: string, startMs: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(wordId);
    onSeek(startMs + 1);
  };

  // follow playback: keep the card being spoken in the middle of the list (only this list scrolls, never the page)
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const row = currentPageId ? list?.querySelector<HTMLElement>(`[data-page="${CSS.escape(currentPageId)}"]`) : null;
    if (!list || !row) return;
    const target = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
    if (Math.abs(list.scrollTop - target) > row.offsetHeight / 2) list.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [currentPageId]);

  return (
    <div className="flex h-full flex-col">
      {locked ? (
        <p role="note" className="shrink-0 border-b border-st-line bg-st-raised/60 px-3 py-2 text-xs text-st-muted">
          Captions track is locked — unlock it from the timeline to edit the words. You can still select and play.
        </p>
      ) : null}
      <div className="space-y-2 border-b border-st-line p-3">
        <div className="flex gap-2">
          <input value={find} disabled={locked} onChange={(e) => setFind(e.target.value)} placeholder="Find" className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40 disabled:opacity-50" />
          <input value={replace} disabled={locked} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with" className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40 disabled:opacity-50" />
        </div>
        <div className="flex gap-2">
          <label className="ml-auto inline-flex cursor-pointer items-center rounded-lg border border-st-line bg-st-panel px-3 py-1 text-xs font-medium text-st-text hover:bg-st-hover" title="Replace the captions with an .srt or .vtt file (you can undo)">
            Import SRT / VTT
            <input
              type="file"
              accept=".srt,.vtt,text/vtt,application/x-subrip"
              hidden
              disabled={locked}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const imported = importSubtitles(await f.text(), doc.language);
                if (imported.words.length === 0) return void window.alert("No captions were found in that file.");
                edit((d) => ({ ...imported, language: d.language, direction: d.direction }));
              }}
            />
          </label>
        </div>
        {find ? (
          <div className="flex items-center justify-between text-xs text-st-muted">
            <span>{matchIds.size} match{matchIds.size === 1 ? "" : "es"}</span>
            <Button disabled={locked || matchIds.size === 0} onClick={() => { edit((d) => findReplace(d, find, replace).doc); setFind(""); setReplace(""); }} className="!py-1 text-xs">
              Replace all
            </Button>
          </div>
        ) : null}
        {doc.words.length > 0 ? (
          <details className="space-y-1.5">
            <summary className="cursor-pointer text-xs font-semibold text-st-text">
              Shift all captions{" "}
              <span className="font-normal text-st-faint">— if every caption sits a little early or late</span>
            </summary>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[-1000, -500, -100, 100, 500, 1000].map((ms) => (
                <Button key={ms} disabled={locked} className="!py-1 text-xs" onClick={() => edit((d) => shiftAllWords(d, ms))}>
                  {ms > 0 ? "+" : "−"}{Math.abs(ms) / 1000}s
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                disabled={locked}
                value={shiftSec}
                onChange={(e) => setShiftSec(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyShiftInput(); }}
                placeholder="Seconds (+ later, − earlier)"
                aria-label="Shift all captions by this many seconds"
                className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40"
              />
              <Button disabled={locked} className="!py-1 text-xs" onClick={applyShiftInput}>Apply shift</Button>
            </div>
          </details>
        ) : null}
      </div>

      {doc.words.length > 0 ? <EmphasisSuggestions doc={doc} edit={edit} heroSupported={heroSupported} /> : null}

      {pages.length > 0 ? (
        <p className="shrink-0 border-b border-st-line px-3 py-2 text-xs text-st-muted">
          Drag across words to select them, then drag the selection left or right to retime it.
        </p>
      ) : null}

      <div
        ref={listRef}
        className="relative min-h-0 flex-1 select-none overflow-y-auto"
        onPointerMove={onListPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        {pages.length === 0 ? <div className="p-6 text-center text-sm text-st-muted">
            <p className="font-semibold text-st-text">No spoken words found</p>
            <p className="mt-1">This video has no speech we could hear. Add captions with <b>Import SRT / VTT</b> above, or double-click the captions track in the timeline to type a word at the playhead.</p>
          </div> : null}
        {pages.map((page) => (
          <div key={page.id} data-page={page.id} className={`border-b border-l-4 border-b-st-line/60 px-3 py-2.5 ${page.id === currentPageId ? "border-l-st-or bg-st-lav/35" : "border-l-transparent"}`}>
            <div className="mb-1.5 flex items-center justify-between">
              <button onClick={() => onSeek(page.startMs)} className="-my-1 py-1 pr-2 font-mono text-[11px] text-st-faint hover:text-st-text">{fmtTime(page.startMs)}</button>
            </div>
            <div className="flex flex-wrap gap-1.5 lg:gap-1">
              {page.words.map((w, i) => {
                const inSelection = selectedWordIds.has(w.id);
                const retiming = dragDeltaMs !== null && inSelection;
                return (
                  <button
                    key={w.id}
                    data-word-id={w.id}
                    onPointerDown={(e) => onChipPointerDown(e, w.id)}
                    onClick={() => onChipClick(w.id, w.startMs)}
                    style={retiming ? { transform: `translateX(${dragDx}px)` } : undefined}
                    className={`rounded-md px-2 py-1.5 text-sm lg:px-1.5 lg:py-0.5 [touch-action:pan-y] ${
                      w.id === selectedId ? "bg-st-ink text-st-panel" : inSelection ? "bg-st-em/30 text-st-text ring-2 ring-inset ring-st-em" : page.id === currentPageId && timeMs >= w.startMs && timeMs < w.endMs ? "bg-st-or text-[#141412]" : matchIds.has(w.id) ? "bg-st-or/40 text-st-text" : "bg-st-raised text-st-text hover:bg-st-hover"
                    } ${i === page.heroIndex ? "font-bold underline decoration-st-or decoration-2 underline-offset-2" : ""} ${lowConfidence(w.confidence) ? "border-b border-dashed border-st-or" : ""}`}
                    title={lowConfidence(w.confidence) ? "Low confidence: worth double-checking" : undefined}
                  >
                    {w.text}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {hidden.length > 0 ? (
          <div className="p-3">
            <button onClick={() => setShowHidden((v) => !v)} className="text-xs text-st-muted hover:text-st-text">{showHidden ? "▾" : "▸"} {hidden.length} hidden word{hidden.length === 1 ? "" : "s"}</button>
            {showHidden ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {hidden.map((w) => (
                  <button key={w.id} disabled={locked} onClick={() => edit((d) => setHidden(d, w.id, false))} className="rounded-md bg-st-raised/70 px-1.5 py-0.5 text-sm text-st-faint line-through hover:text-st-text disabled:opacity-50" title="Click to restore">
                    {w.text}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {dragDeltaMs !== null && dragPos ? (
        <div aria-hidden className="pointer-events-none fixed z-50 rounded-md bg-st-ink px-2 py-1 font-mono text-xs font-semibold text-st-panel shadow-lg" style={{ left: dragPos.x + 14, top: dragPos.y + 16 }}>
          {formatDelta(dragDeltaMs)}
        </div>
      ) : null}

      {selIds.length > 0 ? (
        <div className="sticky bottom-0 border-t border-st-line bg-st-panel p-3 shadow-[0_-8px_20px_-14px_rgba(0,0,0,0.4)]" role="group" aria-label="Selected words actions">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-st-text">
              {selIds.length} word{selIds.length === 1 ? "" : "s"} selected
              {dragDeltaMs !== null ? <span className="ml-2 font-mono text-st-em">{formatDelta(dragDeltaMs)}</span> : null}
            </p>
            <button onClick={() => onWordSelectionChange(new Set())} className="text-xs font-medium text-st-muted hover:text-st-text">Clear</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {[-500, -100, 100, 500].map((ms) => (
              <Button key={ms} disabled={locked} className="!py-1 text-xs" onClick={() => { const ids = selIds; edit((d) => shiftWordsByIds(d, ids, ms)); }}>
                {ms > 0 ? "+" : "−"}{Math.abs(ms) / 1000}s
              </Button>
            ))}
            <Button tone="danger" disabled={locked} className="!py-1 text-xs" onClick={() => { const ids = selIds; edit((d) => deleteWordsByIds(d, ids)); onWordSelectionChange(new Set()); onSelect(null); }}>Delete selected</Button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="space-y-2 border-t border-st-line bg-st-lav/30 p-3">
          <div className="flex items-center gap-2">
            <input
              value={selected.text}
              disabled={locked}
              onChange={(e) => edit((d) => setWordText(d, selected.id, e.target.value || " "), { coalesceKey: `t-${selected.id}` })}
              className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40"
              aria-label="Edit word"
            />
            <button onClick={() => onSelect(null)} className="text-st-faint hover:text-st-text" aria-label="Close editor">✕</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {heroSupported ? (
              <Button disabled={locked} className="!py-1 text-xs" onClick={() => edit((d) => setEmphasis(d, selected.id, selected.emphasis === "hero" ? "none" : "hero"))}>
                {selected.emphasis === "hero" ? "★ Key word" : "☆ Make key word"}
              </Button>
            ) : null}
            <Button disabled={locked} className="!py-1 text-xs" onClick={() => edit((d) => splitCardAt(d, selected.id))}>Split card here</Button>
            <Button disabled={locked} className="!py-1 text-xs" onClick={() => edit((d) => mergeWithPrevious(d, selected.id))}>Join previous</Button>
            <Button tone="danger" disabled={locked} className="!py-1 text-xs" onClick={() => { edit((d) => setHidden(d, selected.id, true)); onSelect(null); }}>Hide word</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
