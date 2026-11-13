"use client";

import React from "react";
import { NEUTRAL_VIDEO_ADJUST, type ProjectSettings } from "@capseasy/shared";
import { Button, Section, Slider } from "../controls";
import { ColorScopes } from "./ColorScopes";

/** Adjust: colour grading for the video layer (Run 3 slice 4.9 extends the original
 *  brightness/contrast/saturation with exposure, highlights, shadows, temperature and tint).
 *  The preview Player and the MP4 export share one mapping, so what the sliders do here is
 *  exactly what the exported file gets. */
export const AdjustPanel: React.FC<{
  settings: ProjectSettings;
  patch: (p: Partial<ProjectSettings>) => void;
}> = ({ settings, patch }) => {
  const a = settings.videoAdjust;
  const set = (p: Partial<ProjectSettings["videoAdjust"]>) => patch({ videoAdjust: { ...a, ...p } });
  const neutral =
    a.brightness === NEUTRAL_VIDEO_ADJUST.brightness && a.contrast === NEUTRAL_VIDEO_ADJUST.contrast &&
    a.saturation === NEUTRAL_VIDEO_ADJUST.saturation && a.exposure === NEUTRAL_VIDEO_ADJUST.exposure &&
    a.highlights === NEUTRAL_VIDEO_ADJUST.highlights && a.shadows === NEUTRAL_VIDEO_ADJUST.shadows &&
    a.temperature === NEUTRAL_VIDEO_ADJUST.temperature && a.tint === NEUTRAL_VIDEO_ADJUST.tint;
  // Exposure is stored as a multiplier and shown in stops (EV): stops = log2(multiplier).
  const exposureStops = Math.log2(Math.max(0.25, a.exposure));
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Adjust">
        <Slider label="Brightness" value={a.brightness} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ brightness: v })} />
        <Slider label="Contrast" value={a.contrast} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ contrast: v })} />
        <Slider label="Saturation" value={a.saturation} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ saturation: v })} />
        <Slider label="Exposure" value={exposureStops} min={-2} max={2} step={0.05} format={(v) => `${v.toFixed(2)} EV`} onChange={(v) => set({ exposure: Math.round(2 ** v * 10000) / 10000 })} />
        <Slider label="Highlights" value={a.highlights * 100} min={-100} max={100} step={1} onChange={(v) => set({ highlights: v / 100 })} />
        <Slider label="Shadows" value={a.shadows * 100} min={-100} max={100} step={1} onChange={(v) => set({ shadows: v / 100 })} />
        <Slider label="Temperature (warm →)" value={a.temperature * 100} min={-100} max={100} step={1} onChange={(v) => set({ temperature: v / 100 })} />
        <Slider label="Tint" value={a.tint * 100} min={-100} max={100} step={1} onChange={(v) => set({ tint: v / 100 })} />
        <p className="text-xs text-st-faint">Highlights, shadows, temperature and tint are approximations of the photographic controls. Matched between preview and export.</p>
        <Button onClick={() => patch({ videoAdjust: { ...NEUTRAL_VIDEO_ADJUST } })} disabled={neutral} className="w-full">Reset adjustments</Button>
      </Section>
      {/* A14 scopes: mounted with NO props on purpose — the section is display-only
          (it samples the preview frame itself) and must never receive the settings
          write path above. */}
      <ColorScopes />
    </div>
  );
};
