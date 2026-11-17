/**
 * Homepage feature animations — shared stage language.
 *
 * Flat colours only (house palette): dark #141412, cream #FFFFEB, emerald
 * #34D399, orange #FFA946, lavender #F0D7FF. No gradients, no glows.
 * Fonts: Plus Jakarta Sans for everything, Instrument Serif Italic for the
 * accent word only — the same two the homepage itself uses.
 */
import React, { useEffect, useRef, useState } from "react";
import { AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LOCAL_FONTS } from "./localFonts";

export const HOME = {
  dark: "#141412",
  panel: "#1C1C1A",
  raised: "#2E2E2A",
  line: "rgba(255,255,235,0.12)",
  cream: "#FFFFEB",
  creamDim: "rgba(255,255,235,0.65)",
  creamFaint: "rgba(255,255,235,0.45)",
  emerald: "#34D399",
  orange: "#FFA946",
  lavender: "#F0D7FF",
} as const;

export const FPS = 30;
export const DURATION_FRAMES = 240; // 8 s, loops
export const W = 1280;
export const H = 720;

export const sans = `"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif`;
export const serif = `"Instrument Serif", Georgia, serif`;

let localFontsLoaded: Promise<void> | null = null;

/** Registers the bundled faces; no network — the render sandbox cannot fetch Google Fonts from Chromium. */
function loadLocalFonts(): Promise<void> {
  if (localFontsLoaded) return localFontsLoaded;
  localFontsLoaded = (async () => {
    if (typeof document === "undefined") return;
    await Promise.all(
      LOCAL_FONTS.map(async (f) => {
        const face = new FontFace(f.family, `url(${f.data})`, { style: f.style, weight: f.weight });
        document.fonts.add(face);
        await face.load();
      }),
    );
  })();
  return localFontsLoaded;
}

/** Loads the two homepage fonts; gates the first frame until they land. */
export function useHomeFonts() {
  const [handle] = useState(() => delayRender("Loading homepage fonts", { timeoutInMilliseconds: 30000 }));
  const continuedRef = useRef(false);
  useEffect(() => {
    loadLocalFonts()
      .then(() => {
        if (!continuedRef.current) {
          continuedRef.current = true;
          continueRender(handle);
        }
      })
      .catch((e) => cancelRender(e));
  }, [handle]);
}

/** 0→1 progress over [start, end] frames, eased out. */
export function progress(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
}

/** Spring 0→1 starting at `delay` frames, no overshoot. */
export function spring01(frame: number, fps: number, delay: number) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return Math.max(0, Math.min(1, s));
}

export function useFrame() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps };
}

/** Soft loop: fade in from black, fade out to black at the end. */
export function LoopFade({ children }: { children: React.ReactNode }) {
  const { frame } = useFrame();
  const opacity = interpolate(frame, [0, 10, 230, 240], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

/** End card: stage dims, then the line + sub land. */
export function EndCard({ lead, accent, sub }: { lead: string; accent: string; sub: string }) {
  const { frame } = useFrame();
  const dim = progress(frame, 204, 222);
  const textIn = progress(frame, 210, 226);
  const subIn = progress(frame, 214, 226);
  if (dim <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: `rgba(20,20,18,${0.88 * dim})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: textIn,
          fontFamily: sans,
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.1,
          color: HOME.cream,
          textAlign: "center",
          letterSpacing: -1,
        }}
      >
        {lead}{" "}
        <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: HOME.emerald }}>{accent}</span>
      </div>
      <div style={{ opacity: subIn, marginTop: 18, fontFamily: sans, fontSize: 26, color: HOME.creamDim }}>{sub}</div>
    </AbsoluteFill>
  );
}

/** Small caps section label used at the top of both animations. */
export function TopLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 30,
        left: 40,
        right: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 700, letterSpacing: 3, color: HOME.creamFaint }}>{children}</div>
      {right}
    </div>
  );
}
