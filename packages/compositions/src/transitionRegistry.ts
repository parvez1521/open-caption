import type { SegmentTransition, TransitionRegistryId } from "@capseasy/shared";
import type { TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
  blurPresentation,
  paramPresentation,
  zoomPresentation,
  type TransitionBase,
  type TransitionParams,
} from "./transitions";

/**
 * The 100 premium segment transitions (2026-11-18): 10 categories × 10 entries,
 * After Effects style, implemented from scratch on the parameterized bases in
 * ./transitions.tsx — no copied presets or assets.
 *
 * Each entry is a distinct parameterization (direction / shape / colour / amount /
 * intensity / bars) of one of 10 bases, so every entry renders visibly differently
 * in preview AND export through the same TransitionSeries path CaptionedVideo
 * already uses. `defaultDurationMs` is the duration the panel applies on tap
 * (schema bounds 100–2000 ms; `setSegmentTransition` still clamps to the
 * neighbouring clips, as before).
 *
 * Stored form: the entry `id` IS the stored `SegmentTransition.type`
 * (see TRANSITION_REGISTRY_IDS in @capseasy/shared) — the 5 legacy base types
 * (fade/wipe/slide/zoom/blur) keep parsing and keep their original
 * presentations, so existing projects are unaffected.
 */

export type TransitionCategoryId =
  | "dissolve" | "wipe" | "slide" | "zoom" | "glitch"
  | "blur" | "light" | "3d" | "shape" | "stinger";

export const TRANSITION_CATEGORIES: { id: TransitionCategoryId; label: string }[] = [
  { id: "dissolve", label: "Dissolve / Fade" },
  { id: "wipe", label: "Wipe" },
  { id: "slide", label: "Slide" },
  { id: "zoom", label: "Zoom" },
  { id: "glitch", label: "Glitch" },
  { id: "blur", label: "Blur" },
  { id: "light", label: "Light" },
  { id: "3d", label: "3D" },
  { id: "shape", label: "Shape" },
  { id: "stinger", label: "Stinger" },
];

export interface TransitionRegistryEntry {
  id: TransitionRegistryId;
  name: string;
  category: TransitionCategoryId;
  base: TransitionBase;
  params: TransitionParams;
  defaultDurationMs: number;
}

const e = (
  id: TransitionRegistryId,
  name: string,
  category: TransitionCategoryId,
  base: TransitionBase,
  params: TransitionParams,
  defaultDurationMs: number,
): TransitionRegistryEntry => ({ id, name, category, base, params, defaultDurationMs });

export const TRANSITION_REGISTRY: TransitionRegistryEntry[] = [
  // ---- Dissolve / Fade (fade base: plain crossfade, colour dips, scale/blur blends) ----
  e("dissolve-cross", "Cross Dissolve", "dissolve", "fade", {}, 300),
  e("dissolve-black", "Fade to Black", "dissolve", "fade", { color: "#000000" }, 500),
  e("dissolve-white", "Fade to White", "dissolve", "fade", { color: "#ffffff" }, 500),
  e("dissolve-ember", "Fade to Ember", "dissolve", "fade", { color: "#FFA946" }, 500),
  e("dissolve-emerald", "Fade to Emerald", "dissolve", "fade", { color: "#34D399" }, 500),
  e("dissolve-zoom", "Dissolve Zoom", "dissolve", "fade", { amount: 1.04 }, 400),
  e("dissolve-blur", "Dissolve Blur", "dissolve", "fade", { blurPx: 6 }, 400),
  e("dissolve-bloom", "Bloom Dissolve", "dissolve", "fade", { amount: 1.08, blurPx: 4 }, 500),
  e("dissolve-ink", "Fade to Ink", "dissolve", "fade", { color: "#141412" }, 500),
  e("dissolve-warm", "Fade to Warm", "dissolve", "fade", { color: "#3a2a12" }, 500),

  // ---- Wipe (wipe base: edge direction + soft feathered variants) ----
  e("wipe-left", "Wipe Left", "wipe", "wipe", { direction: "left" }, 400),
  e("wipe-right", "Wipe Right", "wipe", "wipe", { direction: "right" }, 400),
  e("wipe-up", "Wipe Up", "wipe", "wipe", { direction: "up" }, 400),
  e("wipe-down", "Wipe Down", "wipe", "wipe", { direction: "down" }, 400),
  e("wipe-diag-down", "Wipe Diagonal Down", "wipe", "wipe", { direction: "down-right" }, 500),
  e("wipe-diag-up", "Wipe Diagonal Up", "wipe", "wipe", { direction: "up-left" }, 500),
  e("wipe-left-soft", "Soft Wipe Left", "wipe", "wipe", { direction: "left", blurPx: 4 }, 500),
  e("wipe-right-soft", "Soft Wipe Right", "wipe", "wipe", { direction: "right", blurPx: 4 }, 500),
  e("wipe-up-soft", "Soft Wipe Up", "wipe", "wipe", { direction: "up", blurPx: 4 }, 500),
  e("wipe-down-soft", "Soft Wipe Down", "wipe", "wipe", { direction: "down", blurPx: 4 }, 500),

  // ---- Slide (slide base: direction × full/short distance + diagonals) ----
  e("slide-right", "Slide from Right", "slide", "slide", { direction: "right" }, 400),
  e("slide-left", "Slide from Left", "slide", "slide", { direction: "left" }, 400),
  e("slide-up", "Slide from Bottom", "slide", "slide", { direction: "up" }, 400),
  e("slide-down", "Slide from Top", "slide", "slide", { direction: "down" }, 400),
  e("slide-right-short", "Short Slide Right", "slide", "slide", { direction: "right", amount: 0.6 }, 350),
  e("slide-left-short", "Short Slide Left", "slide", "slide", { direction: "left", amount: 0.6 }, 350),
  e("slide-up-short", "Short Slide Up", "slide", "slide", { direction: "up", amount: 0.6 }, 350),
  e("slide-down-short", "Short Slide Down", "slide", "slide", { direction: "down", amount: 0.6 }, 350),
  e("slide-diag-down", "Slide Diagonal Down", "slide", "slide", { direction: "down-right" }, 450),
  e("slide-diag-up", "Slide Diagonal Up", "slide", "slide", { direction: "up-left" }, 450),

  // ---- Zoom (zoom base: in/out × depth + blur combos) ----
  e("zoom-in-soft", "Zoom In Soft", "zoom", "zoom", { mode: "in", amount: 0.08 }, 350),
  e("zoom-in", "Zoom In", "zoom", "zoom", { mode: "in", amount: 0.15 }, 400),
  e("zoom-in-hard", "Zoom In Hard", "zoom", "zoom", { mode: "in", amount: 0.3 }, 400),
  e("zoom-in-deep", "Zoom In Deep", "zoom", "zoom", { mode: "in", amount: 0.45 }, 500),
  e("zoom-out-soft", "Zoom Out Soft", "zoom", "zoom", { mode: "out", amount: 0.08 }, 350),
  e("zoom-out", "Zoom Out", "zoom", "zoom", { mode: "out", amount: 0.15 }, 400),
  e("zoom-out-hard", "Zoom Out Hard", "zoom", "zoom", { mode: "out", amount: 0.3 }, 400),
  e("zoom-out-deep", "Zoom Out Deep", "zoom", "zoom", { mode: "out", amount: 0.5 }, 500),
  e("zoom-in-blur", "Zoom In Blur", "zoom", "zoom", { mode: "in", amount: 0.2, blurPx: 8 }, 450),
  e("zoom-out-blur", "Zoom Out Blur", "zoom", "zoom", { mode: "out", amount: 0.2, blurPx: 8 }, 450),

  // ---- Glitch (glitch base: intensity × slice count × shift side) ----
  e("glitch-light", "Glitch Light", "glitch", "glitch", { intensity: 0.25, slices: 3, shift: "both" }, 400),
  e("glitch", "Glitch", "glitch", "glitch", { intensity: 0.5, slices: 3, shift: "both" }, 400),
  e("glitch-hard", "Glitch Hard", "glitch", "glitch", { intensity: 0.8, slices: 3, shift: "both" }, 400),
  e("glitch-extreme", "Glitch Extreme", "glitch", "glitch", { intensity: 1, slices: 3, shift: "both" }, 500),
  e("glitch-slices-5", "Glitch Slices 5", "glitch", "glitch", { intensity: 0.5, slices: 5, shift: "both" }, 400),
  e("glitch-slices-8", "Glitch Slices 8", "glitch", "glitch", { intensity: 0.5, slices: 8, shift: "both" }, 400),
  e("glitch-shift-left", "Glitch Shift Left", "glitch", "glitch", { intensity: 0.6, slices: 4, shift: "left" }, 400),
  e("glitch-shift-right", "Glitch Shift Right", "glitch", "glitch", { intensity: 0.6, slices: 4, shift: "right" }, 400),
  e("glitch-hard-left", "Glitch Hard Left", "glitch", "glitch", { intensity: 0.9, slices: 6, shift: "left" }, 450),
  e("glitch-hard-right", "Glitch Hard Right", "glitch", "glitch", { intensity: 0.9, slices: 6, shift: "right" }, 450),

  // ---- Blur (blur base: strength × zoom/slide combos + dip) ----
  e("blur-soft", "Blur Soft", "blur", "blur", { blurPx: 4 }, 350),
  e("blur", "Blur Cross", "blur", "blur", { blurPx: 8 }, 400),
  e("blur-strong", "Blur Strong", "blur", "blur", { blurPx: 20 }, 450),
  e("blur-heavy", "Blur Heavy", "blur", "blur", { blurPx: 32 }, 500),
  e("blur-mist", "Blur Mist", "blur", "blur", { blurPx: 12 }, 600),
  e("blur-zoom-in", "Blur Zoom In", "blur", "blur", { blurPx: 12, amount: -0.06 }, 450),
  e("blur-zoom-out", "Blur Zoom Out", "blur", "blur", { blurPx: 12, amount: 0.06 }, 450),
  e("blur-slide-right", "Blur Slide Right", "blur", "blur", { blurPx: 12, direction: "right" }, 450),
  e("blur-slide-left", "Blur Slide Left", "blur", "blur", { blurPx: 12, direction: "left" }, 450),
  e("blur-dip", "Blur Dip", "blur", "blur", { blurPx: 20, amount: 0.04 }, 500),

  // ---- Light (light base: leak colour) ----
  e("light-white", "Light Leak White", "light", "light", { color: "#ffffff" }, 500),
  e("light-cream", "Light Leak Cream", "light", "light", { color: "#FFF3D6" }, 500),
  e("light-amber", "Light Leak Amber", "light", "light", { color: "#FFC46B" }, 500),
  e("light-orange", "Light Leak Orange", "light", "light", { color: "#FFA946" }, 500),
  e("light-gold", "Light Leak Gold", "light", "light", { color: "#FFD166" }, 500),
  e("light-peach", "Light Leak Peach", "light", "light", { color: "#FFC9A3" }, 500),
  e("light-emerald", "Light Leak Emerald", "light", "light", { color: "#34D399" }, 500),
  e("light-mint", "Light Leak Mint", "light", "light", { color: "#A7F3D0" }, 500),
  e("light-teal", "Light Leak Teal", "light", "light", { color: "#5EEAD4" }, 500),
  e("light-ice", "Light Leak Ice", "light", "light", { color: "#BAE6FD" }, 500),

  // ---- 3D (rotate base: axis × angle) ----
  e("flip-horizontal", "Flip Horizontal", "3d", "rotate", { axis: "y", angle: 180 }, 500),
  e("flip-vertical", "Flip Vertical", "3d", "rotate", { axis: "x", angle: 180 }, 500),
  e("flip-horizontal-soft", "Flip Horizontal Soft", "3d", "rotate", { axis: "y", angle: 90 }, 450),
  e("flip-vertical-soft", "Flip Vertical Soft", "3d", "rotate", { axis: "x", angle: 90 }, 450),
  e("spin-90", "Spin 90", "3d", "rotate", { axis: "z", angle: 90 }, 450),
  e("spin-180", "Spin 180", "3d", "rotate", { axis: "z", angle: 180 }, 500),
  e("spin-360", "Spin 360", "3d", "rotate", { axis: "z", angle: 360 }, 600),
  e("tilt-left", "Tilt Left", "3d", "rotate", { axis: "y", angle: -60 }, 400),
  e("tilt-right", "Tilt Right", "3d", "rotate", { axis: "y", angle: 60 }, 400),
  e("tilt-up", "Tilt Up", "3d", "rotate", { axis: "x", angle: -45 }, 400),

  // ---- Shape (shape base: mask shape × in/out + soft) ----
  e("iris-circle", "Iris Circle", "shape", "shape", { shape: "circle", mode: "in" }, 500),
  e("iris-circle-out", "Iris Circle Out", "shape", "shape", { shape: "circle", mode: "out" }, 500),
  e("iris-diamond", "Iris Diamond", "shape", "shape", { shape: "diamond", mode: "in" }, 500),
  e("iris-diamond-out", "Iris Diamond Out", "shape", "shape", { shape: "diamond", mode: "out" }, 500),
  e("iris-square", "Iris Square", "shape", "shape", { shape: "square", mode: "in" }, 500),
  e("iris-square-out", "Iris Square Out", "shape", "shape", { shape: "square", mode: "out" }, 500),
  e("iris-hexagon", "Iris Hexagon", "shape", "shape", { shape: "hexagon", mode: "in" }, 550),
  e("iris-triangle", "Iris Triangle", "shape", "shape", { shape: "triangle", mode: "in" }, 550),
  e("iris-circle-soft", "Iris Circle Soft", "shape", "shape", { shape: "circle", mode: "in", blurPx: 6 }, 550),
  e("iris-diamond-soft", "Iris Diamond Soft", "shape", "shape", { shape: "diamond", mode: "in", blurPx: 6 }, 550),

  // ---- Stinger (stinger base: flash/bar colour × bar count) ----
  e("stinger-white", "Stinger White", "stinger", "stinger", { color: "#ffffff", bars: 1 }, 400),
  e("stinger-orange", "Stinger Orange", "stinger", "stinger", { color: "#FFA946", bars: 1 }, 400),
  e("stinger-emerald", "Stinger Emerald", "stinger", "stinger", { color: "#34D399", bars: 1 }, 400),
  e("stinger-black", "Stinger Black", "stinger", "stinger", { color: "#141412", bars: 1 }, 400),
  e("stinger-gold", "Stinger Gold", "stinger", "stinger", { color: "#FFD166", bars: 1 }, 400),
  e("stinger-double-orange", "Stinger Double Orange", "stinger", "stinger", { color: "#FFA946", bars: 2 }, 450),
  e("stinger-triple", "Stinger Triple", "stinger", "stinger", { color: "#ffffff", bars: 3 }, 450),
  e("stinger-flash-white", "Flash White", "stinger", "stinger", { color: "#ffffff", bars: 0 }, 300),
  e("stinger-flash-orange", "Flash Orange", "stinger", "stinger", { color: "#FFA946", bars: 0 }, 300),
  e("stinger-cream", "Stinger Cream", "stinger", "stinger", { color: "#FFF3D6", bars: 1 }, 400),
];

export const transitionRegistryEntry = (id: string): TransitionRegistryEntry | undefined =>
  TRANSITION_REGISTRY.find((entry) => entry.id === id);

export const transitionsInCategory = (category: TransitionCategoryId): TransitionRegistryEntry[] =>
  TRANSITION_REGISTRY.filter((entry) => entry.category === category);

/** The presentation for one registry entry (its base + params). */
export function presentationForRegistryEntry(
  entry: TransitionRegistryEntry,
): TransitionPresentation<Record<string, unknown>> {
  return paramPresentation(entry.base, entry.params) as unknown as TransitionPresentation<Record<string, unknown>>;
}

/**
 * The installed presentation for a STORED transition — the one render path
 * CaptionedVideo uses. Registry ids resolve to their parameterized base;
 * the 5 legacy types keep their original presentations (fade/slide/wipe
 * from @remotion/transitions, zoom/blur from ./transitions).
 */
export function presentationForTransition(
  transition: SegmentTransition,
): TransitionPresentation<Record<string, unknown>> {
  const entry = transitionRegistryEntry(transition.type);
  if (entry) return presentationForRegistryEntry(entry);
  switch (transition.type) {
    case "fade":
      return fade() as unknown as TransitionPresentation<Record<string, unknown>>;
    case "slide":
      return slide({ direction: "from-right" }) as unknown as TransitionPresentation<Record<string, unknown>>;
    case "wipe":
      return wipe() as unknown as TransitionPresentation<Record<string, unknown>>;
    case "zoom":
      return zoomPresentation();
    case "blur":
      return blurPresentation();
    default:
      // Unreachable for a schema-validated transition (registry ids resolve
      // above; the 5 legacy types are cased); a loud failure beats a silent cut.
      throw new Error(`Unknown transition type: ${(transition as { type: string }).type}`);
  }
}
