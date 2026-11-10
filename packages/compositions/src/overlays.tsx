import React from "react";
import { Img } from "remotion";
import type { OverlayItem, OverlayShape } from "@capseasy/shared";
import { SocialOverlayView } from "./social";

/**
 * The app's own overlay shape set: nine simple geometric SVGs drawn for Open Caption (not copied from any
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
    </svg>
  );
};

/** Base box (reference px at a 1080 short edge) a shape overlay occupies before the item's scale. */
export const SHAPE_BASE_PX = 240;
/** Base width (reference px at a 1080 short edge) an image overlay occupies before the item's scale. */
export const IMAGE_BASE_PX = 360;
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
  if (item.kind === "social") {
    // animated Social Media graphic: phases derive from the item's own window (localMs is the time
    // inside its Sequence, supplied by CaptionedVideo from the frame — never a wall clock)
    if (!item.variant) return null;
    return (
      <div style={wrap}>
        <SocialOverlayView item={item} sc={sc} localMs={localMs} assetSrc={assetSrc} />
      </div>
    );
  }
  if (item.kind === "text") {
    return (
      <div
        style={{
          ...wrap,
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
      </div>
    );
  }
  if (item.kind === "image") {
    // device-local bytes: without a resolved URL in this rendering context there is nothing honest
    // to draw (server renders cannot see IndexedDB) — skip rather than paint a broken image.
    if (!assetSrc) return null;
    return (
      <div style={wrap}>
        <Img src={assetSrc} alt={item.assetName ?? ""} style={{ display: "block", width: IMAGE_BASE_PX * sc, height: "auto" }} />
      </div>
    );
  }
  if (!item.shape) return null;
  return (
    <div style={wrap}>
      <OverlayShapeSvg shape={item.shape} color={item.color} size={SHAPE_BASE_PX * sc} />
    </div>
  );
};
