/**
 * Prompts for the optional local model, and the parser that turns its raw text back into items.
 * Kept pure and separate from the service so both sides are unit-testable without a model.
 * The output contract is one item per line; anything that does not parse cleanly is rejected by
 * the service, which falls back to the template engine rather than showing half-formed text.
 */
import type { CaptionInput } from "./templates";
import type { HooksInput } from "./templates";
import type { IdeasInput } from "./templates";
import type { GeneratedItem, GeneratorKind } from "./model";
import { clampCount } from "./templates";
import { platformLabel } from "./model";

export interface ChatPrompt { system: string; user: string }

const SYSTEM =
  "You write short social media content. Follow the requested format exactly: one item per line, no numbering, no bullet points, no explanations, nothing before or after the lines.";

export function buildPrompt(kind: GeneratorKind, input: IdeasInput | HooksInput | CaptionInput): ChatPrompt {
  if (kind === "ideas") {
    const i = input as IdeasInput;
    const count = clampCount(i.count);
    return {
      system: SYSTEM,
      user: `Write ${count} video content ideas about "${i.niche}" for ${platformLabel(i.platform)}, aimed at ${i.audience || "beginners"}. Format each line exactly as: Title :: one-line angle`,
    };
  }
  if (kind === "hooks") {
    const i = input as HooksInput;
    const count = clampCount(i.count);
    return {
      system: SYSTEM,
      user: `Write ${count} opening hooks in the ${i.style} style about "${i.topic}" for ${platformLabel(i.platform)}. Each hook is one line of at most 18 words, spoken in the first three seconds of a video.`,
    };
  }
  const i = input as CaptionInput;
  return {
    system: SYSTEM,
    user: `Write 3 social media captions in a ${i.tone} tone about "${i.topic}" for ${platformLabel(i.platform)}. Format each line exactly as: Caption text :: #hashtag1 #hashtag2 #hashtag3`,
  };
}

const cleanLine = (line: string): string =>
  line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();

function parseHashtags(text: string): string[] {
  return [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
}

/** Parse raw model output into items. Returns [] when nothing usable is there. */
export function parseModelOutput(kind: GeneratorKind, raw: string, wanted: number): GeneratedItem[] {
  const lines = raw.split(/\r?\n/).map(cleanLine).filter((l) => l.length >= 3);
  const items: GeneratedItem[] = [];
  for (const line of lines) {
    if (kind === "ideas") {
      const [title, angle] = line.split("::").map((s) => s.trim());
      if (title && title.length >= 4) items.push({ title, detail: angle || undefined });
    } else if (kind === "hooks") {
      const text = line.replace(/^["']|["']$/g, "");
      if (text.length >= 8) items.push({ title: text });
    } else {
      const [caption, tagText] = line.split("::").map((s) => s.trim());
      const text = (caption ?? "").replace(/#[\p{L}\p{N}_]+/gu, "").trim();
      const hashtags = parseHashtags(tagText ?? line);
      if (text.length >= 8) items.push({ title: text, hashtags: hashtags.length ? hashtags : undefined });
    }
    if (items.length >= wanted) break;
  }
  return items;
}

/** A model batch counts as usable only if at least half the requested items parsed. */
export const MIN_MODEL_RATIO = 0.5;
