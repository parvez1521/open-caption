/** Pack: Creator two/three-line styles. Templates (layouts) and gallery looks; wired in through ./index.ts. */
import type { CaptionStyleV2 } from "@capseasy/shared";
import type { LookSeed } from "../looks/new";
import type { TemplateCapabilities, TemplateDefinition } from "../types";
import { STOCK_ENTRANCES, WS } from "./creator-core";
import {
  BubbleLayout, CrazyGlideLayout, CrazyShineLayout, CreatorSkewLayout, FUSION_GREEN, GamerLayout, GirlyLayout, NeonTitleLayout, SerifScriptLayout,
  ShineTitleLayout, SmoothFusionLayout, SmoothLayout, SparkLayout, TripleBlockLayout, WarmScriptLayout,
} from "./creator-layouts";

/** Capabilities: one text colour (fill), the accent colour (highlight), hero font/scale where a line is drawn big. */
const caps = (over: Partial<TemplateCapabilities> = {}): TemplateCapabilities => ({
  hero: true, alignment: false, stagger: false, accentPeriod: false, weight: true, color: true, background: true, emoji: false,
  activeEffects: ["none"], entrances: STOCK_ENTRANCES, ...over,
});
/** styles whose motion is built in (WhiteStair locks their Transitions tab) */
const OWN = ["none"] as const;

const px = (n: number) => Math.round(n * WS * 10) / 10;
const accent = (color: string): CaptionStyleV2["active"] => ({ effect: "none", color, scale: 1, boxRadius: 12 });
const enter = (type: CaptionStyleV2["entrance"]["type"], durationMs = 400): CaptionStyleV2["entrance"] => ({ type, durationMs, stagger: "none", easing: "outQuad" });
const NO_ENTRANCE = enter("none");
const NO_EXIT: CaptionStyleV2["exit"] = { type: "none", durationMs: 160 };
const glow = (color: string, radius: number, intensity: number): CaptionStyleV2["glow"] => ({ enabled: true, color, radius, intensity });
const OFF_GLOW = { enabled: false, color: "#FFFFFF", radius: 12, intensity: 0.8 };
/** a soft dark lift so light text still reads on bright video (not in the catalogue: added for readability) */
const lift = (y = 3, blur = 10, a = 0.5) => [{ x: 0, y: 1, blur: 3, color: "rgba(0,0,0,0.55)" }, { x: 0, y, blur, color: `rgba(0,0,0,${a})` }];
const solid = (color: string): CaptionStyleV2["fill"] => ({ type: "solid", color });

type T = Omit<TemplateDefinition, "settingsDefaults" | "capabilities"> & { capabilities?: TemplateCapabilities; settingsDefaults?: TemplateDefinition["settingsDefaults"] };
const tpl = (t: T): TemplateDefinition => ({ settingsDefaults: { maxWordsPerCard: 3 }, capabilities: caps(), ...t });

export const CREATOR_TEMPLATES: TemplateDefinition[] = [
  tpl({
    id: "pack_creator_skew", name: "Skewed Ice Headline", layout: "pack-creator-skew", heroDrawn: true,
    description: "Light caps over a bigger, tighter, skewed line in an ice ramp that brightens to white in the middle",
    defaults: {
      fontId: "Montserrat", fontWeight: 900, fontSize: px(36), casing: "upper", lineHeight: 1, fill: solid("#ECECEC"), active: accent("#2BAEFF"),
      hero: { scale: 1.25, rotate: 0 }, glow: glow("#FFFFFF", px(8), 0.4), shadows: lift(), entrance: NO_ENTRANCE, exit: NO_EXIT,
    },
    fonts: ["Montserrat"], Page: CreatorSkewLayout,
  }),
  tpl({
    id: "pack_creator_shine", name: "Shine-Streak Italic Title", layout: "pack-creator-shine", heroDrawn: true,
    description: "A glowing italic title crossed by two diagonal white shine streaks, a light subtitle underneath",
    defaults: {
      fontId: "Montserrat", fontWeight: 300, fontSize: px(46 * 0.4), casing: "none", lineHeight: 1, fill: solid("#FFFFFF"), active: accent("#1CD0FF"),
      hero: { fontId: "Kanit", fontWeight: 700, scale: 2.5, rotate: 0 }, glow: glow("#1CD0FF", px(15), 0.6), shadows: [{ x: px(2), y: px(4), blur: px(5), color: "rgba(0,0,0,0.8)" }],
      entrance: NO_ENTRANCE, exit: NO_EXIT, templateOptions: { titleItalic: true },
    },
    settingsDefaults: { maxWordsPerCard: 4 }, fonts: ["Kanit", "Montserrat"], Page: ShineTitleLayout,
  }),
  tpl({
    id: "pack_creator_neon", name: "Neon Gradient Title", layout: "pack-creator-neon", heroDrawn: true,
    description: "Condensed caps in a neon gradient with a layered glow, over a glowing white subtitle",
    defaults: {
      fontId: "Montserrat", fontWeight: 500, fontSize: px(46 * 0.42), casing: "upper", lineHeight: 1, fill: solid("#FFFFFF"), active: accent("#00A3E0"),
      hero: { fontId: "Bebas Neue", fontWeight: 400, scale: 2.4, rotate: 0 }, glow: glow("#00A3E0", px(12), 1), shadows: [{ x: 0, y: px(2), blur: px(4), color: "rgba(0,0,0,0.55)" }],
      entrance: enter("blur-in", 500), exit: NO_EXIT, templateOptions: { titleItalic: false },
    },
    fonts: ["Bebas Neue", "Montserrat"], Page: NeonTitleLayout,
  }),
  tpl({
    id: "pack_creator_serif_script", name: "Glossy Serif + Script", layout: "pack-creator-serif-script", heroDrawn: true, fixedWordsPerCard: 2,
    description: "One glossy black-weight serif word with soft shine streaks, a script word tucked under it",
    defaults: {
      fontId: "Allura", fontWeight: 400, fontSize: 92, casing: "lower", lineHeight: 1, fill: solid("#D0D0D0"), active: accent("#76FF03"),
      hero: { fontId: "Playfair Display", fontWeight: 900, scale: 1 / 0.75, rotate: 0 }, glow: glow("#76FF03", px(8), 0.7), shadows: [{ x: 0, y: px(2), blur: px(3), color: "rgba(0,0,0,0.6)" }],
      entrance: enter("rise"), exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 2 }, fonts: ["Playfair Display", "Allura"], Page: SerifScriptLayout,
  }),
  tpl({
    id: "pack_creator_warm_script", name: "Golden Glow Headline", layout: "pack-creator-warm-script", heroDrawn: true,
    description: "A warm yellow-to-orange headline glowing gold on the left and orange on the right, over a glowing white script line",
    defaults: {
      fontId: "Poppins", fontWeight: 700, fontSize: px(33), casing: "title", lineHeight: 1,
      fill: { type: "gradient", angle: 135, stops: [{ color: "#FFFDE7", at: 0 }, { color: "#FFEA00", at: 0.06 }, { color: "#FFB300", at: 0.22 }, { color: "#FF9100", at: 0.6 }, { color: "#FF6D00", at: 1 }] },
      active: accent("#FFFFFF"), hero: { fontId: "Great Vibes", fontWeight: 400, scale: 1.3, rotate: 0 }, glow: glow("#FF6D00", 20, 1), shadows: [],
      entrance: enter("rise"), exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 4 }, fonts: ["Poppins", "Great Vibes"], Page: WarmScriptLayout,
  }),
  tpl({
    id: "pack_crazy_shine", name: "Shine-Band Hero Word", layout: "pack-crazy-shine", heroDrawn: true,
    description: "Italic white words around one huge orange word with pale-yellow diagonal shine bands",
    defaults: {
      fontId: "Montserrat", fontWeight: 700, fontStyle: "italic", fontSize: 60, casing: "title", lineHeight: 1, fill: solid("#FFFFFF"), active: accent("#FF8F00"),
      hero: { fontId: "Montserrat", fontWeight: 800, scale: 1.95 / 0.94, rotate: 0 }, glow: glow("#E65100", 11, 0.55), shadows: [{ x: 0, y: 1.4, blur: 2.8, color: "rgba(0,0,0,0.5)" }],
      entrance: NO_ENTRANCE, exit: NO_EXIT, templateOptions: { shine: "#FFFFB4", shineEdge: "#FFF564" },
    },
    fonts: ["Montserrat"], Page: CrazyShineLayout,
  }),
  tpl({
    id: "pack_crazy_glide", name: "Overshoot Glide Stack", layout: "pack-crazy-glide",
    description: "Three tight lowercase lines glide in from alternating sides, overshoot and settle; the middle line glows",
    defaults: {
      fontId: "Montserrat", fontWeight: 800, fontSize: px(48), casing: "lower", lineHeight: 1, fill: solid("#FFFFFF"), active: accent("#04AEFC"),
      glow: glow("#04AEFC", px(16), 1), shadows: lift(), entrance: NO_ENTRANCE, exit: NO_EXIT,
    },
    capabilities: caps({ entrances: OWN }), settingsDefaults: { maxWordsPerCard: 4 }, fonts: ["Montserrat"], Page: CrazyGlideLayout,
  }),
  tpl({
    id: "pack_spark", name: "Serif Shine Sweep", layout: "pack-spark", heroDrawn: true,
    description: "A big flat-colour serif word with a shine sweeping across it on a loop, small glowing lines overlapping above and below",
    defaults: {
      fontId: "Inter", fontWeight: 600, fontSize: px(44 * 0.58), casing: "lower", lineHeight: 1, fill: solid("#FFFFFF"), active: accent("#9EFF12"),
      hero: { fontId: "Playfair Display", fontWeight: 900, scale: 1 / 0.58, rotate: 0 }, glow: glow("#9EFF12", px(4), 0.5), shadows: [{ x: 0, y: px(1), blur: px(3), color: "rgba(0,0,0,0.8)" }],
      entrance: NO_ENTRANCE, exit: NO_EXIT,
    },
    fonts: ["Inter", "Playfair Display"], Page: SparkLayout,
  }),
  tpl({
    id: "pack_gamer", name: "Arcade Door Pop", layout: "pack-gamer",
    description: "Rounded gradient words on a thick dark outline door-open one by one as they're spoken, then drop away",
    defaults: {
      fontId: "Fredoka", fontWeight: 700, fontSize: 92, casing: "none", lineHeight: 1,
      fill: { type: "gradient", angle: 180, stops: [{ color: "#005CE6", at: 0 }, { color: "#28C4FF", at: 0.5 }, { color: "#005CE6", at: 1 }] },
      stroke: { enabled: true, width: Math.round(0.117 * 92 * 10) / 10, color: "#040711" }, active: accent("#28C4FF"), glow: OFF_GLOW,
      shadows: [{ x: 0, y: Math.round(0.067 * 92 * 10) / 10, blur: Math.round(0.117 * 92 * 10) / 10, color: "rgba(0,0,0,0.65)" }],
      position: { x: 0.5, y: 0.78 }, entrance: NO_ENTRANCE, exit: NO_EXIT, templateOptions: { dynamicColor: false },
    },
    capabilities: caps({ hero: false, entrances: OWN }), fonts: ["Fredoka"], Page: GamerLayout,
  }),
  tpl({
    id: "pack_triple_block", name: "Highlight Block Middle", layout: "pack-triple-block", heroDrawn: true,
    description: "Small white caps above and below the key word, set solid on a bright colour block",
    defaults: {
      fontId: "Outfit", fontWeight: 900, fontSize: 42, casing: "upper", lineHeight: 1, fill: solid("#FFFFFF"), active: accent("#B7FF29"),
      hero: { fontId: "Outfit", fontWeight: 900, scale: 2.1, rotate: 0 }, glow: OFF_GLOW, shadows: lift(), entrance: NO_ENTRANCE, exit: NO_EXIT,
    },
    fonts: ["Outfit"], Page: TripleBlockLayout,
  }),
  tpl({
    id: "pack_smooth", name: "Three-Part Glide In", layout: "pack-smooth", heroDrawn: true,
    description: "A small line slides in from the left, the glowing key word pops up, a small line slides in from the right",
    defaults: {
      fontId: "Outfit", fontWeight: 600, fontSize: 38, casing: "title", lineHeight: 1, fill: solid("#FFFFFF"), active: accent("#EF4444"),
      hero: { fontId: "Poppins", fontWeight: 900, scale: 2.25, rotate: 0 }, glow: glow("#EF4444", px(9), 1), shadows: lift(), entrance: NO_ENTRANCE, exit: NO_EXIT,
    },
    capabilities: caps({ entrances: OWN }), fonts: ["Outfit", "Poppins"], Page: SmoothLayout,
  }),
  tpl({
    id: "pack_smooth_fusion", name: "Fusion Type-On", layout: "pack-smooth-fusion", heroDrawn: true,
    description: "Small lines hung left and right of a big key word in a bright-centred dual-tone gradient; everything types on",
    defaults: {
      fontId: "Outfit", fontWeight: 600, fontSize: 38, casing: "title", lineHeight: 1, fill: solid("#FFFFFF"), active: accent(FUSION_GREEN.mid),
      hero: { fontId: "Outfit", fontWeight: 900, scale: 2.25, rotate: 0 }, glow: OFF_GLOW, shadows: lift(),
      entrance: { type: "typewriter", durationMs: 400, stagger: "none", easing: "linear" }, exit: NO_EXIT, templateOptions: { fusion: FUSION_GREEN },
    },
    fonts: ["Outfit"], Page: SmoothFusionLayout,
  }),
  tpl({
    id: "pack_girly", name: "Sparkle Script", layout: "pack-girly", heroDrawn: true,
    description: "A small serif lead-in over a big blush script word, every i dotted with a sparkle star",
    defaults: {
      fontId: "DM Serif Display", fontWeight: 400, fontSize: 46, casing: "none", lineHeight: 1, fill: solid("#F9DCED"), active: accent("#FFFFFF"),
      hero: { fontId: "Great Vibes", fontWeight: 400, scale: 2.6, rotate: 0 }, glow: OFF_GLOW,
      shadows: [{ x: px(2), y: px(4), blur: px(3), color: "rgba(0,0,0,0.15)" }, { x: 0, y: 2, blur: 10, color: "rgba(0,0,0,0.5)" }],
      entrance: NO_ENTRANCE, exit: NO_EXIT,
    },
    capabilities: caps({ entrances: OWN }), fonts: ["DM Serif Display", "Great Vibes"], Page: GirlyLayout,
  }),
  tpl({
    id: "pack_bubble", name: "Pastel Bubble Outline", layout: "pack-bubble", fixedWordsPerCard: 2,
    description: "Two rounded pastel lines with a thick round outline and a hard offset shadow",
    defaults: {
      fontId: "Fredoka", fontWeight: 600, fontSize: px(46), casing: "title", lineHeight: 1, fill: solid("#FFDAEC"), active: accent("#FFDAEC"),
      stroke: { enabled: true, width: Math.round(0.045 * px(46) * 10) / 10, color: "#594C52" }, glow: OFF_GLOW,
      shadows: [{ x: Math.round(0.07 * px(46) * 10) / 10, y: Math.round(0.09 * px(46) * 10) / 10, blur: 0, color: "#594C52" }], entrance: NO_ENTRANCE, exit: NO_EXIT,
    },
    capabilities: caps({ hero: false }), settingsDefaults: { maxWordsPerCard: 2 }, fonts: ["Fredoka"], Page: BubbleLayout,
  }),
];

const look = (id: string, name: string, templateId: string, description: string, tags: string[], style: Partial<CaptionStyleV2> = {}): LookSeed => {
  const t = CREATOR_TEMPLATES.find((x) => x.id === templateId)!;
  return { id, name, description, category: "Creator", templateId, style, settings: { ...t.settingsDefaults }, tags };
};

export const CREATOR_LOOKS: LookSeed[] = [
  look("creator_skew_ice", "Skewed Ice Headline", "pack_creator_skew", "Light caps over a bigger skewed line that brightens to white in the middle", ["Caps", "Skewed", "Gradient"]),
  look("creator_shine_title", "Shine-Streak Italic Title", "pack_creator_shine", "A glowing cyan italic title crossed by two white shine streaks, over a thin subtitle", ["Italic", "Shine", "Subtitle"]),
  look("creator_neon_title", "Neon Gradient Title", "pack_creator_neon", "Condensed neon-blue caps with a layered glow over a glowing subtitle", ["Neon", "Caps", "Subtitle"]),
  look("creator_gloss_serif", "Glossy Serif + Script", "pack_creator_serif_script", "One glossy lime serif word with soft shine streaks and a script word tucked under it", ["Serif", "Script", "Shine"]),
  look("creator_golden_glow", "Golden Glow Headline", "pack_creator_warm_script", "A warm golden headline over a big glowing white script line", ["Gradient", "Script", "Glow"]),
  look("creator_shine_band", "Shine-Band Hero Word", "pack_crazy_shine", "Italic white words around one huge orange word with pale shine bands", ["3 lines", "Italic", "Shine"]),
  look("creator_glide_stack", "Overshoot Glide Stack", "pack_crazy_glide", "Tight lowercase lines glide in from alternating sides and settle; the middle line glows blue", ["3 lines", "Glide", "Glow"]),
  look("creator_shine_sweep", "Serif Shine Sweep", "pack_spark", "A big lime serif word with a looping shine sweep, small glowing lines overlapping it", ["3 lines", "Serif", "Shine loop"]),
  look("creator_arcade_door", "Arcade Door Pop", "pack_gamer", "Rounded blue gradient words on a thick outline door-open as they're spoken", ["Gradient", "Thick outline", "Word by word"]),
  look("creator_block_middle", "Highlight Block Middle", "pack_triple_block", "Small caps above and below the key word set on a lime block", ["3 lines", "Caps", "Box"]),
  look("creator_three_part", "Three-Part Glide In", "pack_smooth", "Side lines slide in from left and right around a glowing red key word that pops up", ["3 lines", "Glow", "Kinetic"]),
  look("creator_fusion_type", "Fusion Type-On", "pack_smooth_fusion", "Side lines around a big lime-to-green gradient key word; every letter types on", ["3 lines", "Gradient", "Typewriter"]),
  look("creator_sparkle_script", "Sparkle Script", "pack_girly", "A serif lead-in over a big blush script word with sparkle-dotted i's", ["Script", "Sparkles", "Pop"]),
  look("creator_pastel_bubble", "Pastel Bubble Outline", "pack_bubble", "Two pastel pink rounded lines with a thick round outline and hard shadow", ["Rounded", "Outline", "2 words"]),
];
