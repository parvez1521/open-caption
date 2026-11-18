/**
 * AI Edit visual styles (Studio revision, Task 9): the style chooser's
 * options, each with a house-made preview.
 *
 * Previews are flat SVG shapes drawn from the style's own descriptor —
 * never copied artwork, never a stock image, never a gradient (the design
 * ban list). The palette is the standing one: dark #141412, emerald
 * #34D399, orange #FFA946, cream #FFFFEB.
 */

export type AiEditPreviewShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; rx?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number };

export interface AiEditStyle {
  id: string;
  label: string;
  hint: string;
  /** Appended to the planner's prompt for each visual, so the plan matches the chosen look. */
  promptSuffix: string;
  preview: { bg: string; shapes: AiEditPreviewShape[] };
}

const DARK = "#141412";
const EMERALD = "#34D399";
const ORANGE = "#FFA946";
const CREAM = "#FFFFEB";

export const AI_EDIT_STYLES: readonly AiEditStyle[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    hint: "Wide frames, warm light, film feel",
    promptSuffix: "cinematic lighting, wide framing, warm tones, film look",
    preview: {
      bg: DARK,
      shapes: [
        { kind: "rect", x: 0, y: 0, w: 96, h: 8, fill: "#000000" },
        { kind: "rect", x: 0, y: 46, w: 96, h: 8, fill: "#000000" },
        { kind: "circle", cx: 68, cy: 24, r: 9, fill: ORANGE },
        { kind: "rect", x: 8, y: 34, w: 80, h: 2, fill: EMERALD },
        { kind: "rect", x: 8, y: 14, w: 30, h: 3, fill: CREAM },
      ],
    },
  },
  {
    id: "clean",
    label: "Clean",
    hint: "Minimal, lots of space, one accent",
    promptSuffix: "minimal composition, lots of empty space, one accent colour, clean and simple",
    preview: {
      bg: DARK,
      shapes: [
        { kind: "line", x1: 10, y1: 27, x2: 58, y2: 27, stroke: EMERALD, width: 3 },
        { kind: "rect", x: 10, y: 34, w: 34, h: 3, fill: CREAM },
        { kind: "circle", cx: 78, cy: 27, r: 7, fill: ORANGE },
      ],
    },
  },
  {
    id: "bold",
    label: "Bold",
    hint: "Big shapes, high contrast, loud",
    promptSuffix: "bold graphic shapes, high contrast, strong colours, striking composition",
    preview: {
      bg: DARK,
      shapes: [
        { kind: "rect", x: 8, y: 8, w: 38, h: 38, fill: ORANGE },
        { kind: "rect", x: 14, y: 14, w: 26, h: 4, fill: DARK },
        { kind: "rect", x: 14, y: 22, w: 18, h: 4, fill: DARK },
        { kind: "circle", cx: 72, cy: 36, r: 12, fill: EMERALD },
      ],
    },
  },
  {
    id: "warm",
    label: "Warm",
    hint: "Soft light, friendly, storybook",
    promptSuffix: "soft warm light, friendly and gentle mood, warm colours",
    preview: {
      bg: DARK,
      shapes: [
        { kind: "circle", cx: 48, cy: 22, r: 12, fill: ORANGE },
        { kind: "rect", x: 10, y: 38, w: 76, h: 3, fill: EMERALD },
        { kind: "circle", cx: 22, cy: 16, r: 4, fill: CREAM },
        { kind: "circle", cx: 74, cy: 14, r: 3, fill: CREAM },
      ],
    },
  },
];

export const DEFAULT_AI_EDIT_STYLE_ID = "cinematic";

/** The style for an id, falling back to the default for unknown/stale ids. */
export function aiEditStyleById(id: string | null | undefined): AiEditStyle {
  return AI_EDIT_STYLES.find((s) => s.id === id) ?? AI_EDIT_STYLES[0]!;
}
