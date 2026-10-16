/**
 * The look catalogue for agents: list, search and describe looks, and the exact controls each look honours.
 * Everything here is derived from the templates package (the studio's own registry, controlVisible(), the zod
 * schemas), so it cannot drift from what the renderer does.
 */
import { CaptionStyleSchema, ProjectSettingsSchema, type CaptionStyleV2, type ProjectSettings } from "@capseasy/shared";
import {
  BACKGROUND_TYPES,
  KNOWN_FONTS,
  LOOKS,
  LOOK_SECTIONS,
  applyLook,
  controlVisible,
  effectsFor,
  entrancesFor,
  exitsFor,
  getLook,
  getTemplate,
  lookNumber,
  isRetiredLook,
  LOOK_NUMBER_ORDER,
  type ControlId,
  type LookDefinition,
  type TemplateDefinition,
} from "@capseasy/templates";
import { CaptionsEasyError } from "./errors";
import { getKey, setKey } from "./keys";
import type { ControlType, ListLooksOptions, LookControl, LookDetails, LookRef, LookSummary, SettingControl } from "./types";

// ---------------------------------------------------------------- zod introspection

type ZodLike = { _def: { typeName: string; innerType?: ZodLike; schema?: ZodLike; type?: ZodLike; values?: readonly string[]; checks?: { kind: string; value: number }[]; options?: ZodLike[] }; shape?: Record<string, ZodLike> };

const unwrap = (z: ZodLike): ZodLike => {
  let cur = z;
  for (let i = 0; i < 10; i++) {
    const d = cur._def;
    if ((d.typeName === "ZodDefault" || d.typeName === "ZodOptional" || d.typeName === "ZodNullable") && d.innerType) cur = d.innerType;
    else if (d.typeName === "ZodEffects" && d.schema) cur = d.schema;
    else break;
  }
  return cur;
};

/** The zod schema at a style path ("active.effect", "shadows.blur" walks into the array element). */
function schemaAt(root: ZodLike, path: string): ZodLike | undefined {
  let cur: ZodLike | undefined = unwrap(root);
  for (const part of path.split(".")) {
    if (!cur) return undefined;
    if (cur._def.typeName === "ZodArray" && cur._def.type) cur = unwrap(cur._def.type);
    const shape: Record<string, ZodLike> | undefined = (cur as { shape?: Record<string, ZodLike> }).shape;
    cur = shape?.[part] ? unwrap(shape[part]) : undefined;
  }
  if (cur?._def.typeName === "ZodArray" && cur._def.type) cur = unwrap(cur._def.type);
  return cur;
}

const enumValues = (root: ZodLike, path: string): string[] => [...(schemaAt(root, path)?._def.values ?? [])];
function numberBounds(root: ZodLike, path: string): { min?: number; max?: number } {
  const checks = schemaAt(root, path)?._def.checks ?? [];
  return { min: checks.find((c) => c.kind === "min")?.value, max: checks.find((c) => c.kind === "max")?.value };
}

const STYLE = CaptionStyleSchema as unknown as ZodLike;
const SETTINGS = ProjectSettingsSchema as unknown as ZodLike;

// ---------------------------------------------------------------- the control table

interface ControlDef {
  id: ControlId;
  key: string;
  label: string;
  type: ControlType;
  /** the schema path the value is validated against (defaults to key) */
  schemaPath?: string;
  /** designed range (the studio's slider); clipped to the schema's own bounds */
  min?: number;
  max?: number;
  step?: number;
  options?: (t: TemplateDefinition) => readonly string[];
  /** turns on what this control needs ("stroke.enabled=true"); used to list it and, when `auto`, to apply it */
  needs?: { label: string; apply: (s: CaptionStyleV2) => CaptionStyleV2; auto: boolean };
  description?: string;
}

const on = (key: string, value: unknown, auto = true) => ({ label: `${key}=${value}`, apply: (s: CaptionStyleV2) => setKey(s, key, value), auto });
const SCALED = ["pop", "scale-up", "box", "bounce", "shake"];

export const CONTROL_DEFS: ControlDef[] = [
  { id: "font", key: "fontId", label: "Font", type: "font", options: () => KNOWN_FONTS, description: "Google font family (bundled loaders)" },
  { id: "size", key: "fontSize", label: "Size", type: "number", min: 24, max: 140, step: 1, description: "px at a 1080 px short edge; scales with the video" },
  { id: "weight", key: "fontWeight", label: "Weight", type: "number", min: 300, max: 900, step: 100 },
  { id: "casing", key: "casing", label: "Case", type: "enum", options: () => enumValues(STYLE, "casing") },
  { id: "align", key: "align", label: "Align", type: "enum", options: () => enumValues(STYLE, "align") },
  { id: "letterSpacing", key: "letterSpacing", label: "Letter spacing", type: "number", min: -4, max: 20, step: 0.5 },
  { id: "wordSpacing", key: "wordSpacing", label: "Word spacing", type: "number", min: -10, max: 40, step: 1 },
  { id: "lineHeight", key: "lineHeight", label: "Line height", type: "number", min: 0.8, max: 2, step: 0.05 },
  { id: "fillType", key: "fill.type", label: "Text fill", type: "enum", options: () => ["solid", "gradient"] },
  { id: "textColor", key: "fill.color", label: "Text colour", type: "color", description: "solid text colour (gradient start when fill.type=gradient)" },
  { id: "gradientColor2", key: "fill.endColor", label: "Gradient end colour", type: "color", needs: on("fill.type", "gradient") },
  { id: "gradientAngle", key: "fill.angle", label: "Gradient angle", type: "number", min: 0, max: 360, step: 5, needs: on("fill.type", "gradient") },
  { id: "highlightColor", key: "active.color", label: "Highlight / key word colour", type: "color", description: "colour of the spoken word's effect and of the key word" },
  { id: "effect", key: "active.effect", label: "Spoken-word effect", type: "enum", options: (t) => effectsFor(t) },
  { id: "boxColor", key: "active.boxColor", label: "Box colour", type: "color", needs: on("active.effect", "box", false) },
  { id: "effectStrength", key: "active.scale", label: "Effect strength", type: "number", min: 1, max: 1.5, step: 0.02, description: "how strongly pop/scale/box/bounce/shake effects move" },
  { id: "dimUnspoken", key: "inactiveOpacity", label: "Not-yet-spoken words opacity", type: "number", min: 0.1, max: 1, step: 0.05, needs: on("templateOptions.reveal", "all", false) },
  { id: "reveal", key: "templateOptions.reveal", label: "Words appear", type: "enum", options: () => ["progressive", "all"], description: "progressive = as spoken, all = whole card at once" },
  { id: "heroScale", key: "hero.scale", label: "Key word size", type: "number", min: 1, max: 3, step: 0.05 },
  { id: "heroFont", key: "hero.fontId", label: "Key word font", type: "font", options: () => KNOWN_FONTS },
  { id: "outline", key: "stroke.enabled", label: "Outline", type: "boolean" },
  { id: "outlineWidth", key: "stroke.width", label: "Outline width", type: "number", min: 1, max: 16, step: 0.5, needs: on("stroke.enabled", true) },
  { id: "outlineColor", key: "stroke.color", label: "Outline colour", type: "color", needs: on("stroke.enabled", true) },
  { id: "shadow", key: "shadow.enabled", label: "Drop shadow", type: "boolean" },
  { id: "shadowColor", key: "shadow.color", label: "Shadow colour", type: "color", schemaPath: "shadows.color", needs: on("shadow.enabled", true) },
  { id: "shadowBlur", key: "shadow.blur", label: "Shadow softness", type: "number", min: 0, max: 40, step: 1, schemaPath: "shadows.blur", needs: on("shadow.enabled", true) },
  { id: "shadowDistance", key: "shadow.distance", label: "Shadow distance", type: "number", min: 0, max: 30, step: 1, schemaPath: "shadows.y", needs: on("shadow.enabled", true) },
  { id: "glow", key: "glow.enabled", label: "Glow", type: "boolean" },
  { id: "glowColor", key: "glow.color", label: "Glow colour", type: "color", needs: on("glow.enabled", true) },
  { id: "glowSize", key: "glow.radius", label: "Glow size", type: "number", min: 2, max: 60, step: 1, needs: on("glow.enabled", true) },
  { id: "background", key: "background.type", label: "Background", type: "enum", options: () => BACKGROUND_TYPES },
  { id: "backgroundColor", key: "background.color", label: "Background colour", type: "color", needs: on("background.type", "box") },
  { id: "backgroundOpacity", key: "background.opacity", label: "Background opacity", type: "number", min: 0.1, max: 1, step: 0.05, needs: on("background.type", "box") },
  { id: "backgroundPadding", key: "background.padding", label: "Background padding", type: "number", min: 0, max: 60, step: 1, needs: on("background.type", "box") },
  { id: "backgroundRadius", key: "background.radius", label: "Background corner radius", type: "number", min: 0, max: 100, step: 1, needs: on("background.type", "box") },
  { id: "backgroundBlur", key: "background.blur", label: "Frosted blur", type: "number", min: 0, max: 40, step: 1, needs: on("background.type", "box") },
  { id: "positionY", key: "position.y", label: "Vertical position", type: "number", min: 0.05, max: 0.95, step: 0.01, description: "centre of the captions, 0 = top, 1 = bottom" },
  { id: "positionX", key: "position.x", label: "Horizontal position", type: "number", min: 0.05, max: 0.95, step: 0.01, description: "0 = left, 1 = right" },
  { id: "maxWidth", key: "maxWidth", label: "Max width", type: "number", min: 0.3, max: 1, step: 0.01, description: "fraction of the frame width" },
  { id: "rotation", key: "rotation", label: "Rotation", type: "number", min: -15, max: 15, step: 0.5, description: "degrees" },
  { id: "entrance", key: "entrance.type", label: "Entrance", type: "enum", options: (t) => entrancesFor(t) },
  { id: "entranceSpeed", key: "entrance.durationMs", label: "Entrance duration (ms)", type: "number", min: 80, max: 800, step: 20, needs: on("entrance.type", "rise", false) },
  { id: "stagger", key: "entrance.stagger", label: "Animate", type: "enum", options: () => enumValues(STYLE, "entrance.stagger"), needs: on("entrance.type", "rise", false), description: "none = whole card, word = word by word, char = letter by letter" },
  { id: "easing", key: "entrance.easing", label: "Easing", type: "enum", options: () => enumValues(STYLE, "entrance.easing").filter((e) => e !== "spring"), needs: on("entrance.type", "rise", false) },
  { id: "exit", key: "exit.type", label: "Exit", type: "enum", options: (t) => exitsFor(t) },
  { id: "exitSpeed", key: "exit.durationMs", label: "Exit duration (ms)", type: "number", min: 80, max: 800, step: 20, needs: on("exit.type", "fade", false) },
  { id: "motionIntensity", key: "motionIntensity", label: "Motion intensity", type: "number", min: 0, max: 2, step: 0.05 },
  { id: "emotionReactivity", key: "emotionReactivity", label: "Emotion reactivity", type: "number", min: 0, max: 1, step: 0.05, description: "how much exclamations/questions change the motion" },
];

const byKey = new Map(CONTROL_DEFS.map((c) => [c.key, c]));
export const isControlKey = (key: string) => byKey.has(key);
export const controlByKey = (key: string) => byKey.get(key);

/** effectStrength's prerequisite depends on which scaled effects the template offers */
function needsFor(def: ControlDef, t: TemplateDefinition): ControlDef["needs"] {
  if (def.id !== "effectStrength") return def.needs;
  const e = effectsFor(t).find((x) => SCALED.includes(x));
  return e ? { label: `active.effect=${effectsFor(t).filter((x) => SCALED.includes(x)).join("|")}`, apply: (s) => setKey(s, "active.effect", e), auto: false } : undefined;
}

/** Designed range, clipped to the schema's bounds and widened to include the look's own value. */
export function rangeOf(def: ControlDef, lookValue?: unknown): { min?: number; max?: number } {
  if (def.type !== "number") return {};
  const z = numberBounds(STYLE, def.schemaPath ?? def.key);
  let min = Math.max(def.min ?? -Infinity, z.min ?? -Infinity);
  let max = Math.min(def.max ?? Infinity, z.max ?? Infinity);
  if (typeof lookValue === "number" && Number.isFinite(lookValue)) {
    min = Math.min(min, lookValue);
    max = Math.max(max, lookValue);
  }
  return { ...(Number.isFinite(min) ? { min } : {}), ...(Number.isFinite(max) ? { max } : {}) };
}

export type Visibility = { visible: true; needs?: undefined } | { visible: true; needs: NonNullable<ControlDef["needs"]> } | { visible: false };

/** Does the look's template honour this control as the style stands (or once its prerequisite is switched on)? */
export function visibility(def: ControlDef, t: TemplateDefinition, s: CaptionStyleV2): Visibility {
  if (def.options && def.type === "enum" && def.options(t).length < 2) return { visible: false };
  if (controlVisible(def.id, t, s)) return { visible: true };
  const needs = needsFor(def, t);
  if (needs && controlVisible(def.id, t, needs.apply(s))) return { visible: true, needs };
  return { visible: false };
}

// ---------------------------------------------------------------- looks

const sectionOf = new Map<string, string>();
for (const s of LOOK_SECTIONS) for (const id of s.lookIds) if (!sectionOf.has(id)) sectionOf.set(id, s.id);

function wordsPerCard(look: LookDefinition): number {
  return applyLook(look).settings.maxWordsPerCard ?? 3;
}

function summary(look: LookDefinition): LookSummary {
  const t = getTemplate(look.templateId);
  return {
    number: look.number ?? lookNumber(look.id) ?? 0,
    id: look.id,
    name: look.name,
    section: sectionOf.get(look.id) ?? look.category.toLowerCase(),
    tags: look.tags ?? [],
    description: look.description,
    layout: t.layout === "word" ? "word" : t.layout.replace(/^pack-/, ""),
    wordsPerCard: wordsPerCard(look),
  };
}

/** Resolve a look number (118, "118", "#118") or id. Retired looks still resolve (projects keep rendering). */
export function resolveLook(ref: LookRef): LookDefinition {
  const raw = typeof ref === "number" ? String(ref) : String(ref ?? "").trim();
  const num = /^#?\d+$/.test(raw) ? Number(raw.replace("#", "")) : NaN;
  const id = Number.isFinite(num) ? LOOK_NUMBER_ORDER[num - 1] : raw.toLowerCase().replace(/[\s-]+/g, "_");
  const look = id ? getLook(id) : undefined;
  if (!look) {
    const hint = Number.isFinite(num) ? `Look numbers run from 1 to ${LOOK_NUMBER_ORDER.length}.` : `Run \`captionseasy looks\` (or list_looks) to see every look.`;
    const close = !Number.isFinite(num) && raw ? listLooks({ query: raw }).slice(0, 5).map((l) => `${l.number} ${l.id}`) : [];
    throw new CaptionsEasyError("UNKNOWN_LOOK", `Unknown look "${raw}". ${hint}${close.length ? ` Did you mean: ${close.join(", ")}?` : ""}`, close.length ? { suggestions: close } : undefined);
  }
  return { ...look, number: look.number ?? lookNumber(look.id) };
}

/** The gallery looks (retired ones excluded), in gallery order. */
export function listLooks(opts: ListLooksOptions = {}): LookSummary[] {
  const terms = (opts.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const tags = (opts.tags ?? []).map((t) => t.toLowerCase());
  return LOOKS.map(summary).filter((l) => {
    if (opts.section && l.section !== opts.section.toLowerCase()) return false;
    const hay = `${l.number} #${l.number} ${l.id} ${l.name} ${l.description} ${l.tags.join(" ")} ${l.section} ${l.layout}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return false;
    return tags.every((t) => l.tags.some((x) => x.toLowerCase().includes(t)));
  });
}

/** Pacing controls every look shares (the studio's Settings panel). */
export function settingControls(look: LookDefinition, settings: ProjectSettings): SettingControl[] {
  const t = getTemplate(look.templateId);
  const oneWord = t.layout === "word";
  const usesLines = !oneWord && t.layout !== "stack3" && t.layout !== "kinetic";
  const num = (key: keyof ProjectSettings, label: string, min: number, max: number, step: number, description?: string): SettingControl => {
    const z = numberBounds(SETTINGS, key);
    return { key, label, type: "number", min: Math.max(min, z.min ?? min), max: Math.min(max, z.max ?? max), step, default: settings[key], ...(description ? { description } : {}) };
  };
  const out: SettingControl[] = [];
  if (!oneWord && !t.fixedWordsPerCard) out.push(num("maxWordsPerCard", "Words per card", 1, 12, 1, "2 = fast (hooks, Shorts), 4 = normal, 7 = slow (podcasts)"));
  if (usesLines) out.push(num("maxLines", "Max lines", 1, 3, 1), num("maxCharsPerLine", "Characters per line", 8, 60, 1));
  out.push(
    num("pauseMs", "New card after a pause of (ms)", 150, 1500, 50),
    num("holdMs", "Keep card on screen after speech (ms)", 0, 1500, 50),
    num("minCardMs", "Minimum card time (ms)", 200, 2000, 50),
    { key: "gapBehavior", label: "During silence", type: "enum", options: enumValues(SETTINGS, "gapBehavior"), default: settings.gapBehavior, description: "hold = keep the last card, clear = empty screen" },
    num("syncOffsetMs", "Sync offset (ms)", -1000, 1000, 10, "positive = captions later"),
    { key: "removeFillers", label: "Remove filler words (um, uh)", type: "boolean", default: settings.removeFillers },
    { key: "profanity", label: "Profanity", type: "enum", options: ["off", "mask", "hide"], default: settings.profanity },
  );
  return out;
}

/** A look's resolved style + pacing (the starting point every override applies to). */
export function lookBase(look: LookDefinition): { style: CaptionStyleV2; settings: ProjectSettings } {
  const { style, settings } = applyLook(look);
  return { style, settings: ProjectSettingsSchema.parse(settings) };
}

/** Everything an agent needs to use and customise one look. */
export function describeLook(ref: LookRef): LookDetails {
  const look = resolveLook(ref);
  const t = getTemplate(look.templateId);
  const { style, settings } = lookBase(look);
  const controls: LookControl[] = [];
  const defaults: Record<string, unknown> = {};
  for (const def of CONTROL_DEFS) {
    const v = visibility(def, t, style);
    if (!v.visible) continue;
    // what the renderer uses when the key is unset (the hero font is the body font, the box is the highlight colour,
    // a shadow/gradient gets the default it would be switched on with)
    const value = getKey(style, def.key) ?? (v.needs ? getKey(v.needs.apply(style), def.key) : undefined);
    const fallback = value ?? (def.key === "hero.fontId" ? style.fontId : def.key === "active.boxColor" ? style.active.color : undefined);
    defaults[def.key] = fallback;
    controls.push({
      key: def.key,
      label: def.label,
      type: def.type,
      ...rangeOf(def, fallback),
      ...(def.step !== undefined ? { step: def.step } : {}),
      ...(def.options && def.type === "enum" ? { options: [...def.options(t)] } : {}),
      default: fallback ?? null,
      ...(v.needs ? { dependsOn: v.needs.label } : {}),
      ...(def.description ? { description: def.description } : {}),
    });
  }
  return { ...summary(look), retired: isRetiredLook(look.id), defaults, controls, settings: settingControls(look, settings) };
}
