import React from "react";
import { Img } from "remotion";
import type { OverlayFont, OverlayItem, OverlayShape } from "@capseasy/shared";
import { SocialOverlayView } from "./social";

/**
 * The app's own overlay shape set: fifty simple geometric SVGs drawn for Captionit (not copied from any
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
  // Studio stickers batch (2026-11-18): house-drawn sticker art, same SVG family
  { id: "burst", label: "Burst" },
  { id: "bolt", label: "Lightning bolt" },
  { id: "crown", label: "Crown" },
  { id: "flame", label: "Flame" },
  { id: "thumbs-up", label: "Thumbs up" },
  { id: "curved-arrow", label: "Curved arrow" },
  { id: "sun", label: "Sun" },
  { id: "explosion", label: "Explosion" },
  { id: "ribbon", label: "Ribbon" },
  { id: "tag", label: "Tag" },
  { id: "pin", label: "Pin" },
  { id: "target", label: "Target" },
  // Studio stickers expansion (2026-11-18): 17 more house-drawn stickers, same SVG family
  { id: "megaphone", label: "Megaphone" },
  { id: "music-note", label: "Music note" },
  { id: "mic", label: "Microphone" },
  { id: "camera", label: "Camera" },
  { id: "play", label: "Play" },
  { id: "rocket", label: "Rocket" },
  { id: "trophy", label: "Trophy" },
  { id: "gift", label: "Gift" },
  { id: "bell", label: "Bell" },
  { id: "clock", label: "Clock" },
  { id: "gem", label: "Gem" },
  { id: "puzzle", label: "Puzzle piece" },
  { id: "coffee", label: "Coffee" },
  { id: "umbrella", label: "Umbrella" },
  { id: "key", label: "Key" },
  { id: "lock", label: "Lock" },
  { id: "thumbs-down", label: "Thumbs down" },
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
      {shape === "burst" ? (
        <polygon
          fill={color}
          points="96,50 75.1,56.7 89.8,73 68.4,68.4 73,89.8 56.7,75.1 50,96 43.3,75.1 27,89.8 31.6,68.4 10.2,73 24.9,56.7 4,50 24.9,43.3 10.2,27 31.6,31.6 27,10.2 43.3,24.9 50,4 56.7,24.9 73,10.2 68.4,31.6 89.8,27 75.1,43.3"
        />
      ) : null}
      {shape === "bolt" ? <polygon fill={color} points="56,6 24,54 44,54 40,94 76,44 54,44" /> : null}
      {shape === "crown" ? (
        <>
          <polygon fill={color} points="12,74 12,36 30,50 50,22 70,50 88,36 88,74" />
          <rect x={12} y={78} width={76} height={9} rx={2} fill={color} />
        </>
      ) : null}
      {shape === "flame" ? (
        <path
          fill={color}
          d="M50 8 C58 24 72 34 72 54 A22 22 0 1 1 28 54 C28 44 34 40 38 32 C42 38 44 40 46 40 C44 28 46 16 50 8 Z"
        />
      ) : null}
      {shape === "thumbs-up" ? (
        <>
          <rect x={26} y={48} width={48} height={38} rx={10} fill={color} />
          <path fill={color} d="M34 50 L34 34 Q34 22 46 22 Q54 22 52 32 L48 48 Z" />
        </>
      ) : null}
      {shape === "curved-arrow" ? (
        <>
          <path d="M14 78 Q 30 22 74 30" {...strokeProps} strokeWidth={9} />
          <path d="M60 20 L78 30 L62 44" {...strokeProps} strokeWidth={9} />
        </>
      ) : null}
      {shape === "sun" ? (
        <>
          <circle cx={50} cy={50} r={20} fill={color} />
          <path d="M50 8 V20 M50 80 V92 M8 50 H20 M80 50 H92 M20 20 L29 29 M71 71 L80 80 M80 20 L71 29 M29 71 L20 80" {...strokeProps} strokeWidth={7} />
        </>
      ) : null}
      {shape === "explosion" ? (
        <polygon
          fill={color}
          points="94,50 77.7,61.5 81,81 61.5,77.7 50,94 38.5,77.7 19,81 22.3,61.5 6,50 22.3,38.5 19,19 38.5,22.3 50,6 61.5,22.3 81,19 77.7,38.5"
        />
      ) : null}
      {shape === "ribbon" ? <path fill={color} d="M12 24 H88 V56 L50 72 L12 56 Z" /> : null}
      {shape === "tag" ? (
        <>
          <path fill={color} d="M14 14 H56 L88 46 L46 88 L14 56 Z" />
          <circle cx={32} cy={32} r={7} fill="#141412" />
        </>
      ) : null}
      {shape === "pin" ? (
        <>
          <path fill={color} d="M50 6 A26 26 0 0 1 76 32 C76 52 50 92 50 92 C50 92 24 52 24 32 A26 26 0 0 1 50 6 Z" />
          <circle cx={50} cy={32} r={10} fill="#141412" />
        </>
      ) : null}
      {shape === "target" ? (
        <>
          <circle cx={50} cy={50} r={40} fill="none" {...strokeProps} strokeWidth={8} />
          <circle cx={50} cy={50} r={24} fill="none" {...strokeProps} strokeWidth={8} />
          <circle cx={50} cy={50} r={9} fill={color} />
        </>
      ) : null}
      {shape === "megaphone" ? (
        <>
          <polygon fill={color} points="18,40 70,22 70,78 18,60" />
          <rect x={26} y={60} width={13} height={26} rx={3} fill={color} />
          <path d="M80 36 Q88 50 80 64" {...strokeProps} strokeWidth={6} />
        </>
      ) : null}
      {shape === "music-note" ? (
        <>
          <rect x={58} y={12} width={8} height={60} fill={color} />
          <polygon fill={color} points="66,12 88,24 82,46 66,36" />
          <ellipse cx={47} cy={74} rx={15} ry={10} fill={color} transform="rotate(-18 47 74)" />
        </>
      ) : null}
      {shape === "mic" ? (
        <>
          <rect x={36} y={8} width={28} height={46} rx={14} fill={color} />
          <path d="M38 22 H62 M38 31 H62 M38 40 H62" stroke="#141412" strokeWidth={4} strokeLinecap="round" />
          <path d="M50 54 V72" {...strokeProps} />
          <path d="M34 80 H66" {...strokeProps} />
        </>
      ) : null}
      {shape === "camera" ? (
        <>
          <rect x={34} y={24} width={32} height={12} rx={3} fill={color} />
          <rect x={10} y={34} width={80} height={48} rx={8} fill={color} />
          <circle cx={50} cy={58} r={15} fill="#141412" />
          <circle cx={50} cy={58} r={6} fill={color} />
        </>
      ) : null}
      {shape === "play" ? (
        <>
          <circle cx={50} cy={50} r={38} fill="none" {...strokeProps} strokeWidth={8} />
          <polygon fill={color} points="41,30 73,50 41,70" />
        </>
      ) : null}
      {shape === "rocket" ? (
        <>
          <polygon fill={color} points="32,50 14,74 32,66" />
          <polygon fill={color} points="68,50 86,74 68,66" />
          <path fill={color} d="M50 6 C64 20 69 38 69 56 L31 56 C31 38 36 20 50 6 Z" />
          <circle cx={50} cy={38} r={8} fill="#141412" />
          <polygon fill={color} points="41,56 50,80 59,56" />
        </>
      ) : null}
      {shape === "trophy" ? (
        <>
          <path d="M28 18 Q10 18 12 32 Q14 44 28 42" fill="none" {...strokeProps} />
          <path d="M72 18 Q90 18 88 32 Q86 44 72 42" fill="none" {...strokeProps} />
          <path fill={color} d="M28 12 H72 V40 Q72 58 50 58 Q28 58 28 40 Z" />
          <rect x={46} y={58} width={8} height={14} fill={color} />
          <rect x={34} y={72} width={32} height={10} rx={3} fill={color} />
        </>
      ) : null}
      {shape === "gift" ? (
        <>
          <ellipse cx={37} cy={23} rx={13} ry={8} fill={color} transform="rotate(-28 37 23)" />
          <ellipse cx={63} cy={23} rx={13} ry={8} fill={color} transform="rotate(28 63 23)" />
          <rect x={12} y={32} width={76} height={14} rx={4} fill={color} />
          <rect x={16} y={46} width={68} height={38} rx={4} fill={color} />
          <rect x={45} y={32} width={10} height={52} fill="#141412" opacity={0.55} />
        </>
      ) : null}
      {shape === "bell" ? (
        <>
          <circle cx={50} cy={11} r={5} fill={color} />
          <path fill={color} d="M50 16 C66 22 78 36 78 54 V64 H22 V54 C22 36 34 22 50 16 Z" />
          <rect x={20} y={64} width={60} height={6} rx={3} fill={color} />
          <circle cx={50} cy={78} r={7} fill={color} />
        </>
      ) : null}
      {shape === "clock" ? (
        <>
          <circle cx={50} cy={50} r={38} fill="none" {...strokeProps} strokeWidth={8} />
          <path d="M50 50 V28" {...strokeProps} strokeWidth={8} />
          <path d="M50 50 L68 61" {...strokeProps} strokeWidth={8} />
        </>
      ) : null}
      {shape === "gem" ? (
        <>
          <polygon fill={color} points="50,10 86,38 50,90 14,38" />
          <path d="M14 38 H86 M50 10 L36 38 L50 90 M50 10 L64 38 L50 90" stroke="#141412" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.55} />
        </>
      ) : null}
      {shape === "puzzle" ? (
        <>
          <rect x={20} y={28} width={60} height={52} rx={6} fill={color} />
          <circle cx={50} cy={28} r={11} fill={color} />
          <circle cx={80} cy={54} r={11} fill={color} />
        </>
      ) : null}
      {shape === "coffee" ? (
        <>
          <path d="M38 26 Q34 20 38 14 M54 26 Q50 20 54 14" {...strokeProps} strokeWidth={5} />
          <path d="M72 44 Q90 44 90 56 Q90 68 72 68" fill="none" {...strokeProps} />
          <path fill={color} d="M22 34 H72 V70 Q72 82 60 82 H34 Q22 82 22 70 Z" />
        </>
      ) : null}
      {shape === "umbrella" ? (
        <>
          <path fill={color} d="M8 52 A42 42 0 0 1 92 52 Q80 44 70 52 Q60 44 50 52 Q40 44 30 52 Q20 44 8 52 Z" />
          <path d="M50 52 V86 Q50 94 42 94 Q36 94 36 88" fill="none" {...strokeProps} />
        </>
      ) : null}
      {shape === "key" ? (
        <>
          <circle cx={28} cy={32} r={15} fill="none" {...strokeProps} strokeWidth={8} />
          <path d="M40 44 L84 88" {...strokeProps} strokeWidth={9} />
          <path d="M62 62 L72 52 M74 74 L84 64" {...strokeProps} />
        </>
      ) : null}
      {shape === "lock" ? (
        <>
          <path d="M32 44 V34 A18 18 0 0 1 68 34 V44" fill="none" {...strokeProps} strokeWidth={8} />
          <rect x={20} y={44} width={60} height={40} rx={8} fill={color} />
          <circle cx={50} cy={60} r={6} fill="#141412" />
          <rect x={47} y={62} width={6} height={12} fill="#141412" />
        </>
      ) : null}
      {shape === "thumbs-down" ? (
        <>
          <rect x={26} y={14} width={48} height={38} rx={10} fill={color} />
          <path fill={color} d="M34 50 L34 66 Q34 78 46 78 Q54 78 52 68 L48 52 Z" />
        </>
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
 * Text-overlay typefaces (2026-11-18, for the 50-title registry): system font stacks only —
 * no webfont downloads, no licences to clear. Absent `font` = sans, the pre-existing look.
 */
export const OVERLAY_FONT_STACKS: Record<OverlayFont, string> = {
  sans: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
  hand: "'Segoe Script', 'Brush Script MT', 'Comic Sans MS', cursive",
};
export const OVERLAY_FONT_OPTIONS: { id: OverlayFont; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
  { id: "hand", label: "Handwritten" },
];

/**
 * One overlay item, centre-anchored at (x, y) fractions of the canvas. `sc` is the composition's
 * scale factor (short edge / 1080), so sizes follow the same reference-px convention as captions.
 */
export const OverlayView: React.FC<{ item: OverlayItem; sc: number; assetSrc?: string; memberAssetSrcs?: string[]; localMs?: number }> = ({ item, sc, assetSrc, memberAssetSrcs, localMs = 0 }) => {
  const wrap: React.CSSProperties = {
    position: "absolute",
    left: `${item.x * 100}%`,
    top: `${item.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`,
    pointerEvents: "none",
    // whole-item opacity (absent = untouched, so existing items render identically)
    ...(item.opacity !== undefined ? { opacity: item.opacity } : {}),
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
    return frame(<SocialOverlayView item={item} sc={sc} localMs={localMs} assetSrc={assetSrc} memberAssetSrcs={memberAssetSrcs} />);
  }
  if (item.kind === "text") {
    return frame(
      <div
        style={{
          fontFamily: OVERLAY_FONT_STACKS[item.font ?? "sans"],
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
