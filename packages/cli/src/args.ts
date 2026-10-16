/** Tiny, dependency-free argv parser for the CLI (pure: unit-tested). */
import { CaptionsEasyError } from "./errors";

export type Command =
  | { cmd: "help"; topic?: string }
  | { cmd: "version" }
  | { cmd: "looks"; query?: string; tags: string[]; section?: string; json: boolean }
  | { cmd: "look"; ref: string; json: boolean }
  | { cmd: "build"; words: string; look: string; language?: string; style: Record<string, string>; settings: Record<string, string>; out?: string; json: boolean }
  | { cmd: "transcribe"; video: string; language: "en" | "hinglish" | "auto"; out?: string; json: boolean }
  | {
      cmd: "caption";
      video: string;
      look: string;
      words?: string;
      language: "en" | "hinglish" | "auto";
      style: Record<string, string>;
      settings: Record<string, string>;
      overlay: boolean;
      format?: "mov" | "webm";
      out?: string;
      concurrency?: number;
      json: boolean;
    }
  | { cmd: "mcp" };

const VALUE_FLAGS = new Set(["look", "words", "language", "lang", "set", "out", "o", "format", "tag", "section", "concurrency", "l"]);
const BOOL_FLAGS = new Set(["json", "overlay", "help", "h", "version", "v", "burn"]);

/** Keys that belong to caption pacing (ProjectSettings) rather than the look's style. */
export const SETTINGS_KEYS = new Set(["maxWordsPerCard", "maxLines", "maxCharsPerLine", "pauseMs", "holdMs", "minCardMs", "gapBehavior", "syncOffsetMs", "removeFillers", "profanity"]);

const fail = (m: string): never => {
  throw new CaptionsEasyError("BAD_ARGS", m);
};

interface Parsed {
  positional: string[];
  flags: Map<string, string[]>;
}

export function tokenize(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const add = (k: string, v: string) => flags.set(k, [...(flags.get(k) ?? []), v]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    const m = /^--?([a-zA-Z][\w-]*)(?:=(.*))?$/s.exec(a);
    if (!m) {
      positional.push(a);
      continue;
    }
    const name = m[1]!;
    if (BOOL_FLAGS.has(name)) {
      add(name, m[2] ?? "true");
    } else if (VALUE_FLAGS.has(name)) {
      const v = m[2] ?? argv[++i];
      if (v === undefined) fail(`--${name} needs a value`);
      add(name, v!);
    } else fail(`Unknown option ${a}. Run \`captionseasy --help\`.`);
  }
  return { positional, flags };
}

const LANGS = ["en", "hinglish", "auto"] as const;
function language(p: Parsed): (typeof LANGS)[number] {
  const v = (p.flags.get("language") ?? p.flags.get("lang") ?? ["en"]).at(-1)!.toLowerCase();
  const norm = v === "hi" || v === "hi-latn" ? "hinglish" : v;
  if (!(LANGS as readonly string[]).includes(norm)) fail(`--language must be one of: ${LANGS.join(", ")}`);
  return norm as (typeof LANGS)[number];
}

const last = (p: Parsed, ...names: string[]) => {
  for (const n of names) {
    const v = p.flags.get(n);
    if (v?.length) return v.at(-1);
  }
  return undefined;
};
const has = (p: Parsed, name: string) => (p.flags.get(name) ?? []).some((v) => v !== "false");

/** `--set key=value` pairs, split into style keys and pacing (settings) keys. */
export function parseSets(sets: string[]): { style: Record<string, string>; settings: Record<string, string> } {
  const style: Record<string, string> = {};
  const settings: Record<string, string> = {};
  for (const s of sets) {
    const eq = s.indexOf("=");
    if (eq <= 0) fail(`--set expects key=value (got "${s}"). Example: --set active.color=#FF3366`);
    let key = s.slice(0, eq).trim();
    const value = s.slice(eq + 1).trim();
    if (key.startsWith("settings.")) {
      settings[key.slice("settings.".length)] = value;
      continue;
    }
    if (key.startsWith("style.")) key = key.slice("style.".length);
    if (SETTINGS_KEYS.has(key)) settings[key] = value;
    else style[key] = value;
  }
  return { style, settings };
}

export function parseArgs(argv: string[]): Command {
  const p = tokenize(argv);
  const json = has(p, "json");
  if (has(p, "version") || has(p, "v")) return { cmd: "version" };
  const [first, ...rest] = p.positional;
  if (has(p, "help") || has(p, "h") || !first || first === "help") return { cmd: "help", topic: first === "help" ? rest[0] : first };
  switch (first) {
    case "mcp":
      return { cmd: "mcp" };
    case "looks":
      return { cmd: "looks", query: rest.join(" ") || undefined, tags: p.flags.get("tag") ?? [], section: last(p, "section"), json };
    case "look":
      if (!rest[0]) fail("Usage: captionseasy look <number|id>");
      return { cmd: "look", ref: rest[0]!, json };
    case "build": {
      const words = last(p, "words");
      const look = last(p, "look", "l");
      if (!words || !look) fail("Usage: captionseasy build --words words.json --look <number|id> [--set key=value ...] [--out props.json]");
      const { style, settings } = parseSets(p.flags.get("set") ?? []);
      const lang = last(p, "language", "lang");
      return { cmd: "build", words: words!, look: look!, ...(lang ? { language: lang } : {}), style, settings, out: last(p, "out", "o"), json };
    }
    case "transcribe":
      if (!rest[0]) fail("Usage: captionseasy transcribe <video> [--language en|hinglish|auto] [--out words.json]");
      return { cmd: "transcribe", video: rest[0]!, language: language(p), out: last(p, "out", "o"), json };
  }
  // captionseasy <video> --look ...   (or: captionseasy caption|render <video> ...)
  const video = first === "caption" || first === "render" ? rest[0] : first;
  if (!video) fail("Usage: captionseasy <video> --look <number|id>");
  const extra = (first === "caption" || first === "render" ? rest.slice(1) : rest);
  if (extra.length) fail(`Unexpected argument "${extra[0]}". Options go after the video, e.g. --look 12 --set active.color=#FF3366`);
  const look = last(p, "look", "l");
  if (!look) fail("Pick a look with --look <number|id>. See them with `captionseasy looks`.");
  const format = last(p, "format")?.toLowerCase();
  if (format && format !== "mov" && format !== "webm") fail("--format must be mov or webm");
  const conc = last(p, "concurrency");
  const concurrency = conc === undefined ? undefined : Number(conc);
  if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) fail("--concurrency must be a whole number >= 1");
  const { style, settings } = parseSets(p.flags.get("set") ?? []);
  return {
    cmd: "caption",
    video: video!,
    look: look!,
    words: last(p, "words"),
    language: language(p),
    style,
    settings,
    overlay: has(p, "overlay") || Boolean(format),
    format: format as "mov" | "webm" | undefined,
    out: last(p, "out", "o"),
    concurrency,
    json,
  };
}
