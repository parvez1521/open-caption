"use client";

import React from "react";
import { Section } from "../controls";
import { overlayItemsOf } from "../composition";
import { OverlayEditor } from "./OverlayEditor";
import type { OverlayPanelProps } from "./TextPanel";
import { TITLE_CATEGORIES, TITLE_STYLES, makeTitleOverlay, type TitleStyle } from "../titleStyles";
import { TitleLivePreview } from "./TitleLivePreview";

/** Category groups in registry order, styles within a group in registry order. */
const TITLE_GROUPS = TITLE_CATEGORIES.map((category) => ({
  category,
  styles: TITLE_STYLES.filter((s) => s.category === category),
})).filter((g) => g.styles.length > 0);

/** Titles: 50 ready-made text-title presets. Each card shows a REAL live preview of the
 *  title — its own typography plus its Remotion in/out animation, looping in miniature
 *  (TitleLivePreview) — and works with no video loaded. Clicking one adds it as a timed
 *  text overlay at the playhead, through the exact overlay path Text uses (makeTitleOverlay
 *  + settings patch + select), so it renders in the preview and the exported MP4. */
export const TitlesPanel: React.FC<OverlayPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition, mediaAssets, onImportMedia }) => {
  const texts = composition ? overlayItemsOf(composition, "text") : settings.overlays.filter((o) => o.kind === "text");
  const selected = texts.find((o) => o.id === selectedId) ?? null;

  const add = (style: TitleStyle) => {
    const item = makeTitleOverlay(style, getTimeMs(), durationMs);
    patch({ overlays: [...settings.overlays, item] });
    onSelect(item.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The selected title's editor sits at the TOP of the panel (same as Motion):
            a title just added must look editable at once. */}
        {selected ? (
          <OverlayEditor
            item={selected}
            onChange={(next) => patch({ overlays: settings.overlays.map((o) => (o.id === next.id ? next : o)) })}
            onDelete={() => { patch({ overlays: settings.overlays.filter((o) => o.id !== selected.id) }); onSelect(null); }}
            mediaAssets={mediaAssets}
            onImportMedia={onImportMedia}
          />
        ) : null}
        <Section title="Text titles" hint="Tap a title to add it at the playhead, then edit its text in the editor above.">
          {TITLE_GROUPS.map((g) => (
            <div key={g.category} className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-st-faint">{g.category}</h3>
              <div className="grid grid-cols-2 gap-2">
                {g.styles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => add(s)}
                    className="flex flex-col items-stretch overflow-hidden rounded-xl border border-st-line bg-st-panel text-left"
                    aria-label={`Add ${s.name}`}
                  >
                    <TitleLivePreview style={s} />
                    <span className="px-2.5 pb-2 pt-2 text-[12px] font-semibold leading-tight text-st-text">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
};
