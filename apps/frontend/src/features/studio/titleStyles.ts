import { OVERLAY_ENTER_ANIMS, OVERLAY_EXIT_ANIMS } from "@capseasy/compositions";
import type { OverlayFont, OverlayItem } from "@capseasy/shared";
import { makeTextOverlay } from "./panels/overlayItems";

/**
 * The 50-title registry (2026-11-18): OUR OWN recreations of premium Envato-style
 * title looks — bold kinetic type, minimal lower-thirds, elegant serif, playful pops.
 * Style reference only: no Envato file, asset, font or copy is used here; every value
 * below is our own. Each entry is a preset for a text overlay: it renders through the
 * shared Remotion composition (OverlayView) in preview AND MP4 export, exactly like a
 * hand-made text overlay, so a title never needs a second render path.
 *
 * Palette is the brand palette only (#FFFFFF, #FFFFEB, #34D399, #FFA946). Fonts are the
 * system stacks in OVERLAY_FONT_STACKS (no downloads, no licences). Animations are the
 * box-applicable lists only — letter-level presets stay caption-only.
 */
export type TitleCategory = "Kinetic Big" | "Lower Third" | "Minimal" | "Bold Punch" | "Elegant" | "Fun Pop";

export type TitleEnterAnim = (typeof OVERLAY_ENTER_ANIMS)[number]["id"];
export type TitleExitAnim = (typeof OVERLAY_EXIT_ANIMS)[number]["id"];

export interface TitleStyle {
  id: string;
  name: string;
  category: TitleCategory;
  /** the default overlay text placed on the timeline */
  text: string;
  font: OverlayFont;
  fontSize: number;
  color: "#FFFFFF" | "#FFFFEB" | "#34D399" | "#FFA946";
  /** centre of the canvas as a fraction; y 0.5 centre, 0.82 lower-third, 0.18 top title */
  x: 0.5;
  y: 0.5 | 0.82 | 0.18;
  enterAnim: TitleEnterAnim;
  exitAnim: TitleExitAnim;
  enterSpeed: number;
  exitSpeed: number;
  durationMs: number;
}

/** System font stacks for the four overlay fonts — single source is
 *  OVERLAY_FONT_STACKS in packages/compositions/src/overlays.tsx (re-exported
 *  through the package index); aliased here so the registry + panel share it. */
export { OVERLAY_FONT_STACKS as TITLE_FONT_STACKS } from "@capseasy/compositions";

/** Categories in registry order — the panel groups titles in this order. */
export const TITLE_CATEGORIES: TitleCategory[] = [
  "Kinetic Big",
  "Lower Third",
  "Minimal",
  "Bold Punch",
  "Elegant",
  "Fun Pop",
];

export const TITLE_STYLES: TitleStyle[] = [
  // Kinetic Big (8) — large centre type that arrives with motion.
  { id: "big-impact", name: "Big Impact", category: "Kinetic Big", text: "BIG IDEA", font: "sans", fontSize: 110, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "pop", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "kinetic-rise", name: "Kinetic Rise", category: "Kinetic Big", text: "Your title", font: "sans", fontSize: 96, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "rise", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "kinetic-slide", name: "Kinetic Slide", category: "Kinetic Big", text: "WATCH THIS", font: "sans", fontSize: 88, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "slide-left", exitAnim: "slide-up", enterSpeed: 1.25, exitSpeed: 1, durationMs: 3500 },
  { id: "kinetic-zoom", name: "Kinetic Zoom", category: "Kinetic Big", text: "THE MOMENT", font: "sans", fontSize: 100, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "zoom", exitAnim: "zoom-out", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "kinetic-drop", name: "Kinetic Drop", category: "Kinetic Big", text: "NEW VIDEO", font: "sans", fontSize: 84, color: "#34D399", x: 0.5, y: 0.5, enterAnim: "drop", exitAnim: "fall", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "kinetic-wave", name: "Kinetic Wave", category: "Kinetic Big", text: "Let's go", font: "sans", fontSize: 80, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "wave", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 3500 },
  { id: "kinetic-flip", name: "Kinetic Flip", category: "Kinetic Big", text: "TOP STORY", font: "sans", fontSize: 92, color: "#FFA946", x: 0.5, y: 0.5, enterAnim: "flip", exitAnim: "blur-out", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "kinetic-top", name: "Kinetic Top", category: "Kinetic Big", text: "BREAKING", font: "sans", fontSize: 76, color: "#FFFFFF", x: 0.5, y: 0.18, enterAnim: "slide-right", exitAnim: "fade", enterSpeed: 1.25, exitSpeed: 1, durationMs: 4000 },

  // Lower Third (8) — name / role lines that sit low on the frame.
  { id: "lower-name", name: "Lower Name", category: "Lower Third", text: "YOUR NAME", font: "sans", fontSize: 40, color: "#FFFFFF", x: 0.5, y: 0.82, enterAnim: "slide-left", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "lower-role", name: "Lower Role", category: "Lower Third", text: "Your Name", font: "sans", fontSize: 36, color: "#FFFFEB", x: 0.5, y: 0.82, enterAnim: "rise", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "lower-credit", name: "Lower Credit", category: "Lower Third", text: "HOSTED BY YOU", font: "sans", fontSize: 32, color: "#FFFFFF", x: 0.5, y: 0.82, enterAnim: "fade", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4500 },
  { id: "lower-guest", name: "Lower Guest", category: "Lower Third", text: "Guest Name", font: "serif", fontSize: 38, color: "#FFFFEB", x: 0.5, y: 0.82, enterAnim: "slide-right", exitAnim: "slide-up", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "lower-topic", name: "Lower Topic", category: "Lower Third", text: "TODAY'S TOPIC", font: "mono", fontSize: 32, color: "#34D399", x: 0.5, y: 0.82, enterAnim: "slide-left", exitAnim: "fade", enterSpeed: 1.25, exitSpeed: 1, durationMs: 4000 },
  { id: "lower-location", name: "Lower Location", category: "Lower Third", text: "Your City", font: "sans", fontSize: 34, color: "#FFFFFF", x: 0.5, y: 0.82, enterAnim: "rise", exitAnim: "fall", enterSpeed: 1, exitSpeed: 1, durationMs: 3500 },
  { id: "lower-quote", name: "Lower Quote", category: "Lower Third", text: "Your quote here", font: "serif", fontSize: 32, color: "#FFFFEB", x: 0.5, y: 0.82, enterAnim: "blur-in", exitAnim: "blur-out", enterSpeed: 1, exitSpeed: 1, durationMs: 4500 },
  { id: "lower-accent", name: "Lower Accent", category: "Lower Third", text: "YOUR NAME", font: "sans", fontSize: 44, color: "#FFA946", x: 0.5, y: 0.82, enterAnim: "pop", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },

  // Minimal (8) — quiet centre type, small sizes, gentle entrances.
  { id: "minimal-quiet", name: "Minimal Quiet", category: "Minimal", text: "Your title", font: "sans", fontSize: 48, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "minimal-small", name: "Minimal Small", category: "Minimal", text: "a small title", font: "sans", fontSize: 32, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "rise", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "minimal-serif", name: "Minimal Serif", category: "Minimal", text: "The Story", font: "serif", fontSize: 56, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "blur-out", enterSpeed: 1, exitSpeed: 1, durationMs: 4500 },
  { id: "minimal-mono", name: "Minimal Mono", category: "Minimal", text: "chapter one", font: "mono", fontSize: 36, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "minimal-centre", name: "Minimal Centre", category: "Minimal", text: "Simply said", font: "sans", fontSize: 44, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "blur-in", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "minimal-top", name: "Minimal Top", category: "Minimal", text: "Your title", font: "sans", fontSize: 40, color: "#FFFFFF", x: 0.5, y: 0.18, enterAnim: "rise", exitAnim: "slide-up", enterSpeed: 1, exitSpeed: 1, durationMs: 3500 },
  { id: "minimal-soft", name: "Minimal Soft", category: "Minimal", text: "Take your time", font: "serif", fontSize: 40, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "fade", enterSpeed: 0.75, exitSpeed: 0.75, durationMs: 5000 },
  { id: "minimal-line", name: "Minimal Line", category: "Minimal", text: "ONE WORD", font: "sans", fontSize: 52, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "slide-left", exitAnim: "slide-up", enterSpeed: 1, exitSpeed: 1, durationMs: 3500 },

  // Bold Punch (8) — one or two huge words, fast and loud.
  { id: "punch-one", name: "Punch One", category: "Bold Punch", text: "YES.", font: "sans", fontSize: 120, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "pop", exitAnim: "zoom-out", enterSpeed: 1, exitSpeed: 1, durationMs: 2500 },
  { id: "punch-stop", name: "Punch Stop", category: "Bold Punch", text: "STOP", font: "sans", fontSize: 110, color: "#FFA946", x: 0.5, y: 0.5, enterAnim: "elastic", exitAnim: "fall", enterSpeed: 1, exitSpeed: 1, durationMs: 2500 },
  { id: "punch-now", name: "Punch Now", category: "Bold Punch", text: "NOW", font: "sans", fontSize: 100, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "zoom", exitAnim: "fade", enterSpeed: 1.25, exitSpeed: 1, durationMs: 2500 },
  { id: "punch-free", name: "Punch Free", category: "Bold Punch", text: "FREE", font: "sans", fontSize: 96, color: "#34D399", x: 0.5, y: 0.5, enterAnim: "pop", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "punch-wow", name: "Punch Wow", category: "Bold Punch", text: "WOW", font: "sans", fontSize: 120, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "elastic", exitAnim: "zoom-out", enterSpeed: 1, exitSpeed: 1, durationMs: 2000 },
  { id: "punch-go", name: "Punch Go", category: "Bold Punch", text: "GO", font: "sans", fontSize: 110, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "slide-right", exitAnim: "slide-up", enterSpeed: 1, exitSpeed: 1, durationMs: 2500 },
  { id: "punch-new", name: "Punch New", category: "Bold Punch", text: "NEW", font: "sans", fontSize: 104, color: "#FFA946", x: 0.5, y: 0.5, enterAnim: "drop", exitAnim: "fall", enterSpeed: 1, exitSpeed: 1, durationMs: 2500 },
  { id: "punch-top", name: "Punch Top", category: "Bold Punch", text: "LOOK", font: "sans", fontSize: 88, color: "#FFFFFF", x: 0.5, y: 0.18, enterAnim: "pop", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },

  // Elegant (9) — serif-led, slow fades, cream and white.
  { id: "elegant-title", name: "Elegant Title", category: "Elegant", text: "Your Title", font: "serif", fontSize: 64, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "fade", enterSpeed: 0.75, exitSpeed: 0.75, durationMs: 5000 },
  { id: "elegant-script", name: "Elegant Script", category: "Elegant", text: "Your story", font: "hand", fontSize: 56, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "blur-in", exitAnim: "blur-out", enterSpeed: 0.75, exitSpeed: 0.75, durationMs: 5000 },
  { id: "elegant-serif", name: "Elegant Serif", category: "Elegant", text: "The Beginning", font: "serif", fontSize: 56, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "rise", exitAnim: "fade", enterSpeed: 0.75, exitSpeed: 1, durationMs: 5000 },
  { id: "elegant-quote", name: "Elegant Quote", category: "Elegant", text: "A quiet moment", font: "serif", fontSize: 44, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "fade", enterSpeed: 0.75, exitSpeed: 0.75, durationMs: 6000 },
  { id: "elegant-name", name: "Elegant Name", category: "Elegant", text: "Your Name", font: "serif", fontSize: 48, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "slide-up", enterSpeed: 1, exitSpeed: 1, durationMs: 4500 },
  { id: "elegant-top", name: "Elegant Top", category: "Elegant", text: "Welcome", font: "serif", fontSize: 52, color: "#FFFFFF", x: 0.5, y: 0.18, enterAnim: "rise", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "elegant-cream", name: "Elegant Cream", category: "Elegant", text: "Golden Hour", font: "serif", fontSize: 60, color: "#FFA946", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "blur-out", enterSpeed: 0.75, exitSpeed: 0.75, durationMs: 5000 },
  { id: "elegant-mono", name: "Elegant Mono", category: "Elegant", text: "EST. TODAY", font: "mono", fontSize: 36, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "blur-in", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
  { id: "elegant-close", name: "Elegant Close", category: "Elegant", text: "The End", font: "serif", fontSize: 64, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "fade", exitAnim: "fade", enterSpeed: 0.75, exitSpeed: 0.75, durationMs: 5000 },

  // Fun Pop (9) — bright accents, springy entrances.
  { id: "fun-pop", name: "Fun Pop", category: "Fun Pop", text: "Let's go!", font: "hand", fontSize: 72, color: "#FFA946", x: 0.5, y: 0.5, enterAnim: "pop", exitAnim: "zoom-out", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "fun-bounce", name: "Fun Bounce", category: "Fun Pop", text: "Boom!", font: "sans", fontSize: 96, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "elastic", exitAnim: "fall", enterSpeed: 1, exitSpeed: 1, durationMs: 2500 },
  { id: "fun-wiggle", name: "Fun Wiggle", category: "Fun Pop", text: "Woohoo", font: "hand", fontSize: 64, color: "#34D399", x: 0.5, y: 0.5, enterAnim: "wave", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "fun-bright", name: "Fun Bright", category: "Fun Pop", text: "FUN TIMES", font: "sans", fontSize: 80, color: "#FFA946", x: 0.5, y: 0.5, enterAnim: "pop", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 3000 },
  { id: "fun-mono", name: "Fun Mono", category: "Fun Pop", text: "HELLO!", font: "mono", fontSize: 64, color: "#34D399", x: 0.5, y: 0.5, enterAnim: "slide-left", exitAnim: "slide-up", enterSpeed: 1.25, exitSpeed: 1, durationMs: 3000 },
  { id: "fun-cheer", name: "Fun Cheer", category: "Fun Pop", text: "You did it", font: "hand", fontSize: 60, color: "#FFFFFF", x: 0.5, y: 0.5, enterAnim: "elastic", exitAnim: "blur-out", enterSpeed: 1, exitSpeed: 1, durationMs: 3500 },
  { id: "fun-splash", name: "Fun Splash", category: "Fun Pop", text: "SPLASH", font: "sans", fontSize: 88, color: "#34D399", x: 0.5, y: 0.5, enterAnim: "zoom", exitAnim: "zoom-out", enterSpeed: 1, exitSpeed: 1, durationMs: 2500 },
  { id: "fun-top", name: "Fun Top", category: "Fun Pop", text: "PARTY TIME", font: "sans", fontSize: 72, color: "#FFA946", x: 0.5, y: 0.18, enterAnim: "slide-right", exitAnim: "fade", enterSpeed: 1.25, exitSpeed: 1, durationMs: 3000 },
  { id: "fun-soft", name: "Fun Soft", category: "Fun Pop", text: "Good vibes", font: "hand", fontSize: 56, color: "#FFFFEB", x: 0.5, y: 0.5, enterAnim: "wave", exitAnim: "fade", enterSpeed: 1, exitSpeed: 1, durationMs: 4000 },
];

/**
 * Build a title as a timed text overlay at the playhead: start from makeTextOverlay
 * (same id/timing/position defaults as a hand-added text overlay), then override the
 * preset fields. The window is the style's own duration, clamped to the video length
 * exactly like makeSocialOverlay clamps its 4 s window.
 */
export function makeTitleOverlay(style: TitleStyle, playheadMs: number, durationMs: number): OverlayItem {
  const base = makeTextOverlay(playheadMs, durationMs);
  const startMs = base.startMs;
  let endMs = startMs + style.durationMs;
  if (durationMs > startMs + 400) endMs = Math.min(endMs, durationMs);
  if (endMs <= startMs) endMs = startMs + 400;
  return {
    ...base,
    text: style.text,
    font: style.font,
    fontSize: style.fontSize,
    color: style.color,
    x: style.x,
    y: style.y,
    enterAnim: style.enterAnim,
    enterSpeed: style.enterSpeed,
    exitAnim: style.exitAnim,
    exitSpeed: style.exitSpeed,
    endMs,
  };
}
