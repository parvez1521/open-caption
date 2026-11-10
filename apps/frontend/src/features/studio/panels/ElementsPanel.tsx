"use client";

import React from "react";
import type { ProjectSettings } from "@capseasy/shared";
import { OVERLAY_SHAPE_META, OverlayShapeSvg, SOCIAL_META } from "@capseasy/compositions";
import { Section } from "../controls";
import { overlayItemsOf } from "../composition";
import { AnimatedSocialPreview } from "./AnimatedSocialPreview";
import { OverlayEditor, OverlayRow } from "./OverlayEditor";
import { makeShapeOverlay, makeSocialOverlay } from "./overlayItems";
import type { OverlayPanelProps } from "./TextPanel";

/** Elements: the app's own shape set + placed images from the media bin + animated Social Media
 *  graphics. Clicking one adds it as a timed overlay that renders in the preview and the exported MP4. */
export const ElementsPanel: React.FC<OverlayPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition }) => {
  const shapes = composition ? overlayItemsOf(composition, "shape") : settings.overlays.filter((o) => o.kind === "shape");
  const images = composition ? overlayItemsOf(composition, "image") : settings.overlays.filter((o) => o.kind === "image");
  const socials = composition ? overlayItemsOf(composition, "social") : settings.overlays.filter((o) => o.kind === "social");
  const placed = [...shapes, ...images, ...socials];
  const selected = placed.find((o) => o.id === selectedId) ?? null;
  const labelOf = (o: (typeof placed)[number]) =>
    o.kind === "image" ? o.assetName ?? "Image"
    : o.kind === "social" ? SOCIAL_META.find((s) => s.id === o.variant)?.label ?? "Social"
    : OVERLAY_SHAPE_META.find((s) => s.id === o.shape)?.label ?? "Shape";
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Social Media" hint="Animated graphics drawn by Open Caption — no platform logos, your own words and colour. Pick one to place it at the playhead; it animates in the preview and the exported MP4.">
        <div className="grid grid-cols-2 gap-2">
          {SOCIAL_META.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                const item = makeSocialOverlay(m.id, getTimeMs(), durationMs);
                patch({ overlays: [...settings.overlays, item] });
                onSelect(item.id);
              }}
              className="flex flex-col items-stretch overflow-hidden rounded-xl border border-st-line bg-st-panel text-left transition hover:bg-st-hover"
              aria-label={`Add ${m.label}`}
            >
              {/* the graphic's REAL animation, live in the card (AnimatedSocialPreview renders the
                  same OverlayView the preview + export use) — a name alone never showed what it does */}
              <AnimatedSocialPreview variant={m.id} />
              <span className="flex flex-col items-start gap-1 px-3 py-2.5">
                <span className="text-[12px] font-semibold leading-tight text-st-text">{m.label}</span>
                <span className="text-[11px] leading-snug text-st-faint">{m.hint.split(".")[0]}.</span>
              </span>
            </button>
          ))}
        </div>
      </Section>
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
