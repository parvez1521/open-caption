"use client";

import React, { useRef, useState } from "react";
import type { OverlayItem } from "@capseasy/shared";
import { OVERLAY_ENTER_ANIMS, OVERLAY_EXIT_ANIMS, SOCIAL_META } from "@capseasy/compositions";
import { getMotionTemplate } from "@capseasy/motion";
import { MotionTemplateFields } from "@/features/motion/MotionTemplateFields";
import type { MediaAssetRecord } from "../mediaStore";
import { validateImageFile } from "../mediaAssets";
import type { ImportError } from "../useMediaAssets";
import { Button, ColorField, Section, Slider, fmtTime } from "../controls";

/**
 * The one editor for a selected overlay, shared by the Text, Elements and Motion panels:
 * timing, position (presets + exact X/Y), scale, rotation, opacity, colour and (for text)
 * content and size. A selected MOTION graphic additionally gets the "Edit template" block —
 * the SAME registry-generated form as the /motion customize page (MotionTemplateFields),
 * so its text/colour/image/duration stay editable after placement (P4, 2026-11-11).
 * Every change goes through the caller's settings patch, so it saves with the project and
 * renders in the preview and the MP4 export alike. On stage, overlays can also be dragged
 * (OverlayStageLayer) — both surfaces write the same item fields.
 */
export const OverlayEditor: React.FC<{
  item: OverlayItem;
  onChange: (next: OverlayItem) => void;
  onDelete: () => void;
  /** the project's device-local media bin + importer, for the social avatar/QR asset picker.
   *  Absent = no picker (the panel was mounted without a bin). */
  mediaAssets?: MediaAssetRecord[];
  onImportMedia?: (files: File[]) => Promise<ImportError[]>;
}> = ({ item, onChange, onDelete, mediaAssets, onImportMedia }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  // a social item whose registry entry carries an image field (avatar / QR) gets an asset picker:
  // the item references the bin asset by id, and the composition resolves that id to the
  // device-local bytes at render time (the same flow image overlays already use).
  const template = item.kind === "social" && item.variant ? getMotionTemplate(item.variant) : undefined;
  const imageField = template?.fields.find((f) => f.kind === "image");
  const imageAssets = (mediaAssets ?? []).filter((a) => a.kind === "image");
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
    <Section title={item.kind === "text" ? "Selected text" : item.kind === "image" ? "Selected image" : item.kind === "social" ? `Selected: ${SOCIAL_META.find((m) => m.id === item.variant)?.label ?? "Social"}` : "Selected element"}>
      {item.kind === "image" ? (
        <p className="text-sm text-st-text/90">{item.assetName ?? "Image"}<span className="block text-xs text-st-faint">From the media bin (this device).</span></p>
      ) : null}
      {item.kind === "social" ? (
        <p className="text-xs text-st-faint">{SOCIAL_META.find((m) => m.id === item.variant)?.hint.split(".")[0]}.</p>
      ) : null}
      {item.kind === "social" && template ? (
        <div className="space-y-3 border-t border-st-line pt-3">
          <span className="block text-sm font-medium text-st-text/90">Edit template</span>
          <MotionTemplateFields
            template={template}
            tone="studio"
            text={item.text ?? ""}
            color={item.color}
            onTextChange={(v) => set({ text: v })}
            onColorChange={(v) => set({ color: v })}
            image={imageField && mediaAssets ? {
              assetName: item.assetName ?? null,
              options: imageAssets.map((a) => ({ id: a.id, name: a.name })),
              selectedAssetId: item.assetId ?? null,
              onSelect: (next) => set(next ? { assetId: next.id, assetName: next.name } : { assetId: undefined, assetName: undefined }),
              onUpload: (f) => {
                setImportNote(null);
                // image field: refuse non-images before the generic bin importer
                // (which also accepts video/audio) can store them under this picker
                const v = validateImageFile(f);
                if (!v.ok) {
                  setImportNote(v.error);
                  return;
                }
                if (!onImportMedia) return;
                void onImportMedia([f]).then((errs) => {
                  if (errs.length) setImportNote(errs.map((x) => x.error).join(" "));
                  else setImportNote(`Added ${f.name} to the media bin — pick it in the list to use it here.`);
                });
              },
              note: importNote ?? "Kept in this project's media bin, on this device.",
            } : undefined}
            durationMs={item.endMs - item.startMs <= 30000 ? item.endMs - item.startMs : undefined}
            onDurationChange={(ms) => set({ endMs: item.startMs + ms })}
          />
        </div>
      ) : null}
      {item.kind === "text" || (item.kind === "social" && !template) ? (
        <label className="block text-sm text-st-text/90">
          <span className="mb-1 block">{item.kind === "social" ? "Text (one line per part)" : "Text"}</span>
          {item.kind === "social" ? (
            <textarea
              value={item.text ?? ""}
              rows={4}
              onChange={(e) => set({ text: e.target.value })}
              className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm text-st-text outline-none focus:border-st-lav"
            />
          ) : (
            <input
              value={item.text ?? ""}
              onChange={(e) => set({ text: e.target.value })}
              className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm text-st-text outline-none focus:border-st-lav"
            />
          )}
        </label>
      ) : null}
      {imageField && mediaAssets && !template ? (
        <div className="text-sm text-st-text/90">
          <span className="mb-1 block">{imageField.label}</span>
          {imageAssets.length ? (
            <div className="space-y-1.5">
              {imageAssets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={item.assetId === a.id}
                  onClick={() => set({ assetId: a.id, assetName: a.name })}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${item.assetId === a.id ? "bg-st-lav text-st-ink" : "bg-st-raised/60 text-st-text hover:bg-st-hover"}`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                  {item.assetId === a.id ? <span className="shrink-0 text-xs">In use</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-st-faint">No images in this project&apos;s media bin yet. Upload one and it can be used here.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {onImportMedia ? (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-st-line px-2 py-1 text-[12px] font-medium text-st-text transition hover:bg-st-hover">Upload image</button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label={`Upload ${imageField.label}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setImportNote(null);
                    // image field: refuse non-images before the generic bin importer
                    // (which also accepts video/audio) can store them under this picker
                    const v = validateImageFile(f);
                    if (!v.ok) {
                      setImportNote(v.error);
                      return;
                    }
                    void onImportMedia([f]).then((errs) => {
                      if (errs.length) setImportNote(errs.map((x) => x.error).join(" "));
                      else setImportNote(`Added ${f.name} to the media bin — pick it above to use it here.`);
                    });
                  }}
                />
              </>
            ) : null}
            {item.assetId ? (
              <button type="button" onClick={() => set({ assetId: undefined, assetName: undefined })} className="rounded-md border border-st-line px-2 py-1 text-[12px] font-medium text-orange-accent transition hover:bg-st-hover">Clear image</button>
            ) : null}
          </div>
          {importNote ? <p role="status" className="mt-1.5 text-xs text-st-muted">{importNote}</p> : null}
          <p className="mt-1.5 text-xs text-st-faint">Kept in this project&apos;s media bin, on this device.</p>
        </div>
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
        <div className="flex items-start gap-3">
          <div className="grid w-24 shrink-0 grid-cols-3 gap-1" role="group" aria-label="Position presets">
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
          {/* exact position, for finer placement than the presets (and the numeric
              counterpart of dragging the graphic on the stage) */}
          <div className="flex flex-1 gap-2">
            <label className="flex-1 text-sm text-st-text/90">
              <span className="mb-1 block text-xs text-st-muted">X %</span>
              <input
                type="number" min={0} max={100} step={1}
                value={Math.round(item.x * 100)}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ x: Math.min(1, Math.max(0, v / 100)) }); }}
                aria-label="Position X percent"
                className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm tabular-nums text-st-text outline-none focus:border-st-lav"
              />
            </label>
            <label className="flex-1 text-sm text-st-text/90">
              <span className="mb-1 block text-xs text-st-muted">Y %</span>
              <input
                type="number" min={0} max={100} step={1}
                value={Math.round(item.y * 100)}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ y: Math.min(1, Math.max(0, v / 100)) }); }}
                aria-label="Position Y percent"
                className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm tabular-nums text-st-text outline-none focus:border-st-lav"
              />
            </label>
          </div>
        </div>
      </div>
      <Slider label="Scale" value={item.scale} min={0.25} max={4} step={0.05} unit="×" onChange={(v) => set({ scale: v })} />
      <Slider label="Rotation" value={item.rotation} min={-45} max={45} step={1} unit="°" onChange={(v) => set({ rotation: v })} />
      <Slider label="Opacity" value={Math.round((item.opacity ?? 1) * 100)} min={10} max={100} step={1} unit="%" onChange={(v) => set({ opacity: v / 100 })} />
      {item.kind === "text" ? <Slider label="Size" value={item.fontSize ?? 64} min={24} max={140} onChange={(v) => set({ fontSize: v })} /> : null}
      {item.kind !== "image" && !(item.kind === "social" && template) ? <ColorField label="Colour" value={item.color} onChange={(v) => set({ color: v })} /> : null}
      {/* Package 3 item I.5: entrance/exit animation for EVERY overlay kind — the same
          In/Out preset system as the captions (Package 2 item D), box-applicable subset */}
      <div className="space-y-2 border-t border-st-line pt-3">
        <span className="block text-sm font-medium text-st-text/90">Animation</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm text-st-text/90">
            <span className="mb-1 block text-xs text-st-muted">Entrance</span>
            <select
              aria-label="Entrance animation"
              value={item.enterAnim ?? "none"}
              onChange={(e) => set({ enterAnim: e.target.value === "none" ? undefined : (e.target.value as OverlayItem["enterAnim"]) })}
              className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm text-st-text outline-none focus:border-st-lav"
            >
              {OVERLAY_ENTER_ANIMS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="block text-sm text-st-text/90">
            <span className="mb-1 block text-xs text-st-muted">Exit</span>
            <select
              aria-label="Exit animation"
              value={item.exitAnim ?? "none"}
              onChange={(e) => set({ exitAnim: e.target.value === "none" ? undefined : (e.target.value as OverlayItem["exitAnim"]) })}
              className="w-full rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm text-st-text outline-none focus:border-st-lav"
            >
              {OVERLAY_EXIT_ANIMS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        </div>
        {item.enterAnim && item.enterAnim !== "none" ? (
          <Slider label="Entrance speed" value={item.enterSpeed ?? 1} min={0.5} max={2} step={0.25} unit="×" onChange={(v) => set({ enterSpeed: v })} />
        ) : null}
        {item.exitAnim && item.exitAnim !== "none" ? (
          <Slider label="Exit speed" value={item.exitSpeed ?? 1} min={0.5} max={2} step={0.25} unit="×" onChange={(v) => set({ exitSpeed: v })} />
        ) : null}
      </div>
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
