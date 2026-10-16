/**
 * Dot-path access into a CaptionStyle, plus a few "virtual" keys that hide the style's internal shapes from callers:
 *   fill.color / fill.type / fill.endColor / fill.angle   (solid colour or two-stop gradient)
 *   shadow.enabled / shadow.color / shadow.blur / shadow.distance   (the first drop shadow)
 * Every other key is a plain path ("active.color", "stroke.width", "templateOptions.reveal").
 */
import type { CaptionStyleV2 } from "@capseasy/shared";

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

const DEFAULT_SHADOW = { x: 0, y: 4, blur: 6, color: "rgba(0,0,0,0.6)" };

export function getKey(s: CaptionStyleV2, key: string): unknown {
  const f = s.fill;
  switch (key) {
    case "fill.color": return f.type === "solid" ? f.color : f.stops[0]?.color;
    case "fill.endColor": return f.type === "gradient" ? f.stops[f.stops.length - 1]?.color : undefined;
    case "fill.angle": return f.type === "gradient" ? f.angle : undefined;
    case "shadow.enabled": return s.shadows.length > 0;
    case "shadow.color": return s.shadows[0]?.color;
    case "shadow.blur": return s.shadows[0]?.blur;
    case "shadow.distance": return s.shadows[0]?.y;
  }
  let cur: unknown = s;
  for (const part of key.split(".")) {
    if (!isPlain(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

const solidOf = (s: CaptionStyleV2) => (s.fill.type === "solid" ? s.fill.color : s.fill.stops[0]?.color ?? "#FFFFFF");

/** Returns a new style with `key` set (no validation here: callers validate values and the final style). */
export function setKey(s: CaptionStyleV2, key: string, value: unknown): CaptionStyleV2 {
  const f = s.fill;
  switch (key) {
    case "fill.color":
      return { ...s, fill: f.type === "gradient" ? { ...f, stops: [{ color: String(value), at: 0 }, ...f.stops.slice(1)] } : { type: "solid", color: String(value) } };
    case "fill.type":
      if (value === f.type) return s;
      return { ...s, fill: value === "gradient" ? { type: "gradient", stops: [{ color: solidOf(s), at: 0 }, { color: s.active.color, at: 1 }], angle: 90 } : { type: "solid", color: solidOf(s) } };
    case "fill.endColor": {
      const g = f.type === "gradient" ? f : { type: "gradient" as const, stops: [{ color: solidOf(s), at: 0 }, { color: s.active.color, at: 1 }], angle: 90 };
      return { ...s, fill: { ...g, stops: [...g.stops.slice(0, -1), { color: String(value), at: 1 }] } };
    }
    case "fill.angle": {
      const g = f.type === "gradient" ? f : { type: "gradient" as const, stops: [{ color: solidOf(s), at: 0 }, { color: s.active.color, at: 1 }], angle: 90 };
      return { ...s, fill: { ...g, angle: Number(value) } };
    }
    case "stroke.enabled":
      // an outline switched on gets a visible width (the studio does the same)
      return { ...s, stroke: { ...s.stroke, enabled: Boolean(value), width: value ? s.stroke.width || 3 : s.stroke.width } };
    case "shadow.enabled":
      return { ...s, shadows: value ? (s.shadows.length ? s.shadows : [DEFAULT_SHADOW]) : [] };
    case "shadow.color": case "shadow.blur": case "shadow.distance": {
      const field = key === "shadow.distance" ? "y" : key.slice("shadow.".length);
      const list = s.shadows.length ? s.shadows : [DEFAULT_SHADOW];
      return { ...s, shadows: list.map((x, i) => (i === 0 ? { ...x, [field]: value } : x)) };
    }
  }
  const parts = key.split(".");
  const write = (obj: Plain, i: number): Plain => {
    const k = parts[i]!;
    if (i === parts.length - 1) return { ...obj, [k]: value };
    return { ...obj, [k]: write(isPlain(obj[k]) ? (obj[k] as Plain) : {}, i + 1) };
  };
  return write(s as unknown as Plain, 0) as unknown as CaptionStyleV2;
}

/** `{active: {color: "#f00"}}` and `{"active.color": "#f00"}` both become `[["active.color", "#f00"]]`. */
export function flattenOverrides(o: Record<string, unknown>, known: (key: string) => boolean, prefix = ""): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlain(v) && !known(key)) out.push(...flattenOverrides(v, known, key));
    else out.push([key, v]);
  }
  return out;
}
