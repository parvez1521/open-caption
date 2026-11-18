"use client";

import React from "react";
import type { NewGraphicEntry } from "@capseasy/compositions";
import { Section } from "../controls";
import { overlayItemsOf } from "../composition";
import { NEW_GRAPHICS_GROUPS, newGraphicsTemplates } from "../newGraphics";
import { AnimatedSocialPreview } from "./AnimatedSocialPreview";
import { OverlayEditor } from "./OverlayEditor";
import { makeSocialOverlay } from "./overlayItems";
import type { OverlayPanelProps } from "./TextPanel";

/**
 * 300 NEW motion graphics inside the editor (right column): the fifteen new
 * families from newGraphics.ts, each a section of graphic cards. Placing a
 * graphic goes through the exact overlay path MotionPackPanel uses
 * (makeSocialOverlay + settings patch + select), with the item's length set to
 * the entry's registry default duration. The selected graphic's editor sits at
 * the top, so a graphic just added is fully customizable: text, colour,
 * position, scale, rotation, opacity, duration, entrance/exit animation.
 *
 * Not wired into any tab here — the coordinator wires this panel into the
 * graphics tab in phase 2 (StudioPage.tsx is off-limits to this worker).
 */
export const NewGraphicsPanel: React.FC<OverlayPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition, mediaAssets, onImportMedia }) => {
  const socials = composition ? overlayItemsOf(composition, "social") : settings.overlays.filter((o) => o.kind === "social");
  const selected = socials.find((o) => o.id === selectedId) ?? null;

  const add = (t: NewGraphicEntry) => {
    const base = makeSocialOverlay(t.id, getTimeMs(), durationMs);
    // the registry's default duration for this entry, clamped exactly like makeSocialOverlay clamps its own
    let endMs = base.startMs + t.defaultDurationMs;
    if (durationMs > base.startMs + 400) endMs = Math.min(endMs, durationMs);
    if (endMs <= base.startMs) endMs = base.startMs + 400;
    const item = { ...base, endMs };
    patch({ overlays: [...settings.overlays, item] });
    onSelect(item.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selected ? (
          <OverlayEditor
            item={selected}
            onChange={(next) => patch({ overlays: settings.overlays.map((o) => (o.id === next.id ? next : o)) })}
            onDelete={() => { patch({ overlays: settings.overlays.filter((o) => o.id !== selected.id) }); onSelect(null); }}
            mediaAssets={mediaAssets}
            onImportMedia={onImportMedia}
          />
        ) : null}
        <p className="px-1 pb-1 text-[12px] text-st-faint">300 new graphics, grouped by use. Tap one to add it at the playhead.</p>
        {NEW_GRAPHICS_GROUPS.map((group) => {
          const templates = newGraphicsTemplates(group);
          if (templates.length === 0) return null;
          return (
            <Section key={group.id} title={group.title}>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => add(t)}
                    className="flex flex-col items-stretch overflow-hidden rounded-xl border border-st-line bg-st-panel text-left transition hover:bg-st-hover"
                    aria-label={`Add ${t.title}`}
                  >
                    <AnimatedSocialPreview variant={t.id} />
                    <span className="px-2.5 py-2 text-[12px] font-semibold leading-tight text-st-text">{t.title}</span>
                  </button>
                ))}
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
};
