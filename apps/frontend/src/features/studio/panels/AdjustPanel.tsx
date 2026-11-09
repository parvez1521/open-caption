"use client";

import React from "react";
import { NEUTRAL_VIDEO_ADJUST, type ProjectSettings } from "@capseasy/shared";
import { Button, Section, Slider } from "../controls";

/** Adjust: brightness / contrast / saturation for the video layer. The preview Player and the MP4 export
 *  share one composition, so what the sliders do here is exactly what the exported file gets. */
export const AdjustPanel: React.FC<{
  settings: ProjectSettings;
  patch: (p: Partial<ProjectSettings>) => void;
}> = ({ settings, patch }) => {
  const a = settings.videoAdjust;
  const set = (p: Partial<ProjectSettings["videoAdjust"]>) => patch({ videoAdjust: { ...a, ...p } });
  const neutral = a.brightness === 1 && a.contrast === 1 && a.saturation === 1;
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Adjust" hint="Applied to the video itself, under the captions and overlays. 1.00 leaves a slider's picture unchanged.">
        <Slider label="Brightness" value={a.brightness} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ brightness: v })} />
        <Slider label="Contrast" value={a.contrast} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ contrast: v })} />
        <Slider label="Saturation" value={a.saturation} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ saturation: v })} />
        <Button onClick={() => patch({ videoAdjust: { ...NEUTRAL_VIDEO_ADJUST } })} disabled={neutral} className="w-full">Reset adjustments</Button>
      </Section>
    </div>
  );
};
