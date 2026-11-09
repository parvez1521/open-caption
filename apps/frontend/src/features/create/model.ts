/**
 * Creator Studio generators: shared types, the local-model record and the honest source labelling.
 *
 * Two generation sources exist and they are never blurred:
 *   - "template": the built-in pattern engine (templates.ts). Deterministic, works offline, NOT a model.
 *   - "model":    one small open-weight model that runs on the visitor's own device, opt-in only (localModel.ts).
 * Every batch of output carries its source, and `sourceBadge` is the single place that wording lives.
 */

export type GeneratorKind = "ideas" | "hooks" | "captions";
export type Platform = "reels" | "shorts" | "youtube" | "tiktok";
export type HookStyle = "curiosity" | "problem-solution" | "story" | "controversial" | "pattern-interrupt";
export type CaptionTone = "friendly" | "professional" | "bold" | "funny" | "minimal";
export type Source = "template" | "model";

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "reels", label: "Instagram Reels" },
  { id: "shorts", label: "YouTube Shorts" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
];

export const HOOK_STYLES: { id: HookStyle; label: string }[] = [
  { id: "curiosity", label: "Curiosity" },
  { id: "problem-solution", label: "Problem and solution" },
  { id: "story", label: "Story" },
  { id: "controversial", label: "Controversial" },
  { id: "pattern-interrupt", label: "Pattern interrupt" },
];

export const CAPTION_TONES: { id: CaptionTone; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "bold", label: "Bold" },
  { id: "funny", label: "Funny" },
  { id: "minimal", label: "Minimal" },
];

export const platformLabel = (p: Platform): string => PLATFORMS.find((x) => x.id === p)?.label ?? p;

/** One generated item. `detail` is the supporting line (an idea's angle); `hashtags` ride along on captions. */
export interface GeneratedItem {
  title: string;
  detail?: string;
  hashtags?: string[];
}

/** The text a Copy button puts on the clipboard for one item. */
export const itemCopyText = (item: GeneratedItem): string =>
  [item.title, item.detail, item.hashtags?.length ? item.hashtags.join(" ") : null].filter(Boolean).join("\n");

/**
 * The optional on-device model. Verified 2026-11-10 against the Hugging Face repo and the base model's card:
 * the ONNX conversion of HuggingFaceTB/SmolLM2-360M-Instruct, used with Transformers.js exactly as published
 * (q4 weights on WASM, q4f16 on WebGPU). The base model is Apache-2.0 (model card, "License: Apache 2.0"),
 * and published q4 builds of this checkpoint are ~204 MB, so the page discloses "about 210 MB" before download.
 */
export const LOCAL_MODEL = {
  id: "onnx-community/SmolLM2-360M-Instruct-ONNX",
  name: "SmolLM2 360M Instruct",
  licence: "Apache-2.0",
  approxDownloadMB: 210,
  approxDownloadLabel: "about 210 MB",
  /** Hard cap on generated tokens per request: short lists, not essays, keeps phones sane. */
  maxNewTokens: 384,
} as const;

/** The visible source badge for one batch of output. The template engine is never called AI, anywhere. */
export const sourceBadge = (source: Source): string =>
  source === "model" ? `Local model · ${LOCAL_MODEL.name} · runs on your device` : "Template engine";

/** Plain-language explanation shown next to the badge. */
export const sourceNote = (source: Source): string =>
  source === "model"
    ? "Written by the small model running in this browser tab. Nothing was sent to a server."
    : "Built by the built-in pattern engine from your inputs. No model was used and nothing left this tab.";
