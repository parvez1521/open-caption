"use client";

import React from "react";
import type { ProjectSettings } from "@capseasy/shared";
import { OVERLAY_SHAPE_META, OverlayShapeSvg } from "@capseasy/compositions";
import { Section } from "../controls";
import { overlayItemsOf } from "../composition";
import { OverlayEditor, OverlayRow } from "./OverlayEditor";
import { makeShapeOverlay } from "./overlayItems";
import type { OverlayPanelProps } from "./TextPanel";

/** Elements: the app's own shape set + placed images from the media bin. Clicking a shape adds it as a timed overlay that renders in the preview and the exported MP4. */
export const ElementsPanel: React.FC<OverlayPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition }) => {
  const shapes = composition ? overlayItemsOf(composition, "shape") : settings.overlays.filter((o) => o.kind === "shape");
  const images = composition ? overlayItemsOf(composition, "image") : settings.overlays.filter((o) => o.kind === "image");
  const placed = [...shapes, ...images];
  const selected = placed.find((o) => o.id === selectedId) ?? null;
  const labelOf = (o: (typeof placed)[number]) => (o.kind === "image" ? o.assetName ?? "Image" : OVERLAY_SHAPE_META.find((s) => s.id === o.shape)?.label ?? "Shape");
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Elements" hint="Shapes drawn by Open Caption. Pick one to place it over the video at the playhead, for three seconds.">
        <div className="grid grid-cols-3 gap-2">
          {OVERLAY_SHAPE_META.map((s) => (
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
              <OverlayRow key={o.id} item={o} label={labelOf(o)} selected={o.id === selectedId} onSelect={() => onSelect(o.id === selectedId ? null : o.id)} />
            ))}
          </div>
        </Section>
      ) : null}
      {selected ? (
        <OverlayEditor
          item={selected}
          onChange={(next) => patch({ overlays: settings.overlays.map((o) => (o.id === next.id ? next : o)) })}
          onDelete={() => { patch({ overlays: settings.overlays.filter((o) => o.id !== selected.id) }); onSelect(null); }}
        />
      ) : null}
    </div>
  );
};
