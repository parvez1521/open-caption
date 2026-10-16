/**
 * words + look (+ overrides) -> validated CaptionedVideo props. Overrides are checked against the controls the look's
 * template really honours, so an agent gets a clear error instead of a setting that silently does nothing.
 */
import { CaptionDocSchema, CaptionStyleSchema, ProjectSettingsSchema, type CaptionStyleV2 } from "@capseasy/shared";
import { normalizeTokens } from "@motion-ai/caption-engine/core";
import { KNOWN_FONTS, getTemplate } from "@capseasy/templates";
import { CaptionsEasyError } from "./errors";
import { CONTROL_DEFS, controlByKey, describeLook, isControlKey, lookBase, rangeOf, resolveLook, settingControls, visibility } from "./looks";
import { flattenOverrides, getKey, setKey } from "./keys";
import type { BuildCaptionsInput, CaptionsProps, SettingControl, TranscriptWord } from "./types";

const NAMED_COLORS = new Set(["transparent", "white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "cyan", "magenta", "gold", "silver", "gray", "grey", "lime", "navy", "teal", "maroon", "olive", "aqua", "fuchsia", "violet", "indigo", "coral", "crimson", "turquoise"]);
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(?:rgba?|hsla?)\(\s*[-\d.%\s,/]+\)$/i;
export const isColor = (v: string) => HEX.test(v) || FUNC.test(v) || NAMED_COLORS.has(v.toLowerCase());

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

function bad(message: string, details?: unknown): never {
  throw new CaptionsEasyError("BAD_OVERRIDE", message, details);
}

interface Spec {
  key: string;
  type: string;
  min?: number;
  max?: number;
  options?: readonly (string | number)[];
}

/** Coerce (CLI strings) and check one value against its control. */
export function coerceValue(spec: Spec, raw: unknown, what = "style"): unknown {
  const k = spec.key;
  switch (spec.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) bad(`${k} must be a number (got ${JSON.stringify(raw)}).`);
      if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) bad(`${k} must be between ${spec.min} and ${spec.max} (got ${n}).`, { key: k, min: spec.min, max: spec.max });
      return n;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).toLowerCase();
      if (TRUE.has(s)) return true;
      if (FALSE.has(s)) return false;
      return bad(`${k} must be true or false (got ${JSON.stringify(raw)}).`);
    }
    case "color": {
      const s = String(raw).trim();
      if (!isColor(s)) bad(`${k} must be a colour like "#FFE600", "rgba(0,0,0,0.6)" or "white" (got ${JSON.stringify(raw)}).`);
      return s;
    }
    case "font": {
      const s = String(raw).trim();
      const hit = KNOWN_FONTS.find((f) => f.toLowerCase() === s.toLowerCase());
      if (!hit) bad(`${k}: "${s}" is not a bundled font. Use one of: ${KNOWN_FONTS.join(", ")}.`, { key: k, options: KNOWN_FONTS });
      return hit;
    }
    case "enum": {
      const s = String(raw).trim();
      if (!spec.options?.includes(s)) bad(`${k} must be one of: ${spec.options?.join(", ")} (got ${JSON.stringify(raw)}).`, { key: k, options: spec.options });
      return s;
    }
  }
  return bad(`Unsupported ${what} key ${k}.`);
}

/** Apply style overrides to a look's style. Unknown or unsupported keys are errors that list what is allowed. */
export function applyStyleOverrides(lookRef: BuildCaptionsInput["look"], base: CaptionStyleV2, overrides: Record<string, unknown>, warnings: string[]): CaptionStyleV2 {
  const look = resolveLook(lookRef);
  const t = getTemplate(look.templateId);
  const pairs = flattenOverrides(overrides, isControlKey);
  let style = base;
  const touched: string[] = [];
  // prerequisites first ("stroke.enabled" before "stroke.width"), so order in the input never matters
  const rank = (k: string) => (CONTROL_DEFS.findIndex((d) => d.key === k) === -1 ? 999 : CONTROL_DEFS.some((d) => d.needs?.label.startsWith(`${k}=`)) ? 0 : 1);
  pairs.sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [key, raw] of pairs) {
    const def = controlByKey(key);
    if (!def) {
      const valid = describeLook(lookRef).controls.map((c) => c.key);
      bad(`Unknown style key "${key}". ${look.name} (#${look.number}) accepts: ${valid.join(", ")}.`, { key, validKeys: valid });
    }
    const vis = visibility(def, t, style);
    if (!vis.visible) {
      const valid = describeLook(lookRef).controls.map((c) => c.key);
      bad(`${look.name} (#${look.number}) does not use "${key}" (its design ignores it), so it was rejected rather than silently doing nothing. It accepts: ${valid.join(", ")}.`, { key, validKeys: valid });
    }
    const options = def.options && def.type === "enum" ? def.options(t) : undefined;
    const value = coerceValue({ key, type: def.type, ...rangeOf(def, getKey(base, key)), options }, raw);
    style = setKey(style, key, value);
    touched.push(key);
  }
  // a setting whose switch is off: turn the switch on when that is harmless, else say what it needs
  for (const key of touched) {
    const def = controlByKey(key)!;
    const v = visibility(def, t, style);
    if (v.visible && v.needs) {
      if (v.needs.auto) {
        style = v.needs.apply(style);
        warnings.push(`set ${v.needs.label} because ${key} only shows when it is on`);
      } else {
        bad(`"${key}" only takes effect when ${v.needs.label}. Set that too (it changes the look's motion, so it is not switched on automatically).`, { key, dependsOn: v.needs.label });
      }
    }
  }
  const parsed = CaptionStyleSchema.safeParse(style);
  if (!parsed.success) bad(`The overrides produce an invalid style: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

export function applySettingsOverrides(controls: SettingControl[], base: Record<string, unknown>, overrides: Record<string, unknown>, lookLabel: string, warnings: string[]) {
  const out: Record<string, unknown> = { ...base };
  for (const [key, raw] of Object.entries(overrides)) {
    const c = controls.find((x) => x.key === key);
    if (!c) {
      if (key === "maxWordsPerCard" || key === "maxLines" || key === "maxCharsPerLine") {
        warnings.push(`${key} ignored: ${lookLabel} is composed for a fixed number of words/lines`);
        continue;
      }
      throw new CaptionsEasyError("BAD_SETTINGS", `Unknown setting "${key}". Settings: ${controls.map((x) => x.key).join(", ")}.`, { key, validKeys: controls.map((x) => x.key) });
    }
    try {
      out[key] = coerceValue(c, raw, "setting");
    } catch (e) {
      throw new CaptionsEasyError("BAD_SETTINGS", (e as Error).message, (e as CaptionsEasyError).details);
    }
  }
  const parsed = ProjectSettingsSchema.safeParse(out);
  if (!parsed.success) throw new CaptionsEasyError("BAD_SETTINGS", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

/** Validate caller words (any order, untrimmed) into clean, monotonic, id-stamped doc words. */
export function toDocWords(words: TranscriptWord[], durationMs?: number) {
  if (!Array.isArray(words)) throw new CaptionsEasyError("BAD_WORDS", "words must be an array of { text, startMs, endMs }.");
  words.forEach((w, i) => {
    if (!w || typeof w.text !== "string" || !Number.isFinite(w.startMs) || !Number.isFinite(w.endMs)) {
      throw new CaptionsEasyError("BAD_WORDS", `words[${i}] must be { text: string, startMs: number, endMs: number } (milliseconds), got ${JSON.stringify(w)}.`);
    }
    if (w.endMs < w.startMs) throw new CaptionsEasyError("BAD_WORDS", `words[${i}] ("${w.text}") ends before it starts.`);
  });
  return normalizeTokens(
    words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
    durationMs ? { durationMs } : {},
  );
}

/**
 * Turn timed words + a look (+ optional style and pacing overrides) into validated props for the CaptionedVideo
 * composition. Pure and synchronous: no files, no network.
 */
export function buildCaptions(input: BuildCaptionsInput & { durationMs?: number }): CaptionsProps {
  const look = resolveLook(input.look);
  const warnings: string[] = [];
  const base = lookBase(look);
  const style = input.overrides && Object.keys(input.overrides).length ? applyStyleOverrides(input.look, base.style, input.overrides, warnings) : base.style;
  const label = `${look.name} (#${look.number})`;
  const settings = applySettingsOverrides(settingControls(look, base.settings), base.settings, input.settings ?? {}, label, warnings);
  const words = toDocWords(input.words, input.durationMs);
  if (!words.length) warnings.push("no words to caption: the output will have no captions");
  const doc = CaptionDocSchema.parse({ version: 2, language: input.language ?? "en", words });
  return {
    doc: doc as CaptionsProps["doc"],
    style: style as CaptionsProps["style"],
    settings: settings as CaptionsProps["settings"],
    look: { number: look.number ?? 0, id: look.id, name: look.name },
    warnings,
  };
}
