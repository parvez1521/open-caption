import React from "react";
import { AbsoluteFill } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";

/**
 * Custom TransitionPresentations for the segment transition types the installed
 * @remotion/transitions 4.0.484 does not ship as a plain CSS presentation ("zoom" and "blur";
 * its zoom-blur / linear-blur presentations are shader-based html-in-canvas presentations).
 * They implement the installed TransitionPresentation API: a component receiving
 * presentationProgress (0..1 across the transition), presentationDirection
 * ("entering" | "exiting") and children, plus a props bag (empty here).
 * Timing is the caller's linearTiming — no easing is baked in (honest scope).
 */

type NoProps = Record<string, unknown>;

/** Round to 3 decimals so style strings are stable (0.925, not 0.9249999999999999). */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const ZoomPresentation: React.FC<TransitionPresentationComponentProps<NoProps>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const style: React.CSSProperties =
    presentationDirection === "entering"
      ? { opacity: p, transform: `scale(${round3(0.85 + 0.15 * p)})` }
      : { opacity: 1 - p, transform: `scale(${round3(1 + 0.15 * p)})` };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

export const zoomPresentation = (): TransitionPresentation<NoProps> => ({ component: ZoomPresentation, props: {} });

export const BlurPresentation: React.FC<TransitionPresentationComponentProps<NoProps>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const style: React.CSSProperties =
    presentationDirection === "entering"
      ? { opacity: p, filter: `blur(${12 * (1 - p)}px)` }
      : { opacity: 1 - p, filter: `blur(${12 * p}px)` };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

export const blurPresentation = (): TransitionPresentation<NoProps> => ({ component: BlurPresentation, props: {} });

/* ------------------------------------------------------------------ */
/* Parameterized presentations — the 100-entry premium transition      */
/* registry (packages/compositions/src/transitionRegistry.ts).         */
/*                                                                     */
/* One component, `ParamPresentation`, implements 10 bases; each       */
/* registry entry is a distinct parameterization (direction / shape /  */
/* colour / amount / intensity) of one base, so every entry renders    */
/* visibly differently through the same TransitionSeries path. All     */
/* style is a pure function of (base, params, direction, p) — no      */
/* randomness, no wall clock — so preview, browser export and server   */
/* render agree frame for frame. Numbers are rounded to 3 decimals so  */
/* style strings are stable.                                           */
/* ------------------------------------------------------------------ */

export type TransitionDirection =
  | "left" | "right" | "up" | "down"
  | "down-right" | "down-left" | "up-right" | "up-left";
export type TransitionShape = "circle" | "diamond" | "square" | "hexagon" | "triangle";

export interface TransitionParams {
  /** Which edge / corner the new scene enters from (wipe, slide, blur-slide). */
  direction?: TransitionDirection;
  /** Base-specific magnitude: zoom scale delta, slide distance factor (1 = full frame), blur-slide scale. */
  amount?: number;
  /** Extra blur in px at the transition midpoint (fade / wipe-soft / zoom-blur / blur / shape-soft). */
  blurPx?: number;
  /** Dip / light-leak / stinger colour (CSS colour string). */
  color?: string;
  /** Mask shape (shape base). */
  shape?: TransitionShape;
  /** "in" = mask grows over the entering scene; "out" = mask contracts over the exiting scene. */
  mode?: "in" | "out";
  /** Glitch strength 0..1. */
  intensity?: number;
  /** Glitch slice band layout seed. */
  slices?: number;
  /** Glitch slice offset side. */
  shift?: "left" | "right" | "both";
  /** 3D rotation axis. */
  axis?: "x" | "y" | "z";
  /** 3D rotation in degrees at full progress. */
  angle?: number;
  /** Stinger bars sweeping across (0 = flash only). */
  bars?: number;
}

export type TransitionBase =
  | "fade" | "wipe" | "slide" | "zoom" | "blur"
  | "glitch" | "light" | "rotate" | "shape" | "stinger";

export interface ParamTransitionProps {
  base: TransitionBase;
  params: TransitionParams;
  /** Index signature so the bag satisfies TransitionPresentation's Record<string, unknown> constraint. */
  [key: string]: unknown;
}

const fmt = (n: number): string => String(round3(n));
const pct = (n: number): string => `${fmt(n)}%`;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Slide offset (in % of frame) for a direction at distance `d` (0 = settled). */
function slideOffset(direction: TransitionDirection, d: number): { x: number; y: number } {
  switch (direction) {
    case "left": return { x: -d, y: 0 };
    case "right": return { x: d, y: 0 };
    case "up": return { x: 0, y: d };
    case "down": return { x: 0, y: -d };
    case "down-right": return { x: d, y: -d };
    case "down-left": return { x: -d, y: -d };
    case "up-right": return { x: d, y: d };
    case "up-left": return { x: -d, y: d };
  }
}

/** Wipe clip-path: direction = the edge the new scene enters from; the two scenes tile. */
function wipeClip(direction: TransitionDirection, entering: boolean, p: number): string {
  const q = entering ? 100 * (1 - p) : 100 * p;
  switch (direction) {
    case "left": return entering ? `inset(0 ${pct(q)} 0 0)` : `inset(0 0 0 ${pct(q)})`;
    case "right": return entering ? `inset(0 0 0 ${pct(q)})` : `inset(0 ${pct(q)} 0 0)`;
    case "down": return entering ? `inset(0 0 ${pct(q)} 0)` : `inset(${pct(q)} 0 0 0)`;
    case "up": return entering ? `inset(${pct(q)} 0 0 0)` : `inset(0 0 ${pct(q)} 0)`;
    case "down-right":
      return entering
        ? `polygon(0% 0%, ${pct(100 * p)} 0%, 0% ${pct(100 * p)}%)`
        : `polygon(${pct(100 * p)} 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${pct(100 * p)}%)`;
    case "up-left":
      return entering
        ? `polygon(100% 100%, ${pct(100 * (1 - p))} 100%, 100% ${pct(100 * (1 - p))}%)`
        : `polygon(0% 0%, 100% 0%, 100% ${pct(100 * (1 - p))}%, ${pct(100 * (1 - p))} 100%, 0% 100%)`;
    case "down-left":
      return entering
        ? `polygon(100% 0%, 100% ${pct(100 * p)}, ${pct(100 * (1 - p))} 0%)`
        : `polygon(0% 0%, ${pct(100 * (1 - p))} 0%, 100% ${pct(100 * p)}, 100% 100%, 0% 100%)`;
    case "up-right":
      return entering
        ? `polygon(0% 100%, 0% ${pct(100 * (1 - p))}%, ${pct(100 * p)} 100%)`
        : `polygon(0% 0%, 100% 0%, 100% 100%, ${pct(100 * p)} 100%, 0% ${pct(100 * (1 - p))}%)`;
  }
}

/** Shape-mask clip-path at radius `r` (0..75, in % units around the centre). */
function shapeClip(shape: TransitionShape, r: number): string {
  const c = 50;
  switch (shape) {
    case "circle": return `circle(${pct(r)} at 50% 50%)`;
    case "diamond": return `polygon(50% ${pct(c - r)}, ${pct(c + r)} 50%, 50% ${pct(c + r)}, ${pct(c - r)} 50%)`;
    case "square": return `inset(${pct(c - r)} ${pct(c - r)} ${pct(c - r)} ${pct(c - r)})`;
    case "hexagon":
      return `polygon(50% ${pct(c - r)}, ${pct(c + r * 0.866)} ${pct(c - r * 0.5)}, ${pct(c + r * 0.866)} ${pct(c + r * 0.5)}, 50% ${pct(c + r)}, ${pct(c - r * 0.866)} ${pct(c + r * 0.5)}, ${pct(c - r * 0.866)} ${pct(c - r * 0.5)})`;
    case "triangle": return `polygon(50% ${pct(c - r)}, ${pct(c + r)} ${pct(c + r * 0.7)}, ${pct(c - r)} ${pct(c + r * 0.7)})`;
  }
}

/** The scene wrapper style for one base at progress `p` (0..1). Pure. */
export function paramTransitionStyle(
  base: TransitionBase,
  params: TransitionParams,
  direction: "entering" | "exiting",
  p: number,
): React.CSSProperties {
  const entering = direction === "entering";
  const blur = params.blurPx ?? 0;
  const blurFor = (at: number) => (blur > 0 ? `blur(${fmt(blur * at)}px)` : undefined);
  switch (base) {
    case "fade": {
      const scale = params.amount ?? 1;
      const s = entering ? 1 + (scale - 1) * (1 - p) : 1 + (scale - 1) * p;
      return {
        opacity: entering ? p : 1 - p,
        ...(s !== 1 ? { transform: `scale(${fmt(s)})` } : {}),
        ...(blurFor(entering ? 1 - p : p) ? { filter: blurFor(entering ? 1 - p : p) } : {}),
      };
    }
    case "wipe": {
      return {
        clipPath: wipeClip(params.direction ?? "left", entering, p),
        ...(blurFor(entering ? 1 - p : p) ? { filter: blurFor(entering ? 1 - p : p) } : {}),
      };
    }
    case "slide": {
      const amount = params.amount ?? 1;
      const d = entering ? (1 - p) * 100 * amount : p * 100 * amount;
      // Entering slides in from its direction; exiting slides out the opposite way.
      const off = entering
        ? slideOffset(params.direction ?? "right", d)
        : slideOffset(params.direction ?? "right", -d);
      return { transform: `translate(${fmt(off.x)}%, ${fmt(off.y)}%)` };
    }
    case "zoom": {
      const amount = params.amount ?? 0.15;
      const mode = params.mode ?? "in";
      const scale = mode === "in"
        ? entering ? 1 - amount * (1 - p) : 1 + amount * p
        : entering ? 1 + amount * (1 - p) : 1 - amount * p;
      return {
        opacity: entering ? p : 1 - p,
        transform: `scale(${fmt(scale)})`,
        ...(blurFor(entering ? 1 - p : p) ? { filter: blurFor(entering ? 1 - p : p) } : {}),
      };
    }
    case "blur": {
      const amount = params.amount ?? 0;
      const scale = amount !== 0 ? (entering ? 1 + amount * (1 - p) : 1 + amount * p) : 1;
      const dir = params.direction;
      const off = dir
        ? entering ? slideOffset(dir, (1 - p) * 30) : slideOffset(dir, -p * 30)
        : { x: 0, y: 0 };
      const transform = [
        scale !== 1 ? `scale(${fmt(scale)})` : "",
        off.x !== 0 || off.y !== 0 ? `translate(${fmt(off.x)}%, ${fmt(off.y)}%)` : "",
      ].filter(Boolean).join(" ");
      return {
        opacity: entering ? p : 1 - p,
        filter: `blur(${fmt((params.blurPx ?? 12) * (entering ? 1 - p : p))}px)`,
        ...(transform ? { transform } : {}),
      };
    }
    case "glitch": {
      const intensity = params.intensity ?? 0.5;
      const sign = params.shift === "left" ? -1 : params.shift === "right" ? 1 : entering ? 1 : -1;
      const jitter = sign * intensity * 14 * Math.sin(p * 18 + (entering ? 0 : 2.4));
      return {
        opacity: entering ? p : 1 - p,
        transform: `translateX(${fmt(jitter)}px)`,
        filter: `hue-rotate(${fmt(intensity * 24 * Math.sin(p * 12))}deg)`,
      };
    }
    case "light": {
      const glow = Math.sin(Math.PI * clamp01(p));
      return {
        opacity: entering ? p : 1 - p,
        transform: `scale(${fmt(entering ? 1 + 0.02 * (1 - p) : 1 + 0.02 * p)})`,
        filter: `brightness(${fmt(1 + 0.15 * glow)})`,
      };
    }
    case "rotate": {
      const angle = params.angle ?? 180;
      const axis = params.axis ?? "y";
      const deg = entering ? angle * (p - 1) : angle * p;
      const rotate = axis === "x" ? `rotateX(${fmt(deg)}deg)` : axis === "z" ? `rotate(${fmt(deg)}deg)` : `rotateY(${fmt(deg)}deg)`;
      const scale = entering ? 0.92 + 0.08 * p : 1 - 0.08 * p;
      return {
        opacity: entering ? p : 1 - p,
        transform: `perspective(1200px) ${rotate} scale(${fmt(scale)})`,
      };
    }
    case "shape": {
      const r = 75 * (params.mode === "out" ? (entering ? 0 : 1 - p) : entering ? p : 1 - p);
      // Mode "out": the entering scene is a plain fade (the mask contracts over the exiting scene only).
      if (params.mode === "out" && entering) return { opacity: p };
      return {
        clipPath: shapeClip(params.shape ?? "circle", Math.max(0, r)),
        ...(params.mode === "out" ? { opacity: 1 - p } : {}),
        ...(blurFor(entering ? 1 - p : p) ? { filter: blurFor(entering ? 1 - p : p) } : {}),
      };
    }
    case "stinger": {
      return { opacity: entering ? p : 1 - p };
    }
  }
}

/** Overlay layers a base paints above the scene (dip colour, light leak, glitch slice, stinger). */
function paramOverlay(base: TransitionBase, params: TransitionParams, direction: "entering" | "exiting", p: number, children: React.ReactNode): React.ReactNode {
  const entering = direction === "entering";
  if (base === "fade" && params.color) {
    return <div style={{ position: "absolute", inset: 0, backgroundColor: params.color, opacity: entering ? 1 - p : p, pointerEvents: "none" }} />;
  }
  if (base === "light") {
    const color = params.color ?? "#ffffff";
    return (
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(circle at 30% 20%, ${color}, transparent 70%)`,
          opacity: fmt(Math.sin(Math.PI * clamp01(p)) * 0.9),
        }}
      />
    );
  }
  if (base === "glitch") {
    const intensity = params.intensity ?? 0.5;
    const slices = params.slices ?? 3;
    const top = (17 + slices * 7 + Math.floor(p * 6) * 11) % 70;
    const height = 9 + ((slices * 3) % 6);
    const sign = params.shift === "left" ? -1 : params.shift === "right" ? 1 : entering ? 1 : -1;
    return (
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          clipPath: `inset(${fmt(top)}% 0 ${fmt(100 - top - height)}% 0)`,
          transform: `translateX(${fmt(sign * intensity * 28 * Math.cos(p * 14))}px)`,
        }}
      >
        {children}
      </div>
    );
  }
  if (base === "stinger") {
    const color = params.color ?? "#ffffff";
    const bars = params.bars ?? 1;
    const flash = fmt((1 - Math.abs(2 * p - 1)) * 0.9);
    const barEls = [];
    for (let i = 0; i < bars; i++) {
      barEls.push(
        <div
          key={i}
          style={{
            position: "absolute", top: 0, bottom: 0, width: "10%",
            left: `${fmt(p * 130 - 15 - i * 14)}%`,
            backgroundColor: color, transform: "skewX(-12deg)",
          }}
        />,
      );
    }
    return (
      <>
        <div style={{ position: "absolute", inset: 0, backgroundColor: color, opacity: flash, pointerEvents: "none" }} />
        {barEls}
      </>
    );
  }
  return null;
}

export const ParamPresentation: React.FC<TransitionPresentationComponentProps<ParamTransitionProps>> = ({
  children, presentationDirection, presentationProgress: p, passedProps,
}) => {
  const { base, params } = passedProps;
  return (
    <AbsoluteFill style={paramTransitionStyle(base, params, presentationDirection, p)}>
      {children}
      {paramOverlay(base, params, presentationDirection, p, children)}
    </AbsoluteFill>
  );
};

/** One parameterized presentation: the resolver for a registry entry. */
export const paramPresentation = (base: TransitionBase, params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => ({
  component: ParamPresentation,
  props: { base, params },
});

/** Named factories per base (all delegate to `paramPresentation`). */
export const fadeParamPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("fade", params);
export const wipeParamPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("wipe", params);
export const slideParamPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("slide", params);
export const zoomParamPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("zoom", params);
export const blurParamPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("blur", params);
export const glitchPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("glitch", params);
export const lightLeakPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("light", params);
export const rotatePresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("rotate", params);
export const shapePresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("shape", params);
export const stingerPresentation = (params: TransitionParams = {}): TransitionPresentation<ParamTransitionProps> => paramPresentation("stinger", params);
