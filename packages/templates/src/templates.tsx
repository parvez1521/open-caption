import React from "react";
import { ACTIVE_EFFECTS, ENTRANCES } from "@capseasy/shared";
import { SentenceLayout } from "./layouts/Sentence";
import { Stack3Layout } from "./layouts/Stack3";
import { WordLayout } from "./layouts/Word";
import { BarLayout, BubbleLayout, HighlighterLayout, KaraokeLayout, KineticLayout, TypewriterLayout } from "./layouts/Extra";
import { GlowBehindLayout, GlowDuoLayout, GlowFlowLayout } from "./layouts/Glow";
import { MetalScriptLayout } from "./layouts/MetalScript";
import { PACK_TEMPLATES } from "./pack";
import type { PageRenderProps, TemplateCapabilities, TemplateDefinition } from "./types";

const ALL_EFFECTS = ACTIVE_EFFECTS;
/** what a three-line stack's body words can do while spoken (the hero word has its own styling) */
const STACK_EFFECTS = ["none", "color", "pop", "underline", "glow", "bounce"] as const;
const CORE_ENTRANCES = ["none", "fade", "rise", "drop", "pop", "zoom", "slide-left", "slide-right", "blur-in", "flip", "elastic", "mask-reveal", "glitch", "glitch-slice", "typewriter", "wave", "flicker", "scramble", "block-reveal", "roll", "write-on", "jelly",
  "letter-spin", "letter-elastic", "letter-snap", "letter-burst", "letter-stretch"] as const;
/** layouts that animate each card their own way (bubble pop, kinetic rows) take no extra card entrance */
const OWN_MOTION = ["none"] as const;

const caps = (over: Partial<TemplateCapabilities>): TemplateCapabilities => ({
  hero: true, alignment: true, stagger: false, accentPeriod: false, weight: true, color: true, background: true, emoji: false,
  activeEffects: ALL_EFFECTS, entrances: CORE_ENTRANCES, ...over,
});

const stack = (skinId: string): React.FC<PageRenderProps> => {
  const C: React.FC<PageRenderProps> = (p) => <Stack3Layout {...p} skinId={skinId} />;
  C.displayName = `Stack3(${skinId})`;
  return C;
};

/** The 8 legacy templates, ported, plus the P8 layouts. Capabilities list only what each layout really honours
 *  (enforced by controls.test.tsx: every visible control must change the render). */
export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "staggered_3line", name: "Staggered 3-Line", description: "Staggered layout with an Anton hero word", layout: "stack3",
    defaults: { fontId: "Outfit", fontWeight: 700, fontSize: 50, active: { effect: "none", color: "#00F5C4", scale: 1.08, boxRadius: 12 }, hero: { fontId: "Anton", fontWeight: 900, scale: 1.5, rotate: 0 }, templateOptions: { layoutMode: "splash" } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ alignment: false, stagger: true, weight: false, activeEffects: STACK_EFFECTS }), fonts: ["Outfit", "Anton"], Page: stack("staggered_3line"),
  },
  {
    id: "glow_stack", name: "Glow Stack", description: "Rounded white text, flat deep-blue hero word, splash layout", layout: "stack3",
    defaults: { fontId: "Baloo 2", fontWeight: 800, fontSize: 50, active: { effect: "none", color: "#4FA8FF", scale: 1.08, boxRadius: 12 }, hero: { fontId: "Anton", fontWeight: 900, scale: 2.3, rotate: 0 }, templateOptions: { layoutMode: "splash" } },
    settingsDefaults: { maxWordsPerCard: 4 },
    capabilities: caps({ alignment: false, stagger: true, weight: false, color: false, activeEffects: STACK_EFFECTS }), fonts: ["Baloo 2", "Anton"], Page: stack("glow_stack"),
  },
  {
    id: "cartoon_stack", name: "Cartoon Stack", description: "Playful Fredoka hero with a thick border and Caveat body", layout: "stack3",
    defaults: { fontId: "Caveat", fontWeight: 700, fontSize: 50, active: { effect: "none", color: "#EDE0A6", scale: 1.08, boxRadius: 12 }, hero: { fontId: "Fredoka", fontWeight: 700, scale: 1.6, rotate: 0 } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ weight: false, activeEffects: STACK_EFFECTS }), fonts: ["Fredoka", "Caveat"], Page: stack("cartoon_stack"),
  },
  {
    id: "serif_pop", name: "Serif Pop", description: "Bold brush-script hero word with a pop dot", layout: "stack3",
    defaults: { fontId: "Playfair Display", fontWeight: 800, fontSize: 50, active: { effect: "color", color: "#FFEE00", scale: 1.08, boxRadius: 12 }, hero: { fontId: "Kaushan Script", fontWeight: 400, scale: 1.8, rotate: 0 }, templateOptions: { accentPeriod: true } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ accentPeriod: true, alignment: false, weight: false, color: false, activeEffects: STACK_EFFECTS }), fonts: ["Playfair Display", "Kaushan Script"], Page: stack("serif_pop"),
  },
  {
    id: "cinematic_emerald", name: "Cinematic Emerald", description: "Outfit body with a giant glowing italic Playfair hero", layout: "stack3",
    defaults: { fontId: "Outfit", fontWeight: 600, fontSize: 48, active: { effect: "none", color: "#8CFF3E", scale: 1.08, boxRadius: 12 }, hero: { fontId: "Playfair Display", fontWeight: 900, scale: 2.2, rotate: 0 } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ color: false, activeEffects: STACK_EFFECTS }), fonts: ["Outfit", "Playfair Display"], Page: stack("cinematic_emerald"),
  },
  {
    id: "word_by_word", name: "Word by Word", description: "Single bold uppercase word owns the frame", layout: "word",
    defaults: { fontId: "Montserrat", fontWeight: 900, fontSize: 58, casing: "upper", entrance: { type: "none", durationMs: 200, stagger: "none", easing: "outExpo" }, active: { effect: "scale-up", color: "#00F5C4", scale: 1.08, boxRadius: 12 } },
    settingsDefaults: { maxWordsPerCard: 1 },
    capabilities: caps({ alignment: false }), fonts: ["Montserrat"], Page: WordLayout,
  },
  {
    id: "sentence_highlight", name: "Sentence Highlight", description: "Full segment with the spoken word popping", layout: "sentence",
    defaults: { fontId: "Inter", fontWeight: 900, fontSize: 54, active: { effect: "pop", color: "#00F5C4", scale: 1.12, boxRadius: 12 } },
    settingsDefaults: { maxWordsPerCard: 4 },
    capabilities: caps({}), fonts: ["Inter"], Page: SentenceLayout,
  },
  {
    id: "sentence_clean", name: "Sentence Clean", description: "Elegant, uniform typography with no highlight", layout: "sentence",
    defaults: { fontId: "Cinzel", fontWeight: 800, fontSize: 48, active: { effect: "none", color: "#FFFFFF", scale: 1.0, boxRadius: 12 } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ hero: false, activeEffects: ["none", "color"] }), fonts: ["Cinzel"], Page: SentenceLayout,
  },
  {
    id: "karaoke", name: "Karaoke", description: "Whole line visible; each word fills with colour as it's spoken", layout: "karaoke",
    defaults: { fontId: "Poppins", fontWeight: 800, fontSize: 56, inactiveOpacity: 1, active: { effect: "fill-sweep", color: "#FFD400", scale: 1, boxRadius: 12 }, stroke: { enabled: true, width: 3, color: "#000000" } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ hero: false, activeEffects: ["fill-sweep"] }), fonts: ["Poppins"], Page: KaraokeLayout,
  },
  {
    id: "boxed_word", name: "Boxed Word", description: "Full line; a solid box jumps to the word being spoken", layout: "sentence",
    defaults: { fontId: "Montserrat", fontWeight: 900, fontSize: 56, casing: "upper", templateOptions: { reveal: "all" }, active: { effect: "box", color: "#000000", boxColor: "#22C55E", scale: 1.06, boxRadius: 14 } },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: caps({ activeEffects: ["box", "pop", "color", "none"] }), fonts: ["Montserrat"], Page: SentenceLayout,
    emotionMap: { hype: { scale: 1.15 } },
  },
  {
    id: "typewriter", name: "Typewriter", description: "Letters type out as they're spoken, with a blinking cursor", layout: "typewriter",
    defaults: { fontId: "JetBrains Mono", fontWeight: 700, fontSize: 50, align: "left", entrance: { type: "none", durationMs: 0, stagger: "none", easing: "linear" }, active: { effect: "none", color: "#00FF66", scale: 1, boxRadius: 12 } },
    settingsDefaults: { maxWordsPerCard: 6, maxLines: 2 },
    capabilities: caps({ hero: false, activeEffects: ["none"], entrances: ["none"] }), fonts: ["JetBrains Mono"], Page: TypewriterLayout,
  },
  {
    id: "subtitle_bar", name: "Subtitle Bar", description: "Classic readable subtitles on a translucent bar", layout: "bar",
    defaults: { fontId: "Inter", fontWeight: 600, fontSize: 44, maxWidth: 0.9, position: { x: 0.5, y: 0.86 }, active: { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 }, background: { type: "bar", color: "#000000", opacity: 0.6, padding: 18, radius: 10, blur: 0 }, entrance: { type: "fade", durationMs: 120, stagger: "none", easing: "outCubic" } },
    settingsDefaults: { maxWordsPerCard: 10, maxLines: 2, maxCharsPerLine: 42 },
    capabilities: caps({ hero: false, activeEffects: ["none", "color", "underline"] }), fonts: ["Inter"], Page: BarLayout,
  },
  {
    id: "chat_bubble", name: "Chat Bubble", description: "Messages pop in as chat bubbles, alternating sides", layout: "bubble",
    defaults: { fontId: "Inter", fontWeight: 600, fontSize: 48, active: { effect: "color", color: "#FFFFFF", scale: 1, boxRadius: 12 }, background: { type: "bubble", color: "#0A84FF", opacity: 1, padding: 22, radius: 34, blur: 0 } },
    settingsDefaults: { maxWordsPerCard: 7, maxLines: 3 },
    capabilities: caps({ hero: false, alignment: false, activeEffects: ["none", "color", "underline"], entrances: OWN_MOTION }), fonts: ["Inter"], Page: BubbleLayout,
  },
  {
    id: "highlighter", name: "Highlighter", description: "A marker swipes behind the spoken word and stays on the key word", layout: "highlighter",
    defaults: { fontId: "Lexend", fontWeight: 700, fontSize: 52, fill: { type: "solid", color: "#111111" }, inactiveOpacity: 0.35, active: { effect: "marker", color: "#FDE047", scale: 1, boxRadius: 12 }, background: { type: "box", color: "#FFFFFF", opacity: 0.95, padding: 18, radius: 14, blur: 0 } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ activeEffects: ["marker"] }), fonts: ["Lexend"], Page: HighlighterLayout,
  },
  {
    id: "kinetic", name: "Kinetic", description: "Stacked words at different sizes; the key word huge and tilted", layout: "kinetic",
    defaults: { fontId: "Inter", fontWeight: 800, fontSize: 60, casing: "upper", hero: { fontId: "Anton", fontWeight: 900, scale: 1.8, rotate: -5 }, active: { effect: "pop", color: "#FFD400", scale: 1.1, boxRadius: 12 } },
    settingsDefaults: { maxWordsPerCard: 5 },
    capabilities: caps({ alignment: false, activeEffects: ["pop"], entrances: OWN_MOTION }), fonts: ["Inter", "Anton"], Page: KineticLayout,
  },
  // ---- lit-from-within: layered glow inside and around the letters, every word rising out of a blur
  {
    id: "glow_flow", name: "Glow Lines", description: "Words rise out of a blur, glowing from inside", layout: "glow-flow",
    defaults: {
      fontId: "Nunito", fontWeight: 700, fontSize: 66, lineHeight: 1.08, entrance: { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" }, exit: { type: "fade", durationMs: 180 },
      glow: { enabled: true, color: "#FFFFFF", radius: 14, intensity: 0.75 }, active: { effect: "glow", color: "#FFFFFF", scale: 1, boxRadius: 12 }, templateOptions: { depth: 0.12, glare: 0.3 },
    },
    settingsDefaults: { maxWordsPerCard: 4 },
    capabilities: caps({ alignment: false, background: false, activeEffects: ["glow"], entrances: OWN_MOTION }), fonts: ["Nunito"], Page: GlowFlowLayout,
  },
  {
    id: "glow_duo", name: "Glow Duo", description: "Glowing caps overlapped by an italic accent line", layout: "glow-duo",
    defaults: {
      fontId: "Anton", fontWeight: 400, fontSize: 96, casing: "upper", lineHeight: 1, entrance: { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" }, exit: { type: "fade", durationMs: 180 },
      fill: { type: "solid", color: "#FF2A2A" }, glow: { enabled: true, color: "#FF1A1A", radius: 16, intensity: 1 },
      hero: { fontId: "Instrument Serif", scale: 0.95, fill: { type: "solid", color: "#FFFFFF" }, rotate: 0 },
      active: { effect: "glow", color: "#FF5A4A", scale: 1, boxRadius: 12 }, templateOptions: { duoOrder: "caps-first", depth: 0.5, overlap: 0.32 },
    },
    settingsDefaults: { maxWordsPerCard: 4 },
    capabilities: caps({ alignment: false, background: false, activeEffects: ["glow"], entrances: OWN_MOTION }), fonts: ["Anton", "Instrument Serif"], Page: GlowDuoLayout,
  },
  {
    id: "glow_behind", name: "Giant Word Behind", description: "The key word glows huge behind the line", layout: "glow-behind",
    defaults: {
      fontId: "Playfair Display", fontWeight: 800, fontSize: 54, entrance: { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" }, exit: { type: "fade", durationMs: 200 },
      fill: { type: "solid", color: "#FFFFFF" }, glow: { enabled: true, color: "#FF2020", radius: 22, intensity: 0.9 },
      hero: { fontId: "Bodoni Moda", fontWeight: 900, scale: 3.4, fill: { type: "solid", color: "#E3141B" }, casing: "upper", rotate: 0 },
      active: { effect: "glow", color: "#FF6A5A", scale: 1, boxRadius: 12 }, templateOptions: { depth: 0.6, glare: 0.25 },
    },
    settingsDefaults: { maxWordsPerCard: 4 },
    capabilities: caps({ alignment: false, background: false, activeEffects: ["glow"], entrances: OWN_MOTION }), fonts: ["Playfair Display", "Bodoni Moda"], Page: GlowBehindLayout,
  },
  {
    // the CaptionsEasy title lockup as captions: metal caps slam in letter by letter, the key word is written on in script
    id: "metal_script", name: "Metal + Script", description: "Metal caps slam in letter by letter, the key word is written on in a green script", layout: "metal-script",
    defaults: {
      fontId: "Anton", fontWeight: 400, fontSize: 112, casing: "upper", lineHeight: 1.05, letterSpacing: 1, entrance: { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" }, exit: { type: "fade", durationMs: 200 },
      fill: { type: "gradient", angle: 180, stops: [{ color: "#FFFFFF", at: 0 }, { color: "#F1F3F2", at: 0.46 }, { color: "#BFC4C2", at: 0.54 }, { color: "#7D8482", at: 1 }] },
      shadows: [{ x: 0, y: 6, blur: 18, color: "rgba(0,0,0,0.6)" }],
      glow: { enabled: true, color: "#34D399", radius: 26, intensity: 0.7 },
      hero: { fontId: "Pacifico", fontWeight: 400, scale: 0.95, casing: "title", rotate: 0,
        fill: { type: "gradient", angle: 180, stops: [{ color: "#E4F5EC", at: 0 }, { color: "#9FD8BD", at: 0.35 }, { color: "#3FAF84", at: 0.7 }, { color: "#2C6F57", at: 1 }] } },
      active: { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 }, templateOptions: { overlap: 0.38 },
    },
    settingsDefaults: { maxWordsPerCard: 3 },
    capabilities: caps({ alignment: false, weight: false, background: false, activeEffects: ["none"], entrances: OWN_MOTION }), fonts: ["Anton", "Pacifico"], Page: MetalScriptLayout,
  },
  // the pack: 64 more looks, with their own layouts (src/pack)
  ...PACK_TEMPLATES,
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export { ENTRANCES };
