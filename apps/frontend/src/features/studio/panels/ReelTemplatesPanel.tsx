"use client";

import React, { useMemo, useState } from "react";
import type { OverlayItem } from "@capseasy/shared";
import { Section } from "../controls";
import {
  REEL_TEMPLATES,
  REEL_TEMPLATE_CATEGORIES,
  applyReelTemplate,
  makeReelBackgroundOverlay,
  updateReelParam,
  type ReelParamMapEntry,
  type ReelTemplate,
} from "../reelTemplates";
import type { OverlayPanelProps } from "./TextPanel";

export interface ReelTemplatesPanelProps extends OverlayPanelProps {
  currentLookId?: string | null;
  onChooseLook?: (lookId: string) => void;
}

interface AppliedInstance {
  templateId: string;
  paramMap: ReelParamMapEntry[];
  overlays: OverlayItem[];
  bgOverlayId: string | null;
  bgAssetId: string | null;
}

/**
 * Reel Templates inside the editor (right column): pick a preset bundle and it
 * places its overlays at the playhead and switches the caption look — through the
 * same overlay path the other panels use. The placed words and colours stay
 * editable below until another template replaces them.
 */
export const ReelTemplatesPanel: React.FC<ReelTemplatesPanelProps> = ({
  settings,
  patch,
  getTimeMs,
  durationMs,
  mediaAssets,
  onChooseLook,
}) => {
  const [instance, setInstance] = useState<AppliedInstance | null>(null);
  const [bgAssetId, setBgAssetId] = useState<string>("");

  const images = useMemo(() => (mediaAssets ?? []).filter((a) => a.kind === "image"), [mediaAssets]);
  const appliedTemplate = instance ? REEL_TEMPLATES.find((t) => t.id === instance.templateId) ?? null : null;

  const apply = (template: ReelTemplate) => {
    const playheadMs = getTimeMs();
    const applied = applyReelTemplate(template, playheadMs, durationMs);
    let overlays = applied.overlays;
    let bgOverlayId: string | null = null;
    let newBgAssetId: string | null = null;
    if (template.background && bgAssetId) {
      const asset = images.find((a) => a.id === bgAssetId);
      if (asset) {
        const bg = makeReelBackgroundOverlay(asset, template, playheadMs, durationMs);
        overlays = [bg, ...applied.overlays];
        bgOverlayId = bg.id;
        newBgAssetId = asset.id;
      }
    }
    const oldIds = new Set(instance?.overlays.map((o) => o.id) ?? []);
    patch({ overlays: [...settings.overlays.filter((o) => !oldIds.has(o.id)), ...overlays] });
    onChooseLook?.(template.lookId);
    setInstance({ templateId: template.id, paramMap: applied.paramMap, overlays, bgOverlayId, bgAssetId: newBgAssetId });
  };

  const changeParam = (key: string, field: "text" | "color", value: string) => {
    if (!instance) return;
    const next = updateReelParam(instance.overlays, instance.paramMap, key, value);
    const ids = new Set(instance.overlays.map((o) => o.id));
    patch({ overlays: [...settings.overlays.filter((o) => !ids.has(o.id)), ...next] });
    setInstance({ ...instance, overlays: next });
  };

  const changeBackground = (assetId: string) => {
    if (!instance || !appliedTemplate?.background) return;
    setBgAssetId(assetId);
    const withoutBg = instance.overlays.filter((o) => o.id !== instance.bgOverlayId);
    const templateStartMs = withoutBg[0]?.startMs ?? getTimeMs();
    let overlays = withoutBg;
    let bgOverlayId: string | null = null;
    if (assetId) {
      const asset = images.find((a) => a.id === assetId);
      if (asset) {
        const bg = makeReelBackgroundOverlay(asset, appliedTemplate, templateStartMs, durationMs);
        overlays = [bg, ...withoutBg];
        bgOverlayId = bg.id;
      }
    }
    const ids = new Set(instance.overlays.map((o) => o.id));
    patch({ overlays: [...settings.overlays.filter((o) => !ids.has(o.id)), ...overlays] });
    setInstance({ ...instance, overlays, bgOverlayId, bgAssetId: assetId || null });
  };

  const paramValue = (entry: ReelParamMapEntry): string => {
    const item = instance?.overlays.find((o) => o.id === entry.overlayId);
    if (!item) return "";
    return entry.field === "text" ? item.text ?? "" : item.color ?? "#FFFFFF";
  };

  return (
    <div className="h-full overflow-y-auto">
      <Section title="Reel templates">
        <p className="text-xs text-st-faint">Pick a template to place it at the playhead, then edit the words.</p>
        {REEL_TEMPLATE_CATEGORIES.map((category) => (
          <div key={category} className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-st-muted">{category}</h4>
            <div className="grid grid-cols-2 gap-2">
              {REEL_TEMPLATES.filter((t) => t.category === category).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => apply(t)}
                  aria-label={`Apply ${t.name}`}
                  className="flex flex-col rounded-xl border border-st-line bg-st-panel px-2.5 py-2 text-left"
                >
                  <span className="text-[12px] font-semibold leading-tight text-st-text">{t.name}</span>
                  <span className="mt-1 text-[11px] leading-snug text-st-faint">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>
      {instance && appliedTemplate ? (
        <Section title={`Edit: ${appliedTemplate.name}`}>
          {appliedTemplate.params.map((p) => {
            const entry = instance.paramMap.find((e) => e.key === p.key);
            if (!entry) return null;
            return (
              <label key={p.key} className="block text-[12px] font-medium text-st-text">
                {p.label}
                {p.field === "color" ? (
                  <input
                    type="color"
                    aria-label={p.label}
                    value={paramValue(entry)}
                    onChange={(e) => changeParam(p.key, "color", e.target.value)}
                    className="mt-1 block h-8 w-16 rounded-lg border border-st-line bg-st-raised"
                  />
                ) : (
                  <input
                    type="text"
                    aria-label={p.label}
                    value={paramValue(entry)}
                    onChange={(e) => changeParam(p.key, "text", e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-st-line bg-st-raised px-3 py-2 text-[13px] text-st-text"
                  />
                )}
              </label>
            );
          })}
          {appliedTemplate.background ? (
            <label className="block text-[12px] font-medium text-st-text">
              {appliedTemplate.background.label}
              <select
                aria-label={appliedTemplate.background.label}
                value={instance.bgAssetId ?? ""}
                onChange={(e) => changeBackground(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-st-line bg-st-raised px-3 py-2 text-[13px] text-st-text"
              >
                <option value="">No background</option>
                {images.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
};
