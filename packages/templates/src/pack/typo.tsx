/** Pack: Typographic compositions. Templates (layouts) and gallery looks; wired in through ./index.ts. */
import type { CaptionStyleV2 } from "@capseasy/shared";
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { DisciplineLayout, KineticSlotsLayout, MasterLayout, PodcastLayout, SimpleTypoLayout } from "./typo-a";
import { CleanLayout, ImpactLayout, PunchLayout, RedWipeLayout, ScatterLayout } from "./typo-b";
import { GildedLayout, PerfectLayout, SpotlightLayout, StoryLayout } from "./typo-c";
import { typoCaps } from "./typo-kit";

/** these compositions animate every word themselves: no card entrance, no spoken-word effect */
const OWN: Partial<CaptionStyleV2> = {
  entrance: { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" },
  exit: { type: "none", durationMs: 120 },
};
const accent = (color: string): CaptionStyleV2["active"] => ({ effect: "none", color, scale: 1, boxRadius: 12 });
const solid = (color: string) => ({ type: "solid" as const, color });
const shadow = (x: number, y: number, blur: number, color: string) => ({ x, y, blur, color });
const CENTRE = { x: 0.5, y: 0.5 };
/** legibility on bright video: a crisp contact shadow plus a soft ambient one (added where the original has none) */
const CONTACT = shadow(0, 2, 4, "rgba(0,0,0,0.5)");
const AMBIENT = shadow(0, 4, 16, "rgba(0,0,0,0.4)");

export const TYPO_TEMPLATES: TemplateDefinition[] = [
  {
    id: "pack_master", name: "Banded Big Word", layout: "pack-master",
    description: "Seeded compositions with one big word filled with curved cream/blue bands",
    defaults: {
      ...OWN, fontId: "Inter", fontWeight: 900, fontSize: 56, casing: "lower", lineHeight: 1, position: CENTRE,
      fill: solid("#f3f4f6"), active: accent("#6a9bd1"), hero: { scale: 2, rotate: 0 }, shadows: [CONTACT, AMBIENT],
      templateOptions: { bandColor: "#f1ebd9" },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), heroDrawn: true, fonts: ["Inter"], Page: MasterLayout,
  },
  {
    id: "pack_typo_simple", name: "Rotating Type Layouts", layout: "pack-typo-simple",
    description: "Eight typographic layouts take turns card by card, with a cyan accent",
    defaults: {
      ...OWN, fontId: "Archivo Black", fontWeight: 900, fontSize: 72, casing: "none", lineHeight: 0.95, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#00c7fc"), shadows: [CONTACT, AMBIENT],
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({}), fonts: ["Archivo Black"], Page: SimpleTypoLayout,
  },
  {
    id: "pack_podcast", name: "Ghost Stack", layout: "pack-podcast",
    description: "Caps stacked bottom-left at mixed sizes; ghosted words light up as they're spoken",
    defaults: {
      ...OWN, fontId: "Montserrat", fontWeight: 700, fontSize: 60, casing: "upper", lineHeight: 1.02, align: "left", position: { x: 0.5, y: 0.78 },
      fill: solid("#FFFFFF"), active: accent("#FFFFFF"), shadows: [CONTACT, AMBIENT], templateOptions: { ghostOpacity: 0.32, rowChars: 11 },
    },
    settingsDefaults: { maxWordsPerCard: 6, maxLines: 3 },
    capabilities: typoCaps({ hero: false, alignment: true, weight: true }), fixedWordsPerCard: 6, fonts: ["Montserrat"], Page: PodcastLayout,
  },
  {
    id: "pack_discipline", name: "Huge Word + Script", layout: "pack-discipline",
    description: "A tiny line over one huge word, a red script word overlapping it",
    defaults: {
      ...OWN, fontId: "Montserrat", fontWeight: 800, fontSize: 40, casing: "lower", lineHeight: 0.85, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#E50012"), hero: { scale: 3, rotate: 0 }, shadows: [shadow(0, 1, 3, "rgba(0,0,0,0.9)"), AMBIENT], templateOptions: { scriptFont: "Alex Brush", scriptScale: 0.85 },
    },
    settingsDefaults: { maxWordsPerCard: 4, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), heroDrawn: true, fixedWordsPerCard: 4, fonts: ["Montserrat", "Alex Brush"], Page: DisciplineLayout,
  },
  {
    id: "pack_kinetic_slots", name: "Six-Slot Kinetic", layout: "pack-kinetic-slots",
    description: "Six slots of mixed weights; a yellow caps word slides in under an extruded metal hero",
    defaults: {
      ...OWN, fontId: "Montserrat", fontWeight: 700, fontSize: 76, casing: "none", lineHeight: 1, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#FFF76B"), hero: { scale: 11 / 7.5, fontWeight: 900, fill: solid("#00C7FC"), rotate: 0 },
      shadows: [shadow(1, 1, 2, "rgba(0,0,0,0.5)"), AMBIENT],
    },
    settingsDefaults: { maxWordsPerCard: 6, maxLines: 3 },
    capabilities: typoCaps({}), heroDrawn: true, fixedWordsPerCard: 6, fonts: ["Montserrat"], Page: KineticSlotsLayout,
  },
  {
    id: "pack_impact", name: "Neon Caps Line", layout: "pack-impact",
    description: "A tall glowing neon caps line over a soft white line",
    defaults: {
      ...OWN, fontId: "Oswald", fontWeight: 700, fontSize: 96, casing: "upper", lineHeight: 1.12, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#E60000"), shadows: [CONTACT], templateOptions: { font2: "Montserrat", weight2: 700 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), fonts: ["Oswald", "Montserrat"], Page: ImpactLayout,
  },
  {
    id: "pack_clean", name: "Big/Small Split", layout: "pack-clean",
    description: "Big and small lines in four rotating arrangements, soft black glow",
    defaults: {
      ...OWN, fontId: "Inter", fontWeight: 800, fontSize: 96, casing: "none", lineHeight: 1, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#FFFFFF"), shadows: [shadow(0, 3, 10, "rgba(0,0,0,0.55)"), shadow(0, 0, 28, "rgba(0,0,0,0.35)")], templateOptions: { weight2: 700 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ hero: false, weight: true }), fonts: ["Inter"], Page: CleanLayout,
  },
  {
    id: "pack_red_wipe", name: "Red Block Wipe", layout: "pack-red-wipe",
    description: "Bold lines over an italic serif phrase on a red block that wipes in",
    defaults: {
      ...OWN, fontId: "Montserrat", fontWeight: 700, fontSize: 80, casing: "none", lineHeight: 1.05, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#D11100"), shadows: [shadow(1, 1, 3, "rgba(0,0,0,0.6)"), AMBIENT], templateOptions: { serifFont: "Playfair Display", serifWeight: 700 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), fonts: ["Montserrat", "Playfair Display"], Page: RedWipeLayout,
  },
  {
    id: "pack_punch", name: "Punch Lines", layout: "pack-punch",
    description: "One loud yellow caps line between quiet italic serif lines, each sliding in from its own side",
    defaults: {
      ...OWN, fontId: "Oswald", fontWeight: 700, fontSize: 104, casing: "upper", lineHeight: 1, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#FFED00"), stroke: { enabled: true, width: 2, color: "#000000" }, shadows: [shadow(4, 4, 10, "rgba(0,0,0,0.8)")],
      templateOptions: { quietFont: "Merriweather", quietWeight: 700, quietCasing: "lower", punchExit: true },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), fonts: ["Oswald", "Merriweather"], Page: PunchLayout,
  },
  {
    id: "pack_scatter", name: "Scatter Fly-In", layout: "pack-scatter",
    description: "Words fly in from scattered offsets and land as small lines over a huge hero word",
    defaults: {
      ...OWN, fontId: "Anton", fontWeight: 400, fontSize: 65, casing: "upper", lineHeight: 0.92, position: CENTRE,
      fill: solid("#ffffff"), active: accent("#fde047"), hero: { scale: 2, fill: solid("#fef08a"), rotate: 0 },
    },
    settingsDefaults: { maxWordsPerCard: 5, maxLines: 3 },
    capabilities: typoCaps({}), heroDrawn: true, fixedWordsPerCard: 5, fonts: ["Anton"], Page: ScatterLayout,
  },
  {
    id: "pack_perfect", name: "Longest Word Big", layout: "pack-perfect",
    description: "Two lines: the longest word huge, the rest small and tight against it",
    defaults: {
      ...OWN, fontId: "Montserrat", fontWeight: 900, fontSize: 44, casing: "lower", lineHeight: 0.88, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#FFFFFF"), hero: { scale: 2.4, rotate: 0 }, shadows: [CONTACT, AMBIENT], templateOptions: { smallWeight: 800 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), heroDrawn: true, fonts: ["Montserrat"], Page: PerfectLayout,
  },
  {
    id: "pack_spotlight", name: "Spotlight Hero", layout: "pack-spotlight",
    description: "One giant hero word, small rows above and below, words running up its sides",
    defaults: {
      ...OWN, fontId: "Montserrat", fontWeight: 900, fontSize: 44, casing: "title", lineHeight: 0.85, position: CENTRE,
      fill: solid("#ffffff"), active: accent("#8af7ff"), hero: { scale: 2.55, rotate: 0 }, shadows: [CONTACT, AMBIENT], templateOptions: { smallWeight: 800, smallScale: 0.66 },
    },
    settingsDefaults: { maxWordsPerCard: 5, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), heroDrawn: true, fixedWordsPerCard: 5, fonts: ["Montserrat"], Page: SpotlightLayout,
  },
  {
    id: "pack_gilded", name: "Gilded Headline", layout: "pack-gilded",
    description: "A huge gilded caps headline word up top, the line built word by word below in Bodoni",
    defaults: {
      ...OWN, fontId: "Bodoni Moda", fontWeight: 900, fontSize: 52, casing: "none", lineHeight: 1.1, position: CENTRE,
      fill: solid("#F6EEA4"), active: accent("#F6EEA4"), hero: { fontId: "Bodoni Moda", fontWeight: 900, scale: 2.2, casing: "upper", rotate: 0 },
      shadows: [CONTACT, AMBIENT], templateOptions: { gap: 0.9 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), heroDrawn: true, fonts: ["Bodoni Moda"], Page: GildedLayout,
  },
  {
    id: "pack_story", name: "Editorial Story", layout: "pack-story",
    description: "Editorial serif, line 1 ending on a red italic word, line 2 stepping in",
    defaults: {
      ...OWN, fontId: "Playfair Display", fontWeight: 400, fontSize: 64, casing: "none", lineHeight: 1.1, position: CENTRE,
      fill: solid("#FFFFFF"), active: accent("#E50012"), shadows: [shadow(0, 2, 5, "rgba(0,0,0,0.35)"), AMBIENT],
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 3 },
    capabilities: typoCaps({ weight: true }), fonts: ["Playfair Display"], Page: StoryLayout,
  },
];

const look = (id: string, name: string, templateId: string, description: string, tags: string[], words: number, style: Partial<CaptionStyleV2> = {}): LookSeed => ({
  id, name, description, category: "Typography", templateId, style, settings: { maxWordsPerCard: words, maxLines: 3 }, tags,
});

export const TYPO_LOOKS: LookSeed[] = [
  look("typo_banded_word", "Banded Big Word", "pack_master", "Lowercase lines with one big word filled in curved cream and blue bands", ["Big word", "Two-tone"], 3),
  look("typo_rotating_layouts", "Rotating Type Layouts", "pack_typo_simple", "Chunky type in eight rotating layouts, small and huge words with a cyan accent", ["8 layouts", "Accent"], 3),
  look("typo_ghost_stack", "Ghost Stack Light-Up", "pack_podcast", "Left-aligned caps at mixed sizes; ghosted words turn white as they're spoken", ["Left stack", "Light up"], 6),
  look("typo_huge_script", "Huge Word + Red Script", "pack_discipline", "A tiny line over one huge word with a red script word overlapping it", ["Big word", "Script"], 4),
  look("typo_six_slot", "Six-Slot Kinetic", "pack_kinetic_slots", "Mixed-weight slots rise in; a yellow caps word and an extruded cyan metal hero slide in from both sides", ["3D hero", "Slides"], 6),
  look("typo_red_neon", "Red Neon Caps", "pack_impact", "Tall red neon caps glowing over a soft white line", ["Neon", "Caps"], 3),
  look("typo_big_small", "Big/Small Split", "pack_clean", "Clean white big and small lines in rotating arrangements with a soft black glow", ["Big & small", "Minimal"], 3),
  look("typo_red_block_wipe", "Red Block Wipe", "pack_red_wipe", "Bold white line over an italic serif phrase on a red block that wipes in", ["Italic serif", "Wipe"], 3),
  look("typo_punch_slide", "Punch Line Slide", "pack_punch", "A loud yellow caps line between quiet italic serif lines, sliding in and out from their own sides", ["Loud caps", "Slide in & out"], 3),
  look("typo_scatter_fly", "Scatter Fly-In", "pack_scatter", "Words fly in spinning from all over and land as small lines over a huge yellow word", ["Fly-in", "Huge word"], 5),
  look("typo_longest_big", "Longest Word Big", "pack_perfect", "The longest word huge with the rest tucked small beside it", ["Big word", "Two lines"], 3),
  look("typo_spotlight_sides", "Spotlight Hero + Side Words", "pack_spotlight", "One giant aqua word with small rows above and below and words running up its sides", ["Giant word", "Vertical words"], 5),
  look("typo_gilded_headline", "Gilded Headline", "pack_gilded", "A huge gilded Bodoni caps word with a soft gold glow, the line building below it", ["Gold caps", "Serif"], 3),
  look("typo_editorial_indent", "Editorial Indent", "pack_story", "Serif lines ending on a red italic word, the second line stepping in", ["Serif", "Italic accent"], 3),
];
