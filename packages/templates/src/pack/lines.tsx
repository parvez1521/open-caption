/**
 * Pack: Single-line styles. Templates (layouts) and gallery looks; wired in through ./index.ts.
 * Each look re-creates a catalogued single-line / word-level caption style (docs/research/whitestair-captions.md,
 * sections 3.1–3.59) from its parameters. Sizes are the catalogue's preview px × 1.5 (our reference is a 1080 short
 * edge); per-em distances keep the catalogue's proportions. Layouts live in ./lines-layouts.tsx.
 */
import type { CaptionStyleV2 } from "@capseasy/shared";
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { lineCaps } from "./lines-engine";
import {
  AccentLineLayout, BlockGradientLayout, BloomLayout, ColorPopLayout, FocusBoxLayout, HindLayout, HollowFillLayout, KaraokePillLayout,
  PillWordLayout, PlainLineLayout, PunchPopLayout, SelectHighlightLayout, SlamLayout, SoloLayout,
} from "./lines-layouts";

type Shadow = CaptionStyleV2["shadows"][number];
/** catalogue px → our reference px */
const X = 1.5;
/** a soft dark shadow that is invisible on black but keeps light text readable on bright footage */
const LEGIBLE: Shadow = { x: 0, y: 2, blur: 10, color: "rgba(0,0,0,0.35)" };
/** the catalogue's "no border" hairline: 0.3px rgba(0,0,0,.3) */
const HAIRLINE = { enabled: true, width: 0.3 * X, color: "rgba(0,0,0,0.3)" };
/** cuts: the catalogue's "Default" transition */
const CUT = { type: "none", durationMs: 220, stagger: "none", easing: "outExpo" } as const;
const NO_ACTIVE = { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 } as const;

export const LINES_TEMPLATES: TemplateDefinition[] = [
  {
    id: "pack_plain_line", name: "Plain Line", description: "Plain words, the whole card at once", layout: "pack-plain-line",
    defaults: { fontId: "Lato", fontWeight: 600, fontSize: 34 * X, casing: "lower", fill: { type: "solid", color: "#FFFFFF" }, stroke: HAIRLINE, shadows: [LEGIBLE], entrance: CUT, active: NO_ACTIVE },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({}), fonts: ["Lato"], Page: PlainLineLayout,
  },
  {
    id: "pack_solo", name: "Fade-In Words", description: "Each word fades in at its spoken time; the key word in a larger yellow italic", layout: "pack-solo",
    defaults: {
      fontId: "Lato", fontWeight: 600, fontSize: 34 * X, casing: "lower", fill: { type: "solid", color: "#FFFFFF" }, stroke: HAIRLINE, shadows: [LEGIBLE], entrance: CUT,
      active: { effect: "none", color: "#FACC15", scale: 1, boxRadius: 12 }, hero: { fontId: "Lato", scale: 1.3, rotate: 0 }, templateOptions: { fadeMs: 250 },
    },
    settingsDefaults: { maxWordsPerCard: 4, maxLines: 1 },
    capabilities: lineCaps({ hero: true }), heroDrawn: true, fonts: ["Lato"], Page: SoloLayout,
  },
  {
    id: "pack_slam", name: "Stacked Word Slam", description: "One word per line, each slamming in from 2.5× with a blur as it's spoken", layout: "pack-slam",
    defaults: {
      fontId: "Anton", fontWeight: 400, fontSize: 88 * X, casing: "upper", lineHeight: 1, position: { x: 0.5, y: 0.5 }, fill: { type: "solid", color: "#FFFFFF" },
      shadows: [{ x: 2 * X, y: 2 * X, blur: 0, color: "rgba(0,0,0,0.35)" }, LEGIBLE], entrance: CUT, active: NO_ACTIVE, templateOptions: { slamMs: 250 },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: lineCaps({}), fonts: ["Anton"], Page: SlamLayout,
  },
  {
    id: "pack_script_accent", name: "Script Accent", description: "One clean line with one word in a big coloured script; words slide up", layout: "pack-script-accent",
    defaults: {
      fontId: "Montserrat", fontWeight: 600, fontSize: 30 * X, casing: "lower", fill: { type: "solid", color: "#FFFFFF" }, shadows: [{ x: 0, y: 2 * X, blur: 4 * X, color: "rgba(0,0,0,0.6)" }],
      entrance: CUT, active: { effect: "none", color: "#F472B6", scale: 1, boxRadius: 12 }, hero: { fontId: "Dancing Script", fontWeight: 700, scale: 1.6, casing: "none", rotate: 0 },
      templateOptions: { slideEm: 1, slideMs: 400, staggerMs: 100 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({ hero: true }), heroDrawn: true, fonts: ["Montserrat", "Dancing Script"], Page: AccentLineLayout,
  },
  {
    id: "pack_glow_accent", name: "Italic Glow Word", description: "One clean line; an italic serif word glows the moment it's spoken", layout: "pack-glow-accent",
    defaults: {
      fontId: "Montserrat", fontWeight: 500, fontSize: 30 * X, casing: "lower", fill: { type: "solid", color: "#FFFFFF" }, shadows: [LEGIBLE],
      glow: { enabled: true, color: "#FFFFFF", radius: 18, intensity: 1 }, entrance: CUT, active: { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 },
      hero: { fontId: "Playfair Display", fontWeight: 400, scale: 1.6, rotate: 0 }, templateOptions: { spokenGlow: true, accentItalic: true, slideEm: 1, slideMs: 400, staggerMs: 100 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({ hero: true }), heroDrawn: true, fonts: ["Montserrat", "Playfair Display"], Page: AccentLineLayout,
  },
  {
    id: "pack_hind", name: "Glowing Serif Pop-In", description: "Two glowing lines; one word pops in a big italic serif accent", layout: "pack-hind",
    defaults: {
      fontId: "Poppins", fontWeight: 500, fontSize: 34 * X, casing: "lower", fill: { type: "solid", color: "#FFFFFF" }, shadows: [LEGIBLE],
      glow: { enabled: true, color: "#FFFFFF", radius: 6 * X, intensity: 0.9 }, entrance: CUT, active: { effect: "none", color: "#46D9FF", scale: 1, boxRadius: 12 },
      hero: { fontId: "Playfair Display", fontWeight: 700, scale: 1.55, rotate: 0 }, templateOptions: { accents: ["#46D9FF", "#FF9B3D", "#63FF6B"], showMs: 200 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 2 },
    capabilities: lineCaps({ hero: true }), heroDrawn: true, fonts: ["Poppins", "Playfair Display"], Page: HindLayout,
  },
  {
    id: "pack_color_pop", name: "Colour Pop Word", description: "Full line; the spoken word changes colour and scales up", layout: "pack-color-pop",
    defaults: {
      fontId: "Luckiest Guy", fontWeight: 700, fontSize: 38 * X, casing: "lower", fill: { type: "solid", color: "#FFFFFF" }, stroke: { enabled: true, width: 2 * X, color: "#000000" },
      shadows: [{ x: 1 * X, y: 1 * X, blur: 2 * X, color: "rgba(0,0,0,0.5)" }], entrance: CUT, active: { effect: "pop", color: "#22D3EE", scale: 1.18, boxRadius: 12 },
      templateOptions: { palette: ["#22D3EE", "#FACC15", "#22C55E", "#EF4444"], transitionMs: 200 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({ activeEffects: ["pop"] }), fonts: ["Luckiest Guy"], Page: ColorPopLayout,
  },
  {
    id: "pack_punch_pop", name: "Punch Pop", description: "Tight bold caps; the spoken word punches 1 → 1.35 → 1", layout: "pack-punch-pop",
    defaults: {
      fontId: "Archivo Black", fontWeight: 400, fontSize: 52 * X, casing: "upper", letterSpacing: -3 * X, fill: { type: "solid", color: "#8AFBAF" },
      shadows: [{ x: 4 * X, y: 4 * X, blur: 15 * X, color: "rgba(0,0,0,0.6)" }], entrance: CUT, active: NO_ACTIVE, templateOptions: { punchScale: 1.35, punchMs: 200 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({}), fonts: ["Archivo Black"], Page: PunchPopLayout,
  },
  {
    id: "pack_focus_box", name: "Jump Box", description: "Caps line; a coloured box jumps to the spoken word", layout: "pack-focus-box",
    defaults: {
      fontId: "Inter", fontWeight: 800, fontSize: 38 * X, casing: "upper", fill: { type: "solid", color: "#FFFFFF" }, shadows: [{ x: 1 * X, y: 1 * X, blur: 2 * X, color: "rgba(0,0,0,0.6)" }],
      entrance: CUT, active: { effect: "box", color: "#000000", boxColor: "#FFE600", scale: 1, boxRadius: 4 * X }, templateOptions: { transitionMs: 100 },
    },
    settingsDefaults: { maxWordsPerCard: 4 },
    capabilities: lineCaps({ activeEffects: ["box"] }), fonts: ["Inter"], Page: FocusBoxLayout,
  },
  {
    id: "pack_hollow_fill", name: "Hollow Caps Fill", description: "Outlined caps that fill solid as they're spoken", layout: "pack-hollow-fill",
    defaults: {
      fontId: "Anton", fontWeight: 800, fontSize: 44 * X, casing: "upper", letterSpacing: 0.06 * 44 * X, fill: { type: "solid", color: "#FFFFFF" }, stroke: { enabled: true, width: 2, color: "#FFFFFF" },
      shadows: [{ x: 0, y: 1 * X, blur: 2 * X, color: "rgba(0,0,0,0.4)" }], entrance: CUT, active: NO_ACTIVE, templateOptions: { fillMs: 100 },
    },
    settingsDefaults: { maxWordsPerCard: 4 },
    capabilities: lineCaps({}), fonts: ["Anton"], Page: HollowFillLayout,
  },
  {
    id: "pack_karaoke_pill", name: "Karaoke Pill", description: "Line on a light pill; upcoming words faint, spoken words solid", layout: "pack-karaoke-pill",
    defaults: {
      fontId: "Montserrat", fontWeight: 800, fontSize: 36 * X, casing: "lower", fill: { type: "solid", color: "#000000" }, entrance: CUT, active: NO_ACTIVE,
      background: { type: "pill", color: "#EBEBEB", opacity: 0.85, padding: 10, radius: 16, blur: 0 }, templateOptions: { upcomingAlpha: 0x55 / 255, fadeMs: 150 },
    },
    settingsDefaults: { maxWordsPerCard: 4, maxLines: 1 },
    capabilities: lineCaps({}), fonts: ["Montserrat"], Page: KaraokePillLayout,
  },
  {
    id: "pack_select_highlight", name: "Selection Highlight", description: "A bracketed highlight expands behind the line, like selected text", layout: "pack-select-highlight",
    defaults: {
      fontId: "Montserrat", fontWeight: 800, fontSize: 40 * X, casing: "lower", letterSpacing: -1 * X, fill: { type: "solid", color: "#FFFFFF" }, shadows: [LEGIBLE],
      entrance: CUT, active: { effect: "none", color: "#F5C451", scale: 1, boxRadius: 12 },
      templateOptions: { defaultBorder: "#F5C451", defaultFill: "rgba(247,213,137,0.35)", delayMs: 50, expandMs: 1000 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({ hero: true, background: false }), fonts: ["Montserrat"], Page: SelectHighlightLayout,
  },
  {
    id: "pack_bloom", name: "Soft Bloom", description: "Bold words in a soft layered bloom of their own colour", layout: "pack-bloom",
    defaults: {
      fontId: "Montserrat", fontWeight: 900, fontSize: 48 * X, casing: "lower", fill: { type: "solid", color: "#00E5FF" }, shadows: [LEGIBLE],
      glow: { enabled: true, color: "#00E5FF", radius: 8 * X, intensity: 1 }, entrance: CUT, active: NO_ACTIVE,
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({}), fonts: ["Montserrat"], Page: BloomLayout,
  },
  {
    id: "pack_block_gradient", name: "Line Gradient", description: "One gradient painted across the whole line", layout: "pack-block-gradient",
    defaults: {
      fontId: "Montserrat", fontWeight: 700, fontSize: 48 * X, casing: "lower", entrance: CUT, active: NO_ACTIVE, shadows: [LEGIBLE],
      fill: { type: "gradient", angle: 105, stops: [{ color: "#0869B3", at: 0 }, { color: "#0869B3", at: 0.35 }, { color: "#CCEAFF", at: 0.5 }, { color: "#0869B3", at: 0.65 }, { color: "#0869B3", at: 1 }] },
      glow: { enabled: true, color: "#0869B3", radius: 4 * X, intensity: 0.5 },
    },
    settingsDefaults: { maxWordsPerCard: 3, maxLines: 1 },
    capabilities: lineCaps({}), fonts: ["Montserrat"], Page: BlockGradientLayout,
  },
  {
    id: "pack_pill_word", name: "Word Pill", description: "One word at a time on a rounded badge", layout: "pack-pill-word",
    defaults: {
      fontId: "Poppins", fontWeight: 800, fontSize: 52 * X, casing: "upper", fill: { type: "solid", color: "#E7F3DD" }, entrance: CUT, active: NO_ACTIVE,
      glow: { enabled: true, color: "#E7F3DD", radius: 12 * X, intensity: 0.4 }, background: { type: "pill", color: "#5A6E41", opacity: 1, padding: 28 * X, radius: 16, blur: 0 },
    },
    settingsDefaults: { maxWordsPerCard: 1 },
    capabilities: lineCaps({ alignment: false }), fixedWordsPerCard: 1, fonts: ["Poppins"], Page: PillWordLayout,
  },
];

const look = (l: LookSeed): LookSeed => l;

export const LINES_LOOKS: LookSeed[] = [
  look({ id: "plain_lowercase", name: "Plain Lowercase", description: "Small clean white lowercase line, no box, no motion", category: "Clean", templateId: "pack_plain_line", tags: ["Minimal", "Lowercase"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "fade_in_words", name: "Fade-In Words", description: "Each word fades in as it's spoken; a key word you mark turns big yellow italic", category: "Clean", templateId: "pack_solo", tags: ["Fade in", "Italic key word"],
    style: {}, settings: { maxWordsPerCard: 4 } }),
  look({ id: "stacked_slam", name: "Stacked Word Slam", description: "Tall caps stacked one word per line, each slamming in from 2.5× out of a blur", category: "Cinematic", templateId: "pack_slam", tags: ["Slam", "Stacked", "Caps"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "script_accent_pink", name: "Pink Script Accent", description: "Clean lowercase line with one word in a big pink script; words slide up", category: "Luxury", templateId: "pack_script_accent", tags: ["Script word", "Slide up"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "italic_glow_word", name: "Italic Word Glow", description: "Light lowercase line; an italic serif word lights up with a soft halo when spoken", category: "Luxury", templateId: "pack_glow_accent", tags: ["Italic serif", "Glow on spoken"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "glow_serif_popin", name: "Glowing Serif Pop-In", description: "Two softly glowing lines with one big italic serif word in a rotating accent colour", category: "Viral", templateId: "pack_hind", tags: ["Glow", "Italic accent", "2 lines"],
    style: {}, settings: { maxWordsPerCard: 3, maxLines: 2 } }),
  look({ id: "cycling_color_pop", name: "Cycling Colour Pop", description: "Chunky outlined caps; each spoken word pops up in the next colour of a cyan-yellow-green-red cycle", category: "Viral", templateId: "pack_color_pop", tags: ["Colour cycle", "Scale pop"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "gold_word_lift", name: "Gold Word Lift", description: "Bold lowercase line; the spoken word turns gold and grows a little", category: "Viral", templateId: "pack_color_pop", tags: ["Gold word", "Scale"],
    style: { fontId: "Inter", fontWeight: 800, fontSize: 40 * X, stroke: HAIRLINE, shadows: [LEGIBLE], active: { effect: "pop", color: "#FFD700", scale: 1.1, boxRadius: 12 }, templateOptions: { palette: [], transitionMs: 200 } },
    settings: { maxWordsPerCard: 4 } }),
  look({ id: "mint_caps_pop", name: "Mint Tight Caps Pop", description: "Mint caps with tight tracking and a deep shadow; the spoken word punches", category: "Viral", templateId: "pack_punch_pop", tags: ["Caps", "Punch"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "yellow_jump_box", name: "Yellow Jump Box", description: "White caps; a yellow box with black text jumps to the spoken word", category: "Viral", templateId: "pack_focus_box", tags: ["Caps", "Box highlight"],
    style: {}, settings: { maxWordsPerCard: 4 } }),
  look({ id: "hollow_caps_fill", name: "Hollow Caps Fill", description: "Outlined condensed caps that fill solid white as they're spoken", category: "Viral", templateId: "pack_hollow_fill", tags: ["Outline", "Fill in"],
    style: {}, settings: { maxWordsPerCard: 4 } }),
  look({ id: "karaoke_pill", name: "Karaoke Pill", description: "Line on a light grey pill; upcoming words faint, spoken words solid black", category: "Clean", templateId: "pack_karaoke_pill", tags: ["Pill", "Dim until spoken"],
    style: {}, settings: { maxWordsPerCard: 4 } }),
  look({ id: "selection_highlight", name: "Text Selection Highlight", description: "A gold highlight with dotted handles expands behind the line, like selected text", category: "Education", templateId: "pack_select_highlight", tags: ["Highlight", "Expand"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "cyan_bloom", name: "Cyan Bloom", description: "Heavy cyan lowercase in a soft layered bloom of its own colour", category: "Retro", templateId: "pack_bloom", tags: ["Glow", "Bold"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "slanted_shine", name: "Slanted Shine", description: "Deep blue line with a pale slanted shine band across the middle", category: "Viral", templateId: "pack_block_gradient", tags: ["Shine band", "Gradient"],
    style: {}, settings: { maxWordsPerCard: 3 } }),
  look({ id: "peak_gradient", name: "Centre-Peak Gradient", description: "Dark-green to lime line with a bright yellow peak in the centre", category: "Viral", templateId: "pack_block_gradient", tags: ["Dual tone", "Gradient"],
    style: {
      fontId: "Outfit", fontWeight: 700, fontSize: 50 * X, glow: { enabled: false, color: "#9CD843", radius: 4 * X, intensity: 0.5 },
      fill: { type: "gradient", angle: 90, stops: [{ color: "#387320", at: 0 }, { color: "#9CD843", at: 0.35 }, { color: "#FDF955", at: 0.5 }, { color: "#9CD843", at: 0.65 }, { color: "#387320", at: 1 }] },
    }, settings: { maxWordsPerCard: 3 } }),
  look({ id: "olive_word_pill", name: "Olive Word Pill", description: "One caps word at a time on an olive pill badge with a soft glow", category: "Fun", templateId: "pack_pill_word", tags: ["One word", "Pill"],
    style: {}, settings: { maxWordsPerCard: 1 } }),
];
