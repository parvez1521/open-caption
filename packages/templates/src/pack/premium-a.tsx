/**
 * Pack: premium motion looks (After Effects-grade type animation), part A. Wired in through ./index.ts.
 * Layouts: ./premium-a-difference.tsx (difference blend), ./premium-a-track.tsx (title tracking), ./premium-a-slam.tsx
 * (RGB split slam), ./premium-a-cascade.tsx (letter cascade), ./premium-a-slit.tsx (light slit reveal); shared motion
 * maths in ./premium-a-kit.tsx. Sizes are reference px at a 1080 short edge, tuned for 9:16 shorts.
 */
import type { CaptionStyleV2 } from "@capseasy/shared";
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { CascadeLayout } from "./premium-a-cascade";
import { DifferenceLayout } from "./premium-a-difference";
import { NO_EXIT, OWN_ENTRANCE, premiumCaps } from "./premium-a-kit";
import { SlamLayout } from "./premium-a-slam";
import { SlitLayout } from "./premium-a-slit";
import { TrackInLayout } from "./premium-a-track";

const solid = (color: string) => ({ type: "solid" as const, color });
const NO_STROKE = { enabled: false, width: 0, color: "#000000" };
const NO_GLOW = { enabled: false, color: "#FFFFFF", radius: 12, intensity: 0.6 };
/** a soft dark bed: invisible on black, keeps light type readable on bright footage */
const BED: CaptionStyleV2["shadows"] = [
  { x: 0, y: 0, blur: 3, color: "rgba(0,0,0,0.55)" },
  { x: 0, y: 3, blur: 16, color: "rgba(0,0,0,0.5)" },
];

export const PREMIUM_A_TEMPLATES: TemplateDefinition[] = [
  {
    id: "pack_difference", name: "Difference", description: "Heavy caps in difference blend that invert the video behind them; a difference bar sweeps in and rides the spoken word", layout: "pack-difference",
    defaults: {
      fontId: "Inter", fontWeight: 800, fontSize: 118, casing: "upper", letterSpacing: -4.5, lineHeight: 1.1, maxWidth: 0.86, position: { x: 0.5, y: 0.6 },
      fill: solid("#FFFFFF"), stroke: NO_STROKE, shadows: [], glow: NO_GLOW,
      active: { effect: "box", color: "#FFFFFF", boxColor: "#FFFFFF", scale: 1, boxRadius: 0 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps({ alignment: true, activeEffects: ["box", "none"] }), fonts: ["Inter"], Page: DifferenceLayout,
  },
  {
    id: "pack_track_in", name: "Cinematic Track-In", description: "Thin wide-tracked caps condense out of a blur like a film title, the key word in a heavier weight, then a glint of light passes", layout: "pack-track-in",
    defaults: {
      fontId: "Jost", fontWeight: 300, fontSize: 112, casing: "upper", letterSpacing: 17, lineHeight: 1.18, maxWidth: 0.9, position: { x: 0.5, y: 0.62 },
      fill: solid("#EFEAE1"), stroke: NO_STROKE, shadows: [...BED, { x: 0, y: 0, blur: 30, color: "rgba(0,0,0,0.28)" }], glow: NO_GLOW,
      hero: { fontId: "Jost", fontWeight: 700, scale: 1.12, fill: solid("#FFFFFF"), rotate: 0 },
      active: { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps({ hero: true }), heroDrawn: true, fonts: ["Jost"], Page: TrackInLayout,
  },
  {
    id: "pack_rgb_slam", name: "RGB Split Slam", description: "Heavy condensed caps slam in from 140 % with red and cyan channels converging on the hit and a short camera shake", layout: "pack-rgb-slam",
    defaults: {
      fontId: "Anton", fontWeight: 400, fontSize: 132, casing: "upper", letterSpacing: 1.5, lineHeight: 1.0, maxWidth: 0.88, position: { x: 0.5, y: 0.6 },
      fill: solid("#FFFFFF"), stroke: NO_STROKE, shadows: [{ x: 0, y: 6, blur: 18, color: "rgba(0,0,0,0.45)" }, { x: 0, y: 0, blur: 4, color: "rgba(0,0,0,0.35)" }], glow: NO_GLOW,
      active: { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps(), fonts: ["Anton"], Page: SlamLayout,
  },
  {
    id: "pack_letter_cascade", name: "Letter Cascade", description: "Letters pour in one frame apart on a soft spring, stretched and blurred by their speed; the spoken word lifts and brightens", layout: "pack-letter-cascade",
    defaults: {
      fontId: "Outfit", fontWeight: 800, fontSize: 132, casing: "upper", letterSpacing: 0, lineHeight: 1.04, maxWidth: 0.88, position: { x: 0.5, y: 0.62 },
      fill: solid("#E6E6EA"), stroke: NO_STROKE, shadows: BED, glow: NO_GLOW,
      active: { effect: "color", color: "#FFFFFF", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps({ activeEffects: ["color", "none"] }), fonts: ["Outfit"], Page: CascadeLayout,
  },
  {
    id: "pack_light_slit", name: "Light Slit Reveal", description: "A slit of light sweeps across and uncovers each line, alternating sides card to card", layout: "pack-light-slit",
    defaults: {
      fontId: "Bodoni Moda", fontWeight: 700, fontSize: 165, casing: "none", letterSpacing: -1.5, lineHeight: 1.02, maxWidth: 0.88, position: { x: 0.5, y: 0.62 },
      fill: solid("#F3EEE5"), stroke: NO_STROKE, shadows: [{ x: 0, y: 0, blur: 3, color: "rgba(0,0,0,0.6)" }, { x: 0, y: 3, blur: 16, color: "rgba(0,0,0,0.55)" }], glow: NO_GLOW,
      active: { effect: "color", color: "#FFFFFF", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT, templateOptions: { lightColor: "#9FD4FF" },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: premiumCaps({ activeEffects: ["color", "none"] }), fonts: ["Bodoni Moda"], Page: SlitLayout,
  },
];

const look = (l: Omit<LookSeed, "category" | "style"> & { style?: LookSeed["style"] }): LookSeed => ({ category: "Premium", style: {}, ...l });

export const PREMIUM_A_LOOKS: LookSeed[] = [
  look({ id: "difference_invert", name: "Difference", description: "Bold caps that invert the video behind them, with a difference bar that sweeps in and rides the spoken word", templateId: "pack_difference",
    tags: ["Difference blend", "Invert bar", "Letter rise"], settings: { maxWordsPerCard: 3 } }),
  look({ id: "cinematic_track_in", name: "Cinematic Track-In", description: "Thin wide caps condense out of a blur like a film title, the key word heavier, then a glint of light crosses", templateId: "pack_track_in",
    tags: ["Tracking", "Title sequence", "Light glint"], settings: { maxWordsPerCard: 3 } }),
  look({ id: "rgb_split_slam", name: "RGB Split Slam", description: "Condensed caps slam in with red and cyan channels converging on the hit, a short shake, and a re-split kick on each spoken word", templateId: "pack_rgb_slam",
    tags: ["Slam", "RGB split", "Shake"], settings: { maxWordsPerCard: 3 } }),
  look({ id: "letter_cascade", name: "Letter Cascade", description: "Letters pour in one frame apart on a soft spring with speed blur, and fall away letter by letter", templateId: "pack_letter_cascade",
    tags: ["Per letter", "Spring", "Motion blur"], settings: { maxWordsPerCard: 3 } }),
  look({ id: "light_slit_reveal", name: "Light Slit Reveal", description: "A slit of light sweeps across and uncovers each line, from alternate sides card to card", templateId: "pack_light_slit",
    tags: ["Light sweep", "Mask reveal", "Serif"], settings: { maxWordsPerCard: 3 } }),
];
