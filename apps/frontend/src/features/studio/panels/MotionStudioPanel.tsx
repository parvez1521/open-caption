"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { searchMotionTemplates, type MotionTemplate } from "@capseasy/motion";
import { SOCIAL_META } from "@capseasy/compositions";
import { Section } from "../controls";
import { overlayItemsOf } from "../composition";
import { AnimatedSocialPreview } from "./AnimatedSocialPreview";
import { OverlayEditor, OverlayRow } from "./OverlayEditor";
import { makeSocialOverlay } from "./overlayItems";
import type { OverlayPanelProps } from "./TextPanel";

/**
 * Motion Studio inside the editor (right column): browse/search the SAME typed registry the
 * standalone /motion pages use and place a template on the current project's timeline at the
 * playhead — through the exact overlay path Elements uses (makeSocialOverlay + settings
 * patch + select), with the item's length set to the template's registry default duration.
 * No second implementation: the customize page and this panel differ only in layout.
 */
export const MotionStudioPanel: React.FC<OverlayPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition, mediaAssets, onImportMedia }) => {
  const [query, setQuery] = useState("");

  // No category filter UI in this panel (owner order 2026-11-11): search + the full
  // list only. The /motion discovery page keeps its category filters — different surface.
  const results = useMemo(
    () => searchMotionTemplates({ query: query.trim() || undefined }, "category"),
    [query],
  );

  const socials = composition ? overlayItemsOf(composition, "social") : settings.overlays.filter((o) => o.kind === "social");
  const selected = socials.find((o) => o.id === selectedId) ?? null;

  const add = (t: MotionTemplate) => {
    const base = makeSocialOverlay(t.id, getTimeMs(), durationMs);
    // the registry's default duration for this template, clamped exactly like makeSocialOverlay clamps its own
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
        {/* The selected graphic's editor sits at the TOP of the panel (owner fix
            2026-11-11): it used to render below the whole template grid, so a graphic
            the user had just added looked uneditable. */}
        {selected ? (
          <OverlayEditor
            item={selected}
            onChange={(next) => patch({ overlays: settings.overlays.map((o) => (o.id === next.id ? next : o)) })}
            onDelete={() => { patch({ overlays: settings.overlays.filter((o) => o.id !== selected.id) }); onSelect(null); }}
            mediaAssets={mediaAssets}
            onImportMedia={onImportMedia}
          />
        ) : null}
        <Section title="Motion templates">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            aria-label="Search motion templates"
            className="w-full rounded-lg border border-st-line bg-st-raised px-3 py-2 text-[13px] text-st-text placeholder:text-st-faint"
          />
          {results.length === 0 ? (
            <p className="text-[12px] text-st-faint">No templates match that search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {results.map((t) => (
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
          )}
          <Link href="/motion" className="inline-block text-[12px] font-semibold text-st-text underline decoration-st-line underline-offset-2 hover:decoration-st-text">
            Open the full Motion Studio
          </Link>
        </Section>
        {socials.length ? (
          <Section title="On this video">
            <div className="space-y-1.5">
              {socials.map((o) => (
                <OverlayRow
                  key={o.id}
                  item={o}
                  label={SOCIAL_META.find((s) => s.id === o.variant)?.label ?? "Social"}
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
