/**
 * Pack: trending creator styles (keyword colours, label stacks, strips, card-to-card motion). Wired in through ./index.ts.
 * Each look re-creates a caption style catalogued in docs/research/competitors-captions.md (section 2, the current v2
 * definitions) from its published parameters. Sizes: the catalogue's px are at its editor preview scale, 2.25× smaller
 * than its render size at a 1080 short edge (our reference), so X = 2.25; distances are kept per em.
 * Layouts: ./trending-keywords.tsx, ./trending-labels.tsx, ./trending-motion.tsx; shared plumbing: ./trending-kit.tsx.
 */
import type { CaptionStyleV2, Page } from "@capseasy/shared";
import type { LookSeed } from "../looks/new";
import type { EmotionModifier, TemplateDefinition } from "../types";
import { trendCaps } from "./trending-kit";
import { GoldBevelLayout, LightBoldLayout, TriKeywordsLayout } from "./trending-keywords";
import { CreamStripLayout, LabelBoxLayout, LabelStackLayout } from "./trending-labels";
import { TiltRiseLayout, WhipCardsLayout } from "./trending-motion";

type Shadow = CaptionStyleV2["shadows"][number];
/** catalogue px → our reference px */
const X = 2.25;
const em = (v: number, size: number) => Math.round(v * size * 100) / 100;

const CUT = { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" } as const;
const NO_EXIT = { type: "none", durationMs: 200 } as const;
const accent = (color: string) => ({ effect: "none" as const, color, scale: 1, boxRadius: 12 });
const solidFill = (color: string) => ({ type: "solid" as const, color });
const NO_STROKE = { enabled: false, width: 0, color: "#000000" };

/** the highlight colour is a label/box colour in these looks: emotion never recolours it */
const KEEP_ACCENT: Partial<Record<Page["emotion"], EmotionModifier>> = {
  excited: { accent: undefined }, sad: { accent: undefined }, angry: { accent: undefined }, surprised: { accent: undefined }, question: { accent: undefined }, hype: { accent: undefined },
};

// ---------------------------------------------------------------- sizes and shadows (catalogue em → reference px)

const H1 = 30 * X; // 67.5
const H4 = 58 * X; // 130.5
const DAN = 36 * X; // 81
const KEN = 28 * X; // 63
const ADR = 40 * X; // 90
const BEN = 42 * X; // 94.5
const WIL = 38 * X; // 85.5
const IMA = 30 * X; // 67.5

/** shadow L: five soft black halos, 0.15 → 0.55 em */
const HALO: Shadow[] = [0.15, 0.25, 0.35, 0.45, 0.55].map((r) => ({ x: 0, y: 0, blur: em(r, H1), color: "#000000" }));
/** the bevel stack's dark layers (the 1 px white edge and the bloom in the fill colour are drawn by the layout) */
const BEVEL: Shadow[] = [
  { x: 0, y: em(0.02299, H4), blur: em(0.01533, H4), color: "#000000" },
  { x: em(0.00766, H4), y: em(0.00766, H4), blur: em(0.00766, H4), color: "#000000" },
  { x: 0, y: 0, blur: em(0.04598, H4), color: "#000000" },
  { x: 0, y: 0, blur: em(0.12261, H4), color: "#000000" },
  { x: 0, y: 0, blur: em(0.16858, H4), color: "#000000" },
];
/** a soft dark bed: invisible on black, keeps thin white text readable on bright footage */
const LEGIBLE: Shadow[] = [{ x: 0, y: 0, blur: 4, color: "rgba(0,0,0,0.5)" }, { x: 0, y: 2, blur: 14, color: "rgba(0,0,0,0.55)" }];
/** shadow M: a tight black halo plus a soft drop */
const SHADOW_M = (size: number): Shadow[] => [{ x: 0, y: 0, blur: em(0.08466, size), color: "#000000" }, { x: 0, y: em(0.07407, size), blur: em(0.10582, size), color: "#000000" }];

export const TRENDING_TEMPLATES: TemplateDefinition[] = [
  {
    id: "pack_tri_keywords", name: "Three-Colour Keywords", description: "Heavy caps in a soft dark halo; about one word in three is a keyword in one of three colours", layout: "pack-tri-keywords",
    defaults: {
      fontId: "Montserrat", fontWeight: 900, fontSize: H1, casing: "upper", lineHeight: 1.2, position: { x: 0.5, y: 0.5 }, fill: solidFill("#FFFFFF"), stroke: NO_STROKE, shadows: HALO,
      entrance: CUT, exit: NO_EXIT, active: accent("#2BF82A"), templateOptions: { accents: ["#FDFA14", "#F01916"] },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 },
    capabilities: trendCaps({ hero: true }), fonts: ["Montserrat"], Page: TriKeywordsLayout,
  },
  {
    id: "pack_gold_bevel", name: "Gold Bevel Caps", description: "Condensed caps in a shaded gold fill with a bevel shadow; a lone word is set larger", layout: "pack-gold-bevel",
    defaults: {
      fontId: "Anton", fontWeight: 400, fontSize: H4, casing: "upper", lineHeight: 1.15, letterSpacing: -em(0.00766, H4), position: { x: 0.5, y: 0.54 }, fill: solidFill("#FFC00B"),
      stroke: { enabled: true, width: em(0.00766, H4), color: "#000000" }, shadows: BEVEL, entrance: CUT, exit: NO_EXIT, active: accent("#FFFFFF"),
    },
    settingsDefaults: { maxWordsPerCard: 2, maxLines: 2, maxCharsPerLine: 15 },
    capabilities: trendCaps({ hero: true }), fonts: ["Anton"], fixedWordsPerCard: 2, Page: GoldBevelLayout,
  },
  {
    id: "pack_label_box", name: "Solid Label Card", description: "Dark caps on one solid box behind the whole card; every third card bounces its key word alone", layout: "pack-label-box",
    defaults: {
      fontId: "Anton", fontWeight: 400, fontSize: DAN, casing: "upper", lineHeight: 1, position: { x: 0.5, y: 0.5 }, fill: solidFill("#1C1E1D"), stroke: NO_STROKE, shadows: [],
      entrance: CUT, exit: NO_EXIT, active: accent("#FDFD00"), templateOptions: { boxColors: ["#FFFFFF", "#13FD00"], boxRadius: 0.15, soloEvery: 3, soloScale: 1.5 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1, maxCharsPerLine: 12 },
    capabilities: trendCaps({ hero: true }), fonts: ["Anton"], emotionMap: KEEP_ACCENT, Page: LabelBoxLayout,
  },
  {
    id: "pack_label_stack", name: "Tilted Label Stack", description: "Each line on its own label, dark then bright; the bright one tilted and tucked under", layout: "pack-label-stack",
    defaults: {
      fontId: "Montserrat", fontWeight: 700, fontSize: KEN, casing: "none", lineHeight: 1.5, letterSpacing: -em(0.03, KEN), position: { x: 0.5, y: 0.57 }, fill: solidFill("#FFFFFF"),
      stroke: NO_STROKE, shadows: [], entrance: CUT, exit: NO_EXIT, active: accent("#13FD00"),
      templateOptions: { labelColor: "#2A2A2E", labelEdge: "rgba(255,255,255,0.22)", accentTextColor: "#000000", labelRadius: 0.24, tilt: -2, soloEvery: 3, soloScale: 1.2 },
    },
    settingsDefaults: { maxWordsPerCard: 4, maxLines: 2, maxCharsPerLine: 8 },
    capabilities: trendCaps({ hero: true }), fonts: ["Montserrat"], fixedWordsPerCard: 4, emotionMap: KEEP_ACCENT, Page: LabelStackLayout,
  },
  {
    id: "pack_cream_strips", name: "Cream Strip Lines", description: "Left-aligned lines on cream strips, the spoken word in red; every third card rocks one red word", layout: "pack-cream-strips",
    defaults: {
      fontId: "Inter", fontWeight: 700, fontSize: ADR, casing: "none", lineHeight: 1.15, letterSpacing: -em(0.01, ADR), maxWidth: 0.7, position: { x: 0.5, y: 0.5 }, fill: solidFill("#000000"),
      stroke: NO_STROKE, shadows: [], entrance: CUT, exit: NO_EXIT, active: accent("#F64F46"),
      templateOptions: { stripColor: "#FFF5E3", stripRadius: 0, rockDeg: 10, soloEvery: 3, soloScale: 1.3 },
    },
    settingsDefaults: { maxWordsPerCard: 4, maxLines: 2, maxCharsPerLine: 8 },
    capabilities: trendCaps({ hero: true }), fonts: ["Inter"], fixedWordsPerCard: 4, emotionMap: KEEP_ACCENT, Page: CreamStripLayout,
  },
  {
    id: "pack_tilt_rise", name: "Tilted Rising Rows", description: "Tight rows rise with their own tilt, overshoot and settle; a solo key word writes itself on and floats", layout: "pack-tilt-rise",
    defaults: {
      fontId: "Inter", fontWeight: 700, fontSize: BEN, casing: "none", lineHeight: 0.9, letterSpacing: -em(0.05, BEN), position: { x: 0.5, y: 0.62 }, fill: solidFill("#FFFFFF"),
      stroke: NO_STROKE, shadows: SHADOW_M(BEN), entrance: CUT, exit: NO_EXIT, active: accent("#FF0000"), templateOptions: { soloEvery: 3, soloScale: 1.5 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 },
    capabilities: trendCaps({ hero: true }), fonts: ["Inter"], Page: TiltRiseLayout,
  },
  {
    id: "pack_whip_cards", name: "Whip-In Cards", description: "Bold caps whipping in out of a blur, a different way each card, each card pushed out by the next", layout: "pack-whip-cards",
    defaults: {
      fontId: "Inter", fontWeight: 800, fontSize: WIL, casing: "upper", lineHeight: 1, letterSpacing: em(0.02, WIL), position: { x: 0.5, y: 0.57 }, fill: solidFill("#FFFFFF"),
      stroke: NO_STROKE, shadows: [{ x: 0, y: em(0.05848, WIL), blur: em(0.17544, WIL), color: "#000000" }], entrance: CUT, exit: NO_EXIT, active: accent("#FFFFFF"),
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 },
    capabilities: trendCaps({}), fonts: ["Inter"], Page: WhipCardsLayout,
  },
  {
    id: "pack_light_bold", name: "Light to Bold", description: "Light sentence-case lines; the line being spoken jumps to bold, key words bold italic", layout: "pack-light-bold",
    defaults: {
      fontId: "Montserrat", fontWeight: 300, fontSize: IMA, casing: "none", lineHeight: 1.1, position: { x: 0.5, y: 0.59 }, fill: solidFill("#FFFFFF"), stroke: NO_STROKE,
      // the catalogue's tiny #333 drop, plus a soft dark bed (ours) so the light weight still reads on bright footage
      shadows: [{ x: 0, y: em(0.01481, IMA), blur: em(0.05926, IMA), color: "#333333" }, ...LEGIBLE], entrance: CUT, exit: NO_EXIT, active: accent("#FFFFFF"),
      hero: { scale: 1.3, rotate: 0 }, templateOptions: { boldWeight: 700 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 },
    capabilities: trendCaps({ hero: true }), heroDrawn: true, fonts: ["Montserrat"], Page: LightBoldLayout,
  },
];

const look = (l: Omit<LookSeed, "category" | "style"> & { style?: LookSeed["style"] }): LookSeed => ({ category: "Trending", style: {}, ...l });

export const TRENDING_LOOKS: LookSeed[] = [
  look({ id: "tri_color_keywords", name: "Three-Colour Keywords", description: "Heavy white caps in a soft dark halo; key words light up green, yellow or red in turn", templateId: "pack_tri_keywords", tags: ["Caps", "Keyword colours", "Halo"],
    settings: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 } }),
  look({ id: "gold_bevel_caps", name: "Gold Bevel Caps", description: "Big condensed caps in shaded gold with a bevel edge; a lone word grows 1.4×", templateId: "pack_gold_bevel", tags: ["Gold", "Bevel", "Two words"],
    settings: { maxWordsPerCard: 2, maxLines: 2, maxCharsPerLine: 15 } }),
  look({ id: "solid_label_card", name: "Solid Label Card", description: "Dark caps on a solid yellow card that pops in; every third card bounces its key word on a wiggling box", templateId: "pack_label_box", tags: ["Box", "Solo word", "Caps"],
    settings: { maxWordsPerCard: 3, maxLines: 1, maxCharsPerLine: 12 } }),
  look({ id: "tilted_label_stack", name: "Tilted Label Stack", description: "Two lines on stacked labels, black then green; the green one tilted and tucked under, both bouncing in", templateId: "pack_label_stack", tags: ["Labels", "Tilt", "Elastic"],
    settings: { maxWordsPerCard: 4, maxLines: 2, maxCharsPerLine: 8 } }),
  look({ id: "cream_strip_lines", name: "Cream Strip Lines", description: "Left-aligned lines on cream strips with the spoken word in red; every third card rocks one word on red", templateId: "pack_cream_strips", tags: ["Strips", "Red word", "Left aligned"],
    settings: { maxWordsPerCard: 4, maxLines: 2, maxCharsPerLine: 8 } }),
  look({ id: "tilted_rising_rows", name: "Tilted Rising Rows", description: "Tight rows rise tilted, overshoot and settle; every third card writes one word on and lets it float", templateId: "pack_tilt_rise", tags: ["Tilt", "Rise", "Floating word"],
    settings: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 } }),
  look({ id: "whip_in_cards", name: "Whip-In Cards", description: "Bold caps whip in out of a blur, a new direction every card, each one pushed out by the next", templateId: "pack_whip_cards", tags: ["Blur whip", "Push exit", "Caps"],
    settings: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 } }),
  look({ id: "light_to_bold", name: "Light to Bold", description: "Thin sentence-case lines that turn bold while they're spoken; key words in bold italic", templateId: "pack_light_bold", tags: ["Weight jump", "Italic key word"],
    settings: { maxWordsPerCard: 3, maxLines: 2, maxCharsPerLine: 8 } }),
];
