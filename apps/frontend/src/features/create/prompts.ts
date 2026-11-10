/**
 * Prompts for the optional local model, and the parser that turns its raw text back into items.
 * Kept pure and separate from the service so both sides are unit-testable without a model.
 * The output contract is one item per line; anything that does not parse cleanly is rejected by
 * the service, which falls back to the template engine rather than showing half-formed text.
 */
import type { CaptionInput } from "./templates";
import type { HooksInput } from "./templates";
import type { IdeasInput } from "./templates";
import type { RepurposeInput } from "./repurpose";
import { repurposePartLabel } from "./repurpose";
import type { GeneratedItem, GeneratorKind, RepurposeTransform } from "./model";
import { clampCount } from "./templates";
import { platformLabel } from "./model";
import type { BrandProfile } from "./brandProfile";
import { profilePromptBlock } from "./brandProfile";

export type AnyGeneratorInput = IdeasInput | HooksInput | CaptionInput | RepurposeInput;

export interface ChatPrompt { system: string; user: string }

const SYSTEM =
  "You write short social media content. Follow the requested format exactly: one item per line, no numbering, no bullet points, no explanations, nothing before or after the lines.";

const withProfile = (user: string, profile?: BrandProfile | null): string => {
  if (!profile) return user;
  const block = profilePromptBlock(profile);
  return block ? `${user}\n\n${block}` : user;
};

export function buildPrompt(
  kind: GeneratorKind,
  input: AnyGeneratorInput,
  profile?: BrandProfile | null,
): ChatPrompt {
  // An explicit argument wins; otherwise fall back to a profile carried on the input itself.
  const effectiveProfile = profile ?? (input as AnyGeneratorInput).profile ?? null;
  if (kind === "repurpose") {
    const i = input as RepurposeInput;
    return {
      system: SYSTEM,
      user: withProfile(
        `Restructure ONLY the text below for this transform: ${i.transform}. Add no new facts, claims, examples or calls to action, and do not change the meaning. Output one part per line, in order, with nothing else.\n\nSource text:\n${i.sourceText}`,
        effectiveProfile,
      ),
    };
  }
  if (kind === "ideas") {
    const i = input as IdeasInput;
    const count = clampCount(i.count);
    const category = i.category ?? "educational";
    const difficulty = i.difficulty ?? "medium";
    const duration = i.duration ?? "30-60s";
    const objective = i.objective ?? "engagement";
    return {
      system: SYSTEM,
      user: withProfile(
        `Write ${count} video content ideas about "${i.niche}" for ${platformLabel(i.platform)}, aimed at ${i.audience || "beginners"}. Category: ${category}. Difficulty: ${difficulty}. Duration: ${duration}. Objective: ${objective}. Format each line exactly as: Title :: one-line angle`,
        effectiveProfile,
      ),
    };
  }
  if (kind === "hooks") {
    const i = input as HooksInput;
    const count = clampCount(i.count);
    return {
      system: SYSTEM,
      user: withProfile(
        `Write ${count} opening hooks in the ${i.style} style about "${i.topic}" for ${platformLabel(i.platform)}. Each hook is one line of at most 18 words, spoken in the first three seconds of a video.`,
        effectiveProfile,
      ),
    };
  }
  const i = input as CaptionInput;
  let user = `Write 3 social media captions in a ${i.tone} tone about "${i.topic}" for ${platformLabel(i.platform)}. Format each line exactly as: Caption text :: #hashtag1 #hashtag2 #hashtag3`;
  if (i.format && i.format !== "instagram") user = `${user} The captions are for ${i.format}.`;
  if (i.sponsored) {
    // Sponsored wording is exact sponsor text: instruct the model to include
    // it — and the service still enforces it verbatim after parsing
    // (captionStudio.applySponsored), because a model cannot be trusted to.
    const points = i.sponsored.talkingPoints.filter((p) => p.trim().length > 0);
    const tags = i.sponsored.requiredTags.filter((t) => t.trim().length > 0);
    const bits: string[] = [];
    if (points.length) bits.push(`include each of these talking points exactly as written: ${points.join(" | ")}`);
    if (tags.length) bits.push(`include these tags exactly: ${tags.join(" ")}`);
    if (i.sponsored.disclosure.trim()) bits.push(`end every caption with this disclosure line exactly: ${i.sponsored.disclosure}`);
    if (bits.length) user = `${user} Sponsored post: ${bits.join("; ")}.`;
  }
  return {
    system: SYSTEM,
    user: withProfile(user, effectiveProfile),
  };
}

const cleanLine = (line: string): string =>
  line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();

function parseHashtags(text: string): string[] {
  return [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
}

/**
 * Parse raw model output into items. Returns [] when nothing usable is there.
 * For "repurpose", `transform` selects the shared part labels
 * (repurpose.repurposePartLabel) attached as each item's detail; the titles
 * are the model's lines, unchanged.
 */
export function parseModelOutput(
  kind: GeneratorKind,
  raw: string,
  wanted: number,
  transform?: RepurposeTransform,
): GeneratedItem[] {
  const lines = raw.split(/\r?\n/).map(cleanLine).filter((l) => l.length >= 3);
  if (kind === "repurpose") {
    const titles = lines.slice(0, Math.max(1, wanted));
    return titles.map((title, i) => ({
      title,
      detail: repurposePartLabel(transform ?? "script-to-carousel", i, titles.length),
    }));
  }
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
