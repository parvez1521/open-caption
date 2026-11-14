"use client";

import React from "react";
import { fontStack, getLook } from "@capseasy/templates";
import { AnimatedTemplatePreview } from "@/features/studio/panels/AnimatedTemplatePreview";

/**
 * Hero kinetic caption strip: the default Kinetic look (Kinetic Big Word) rendering its real
 * word-by-word motion, live, through the same AnimatedTemplatePreview the picker and the
 * cylinder use. The motion is the template's own pop/scale/tilt — not a CSS imitation — over
 * that preview's five-word sample line ("Make every single word count").
 */
export function HeroKineticCaption() {
  const look = getLook("kinetic_mix");
  if (!look) return null;
  const s = look.style;
  const fill = s.fill.type === "solid" ? s.fill.color : s.fill.stops[0]!.color;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#FFFFEB]/10 bg-black shadow-[0_24px_50px_-24px_rgba(0,0,0,0.7)]">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="text-[13px] font-bold text-[#FFFFEB]">Kinetic Big Word</span>
        <span className="shrink-0 rounded-full bg-[#FFA946] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#141412]">Live · default look</span>
      </div>
      <div className="mt-2">
        <AnimatedTemplatePreview
          look={look}
          poster={
            <div className="flex h-full w-full items-center justify-center bg-black px-3 text-center text-[22px] leading-tight">
              <span
                style={{
                  fontFamily: fontStack(s.fontId),
                  fontWeight: s.fontWeight,
                  color: fill,
                  textTransform: s.casing === "upper" ? "uppercase" : s.casing === "lower" ? "lowercase" : "none",
                }}
              >
                Watch this <span style={{ color: s.active.color }}>now</span>
              </span>
            </div>
          }
        />
      </div>
    </div>
  );
}
