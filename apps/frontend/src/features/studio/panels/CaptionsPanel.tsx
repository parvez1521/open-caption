"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CaptionDoc, Page } from "@capseasy/shared";
import { deleteWordsByIds, findMatches, findReplace, importSubtitles, mergeWithPrevious, setEmphasis, setHidden, setWordText, shiftAllWords, shiftWordsByIds, splitCardAt } from "@motion-ai/caption-engine/core";
import { Button, fmtTime } from "../controls";


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
  /** multi-select: ids of the caption cards (derived pages) ticked for a group adjust */
  selectedCards: Set<string>;
  onToggleCard: (pageId: string) => void;
  onSelectAllCards: () => void;
  onClearCardSelection: () => void;
}

export const CaptionsPanel: React.FC<Props> = ({ doc, pages, currentPageId, timeMs, selectedId, onSelect, onSeek, edit, heroSupported, selectedCards, onToggleCard, onSelectAllCards, onClearCardSelection }) => {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [shiftSec, setShiftSec] = useState("");
  const [groupMs, setGroupMs] = useState("");
  const selectedPages = useMemo(() => pages.filter((p) => selectedCards.has(p.id)), [pages, selectedCards]);
  const selectedWordIds = useMemo(() => selectedPages.flatMap((p) => p.words.map((w) => w.id)), [selectedPages]);
  const allSelected = pages.length > 0 && selectedPages.length === pages.length;
  const applyGroupMs = () => {
    const v = Number.parseFloat(groupMs);
    if (!Number.isFinite(v) || v === 0 || selectedWordIds.length === 0) return;
    const ids = selectedWordIds;
    edit((d) => shiftWordsByIds(d, ids, Math.round(v)));
    setGroupMs("");
  };
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
      <div className="space-y-2 border-b border-st-line p-3">
        <div className="flex gap-2">
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find" className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40" />
          <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with" className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40" />
        </div>
        <div className="flex gap-2">
          <label className="ml-auto inline-flex cursor-pointer items-center rounded-lg border border-st-line bg-st-panel px-3 py-1 text-xs font-medium text-st-text hover:bg-st-hover" title="Replace the captions with an .srt or .vtt file (you can undo)">
            Import SRT
            <input
              type="file"
              accept=".srt,.vtt,text/vtt,application/x-subrip"
              hidden
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
            <Button disabled={matchIds.size === 0} onClick={() => { edit((d) => findReplace(d, find, replace).doc); setFind(""); setReplace(""); }} className="!py-1 text-xs">
              Replace all
            </Button>
          </div>
        ) : null}
        {doc.words.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-st-text">
              Shift all captions{" "}
              <span className="font-normal text-st-faint">— if every caption sits a little early or late, move them all together</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[-1000, -500, -100, 100, 500, 1000].map((ms) => (
                <Button key={ms} className="!py-1 text-xs" onClick={() => edit((d) => shiftAllWords(d, ms))}>
                  {ms > 0 ? "+" : "−"}{Math.abs(ms) / 1000}s
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                value={shiftSec}
                onChange={(e) => setShiftSec(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyShiftInput(); }}
                placeholder="Seconds (+ later, − earlier)"
                aria-label="Shift all captions by this many seconds"
                className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40"
              />
              <Button className="!py-1 text-xs" onClick={applyShiftInput}>Apply shift</Button>
            </div>
          </div>
        ) : null}
      </div>

      {pages.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-st-line bg-st-panel px-3 py-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => (allSelected ? onClearCardSelection() : onSelectAllCards())}
            aria-label="Select all caption lines"
            className="h-4 w-4 shrink-0 cursor-pointer accent-[#34D399]"
          />
          <span className="text-xs font-medium text-st-muted">
            {selectedPages.length > 0 ? `${selectedPages.length} selected` : "Select lines to adjust them together"}
          </span>
          {selectedPages.length > 0 ? (
            <button onClick={onClearCardSelection} className="ml-auto text-xs font-medium text-st-muted hover:text-st-text">Clear selection</button>
          ) : null}
        </div>
      ) : null}

      <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto">
        {pages.length === 0 ? <div className="p-6 text-center text-sm text-st-muted">
            <p className="font-semibold text-st-text">No spoken words found</p>
            <p className="mt-1">This video has no speech we could hear. Add captions with <b>Import SRT</b> above, or double-click the captions track in the timeline to type a word at the playhead.</p>
          </div> : null}
        {pages.map((page) => (
          <div key={page.id} data-page={page.id} className={`border-b border-l-4 border-b-st-line/60 px-3 py-2.5 transition-colors ${selectedCards.has(page.id) ? "bg-st-em/10" : page.id === currentPageId ? "border-l-st-or bg-st-lav/35" : "border-l-transparent"}`}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedCards.has(page.id)}
                  onChange={() => onToggleCard(page.id)}
                  aria-label={`Select caption line at ${fmtTime(page.startMs)}`}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#34D399]"
                />
                <button onClick={() => onSeek(page.startMs)} className="-my-1 py-1 pr-2 font-mono text-[11px] text-st-faint hover:text-st-text">{fmtTime(page.startMs)}</button>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 lg:gap-1">
              {page.words.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => { onSelect(w.id); onSeek(w.startMs + 1); }}
                  className={`rounded-md px-2 py-1.5 text-sm transition lg:px-1.5 lg:py-0.5 ${
                    w.id === selectedId ? "bg-st-ink text-st-panel" : page.id === currentPageId && timeMs >= w.startMs && timeMs < w.endMs ? "bg-st-or text-[#141412]" : matchIds.has(w.id) ? "bg-st-or/40 text-st-text" : "bg-st-raised text-st-text hover:bg-st-hover"
                  } ${i === page.heroIndex ? "font-bold underline decoration-st-or decoration-2 underline-offset-2" : ""} ${lowConfidence(w.confidence) ? "border-b border-dashed border-st-or" : ""}`}
                  title={lowConfidence(w.confidence) ? "Low confidence: worth double-checking" : undefined}
                >
                  {w.text}
                </button>
              ))}
            </div>
          </div>
        ))}

        {hidden.length > 0 ? (
          <div className="p-3">
            <button onClick={() => setShowHidden((v) => !v)} className="text-xs text-st-muted hover:text-st-text">{showHidden ? "▾" : "▸"} {hidden.length} hidden word{hidden.length === 1 ? "" : "s"}</button>
            {showHidden ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {hidden.map((w) => (
                  <button key={w.id} onClick={() => edit((d) => setHidden(d, w.id, false))} className="rounded-md bg-st-raised/70 px-1.5 py-0.5 text-sm text-st-faint line-through hover:text-st-text" title="Click to restore">
                    {w.text}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedPages.length > 0 ? (
        <div className="sticky bottom-0 space-y-2 border-t border-st-line bg-st-panel p-3 shadow-[0_-8px_20px_-14px_rgba(0,0,0,0.4)]" role="group" aria-label="Selected lines actions">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-st-text">{selectedPages.length} selected · {selectedWordIds.length} word{selectedWordIds.length === 1 ? "" : "s"}</p>
            <button onClick={onClearCardSelection} className="text-xs font-medium text-st-muted hover:text-st-text">Clear selection</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[-500, -100, 100, 500].map((ms) => (
              <Button key={ms} className="!py-1 text-xs" onClick={() => { const ids = selectedWordIds; edit((d) => shiftWordsByIds(d, ids, ms)); }}>
                {ms > 0 ? "+" : "−"}{Math.abs(ms) / 1000}s
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step="10"
              value={groupMs}
              onChange={(e) => setGroupMs(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyGroupMs(); }}
              placeholder="Custom shift (ms, + later, − earlier)"
              aria-label="Shift selected lines by this many milliseconds"
              className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40"
            />
            <Button className="!py-1 text-xs" onClick={applyGroupMs}>Apply shift</Button>
            <Button tone="danger" className="!py-1 text-xs" onClick={() => { const ids = selectedWordIds; edit((d) => deleteWordsByIds(d, ids)); onClearCardSelection(); onSelect(null); }}>Delete selected</Button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="space-y-2 border-t border-st-line bg-st-lav/30 p-3">
          <div className="flex items-center gap-2">
            <input
              value={selected.text}
              onChange={(e) => edit((d) => setWordText(d, selected.id, e.target.value || " "), { coalesceKey: `t-${selected.id}` })}
              className="min-w-0 flex-1 rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40"
              aria-label="Edit word"
            />
            <button onClick={() => onSelect(null)} className="text-st-faint hover:text-st-text" aria-label="Close editor">✕</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {heroSupported ? (
              <Button className="!py-1 text-xs" onClick={() => edit((d) => setEmphasis(d, selected.id, selected.emphasis === "hero" ? "none" : "hero"))}>
                {selected.emphasis === "hero" ? "★ Key word" : "☆ Make key word"}
              </Button>
            ) : null}
            <Button className="!py-1 text-xs" onClick={() => edit((d) => splitCardAt(d, selected.id))}>Split card here</Button>
            <Button className="!py-1 text-xs" onClick={() => edit((d) => mergeWithPrevious(d, selected.id))}>Join previous</Button>
            <Button tone="danger" className="!py-1 text-xs" onClick={() => { edit((d) => setHidden(d, selected.id, true)); onSelect(null); }}>Hide word</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
