/**
 * `captionseasy mcp`: the library as an MCP server over stdio (newline-delimited JSON-RPC 2.0, the MCP stdio
 * transport). Written without the MCP SDK so the core package keeps zero runtime dependencies; it implements what
 * a tools-only server needs: initialize, ping, tools/list, tools/call (+ progress notifications).
 * stdout carries the protocol, so every log line goes to stderr.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { loadAddon } from "./addons";
import { buildCaptions } from "./captions";
import { CaptionsEasyError, errorJson } from "./errors";
import { describeLook, listLooks } from "./looks";
import type { LookRef, TranscriptWord } from "./types";
import { VERSION } from "./version";
import { readWordsFile } from "./words-file";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCTIONS = `CaptionsEasy gives you designed, animated caption styles ("looks") and turns timed words into ready-to-render caption props, on this machine (free, no API keys).
Typical flow when you already have word timings: build_captions({ words, look }) -> props { doc, style, settings } for the CaptionedVideo Remotion composition (npm package "captionseasy/remotion").
To get a finished video file instead: caption_video({ video, look, words }) (needs the add-on captionseasy-render; without words it also needs captionseasy-transcribe).
Pick a look with list_looks (query like "bold", "minimal", "karaoke", "one word"), or use 12 (Jumping Box) or 105 (Classic Subtitle) as safe defaults.
Only call describe_look when the user asks for a change (colour, size, position, pacing); pass those as overrides/settings.`;

// ---------------------------------------------------------------- tool definitions (JSON Schema)

const lookSchema = { anyOf: [{ type: "integer" }, { type: "string" }], description: 'Look number (e.g. 12) or id (e.g. "hormozi_box"), from list_looks' };
const wordsSchema = {
  type: "array",
  description: "Timed words, milliseconds on the video's clock",
  items: { type: "object", properties: { text: { type: "string" }, startMs: { type: "number" }, endMs: { type: "number" } }, required: ["text", "startMs", "endMs"] },
};
const overridesSchema = { type: "object", additionalProperties: true, description: 'Style changes, keys from describe_look controls (flat dot paths), e.g. {"active.color": "#FF3366", "fontSize": 80, "position.y": 0.8}' };
const settingsSchema = { type: "object", additionalProperties: true, description: 'Pacing changes, keys from describe_look settings, e.g. {"maxWordsPerCard": 2}' };
const languageSchema = { type: "string", enum: ["en", "hinglish", "auto"] };

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  run: (args: Record<string, unknown>, progress: (fraction: number, message: string) => void) => Promise<unknown> | unknown;
}

const wordsFrom = (a: Record<string, unknown>): { words?: TranscriptWord[]; language?: string } => {
  if (a.words !== undefined) return { words: a.words as TranscriptWord[] };
  if (typeof a.words_file === "string") return readWordsFile(a.words_file);
  return {};
};

export const TOOLS: Tool[] = [
  {
    name: "list_looks",
    title: "List caption looks",
    description:
      "List CaptionsEasy's designed caption looks (99). Each has a permanent `number` and an `id`; pass either to build_captions / caption_video. " +
      'Filter with `query` (free text over name, description, tags and section, e.g. "bold", "neon", "subtitle", "one word", "karaoke") ' +
      "or `section` (viral, popular, premium, trending, creator, dynamic, typography, simple, paper, plus clean/fun/retro/tech...). " +
      "`layout: word` looks show one word at a time (punchy Shorts/TikTok); sentence/karaoke looks show short phrases (talking heads, tutorials).",
    inputSchema: { type: "object", properties: { query: { type: "string" }, tags: { type: "array", items: { type: "string" } }, section: { type: "string" } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a) => listLooks({ query: a.query as string | undefined, tags: a.tags as string[] | undefined, section: a.section as string | undefined }),
  },
  {
    name: "describe_look",
    title: "Describe a caption look",
    description:
      "One look's defaults and the ONLY style controls its design responds to: `controls` [{ key, type, min/max/options, default, dependsOn }] and pacing `settings` (maxWordsPerCard, pauseMs, gapBehavior...). " +
      'Use it to turn a request like "make the highlight pink and put captions higher" into overrides, e.g. { "active.color": "#FF3366", "position.y": 0.6 }. Keys not listed here are rejected.',
    inputSchema: { type: "object", properties: { look: lookSchema }, required: ["look"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (a) => describeLook(a.look as LookRef),
  },
  {
    name: "build_captions",
    title: "Build caption props",
    description:
      "Turn timed words + a look (+ optional overrides/settings) into validated props { doc, style, settings } for the CaptionedVideo Remotion composition " +
      '(import { CaptionedVideo } from "captionseasy/remotion"; render it in your own timeline, mode "burn" over a video or "overlay" for captions only). ' +
      "Pure and instant: no video, no rendering. Pass `words` inline or `words_file` (a JSON file with an array or { words }). Pass `out` to write the props to a file and get a short summary back instead of the full JSON. " +
      "Invalid keys/values return a clear error listing what is allowed.",
    inputSchema: {
      type: "object",
      properties: { look: lookSchema, words: wordsSchema, words_file: { type: "string" }, overrides: overridesSchema, settings: settingsSchema, language: { type: "string", description: 'Language tag stored in the doc (default "en")' }, out: { type: "string", description: "Optional path to write the props JSON" } },
      required: ["look"],
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
    run: (a) => {
      const w = wordsFrom(a);
      if (!w.words) throw new CaptionsEasyError("BAD_WORDS", "Pass `words` ([{ text, startMs, endMs }]) or `words_file`.");
      const props = buildCaptions({ words: w.words, look: a.look as LookRef, overrides: a.overrides as Record<string, unknown>, settings: a.settings as Record<string, unknown>, language: (a.language as string) ?? w.language });
      if (typeof a.out !== "string") return props;
      writeFileSync(resolve(a.out), JSON.stringify(props, null, 2));
      return { out: resolve(a.out), look: props.look, words: props.doc.words.length, warnings: props.warnings };
    },
  },
  {
    name: "caption_video",
    title: "Caption a video file",
    description:
      "Render captions onto a local video, entirely on this machine. Needs the add-on `captionseasy-render` (returns ADDON_MISSING with the install command if absent). " +
      "Give `words` / `words_file`; without them the video is transcribed first (needs the add-on `captionseasy-transcribe`). " +
      'mode "burn" (default) writes an MP4 with captions and the original audio; mode "overlay" writes only the captions on a transparent background, same size/length as the video: ' +
      'overlay_format "mov" (ProRes 4444, default, every NLE) or "webm" (VP9 alpha, small). `overrides`/`settings` as in build_captions. ' +
      "Returns { out, durationMs, width, height, look, words, renderMs }. Takes roughly real time to a few times real time.",
    inputSchema: {
      type: "object",
      properties: {
        video: { type: "string", description: "Absolute path of the local video file" },
        look: lookSchema,
        out: { type: "string", description: "Output path (default: next to the video)" },
        mode: { type: "string", enum: ["burn", "overlay"] },
        overlay_format: { type: "string", enum: ["mov", "webm"] },
        words: wordsSchema,
        words_file: { type: "string" },
        language: languageSchema,
        overrides: overridesSchema,
        settings: settingsSchema,
      },
      required: ["video", "look"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (a, progress) => {
      const w = wordsFrom(a);
      const addon = await loadAddon("render");
      return addon.render({
        video: a.video as string,
        look: a.look as LookRef,
        out: a.out as string | undefined,
        mode: a.mode as "burn" | "overlay" | undefined,
        overlayFormat: a.overlay_format as "mov" | "webm" | undefined,
        words: w.words,
        transcript: w.words ? { words: w.words, language: w.language } : undefined,
        language: a.language as "en" | "hinglish" | "auto" | undefined,
        overrides: a.overrides as Record<string, unknown> | undefined,
        settings: a.settings as Record<string, unknown> | undefined,
        onProgress: (f, stage) => progress(stage === "render" ? 0.3 + f * 0.7 : f * 0.3, stage === "render" ? "rendering" : "transcribing"),
      });
    },
  },
  {
    name: "transcribe",
    title: "Transcribe a video",
    description:
      "Speech-to-text with word timestamps for a local video/audio file, with a local Whisper model. Needs the add-on `captionseasy-transcribe` (returns ADDON_MISSING with the install command if absent); " +
      'its first call downloads the model once (~200 MB). Returns { language, durationMs, words: [{ text, startMs, endMs }] }. language: "en" (default), "hinglish" or "auto". Pass `out` to also save the words as JSON.',
    inputSchema: { type: "object", properties: { video: { type: "string", description: "Absolute path of the local video or audio file" }, language: languageSchema, out: { type: "string" } }, required: ["video"] },
    annotations: { readOnlyHint: false, openWorldHint: false },
    run: async (a, progress) => {
      const addon = await loadAddon("transcribe");
      const t = await addon.transcribe(a.video as string, { language: a.language as "en" | undefined, onProgress: (f) => progress(f, "transcribing") });
      if (typeof a.out !== "string") return t;
      writeFileSync(resolve(a.out), JSON.stringify(t, null, 2));
      return { ...t, out: resolve(a.out) };
    },
  },
];

// ---------------------------------------------------------------- JSON-RPC over stdio

type Id = string | number;
interface Message {
  jsonrpc: "2.0";
  id?: Id;
  method?: string;
  params?: Record<string, unknown>;
}

const toolResult = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: Array.isArray(data) ? { items: data } : data,
});
const toolError = (e: unknown) => ({ content: [{ type: "text", text: JSON.stringify(errorJson(e), null, 2) }], isError: true });

/** Handles one request; returns the JSON-RPC response (or null for notifications). Exposed for tests. */
export async function handle(msg: Message, notify: (m: object) => void = () => undefined): Promise<object | null> {
  const { id, method, params = {} } = msg;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined || id === null) return null; // notifications (initialized, cancelled ...) need no answer
  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "captionseasy", title: "CaptionsEasy", version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ run: _run, ...t }) => t) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(-32602, `Unknown tool: ${String(params.name)}`);
      const token = (params._meta as { progressToken?: Id } | undefined)?.progressToken;
      let last = -1;
      const progress = (fraction: number, message: string) => {
        const pct = Math.floor(fraction * 100);
        if (token === undefined || pct === last) return;
        last = pct;
        notify({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: token, progress: pct, total: 100, message } });
      };
      try {
        return reply(toolResult(await tool.run((params.arguments as Record<string, unknown>) ?? {}, progress)));
      } catch (e) {
        return reply(toolError(e));
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

export async function startMcpServer() {
  // stdout is the protocol channel: route stray logs (libraries, add-ons) to stderr
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  const send = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    // requests run concurrently; each answers when done
    void handle(msg, send).then((r) => r && send(r)).catch((e) => send({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } }));
  });
  rl.on("close", () => process.exit(0));
  process.stderr.write(`captionseasy ${VERSION} MCP server ready (stdio)\n`);
}
