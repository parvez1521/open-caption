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
