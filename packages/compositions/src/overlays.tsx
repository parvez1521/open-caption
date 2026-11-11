import React from "react";
import { Img } from "remotion";
import type { OverlayItem, OverlayShape } from "@capseasy/shared";
import { SocialOverlayView } from "./social";

/**
 * The app's own overlay shape set: twenty-one simple geometric SVGs drawn for Open Caption (not copied from any
 * icon library). One definition serves the composition render (preview + MP4 export) and the studio's
 * Elements gallery, so what the gallery shows is exactly what renders. No blend modes anywhere: the
 * in-browser renderer ignores mix-blend-mode, which would make preview and export diverge.
 */
export const OVERLAY_SHAPE_META: { id: OverlayShape; label: string }[] = [
  { id: "ring", label: "Ring" },
  { id: "circle", label: "Circle" },
  { id: "arrow", label: "Arrow" },
  { id: "check", label: "Check" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "rectangle", label: "Rectangle" },
  { id: "scribble-underline", label: "Scribble underline" },
  { id: "triangle", label: "Triangle" },
  { id: "rounded-rectangle", label: "Rounded rectangle" },
  { id: "ellipse", label: "Ellipse" },
  { id: "diamond", label: "Diamond" },
  { id: "chevron", label: "Chevron" },
  { id: "double-arrow", label: "Double arrow" },
  { id: "speech-bubble", label: "Speech bubble" },
  { id: "underline-bar", label: "Underline bar" },
  { id: "corner-brackets", label: "Corner brackets" },
  { id: "progress-bar", label: "Progress bar" },
  { id: "plus", label: "Plus" },
  { id: "cross", label: "Cross" },
  { id: "badge", label: "Badge" },
];

const STROKE = 7;

/** One shape, drawn in a 100x100 box; `color` paints both stroke and fill (currentColor-style). */
export const OverlayShapeSvg: React.FC<{ shape: OverlayShape; color: string; size: number }> = ({ shape, color, size }) => {
  const strokeProps = { stroke: color, strokeWidth: STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
      {shape === "ring" ? <ellipse cx={50} cy={50} rx={38} ry={29} {...strokeProps} /> : null}
      {shape === "circle" ? <circle cx={50} cy={50} r={31} fill={color} /> : null}
      {shape === "arrow" ? (
        <>
          <path d="M14 50 H78" {...strokeProps} />
          <path d="M60 31 L80 50 L60 69" {...strokeProps} />
        </>
      ) : null}
      {shape === "check" ? <path d="M21 53 L41 73 L79 28" {...strokeProps} /> : null}
      {shape === "star" ? (
        <polygon
          fill={color}
          points="50,10 61.8,38.2 91.2,39.1 67.9,57.3 76.4,85.9 50,69.5 23.6,85.9 32.1,57.3 8.8,39.1 38.2,38.2"
        />
      ) : null}
      {shape === "heart" ? (
        <path
          fill={color}
          d="M50 84 C26 66 14 52 14 37 C14 24 23 15 35 15 C43 15 48 19 50 25 C52 19 57 15 65 15 C77 15 86 24 86 37 C86 52 74 66 50 84 Z"
        />
      ) : null}
      {shape === "rectangle" ? <rect x={16} y={27} width={68} height={46} rx={3} {...strokeProps} /> : null}
      {shape === "scribble-underline" ? <path d="M7 66 Q 14 54, 22 66 T 38 66 T 54 66 T 70 66 T 86 66 T 97 66" {...strokeProps} strokeWidth={6} /> : null}
      {shape === "triangle" ? <polygon points="50,17 86,80 14,80" {...strokeProps} /> : null}
      {shape === "rounded-rectangle" ? <rect x={14} y={25} width={72} height={50} rx={14} fill={color} /> : null}
      {shape === "ellipse" ? <ellipse cx={50} cy={50} rx={40} ry={27} fill={color} /> : null}
      {shape === "diamond" ? <polygon points="50,10 88,50 50,90 12,50" fill={color} /> : null}
      {shape === "chevron" ? <path d="M32 18 L66 50 L32 82" {...strokeProps} strokeWidth={10} /> : null}
      {shape === "double-arrow" ? (
        <>
          <path d="M22 18 L52 50 L22 82" {...strokeProps} strokeWidth={9} />
          <path d="M50 18 L80 50 L50 82" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "speech-bubble" ? (
        <>
          <path d="M18 14 H82 A10 10 0 0 1 92 24 V62 A10 10 0 0 1 82 72 H56 L34 90 V72 H18 A10 10 0 0 1 8 62 V24 A10 10 0 0 1 18 14 Z" fill={color} />
          <circle cx={31} cy={43} r={5.5} fill="#141412" opacity={0.55} />
          <circle cx={50} cy={43} r={5.5} fill="#141412" opacity={0.55} />
          <circle cx={69} cy={43} r={5.5} fill="#141412" opacity={0.55} />
        </>
      ) : null}
      {shape === "underline-bar" ? <rect x={8} y={44} width={84} height={12} rx={6} fill={color} /> : null}
      {shape === "corner-brackets" ? (
        <>
          <path d="M28 8 H12 A4 4 0 0 0 8 12 V28" {...strokeProps} strokeWidth={8} />
          <path d="M72 8 H88 A4 4 0 0 1 92 12 V28" {...strokeProps} strokeWidth={8} />
          <path d="M28 92 H12 A4 4 0 0 1 8 88 V72" {...strokeProps} strokeWidth={8} />
          <path d="M72 92 H88 A4 4 0 0 0 92 88 V72" {...strokeProps} strokeWidth={8} />
        </>
      ) : null}
      {shape === "progress-bar" ? (
        <>
          <rect x={8} y={40} width={84} height={20} rx={10} {...strokeProps} strokeWidth={5} />
          <rect x={14} y={46} width={52} height={8} rx={4} fill={color} />
        </>
      ) : null}
      {shape === "plus" ? <path d="M50 16 V84 M16 50 H84" {...strokeProps} strokeWidth={11} /> : null}
      {shape === "cross" ? <path d="M26 26 L74 74 M74 26 L26 74" {...strokeProps} strokeWidth={11} /> : null}
      {shape === "badge" ? (
        <polygon
          fill={color}
          points="50,4 58,14 70,9 74,21 87,20 87,33 97,38 91,49 97,60 87,65 87,78 74,77 70,89 58,84 50,94 42,84 30,89 26,77 13,78 13,65 3,60 9,49 3,38 13,33 13,20 26,21 30,9 42,14"
        />
      ) : null}
    </svg>
  );
};

/** Base box (reference px at a 1080 short edge) a shape overlay occupies before the item's scale. */
export const SHAPE_BASE_PX = 240;
/** Base width (reference px at a 1080 short edge) an image overlay occupies before the item's scale. */
export const IMAGE_BASE_PX = 360;

/**
 * Package 3 item I.5 — overlay entrance/exit animation, in the SAME motion system as the
 * captions' In/Out: the preset ids come from the shared ENTRANCES / EXITS vocabulary and
 * speed is the same multiplier semantics (base duration ÷ speed). Only the box-applicable
 * presets are offered for overlays — an overlay is one box, so the letter-level presets
 * (typewriter, scramble, the letter animators…) stay caption-only. The math mirrors the
 * caption entranceStyle/exitStyle formulas for these types (same distances, same tails),
 * applied to a wrapper div so it composes with the item's own position/rotation/scale
 * and with a social graphic's internal animation.
 */
export const OVERLAY_ENTER_ANIMS = [
  { id: "none", label: "No entrance" },
  { id: "fade", label: "Fade in" },
  { id: "rise", label: "Rise" },
  { id: "drop", label: "Drop" },
  { id: "pop", label: "Pop" },
  { id: "zoom", label: "Zoom" },
  { id: "slide-left", label: "Slide from left" },
  { id: "slide-right", label: "Slide from right" },
  { id: "blur-in", label: "Blur in" },
  { id: "flip", label: "Flip" },
  { id: "elastic", label: "Elastic" },
  { id: "wave", label: "Wave" },
] as const;
export const OVERLAY_EXIT_ANIMS = [
  { id: "none", label: "No exit" },
  { id: "fade", label: "Fade out" },
  { id: "fall", label: "Fall" },
  { id: "zoom-out", label: "Zoom out" },
  { id: "blur-out", label: "Blur out" },
  { id: "slide-up", label: "Slide up" },
] as const;

const OVERLAY_ENTER_BASE_MS = 320;
const OVERLAY_EXIT_BASE_MS = 240;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
const springOut = (t: number) => {
  const c = 1.2;
  const u = t - 1;
  return Math.min(1, Math.max(0, 1 + (c + 1) * u * u * u + c * u * u));
};

/** The wrapper style for an overlay item at `localMs` inside its own window ({} = settled / no animation). */
export function overlayAnimStyle(item: OverlayItem, localMs: number): React.CSSProperties {
  const windowMs = Math.max(1, item.endMs - item.startMs);
  const enter = item.enterAnim;
  if (enter && enter !== "none") {
    const dur = Math.min(windowMs, OVERLAY_ENTER_BASE_MS / (item.enterSpeed ?? 1));
    if (localMs < dur) {
      const p = easeOutCubic(Math.max(0, localMs) / dur);
      switch (enter) {
        case "fade": return { opacity: p };
        case "rise": return { opacity: p, transform: `translateY(${((1 - p) * 26).toFixed(2)}px)` };
        case "drop": return { opacity: p, transform: `translateY(${(-(1 - p) * 26).toFixed(2)}px)` };
        case "pop": return { opacity: Math.min(1, p * 1.6), transform: `scale(${(0.6 + 0.4 * springOut(Math.max(0, localMs) / dur)).toFixed(3)})` };
        case "zoom": return { opacity: p, transform: `scale(${(0.8 + 0.2 * p).toFixed(3)})` };
        case "slide-left": return { opacity: p, transform: `translateX(${(-(1 - p) * 40).toFixed(2)}px)` };
        case "slide-right": return { opacity: p, transform: `translateX(${((1 - p) * 40).toFixed(2)}px)` };
        case "blur-in": return { opacity: p, filter: `blur(${((1 - p) * 8).toFixed(2)}px)` };
        case "flip": return { opacity: p, transform: `perspective(600px) rotateX(${((1 - p) * -70).toFixed(2)}deg)` };
        case "elastic": return { opacity: Math.min(1, p * 1.6), transform: `scale(${(0.55 + 0.45 * springOut(Math.max(0, localMs) / dur)).toFixed(3)})` };
        case "wave": return { opacity: p, transform: `translateY(${((1 - p) * 18).toFixed(2)}px) rotate(${((1 - p) * -3).toFixed(2)}deg)` };
        default: return { opacity: p };
      }
    }
  }
  const exit = item.exitAnim;
  if (exit && exit !== "none") {
    const dur = Math.min(windowMs, OVERLAY_EXIT_BASE_MS / (item.exitSpeed ?? 1));
    const remaining = windowMs - localMs;
    if (remaining < dur && remaining >= 0) {
      const q = easeInCubic(1 - remaining / dur);
      switch (exit) {
        case "fade": return { opacity: 1 - q };
        case "fall": return { opacity: 1 - q, transform: `translateY(${(q * 26).toFixed(2)}px)` };
        case "zoom-out": return { opacity: 1 - q, transform: `scale(${(1 - 0.2 * q).toFixed(3)})` };
        case "blur-out": return { opacity: 1 - q, filter: `blur(${(q * 8).toFixed(2)}px)` };
        case "slide-up": return { opacity: 1 - q, transform: `translateY(${(-q * 26).toFixed(2)}px)` };
        default: return { opacity: 1 - q };
      }
    }
  }
  return {};
}
/** Default text size (reference px at a 1080 short edge) when an item carries no fontSize. */
export const TEXT_DEFAULT_FONT_PX = 64;

/**
 * One overlay item, centre-anchored at (x, y) fractions of the canvas. `sc` is the composition's
 * scale factor (short edge / 1080), so sizes follow the same reference-px convention as captions.
 */
export const OverlayView: React.FC<{ item: OverlayItem; sc: number; assetSrc?: string; localMs?: number }> = ({ item, sc, assetSrc, localMs = 0 }) => {
  const wrap: React.CSSProperties = {
    position: "absolute",
    left: `${item.x * 100}%`,
    top: `${item.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`,
    pointerEvents: "none",
  };
  // Package 3 item I.5: entrance/exit animation wraps the content in one extra div, and
  // ONLY when the item carries an animation — items without one render exactly as before.
  const animated = Boolean((item.enterAnim && item.enterAnim !== "none") || (item.exitAnim && item.exitAnim !== "none"));
  const frame = (node: React.ReactNode) => (
    // text keeps its canvas-relative max-width on the positioned frame, as before the split
    <div style={item.kind === "text" ? { ...wrap, maxWidth: "86%" } : wrap}>{animated ? <div style={overlayAnimStyle(item, localMs)}>{node}</div> : node}</div>
  );
  if (item.kind === "social") {
    // animated Social Media graphic: phases derive from the item's own window (localMs is the time
    // inside its Sequence, supplied by CaptionedVideo from the frame — never a wall clock)
    if (!item.variant) return null;
    return frame(<SocialOverlayView item={item} sc={sc} localMs={localMs} assetSrc={assetSrc} />);
  }
  if (item.kind === "text") {
    return frame(
      <div
        style={{
          fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
          fontWeight: 700,
          fontSize: (item.fontSize ?? TEXT_DEFAULT_FONT_PX) * sc,
          lineHeight: 1.15,
          color: item.color,
          textAlign: "center",
          whiteSpace: "pre-wrap",
          maxWidth: "86%",
        }}
      >
        {item.text ?? ""}
      </div>,
    );
  }
  if (item.kind === "image") {
    // device-local bytes: without a resolved URL in this rendering context there is nothing honest
    // to draw (server renders cannot see IndexedDB) — skip rather than paint a broken image.
    if (!assetSrc) return null;
    return frame(<Img src={assetSrc} alt={item.assetName ?? ""} style={{ display: "block", width: IMAGE_BASE_PX * sc, height: "auto" }} />);
  }
  if (!item.shape) return null;
  return frame(<OverlayShapeSvg shape={item.shape} color={item.color} size={SHAPE_BASE_PX * sc} />);
};
