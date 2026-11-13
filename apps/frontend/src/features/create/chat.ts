/**
 * AI Studio Chat (3.8): a chat surface whose answers are always STRUCTURED —
 * every assistant turn is one typed payload (ideas, hooks, a script, a shot
 * list, a 7-day calendar, a carousel, or captions), never free prose. That is
 * what makes a chat answer saveable to the content library item by item.
 *
 * Sources follow the same honest routing as service.ts / scriptService.ts:
 *   1. Cloud — when a `runCloud` runner is supplied (the site's free AI).
 *   2. Local model — when the visitor opted in elsewhere and it is ready.
 *   3. Template engine — always available; chat payloads are derived from the
 *      REAL generators (templates.ts / scripts.ts), never invented here.
 * A runner's raw text counts only when `parseChatOutput` turns it into a
 * payload that meets the minimal bar; anything else falls through with a
 * plain note, in service.ts's voice. Every payload carries its source.
 *
 * The pure core (prompt building, parsing, template derivation, routing,
 * message-content shapes) is unit-tested; the small client section at the
 * bottom bridges the one library gap (thread context PATCH).
 */
import { apiClient } from "@/services/api-client";
import type { GeneratedItem, Source } from "./model";
import { itemCopyText } from "./model";
import type { GenerationDeps } from "./service";
import { parseModelOutput } from "./prompts";
import type { BrandProfile } from "./brandProfile";
import { profilePromptBlock } from "./brandProfile";
import { generateCaptions, generateHooks, generateIdeas } from "./templates";
import {
  buildScriptPrompt,
  generateScript,
  parseScriptOutput,
  scriptToText,
  type ScriptDoc,
  type ScriptInput,
} from "./scripts";
import { mapChatThread, type ChatThread, type ContentItem, type ContentKind } from "./library";
import { analysisContextText, readAnalysisBody } from "@/features/analyzer/breakdownItem";

/* ---------------------------------- types ---------------------------------- */

export type ChatOutputType =
  | "ideas"
  | "hooks"
  | "script"
  | "shot-list"
  | "calendar"
  | "carousel"
  | "captions";

export const CHAT_OUTPUT_TYPES: { id: ChatOutputType; label: string }[] = [
  { id: "ideas", label: "Ideas" },
  { id: "hooks", label: "Hooks" },
  { id: "script", label: "Script" },
  { id: "shot-list", label: "Shot list" },
  { id: "calendar", label: "7-day calendar" },
  { id: "carousel", label: "Carousel" },
  { id: "captions", label: "Captions" },
];

export const isChatOutputType = (value: unknown): value is ChatOutputType =>
  typeof value === "string" && CHAT_OUTPUT_TYPES.some((t) => t.id === value);

/** One structured chat answer: `script` only for outputType "script", `items` for every other type. */
export interface ChatPayload {
  outputType: ChatOutputType;
  items?: GeneratedItem[];
  script?: ScriptDoc;
}

export interface ChatTurnResult {
  payload: ChatPayload;
  source: Source;
  fellBack: boolean;
  note?: string;
}

export interface ChatTurnOptions {
  /** Plain text of the library item attached to the thread, when one is attached. */
  contextText?: string;
  /** The active Brand Voice profile; falls back to deps.profile when omitted. */
  profile?: BrandProfile | null;
}

/** The library kind a chat item saves as. */
export const CHAT_SAVE_KIND: Record<ChatOutputType, ContentKind> = {
  ideas: "idea",
  hooks: "hook",
  script: "script",
  "shot-list": "shot-list",
  calendar: "calendar",
  carousel: "carousel",
  captions: "caption",
};

/**
 * Chat script defaults: every chat script is a 30-second reel in a friendly
 * tone. Chat has no format/duration pickers (that is Script Studio's job);
 * these fixed defaults are what buildScriptPrompt / generateScript receive.
 */
const chatScriptInput = (userText: string, profile?: BrandProfile | null): ScriptInput => ({
  topic: userText,
  format: "reel",
  durationSec: 30,
  tone: "friendly",
  profile: profile ?? null,
});

/* ---------------------------------- prompts ---------------------------------- */

const CHAT_SYSTEM =
  "You write short social media content for a creator. Follow the requested format exactly: no numbering, no bullet points, no explanations, nothing before or after the lines.";

export interface ChatPrompt {
  system: string;
  user: string;
}

const contextBlock = (contextText?: string): string => {
  const text = (contextText ?? "").trim();
  return text ? `Context the creator attached — stay consistent with it:\n${text}` : "";
};

/**
 * Build the model prompt for one chat turn. The ideas/hooks/captions formats
 * are the prompts.ts formats verbatim; the script format is buildScriptPrompt's
 * BEAT format (with the chat defaults above). Shot list, calendar and carousel
 * have their own strict one-line formats, parsed by parseChatOutput below.
 */
export function buildChatPrompt(
  outputType: ChatOutputType,
  userText: string,
  opts: ChatTurnOptions = {},
): ChatPrompt {
  const profile = opts.profile ?? null;
  if (outputType === "script") {
    // buildScriptPrompt already appends the Brand Voice block; the attached
    // context goes in front so the model reads it before the request.
    const prompt = buildScriptPrompt(chatScriptInput(userText, profile));
    const ctx = contextBlock(opts.contextText);
    return { system: prompt.system, user: ctx ? `${ctx}\n\n${prompt.user}` : prompt.user };
  }
  let request: string;
  switch (outputType) {
    case "ideas":
      request = `Write 6 video content ideas about "${userText}" for Instagram Reels. Format each line exactly as: Title :: one-line angle`;
      break;
    case "hooks":
      request = `Write 6 opening hooks about "${userText}" for Instagram Reels. Each hook is one line of at most 18 words, spoken in the first three seconds of a video.`;
      break;
    case "captions":
      request = `Write 3 social media captions in a friendly tone about "${userText}" for Instagram Reels. Format each line exactly as: Caption text :: #hashtag1 #hashtag2 #hashtag3`;
      break;
    case "shot-list":
      request = `Write a shot list for a short video about "${userText}". Output one line per shot, formatted exactly as: SHOT | <visual> | <action or line> | <duration like 0:03>`;
      break;
    case "calendar":
      request = `Write a 7-day content calendar about "${userText}". Output exactly 7 lines, one per day in order, formatted exactly as: Day 1 | <content title> | <format or platform note>`;
      break;
    case "carousel":
      request = `Write a carousel about "${userText}". Output one line per slide, formatted exactly as: SLIDE | <slide text>`;
      break;
  }
  const parts: string[] = [];
  const ctx = contextBlock(opts.contextText);
  if (ctx) parts.push(ctx);
  if (profile) {
    const block = profilePromptBlock(profile);
    if (block) parts.push(block);
  }
  parts.push(request);
  return { system: CHAT_SYSTEM, user: parts.join("\n\n") };
}

/* ---------------------------------- parsing ---------------------------------- */

const cleanLine = (line: string): string =>
  line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();

const linesOf = (raw: string): string[] =>
  (raw ?? "").split(/\r?\n/).map(cleanLine).filter((l) => l.length > 0);

function parseShotList(raw: string): GeneratedItem[] {
  const items: GeneratedItem[] = [];
  for (const line of linesOf(raw)) {
    if (!/^SHOT\s*\|/i.test(line)) continue;
    const parts = line.split("|").map((p) => p.trim());
    const visual = parts[1] ?? "";
    if (visual.length < 3) continue;
    const detail = [parts[2] ?? "", parts.slice(3).join(" | ")].filter(Boolean).join(" · ");
    items.push({ title: visual, detail: detail || undefined });
  }
  return items;
}

function parseCalendar(raw: string): GeneratedItem[] {
  const items: GeneratedItem[] = [];
  for (const line of linesOf(raw)) {
    const parts = line.split("|").map((p) => p.trim());
    if (!/^day\s*\d+$/i.test(parts[0] ?? "")) continue;
    const title = parts[1] ?? "";
    if (title.length < 3) continue;
    const note = parts.slice(2).join(" | ");
    items.push({ title, detail: note || undefined });
  }
  return items;
}

function parseCarousel(raw: string): GeneratedItem[] {
  const items: GeneratedItem[] = [];
  for (const line of linesOf(raw)) {
    if (!/^SLIDE\s*\|/i.test(line)) continue;
    const text = line.split("|").slice(1).join(" | ").trim();
    if (text.length < 3) continue;
    items.push({ title: text });
  }
  return items;
}

/**
 * Parse raw model output into a chat payload; null when nothing usable is
 * there. Ideas/hooks/captions go through prompts.ts parseModelOutput. For
 * chat hooks the mechanism is deliberately left undefined: no hook style is
 * chosen in chat, so attaching one style's mechanism (HOOK_MECHANISMS is
 * keyed by style) would mislabel the batch. Template hooks are different —
 * templateChatPayload asks for the "curiosity" style by name, so their
 * mechanism is honest and rides along.
 */
export function parseChatOutput(
  outputType: ChatOutputType,
  raw: string,
  userText: string,
  profile?: BrandProfile | null,
): ChatPayload | null {
  if (outputType === "script") {
    const script = parseScriptOutput(raw, chatScriptInput(userText, profile));
    return script ? { outputType, script } : null;
  }
  if (outputType === "ideas" || outputType === "hooks" || outputType === "captions") {
    const kind = outputType === "ideas" ? "ideas" : outputType === "hooks" ? "hooks" : "captions";
    const items = parseModelOutput(kind, raw, kind === "captions" ? 3 : 6);
    return items.length ? { outputType, items } : null;
  }
  const items =
    outputType === "shot-list"
      ? parseShotList(raw)
      : outputType === "calendar"
        ? parseCalendar(raw)
        : parseCarousel(raw);
  // A fragment is not an answer: shot lists and carousels need at least 2
  // lines, a 7-day calendar at least 4 days, before the payload counts.
  const minimum = outputType === "calendar" ? 4 : 2;
  return items.length >= minimum ? { outputType, items } : null;
}

/** The minimal bar a parsed payload must meet for a runner's turn to count. */
const meetsBar = (payload: ChatPayload): boolean =>
  payload.outputType === "script"
    ? !!payload.script
    : (payload.items?.length ?? 0) >= (payload.outputType === "calendar" ? 4 : 2);

/* ------------------------------ template path ------------------------------ */

/**
 * Deterministic chat payloads, derived from the real generators — the same
 * inputs the /create generators and Script Studio use, with chat's fixed
 * platform/format defaults. Shot lists and carousels are derived from the
 * template script's beats; the calendar relabels a 7-idea batch by day.
 */
export function templateChatPayload(
  outputType: ChatOutputType,
  userText: string,
  profile?: BrandProfile | null,
): ChatPayload {
  const p = profile ?? null;
  switch (outputType) {
    case "ideas":
      return {
        outputType,
        items: generateIdeas({
          niche: userText,
          platform: "reels",
          audience: p?.voice.audience ?? "",
          count: 6,
          profile: p,
        }),
      };
    case "hooks":
      // Style is declared here ("curiosity"), so the mechanisms generateHooks
      // attaches are honest for this batch — unlike parsed model hooks.
      return {
        outputType,
        items: generateHooks({ topic: userText, style: "curiosity", platform: "reels", count: 6, profile: p }),
      };
    case "captions":
      return {
        outputType,
        items: generateCaptions({ topic: userText, platform: "reels", tone: "friendly", profile: p }),
      };
    case "script":
      return { outputType, script: generateScript(chatScriptInput(userText, p)) };
    case "shot-list": {
      const script = generateScript(chatScriptInput(userText, p));
      return {
        outputType,
        items: script.beats.map((beat) => ({
          title: beat.broll,
          detail: `${beat.label} · ${beat.startSec}–${beat.endSec}s · Say: ${beat.dialogue}`,
        })),
      };
    }
    case "calendar": {
      const ideas = generateIdeas({
        niche: userText,
        platform: "reels",
        audience: p?.voice.audience ?? "",
        count: 7,
        profile: p,
      });
      return {
        outputType,
        items: ideas.map((item, i) => ({
          ...item,
          detail: `Day ${i + 1} — ${item.detail ?? ""}`.trimEnd(),
        })),
      };
    }
    case "carousel": {
      const script = generateScript(chatScriptInput(userText, p));
      return {
        outputType,
        items: script.beats.map((beat, i) => ({
          title: beat.onScreenText || beat.dialogue,
          detail: `Slide ${i + 1} of ${script.beats.length}`,
        })),
      };
    }
  }
}

/* ---------------------------------- routing ---------------------------------- */

// Fallback notes in service.ts's voice, reworded for a chat answer.
const FALLBACK_NOTE = "The local model could not run on this device. This answer came from the template engine instead.";
const CLOUD_FALLBACK_NOTE = "The free AI service was not available for this answer. So it came from the template engine instead.";
const CLOUD_TO_LOCAL_NOTE = "The free AI service was not available for this answer. So the local model wrote it instead.";
const CLOUD_AND_LOCAL_NOTE = "The free AI service and the local model were both unavailable. So this answer came from the template engine instead.";

async function tryRunner(
  runner: GenerationDeps["runCloud"],
  outputType: ChatOutputType,
  userText: string,
  opts: ChatTurnOptions,
  profile: BrandProfile | null,
): Promise<ChatPayload | null> {
  if (!runner) return null;
  try {
    const raw = await runner(buildChatPrompt(outputType, userText, { ...opts, profile }));
    const payload = parseChatOutput(outputType, raw, userText, profile);
    return payload && meetsBar(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Run one chat turn: cloud → local → template, first usable payload wins.
 * Mirrors generateContent's routing and note behaviour exactly.
 */
export async function runChatTurn(
  outputType: ChatOutputType,
  userText: string,
  opts: ChatTurnOptions,
  deps: GenerationDeps,
): Promise<ChatTurnResult> {
  const profile = opts.profile ?? deps.profile ?? null;
  let cloudFailed = false;
  if (deps.runCloud) {
    const payload = await tryRunner(deps.runCloud, outputType, userText, opts, profile);
    if (payload) return { payload, source: "cloud", fellBack: false };
    cloudFailed = true;
  }
  if (deps.modelEnabled && deps.runModel) {
    const payload = await tryRunner(deps.runModel, outputType, userText, opts, profile);
    if (payload) {
      return cloudFailed
        ? { payload, source: "model", fellBack: true, note: CLOUD_TO_LOCAL_NOTE }
        : { payload, source: "model", fellBack: false };
    }
    return {
      payload: templateChatPayload(outputType, userText, profile),
      source: "template",
      fellBack: true,
      note: cloudFailed ? CLOUD_AND_LOCAL_NOTE : FALLBACK_NOTE,
    };
  }
  if (cloudFailed) {
    return {
      payload: templateChatPayload(outputType, userText, profile),
      source: "template",
      fellBack: true,
      note: CLOUD_FALLBACK_NOTE,
    };
  }
  return { payload: templateChatPayload(outputType, userText, profile), source: "template", fellBack: false };
}

/* ----------------------------- message contents ----------------------------- */

export function userMessageContent(text: string): Record<string, unknown> {
  return { text };
}

export function assistantMessageContent(result: ChatTurnResult): Record<string, unknown> {
  return {
    payload: result.payload,
    source: result.source,
    ...(result.note ? { note: result.note } : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const SOURCES: readonly Source[] = ["template", "model", "cloud"];

const asGeneratedItem = (value: unknown): GeneratedItem | null => {
  if (!isRecord(value) || typeof value.title !== "string" || !value.title) return null;
  return {
    title: value.title,
    ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
    ...(Array.isArray(value.hashtags)
      ? { hashtags: value.hashtags.filter((t): t is string => typeof t === "string") }
      : {}),
    ...(typeof value.mechanism === "string" ? { mechanism: value.mechanism } : {}),
  };
};

const asScriptDoc = (value: unknown): ScriptDoc | null => {
  if (!isRecord(value) || typeof value.title !== "string" || !Array.isArray(value.beats)) return null;
  if (!value.beats.length) return null;
  for (const beat of value.beats) {
    if (!isRecord(beat) || typeof beat.dialogue !== "string" || typeof beat.label !== "string") return null;
  }
  return value as unknown as ScriptDoc;
};

/** The text of a stored user message; "" when the stored content is not the expected shape. */
export function readUserText(content: unknown): string {
  return isRecord(content) && typeof content.text === "string" ? content.text : "";
}

export interface StoredAssistantContent {
  payload: ChatPayload;
  source: Source;
  note?: string;
}

/**
 * Defensive reader for a stored assistant message. Anything malformed —
 * unknown output type, no usable items, a script without beats — returns
 * null, and the page renders a plain "could not be displayed" line instead
 * of crashing on old or hand-edited rows.
 */
export function readAssistantPayload(content: unknown): StoredAssistantContent | null {
  if (!isRecord(content) || !isRecord(content.payload)) return null;
  const raw = content.payload;
  if (!isChatOutputType(raw.outputType)) return null;
  const source: Source = SOURCES.includes(content.source as Source) ? (content.source as Source) : "template";
  const note = typeof content.note === "string" ? content.note : undefined;
  if (raw.outputType === "script") {
    const script = asScriptDoc(raw.script);
    return script ? { payload: { outputType: "script", script }, source, note } : null;
  }
  if (!Array.isArray(raw.items)) return null;
  const items = raw.items.map(asGeneratedItem).filter((x): x is GeneratedItem => x !== null);
  if (!items.length) return null;
  return { payload: { outputType: raw.outputType, items }, source, note };
}

/* ------------------------------- client bridge ------------------------------- */

/**
 * Attach (or detach, with null) a library item as a thread's context.
 * library.ts exposes renameChatThread for the title only; the thread PATCH
 * route accepts contextItemId too (validated server-side: the item must
 * belong to the caller), so this one helper goes through apiClient directly,
 * in the same style as library.ts's own helpers.
 */
export async function setThreadContext(id: string, contextItemId: string | null): Promise<ChatThread> {
  const raw = await apiClient.patch<unknown>(`/content/threads/${encodeURIComponent(id)}`, {
    json: { contextItemId },
  });
  const thread = mapChatThread(raw);
  if (!thread) throw new Error("The server returned an unexpected chat thread.");
  return thread;
}

/**
 * The plain text of a library item, used as attached chat context: a saved
 * Reel Analyzer breakdown renders via analysisContextText, a saved
 * generated item copies out via itemCopyText, a saved script via
 * scriptToText, and anything else falls back to the item's title.
 */
export function contextTextForItem(item: ContentItem): string {
  const body = item.body;
  if (item.kind === "analysis") {
    // A saved Reel Analyzer breakdown attaches as its measured plain-text
    // rendering; a malformed analysis body falls through to the title below.
    const analysis = readAnalysisBody(body);
    if (analysis) return analysisContextText(analysis);
  }
  if (isRecord(body.item)) {
    const generated = asGeneratedItem(body.item);
    if (generated) return itemCopyText(generated);
  }
  const script = asScriptDoc(body);
  if (script) return scriptToText(script);
  return item.title;
}
