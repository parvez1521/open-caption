import { ACTIVE_EFFECTS, ENTRANCES, type CaptionStyleV2 } from "@capseasy/shared";
import { EMOJI_ENABLED } from "./registry";
import { isLetterAnimator } from "./motion";
import type { TemplateDefinition } from "./types";

/**
 * Which Style-panel controls a template actually honours. The studio panel shows a control only when this
 * says so, and controls.test.tsx proves each visible control changes the render (no namesake controls).
 */
export type ControlId =
  | "font" | "size" | "weight" | "casing" | "align" | "letterSpacing" | "wordSpacing" | "lineHeight"
  | "textColor" | "highlightColor" | "effect" | "boxColor" | "effectStrength"
  | "heroScale" | "heroFont"
  | "outline" | "outlineWidth" | "outlineColor" | "shadow" | "glow"
  | "background" | "backgroundColor" | "backgroundOpacity"
  | "positionY" | "positionX" | "maxWidth" | "rotation"
  | "emoji" | "emojiSize" | "emojiAnimation"
  | "fillType" | "gradientColor2" | "gradientAngle"
  | "shadowColor" | "shadowBlur" | "shadowDistance" | "shadowOpacity" | "glowColor" | "glowSize"
  | "backgroundPadding" | "backgroundRadius" | "backgroundBlur" | "dimUnspoken"
  | "entrance" | "entranceSpeed" | "stagger" | "easing" | "exit" | "exitSpeed" | "motionIntensity" | "emotionReactivity" | "reveal";

export const EXIT_TYPES = ["none", "fade", "fall", "zoom-out", "blur-out", "slide-up", "letter-spin", "letter-elastic", "letter-snap", "letter-burst", "letter-stretch"] as const;
export const BACKGROUND_TYPES = ["none", "pill", "box"] as const;

const STAGGER_LAYOUTS = new Set(["sentence", "karaoke", "bar"]);
export const effectsFor = (t: TemplateDefinition) => ACTIVE_EFFECTS.filter((e) => t.capabilities.activeEffects.includes(e));
/**
 * Entrances the SHARED renderer guarantees for EVERY template at card level (PageView applies
 * entranceStyle around the layout — Package 2 item D, 2026-11-11): the types entranceStyle
 * implements completely on the whole card, needing no layout-drawn companions. Templates whose
 * layouts declare no entrance of their own (capabilities.entrances = ["none"] — most pack
 * layouts, whose words animate in their own fixed way) previously exposed NO Entrance control
 * in the Motion section at all, only Exit; they now offer exactly this set, applied by the
 * shared PageView wrapper so preview ≡ export. Types that need per-letter/per-word drawing
 * inside a layout (flicker, scramble, block-reveal, roll, write-on, split-flap, panels-reveal,
 * letter animators) stay capability-gated to the layouts that draw them.
 */
export const CARD_ENTRANCES = [
  "none", "fade", "rise", "drop", "pop", "zoom", "slide-left", "slide-right", "blur-in",
  "flip", "elastic", "mask-reveal", "glitch", "glitch-slice", "typewriter", "jelly", "wave",
] as const;
/** true when the layout declares no entrance of its own, so PageView owes the card-level one */
export const usesCardEntrance = (t: TemplateDefinition) => t.capabilities.entrances.length <= 1;
/** "wave" and the letter animators move letters one by one, so they are only offered where words are laid out individually */
export const entrancesFor = (t: TemplateDefinition) => usesCardEntrance(t)
  ? [...CARD_ENTRANCES]
  : ENTRANCES.filter((e) => t.capabilities.entrances.includes(e) && ((e !== "wave" && !isLetterAnimator(e)) || STAGGER_LAYOUTS.has(t.layout)));

/** letter exits need words drawn letter by letter (the same layouts as letter entrances) */
export const exitsFor = (t: TemplateDefinition) => EXIT_TYPES.filter((e) => !isLetterAnimator(e) || STAGGER_LAYOUTS.has(t.layout));

/** layouts that show every word of a card at once, so not-yet-spoken words can be dimmed */
const DIM_LAYOUTS = new Set(["karaoke", "bar", "bubble", "highlighter"]);

/** Effects whose look depends on the "strength" (scale) value. */
const SCALED_EFFECTS = new Set(["pop", "scale-up", "box", "bounce", "shake"]);

export function controlVisible(id: ControlId, t: TemplateDefinition, s: CaptionStyleV2): boolean {
  const c = t.capabilities;
  switch (id) {
    case "weight": return c.weight;
    case "align": return c.alignment;
    case "textColor": return c.color;
    case "effect": return effectsFor(t).length > 1;
    case "highlightColor": return s.active.effect !== "none" || c.hero;
    case "boxColor": return s.active.effect === "box";
    case "effectStrength": return SCALED_EFFECTS.has(s.active.effect);
    // only the stack and kinetic layouts draw the hero word in its own size/font; elsewhere "hero" is a colour
    case "heroScale": case "heroFont":
      return c.hero && (t.heroDrawn === true || t.layout === "stack3" || t.layout === "kinetic" || t.layout === "glow-duo" || t.layout === "glow-behind" || t.layout === "metal-script" || (t.layout === "glow-flow" && s.templateOptions.accentHero === true));
    case "outlineWidth": case "outlineColor": return s.stroke.enabled;
    // the bar and the chat bubble ARE their background shape: only its colour/opacity are adjustable
    case "background": return c.background && t.layout !== "bar" && t.layout !== "bubble";
    case "motionIntensity": return t.layout !== "typewriter";
    case "backgroundColor": case "backgroundOpacity": return c.background && s.background.type !== "none";
    case "emoji": return EMOJI_ENABLED;
    case "emojiSize": case "emojiAnimation": return EMOJI_ENABLED && s.emoji.enabled;
    case "entrance": return entrancesFor(t).length > 1;
    case "entranceSpeed": return entrancesFor(t).length > 1 && s.entrance.type !== "none";
    // letter animators keep the curves of the presets they were transcribed from (only their speed changes);
    // split-flap's drum decelerates on its own fixed curve and panels-reveal on its fixed stagger, likewise
    case "easing": return entrancesFor(t).length > 1 && s.entrance.type !== "none" && !isLetterAnimator(s.entrance.type) && s.entrance.type !== "split-flap" && s.entrance.type !== "panels-reveal";
    // word/letter stagger needs words laid out one by one; "wave" is always letter by letter
    case "stagger": return STAGGER_LAYOUTS.has(t.layout) && entrancesFor(t).length > 1 && s.entrance.type !== "none" && s.entrance.type !== "wave" && !isLetterAnimator(s.entrance.type);
    case "fillType": return c.color;
    case "gradientColor2": case "gradientAngle": return c.color && s.fill.type === "gradient";
    case "shadowColor": case "shadowBlur": case "shadowDistance": case "shadowOpacity": return s.shadows.length > 0;
    case "glowColor": case "glowSize": return s.glow.enabled;
    case "backgroundPadding": return c.background && s.background.type !== "none";
    case "backgroundRadius": return c.background && s.background.type !== "none" && s.background.type !== "pill";
    // the Difference template paints on canvas (no DOM backdrop to blur), so its Frosted blur slider would be a lie
    case "backgroundBlur": return c.background && (s.background.type === "pill" || s.background.type === "box") && t.layout !== "bar" && t.layout !== "bubble" && t.layout !== "pack-difference";
    case "dimUnspoken": return DIM_LAYOUTS.has(t.layout) || (t.layout === "sentence" && s.templateOptions.reveal === "all");
    case "exitSpeed": return s.exit.type !== "none";
    case "reveal": return t.layout === "sentence";
    default: return true;
  }
}

interface Variant {
  label?: string;
  /** starting style (defaults to the template's resolved defaults) */
  from?: CaptionStyleV2;
  to: (s: CaptionStyleV2) => CaptionStyleV2;
}
interface ControlCase {
  id: ControlId;
  variants: (base: CaptionStyleV2, t: TemplateDefinition) => Variant[];
}

const one = (to: Variant["to"]): Variant[] => [{ to }];
const withGradient = (s: CaptionStyleV2): CaptionStyleV2 => (s.fill.type === "gradient" ? s : { ...s, fill: { type: "gradient", stops: [{ color: "#FF8A00", at: 0 }, { color: "#7A5CFF", at: 1 }], angle: 90 } });
const withShadow = (s: CaptionStyleV2): CaptionStyleV2 => (s.shadows.length ? s : { ...s, shadows: [{ x: 0, y: 4, blur: 6, color: "rgba(0,0,0,0.6)" }] });
const withMovingEntrance = (s: CaptionStyleV2, t: TemplateDefinition): CaptionStyleV2 =>
  t.capabilities.entrances.includes("rise") ? { ...s, entrance: { ...s.entrance, type: "rise", durationMs: Math.max(200, s.entrance.durationMs) } } : s;

/** Test cases: one representative change per control (several for option lists). */
export const STYLE_CONTROLS: ControlCase[] = [
  { id: "font", variants: (b) => one((s) => ({ ...s, fontId: b.fontId === "Lora" ? "Inter" : "Lora" })) },
  { id: "size", variants: () => one((s) => ({ ...s, fontSize: s.fontSize + 12 })) },
  { id: "weight", variants: () => one((s) => ({ ...s, fontWeight: s.fontWeight >= 700 ? 400 : 800 })) },
  { id: "casing", variants: () => one((s) => ({ ...s, casing: s.casing === "lower" ? "upper" : "lower" })) },
  { id: "align", variants: () => one((s) => ({ ...s, align: s.align === "left" ? "right" : "left" })) },
  { id: "letterSpacing", variants: () => one((s) => ({ ...s, letterSpacing: s.letterSpacing + 4 })) },
  { id: "wordSpacing", variants: () => one((s) => ({ ...s, wordSpacing: s.wordSpacing + 12 })) },
  { id: "lineHeight", variants: () => one((s) => ({ ...s, lineHeight: s.lineHeight + 0.4 })) },
  { id: "textColor", variants: () => one((s) => ({ ...s, fill: { type: "solid", color: "#123456" } })) },
  { id: "highlightColor", variants: () => one((s) => ({ ...s, active: { ...s.active, color: "#AB12CD" } })) },
  {
    id: "effect",
    variants: (b, t) => effectsFor(t).filter((e) => e !== b.active.effect).map((e) => ({ label: e, to: (s) => ({ ...s, active: { ...s.active, effect: e } }) })),
  },
  { id: "boxColor", variants: () => one((s) => ({ ...s, active: { ...s.active, boxColor: "#AB12CD" } })) },
  { id: "effectStrength", variants: () => one((s) => ({ ...s, active: { ...s.active, scale: s.active.scale >= 1.3 ? 1.05 : 1.4 } })) },
  { id: "heroScale", variants: () => one((s) => ({ ...s, hero: { ...s.hero, scale: s.hero.scale + 0.5 } })) },
  { id: "heroFont", variants: (b) => one((s) => ({ ...s, hero: { ...s.hero, fontId: (b.hero.fontId ?? b.fontId) === "Lora" ? "Inter" : "Lora" } })) },
  { id: "outline", variants: () => one((s) => ({ ...s, stroke: { ...s.stroke, enabled: !s.stroke.enabled, width: s.stroke.width || 4 } })) },
  { id: "outlineWidth", variants: () => one((s) => ({ ...s, stroke: { ...s.stroke, width: s.stroke.width + 4 } })) },
  { id: "outlineColor", variants: () => one((s) => ({ ...s, stroke: { ...s.stroke, color: "#AB12CD" } })) },
  { id: "shadow", variants: () => one((s) => ({ ...s, shadows: s.shadows.length ? [] : [{ x: 0, y: 4, blur: 6, color: "rgba(0,0,0,0.6)" }] })) },
  { id: "glow", variants: () => one((s) => ({ ...s, glow: { ...s.glow, enabled: !s.glow.enabled } })) },
  {
    id: "background",
    variants: (b) => BACKGROUND_TYPES.filter((x) => x !== b.background.type).map((x) => ({ label: x, to: (s) => ({ ...s, background: { ...s.background, type: x } }) })),
  },
  { id: "backgroundColor", variants: () => one((s) => ({ ...s, background: { ...s.background, color: "#AB12CD" } })) },
  { id: "backgroundOpacity", variants: () => one((s) => ({ ...s, background: { ...s.background, opacity: s.background.opacity > 0.5 ? 0.3 : 0.9 } })) },
  { id: "positionY", variants: () => one((s) => ({ ...s, position: { ...s.position, y: s.position.y > 0.5 ? 0.3 : 0.7 } })) },
  { id: "positionX", variants: () => one((s) => ({ ...s, position: { ...s.position, x: 0.3 } })) },
  { id: "maxWidth", variants: () => one((s) => ({ ...s, maxWidth: s.maxWidth > 0.6 ? 0.5 : 0.9 })) },
  { id: "rotation", variants: () => one((s) => ({ ...s, rotation: 6 })) },
  { id: "emoji", variants: () => one((s) => ({ ...s, emoji: { ...s.emoji, enabled: !s.emoji.enabled } })) },
  { id: "emojiSize", variants: () => one((s) => ({ ...s, emoji: { ...s.emoji, size: s.emoji.size + 0.6 } })) },
  {
    id: "emojiAnimation",
    variants: (b) => (["pop", "float", "spin", "none"] as const).filter((x) => x !== b.emoji.animation).map((x) => ({ label: x, to: (s) => ({ ...s, emoji: { ...s.emoji, animation: x } }) })),
  },
  {
    id: "entrance",
    variants: (b, t) => entrancesFor(t).filter((e) => e !== b.entrance.type).map((e) => ({ label: e, to: (s) => ({ ...s, entrance: { ...s.entrance, type: e, durationMs: Math.max(200, s.entrance.durationMs) } }) })),
  },
  {
    id: "exit",
    variants: (b, t) => exitsFor(t).filter((x) => x !== b.exit.type).map((x) => ({ label: x, to: (s) => ({ ...s, exit: { ...s.exit, type: x, durationMs: Math.max(200, s.exit.durationMs) } }) })),
  },
  { id: "entranceSpeed", variants: () => one((s) => ({ ...s, entrance: { ...s.entrance, durationMs: s.entrance.durationMs > 400 ? 150 : 700 } })) },
  { id: "exitSpeed", variants: () => one((s) => ({ ...s, exit: { ...s.exit, durationMs: s.exit.durationMs > 400 ? 150 : 700 } })) },
  { id: "stagger", variants: (b) => (["word", "char"] as const).filter((x) => x !== b.entrance.stagger).map((x) => ({ label: x, from: { ...b, entrance: { ...b.entrance, type: "rise", durationMs: 220 } }, to: (s) => ({ ...s, entrance: { ...s.entrance, stagger: x } }) })) },
  { id: "easing", variants: (b) => [{ from: { ...b, entrance: { ...b.entrance, type: "rise", durationMs: 400, easing: "outExpo" } }, to: (s) => ({ ...s, entrance: { ...s.entrance, easing: "linear" } }) }] },
  { id: "fillType", variants: () => one((s) => ({ ...s, fill: s.fill.type === "gradient" ? { type: "solid", color: "#FFFFFF" } : { type: "gradient", stops: [{ color: "#FF8A00", at: 0 }, { color: "#7A5CFF", at: 1 }], angle: 90 } })) },
  { id: "gradientColor2", variants: (b) => [{ from: withGradient(b), to: (s) => ({ ...s, fill: s.fill.type === "gradient" ? { ...s.fill, stops: [s.fill.stops[0]!, { color: "#00FF00", at: 1 }] } : s.fill }) }] },
  { id: "gradientAngle", variants: (b) => [{ from: withGradient(b), to: (s) => ({ ...s, fill: s.fill.type === "gradient" ? { ...s.fill, angle: s.fill.angle + 90 } : s.fill }) }] },
  { id: "shadowColor", variants: (b) => [{ from: withShadow(b), to: (s) => ({ ...s, shadows: s.shadows.map((x) => ({ ...x, color: "#AB12CD" })) }) }] },
  { id: "shadowBlur", variants: (b) => [{ from: withShadow(b), to: (s) => ({ ...s, shadows: s.shadows.map((x) => ({ ...x, blur: x.blur + 10 })) }) }] },
  { id: "shadowDistance", variants: (b) => [{ from: withShadow(b), to: (s) => ({ ...s, shadows: s.shadows.map((x) => ({ ...x, y: x.y + 8 })) }) }] },
  { id: "shadowOpacity", variants: (b) => [{ from: withShadow(b), to: (s) => ({ ...s, shadows: s.shadows.map((x) => ({ ...x, opacity: 0.25 })) }) }] },
  { id: "glowColor", variants: (b) => [{ from: { ...b, glow: { ...b.glow, enabled: true } }, to: (s) => ({ ...s, glow: { ...s.glow, color: "#AB12CD" } }) }] },
  { id: "glowSize", variants: (b) => [{ from: { ...b, glow: { ...b.glow, enabled: true } }, to: (s) => ({ ...s, glow: { ...s.glow, radius: s.glow.radius + 12 } }) }] },
  { id: "backgroundPadding", variants: () => one((s) => ({ ...s, background: { ...s.background, padding: s.background.padding + 12 } })) },
  { id: "backgroundRadius", variants: () => one((s) => ({ ...s, background: { ...s.background, radius: s.background.radius + 12 } })) },
  { id: "backgroundBlur", variants: () => one((s) => ({ ...s, background: { ...s.background, blur: s.background.blur + 12 } })) },
  { id: "dimUnspoken", variants: () => one((s) => ({ ...s, inactiveOpacity: s.inactiveOpacity > 0.6 ? 0.3 : 1 })) },
  // intensity scales movement, so test it with a moving entrance where the template offers one
  { id: "motionIntensity", variants: (b, t) => [{ from: withMovingEntrance(b, t), to: (s) => ({ ...s, motionIntensity: s.motionIntensity > 1 ? 0.3 : 1.8 }) }] },
  { id: "emotionReactivity", variants: (b, t) => [{ from: { ...withMovingEntrance(b, t), emotionReactivity: 0 }, to: (s) => ({ ...s, emotionReactivity: 1 }) }] },
  { id: "reveal", variants: () => one((s) => ({ ...s, templateOptions: { ...s.templateOptions, reveal: s.templateOptions.reveal === "all" ? "progressive" : "all" } })) },
];
