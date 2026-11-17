"use client";

import React from "react";
import { OverlayShapeSvg } from "@capseasy/compositions";
import { Section } from "../controls";
import { overlayItemsOf } from "../composition";
import { OverlayEditor, OverlayRow } from "./OverlayEditor";
import { makeShapeOverlay } from "./overlayItems";
import { STICKER_SETS, stickerShapes } from "../stickers";
import type { OverlayPanelProps } from "./TextPanel";

/**
 * Stickers: the House Stickers set (house-drawn SVG, CC0, free for any use).
 * Clicking one adds it as a timed shape overlay at the playhead — through the exact
 * overlay path Elements uses (makeShapeOverlay + settings patch + select) — so it
 * renders in the preview and the exported MP4. Each button shows the REAL
 * OverlayShapeSvg, the exact component the composition renders: an honest preview,
 * never a fake image.
 */
export const StickersPanel: React.FC<OverlayPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition, mediaAssets, onImportMedia }) => {
  const set = STICKER_SETS[0]!;
  const shapes = stickerShapes();
  const placed = (composition ? overlayItemsOf(composition, "shape") : settings.overlays.filter((o) => o.kind === "shape"))
    .filter((o) => o.kind === "shape" && set.shapes.includes(o.shape));
  const selected = placed.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The selected sticker's editor sits at the TOP of the panel (same as
            MotionStudioPanel): a sticker just added must look editable at once. */}
        {selected ? (
          <OverlayEditor
            item={selected}
            onChange={(next) => patch({ overlays: settings.overlays.map((o) => (o.id === next.id ? next : o)) })}
            onDelete={() => { patch({ overlays: settings.overlays.filter((o) => o.id !== selected.id) }); onSelect(null); }}
            mediaAssets={mediaAssets}
            onImportMedia={onImportMedia}
          />
        ) : null}
        <Section title="Stickers" hint={`Drawn in-house for Captionit. ${set.licence}.`}>
          <div className="grid grid-cols-3 gap-2">
            {shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  const item = makeShapeOverlay(s.id, getTimeMs(), durationMs);
                  patch({ overlays: [...settings.overlays, item] });
                  onSelect(item.id);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-st-line bg-st-panel px-2 py-3 transition hover:bg-st-hover"
                aria-label={`Add ${s.label}`}
              >
                <OverlayShapeSvg shape={s.id} color="#FFFFEB" size={36} />
                <span className="text-[11px] font-medium leading-tight text-st-text">{s.label}</span>
              </button>
            ))}
          </div>
        </Section>
        {placed.length ? (
          <Section title="On this video">
            <div className="space-y-1.5">
              {placed.map((o) => (
                <OverlayRow
                  key={o.id}
                  item={o}
                  label={o.kind === "shape" ? shapes.find((s) => s.id === o.shape)?.label ?? "Sticker" : "Sticker"}
                  selected={o.id === selectedId}
                  onSelect={() => onSelect(o.id === selectedId ? null : o.id)}
                />
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
};
