"use client";

import React from "react";
import type { OverlayItem } from "@capseasy/shared";
import { Button, ColorField, Section, Slider, fmtTime } from "../controls";

/**
 * The one editor for a selected overlay, shared by the Text and Elements panels: timing, position,
 * scale, rotation, colour and (for text) content and size. Every change goes through the caller's
 * settings patch, so it saves with the project and renders in the preview and the MP4 export alike.
 */
export const OverlayEditor: React.FC<{
  item: OverlayItem;
  onChange: (next: OverlayItem) => void;
  onDelete: () => void;
}> = ({ item, onChange, onDelete }) => {
  const set = (p: Partial<OverlayItem>) => onChange({ ...item, ...p });
  const setStart = (sec: number) => {
    if (!Number.isFinite(sec)) return;
    const startMs = Math.max(0, Math.round(sec * 1000));
    set({ startMs, endMs: Math.max(item.endMs, startMs + 100) });
  };
  const setEnd = (sec: number) => {
    if (!Number.isFinite(sec)) return;
    set({ endMs: Math.max(item.startMs + 100, Math.round(sec * 1000)) });
  };
  const positions: { label: string; x: number; y: number }[] = [
    { label: "Top left", x: 0.25, y: 0.25 }, { label: "Top centre", x: 0.5, y: 0.25 }, { label: "Top right", x: 0.75, y: 0.25 },
    { label: "Middle left", x: 0.25, y: 0.5 }, { label: "Centre", x: 0.5, y: 0.5 }, { label: "Middle right", x: 0.75, y: 0.5 },
    { label: "Bottom left", x: 0.25, y: 0.75 }, { label: "Bottom centre", x: 0.5, y: 0.75 }, { label: "Bottom right", x: 0.75, y: 0.75 },
  ];
  return (
    <Section title={item.kind === "text" ? "Selected text" : "Selected element"}>
      {item.kind === "text" ? (
        <label className="block text-sm text-st-text/90">
          <span className="mb-1 block">Text</span>
          <input
            value={item.text ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm text-st-text outline-none focus:border-st-lav"
          />
        </label>
      ) : null}
      <div className="flex items-end gap-2">
        <label className="flex-1 text-sm text-st-text/90">
          <span className="mb-1 block">Start (s)</span>
          <input type="number" min={0} step={0.1} value={Math.round(item.startMs / 100) / 10} onChange={(e) => setStart(Number(e.target.value))} className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm tabular-nums text-st-text outline-none focus:border-st-lav" />
        </label>
        <label className="flex-1 text-sm text-st-text/90">
          <span className="mb-1 block">End (s)</span>
          <input type="number" min={0} step={0.1} value={Math.round(item.endMs / 100) / 10} onChange={(e) => setEnd(Number(e.target.value))} className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm tabular-nums text-st-text outline-none focus:border-st-lav" />
        </label>
      </div>
      <p className="text-xs text-st-faint">On screen from {fmtTime(item.startMs)} to {fmtTime(item.endMs)}.</p>
      <div>
        <span className="mb-1 block text-sm text-st-text/90">Position</span>
        <div className="grid w-24 grid-cols-3 gap-1" role="group" aria-label="Position presets">
          {positions.map((p) => {
            const active = Math.abs(item.x - p.x) < 0.01 && Math.abs(item.y - p.y) < 0.01;
            return (
              <button
                key={p.label}
                type="button"
                title={p.label}
                aria-label={p.label}
                aria-pressed={active}
                onClick={() => set({ x: p.x, y: p.y })}
                className={`grid h-7 w-7 place-items-center rounded-md border transition ${active ? "border-st-ink bg-st-lav" : "border-st-line bg-st-panel hover:bg-st-hover"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-st-ink" : "bg-st-faint"}`} />
              </button>
            );
          })}
        </div>
      </div>
      <Slider label="Scale" value={item.scale} min={0.25} max={4} step={0.05} unit="×" onChange={(v) => set({ scale: v })} />
      <Slider label="Rotation" value={item.rotation} min={-45} max={45} step={1} unit="°" onChange={(v) => set({ rotation: v })} />
      {item.kind === "text" ? <Slider label="Size" value={item.fontSize ?? 64} min={24} max={140} onChange={(v) => set({ fontSize: v })} /> : null}
      <ColorField label="Colour" value={item.color} onChange={(v) => set({ color: v })} />
      <Button tone="danger" onClick={onDelete} className="w-full">Delete</Button>
    </Section>
  );
};

/** Row for one overlay in a panel list: name + time window, click to select. */
export const OverlayRow: React.FC<{ item: OverlayItem; label: string; selected: boolean; onSelect: () => void }> = ({ item, label, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${selected ? "bg-st-lav text-st-ink" : "bg-st-raised/60 text-st-text hover:bg-st-hover"}`}
  >
    <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
    <span className="shrink-0 text-xs tabular-nums text-st-muted">{fmtTime(item.startMs)} – {fmtTime(item.endMs)}</span>
  </button>
);
