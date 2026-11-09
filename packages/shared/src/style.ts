import { z } from "zod";

export const ACTIVE_EFFECTS = [
  "none", "color", "pop", "box", "underline", "marker", "glow", "bounce", "shake", "fill-sweep", "scale-up", "outline-fill",
  // Slice 1 additions: a hand-drawn ring that draws itself around the spoken word, and a highlight box
  // whose width sweeps across the word as it is spoken (the existing "box" jumps; "marker" is a low swipe)
  "scribble-ring", "box-sweep",
] as const;
export const ENTRANCES = [
  "none", "fade", "rise", "drop", "pop", "zoom", "slide-left", "slide-right", "blur-in", "typewriter", "wave", "flip", "elastic", "glitch", "glitch-slice", "mask-reveal",
  // Envato-styles wave (2026-11-10, original implementations in the shared motion layer):
  // flicker = neon strike-on, scramble = decode resolve, block-reveal = solid block wipe,
  // roll = vertical word roll, write-on = pen reveal subset, jelly = squash-and-stretch settle
  "flicker", "scramble", "block-reveal", "roll", "write-on", "jelly",
  // letter animators: per-letter scale/rotate/tracking driven like an After Effects expression selector
  "letter-spin", "letter-elastic", "letter-snap", "letter-burst", "letter-stretch",
] as const;
export const EXITS = ["none", "fade", "fall", "zoom-out", "blur-out", "slide-up",
  // letter exits: the letter animators played backwards from the end of the card
  "letter-spin", "letter-elastic", "letter-snap", "letter-burst", "letter-stretch"] as const;
export const EASINGS = ["linear", "outQuad", "outCubic", "outExpo", "inOutCubic", "spring"] as const;

const Color = z.string();
const Casing = z.enum(["none", "upper", "lower", "title", "sentence"]);
const Stroke = z.object({
  enabled: z.boolean().default(false),
  width: z.number().min(0).max(40).default(4),
  color: Color.default("#000000"),
});

export const FillSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: Color }),
  z.object({
    type: z.literal("gradient"),
    stops: z.array(z.object({ color: Color, at: z.number().min(0).max(1) })).min(2),
    angle: z.number().default(135),
  }),
]);

export const CaptionStyleSchema = z.object({
  templateId: z.string().default("sentence_highlight"),
  fontId: z.string().default("Montserrat"),
  fontWeight: z.number().int().min(100).max(900).default(800),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  /** reference px at 1080 short edge */
  fontSize: z.number().min(12).max(300).default(64),
  casing: Casing.default("none"),
  letterSpacing: z.number().default(0),
  wordSpacing: z.number().default(0),
  lineHeight: z.number().min(0.7).max(2.5).default(1.15),
  align: z.enum(["left", "center", "right"]).default("center"),
  maxWidth: z.number().min(0.3).max(1).default(0.86),
  fill: FillSchema.default({ type: "solid", color: "#FFFFFF" }),
  inactiveOpacity: z.number().min(0).max(1).default(1),
  hero: z
    .object({
      fontId: z.string().optional(),
      fontWeight: z.number().int().optional(),
      scale: z.number().min(0.5).max(4).default(1.4),
      fill: FillSchema.optional(),
      stroke: Stroke.optional(),
      casing: Casing.optional(),
      rotate: z.number().default(0),
    })
    .default({}),
  active: z
    .object({
      effect: z.enum(ACTIVE_EFFECTS).default("color"),
      color: Color.default("#FFE600"),
      scale: z.number().min(0.8).max(2).default(1.08),
      boxColor: Color.optional(),
      boxRadius: z.number().min(0).max(100).default(12),
    })
    .default({}),
  stroke: Stroke.default({}),
  shadows: z
    .array(z.object({ x: z.number(), y: z.number(), blur: z.number().min(0), color: Color }))
    .max(12)
    .default([]),
  glow: z
    .object({
      enabled: z.boolean().default(false),
      color: Color.default("#FFFFFF"),
      radius: z.number().min(0).max(80).default(12),
      intensity: z.number().min(0).max(2).default(0.8),
    })
    .default({}),
  background: z
    .object({
      type: z.enum(["none", "pill", "box", "bar", "word-box", "bubble"]).default("none"),
      color: Color.default("#000000"),
      opacity: z.number().min(0).max(1).default(0.7),
      padding: z.number().min(0).max(120).default(16),
      radius: z.number().min(0).max(120).default(16),
      blur: z.number().min(0).max(60).default(0),
    })
    .default({}),
  /** normalized 0..1 (center of the caption block) */
  position: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).default({ x: 0.5, y: 0.72 }),
  safeBox: z
    .object({
      top: z.number().min(0).max(0.5),
      bottom: z.number().min(0).max(0.5),
      left: z.number().min(0).max(0.5),
      right: z.number().min(0).max(0.5),
    })
    .default({ top: 0.06, bottom: 0.1, left: 0.06, right: 0.06 }),
  rotation: z.number().min(-45).max(45).default(0),
  entrance: z
    .object({
      type: z.enum(ENTRANCES).default("rise"),
      durationMs: z.number().min(0).max(1500).default(220),
      stagger: z.enum(["none", "word", "char"]).default("none"),
      easing: z.enum(EASINGS).default("outExpo"),
    })
    .default({}),
  exit: z.object({ type: z.enum(EXITS).default("none"), durationMs: z.number().min(0).max(1000).default(120) }).default({}),
  motionIntensity: z.number().min(0).max(2).default(1),
  emotionReactivity: z.number().min(0).max(1).default(0.6),
  emoji: z
    .object({
      enabled: z.boolean().default(false),
      size: z.number().min(0.5).max(3).default(1),
      animation: z.enum(["pop", "float", "spin", "none"]).default("pop"),
    })
    .default({}),
  templateOptions: z.record(z.unknown()).default({}),
});
export type CaptionStyleV2 = z.infer<typeof CaptionStyleSchema>;
export const defaultStyle = (over: Partial<CaptionStyleV2> = {}): CaptionStyleV2 => CaptionStyleSchema.parse(over);
