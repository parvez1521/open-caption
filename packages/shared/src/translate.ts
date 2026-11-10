import { z } from "zod";

/**
 * On-device caption translation (Phase 5, slice 5.1): the VERIFIED-pairs registry — the single
 * source of truth for which English→target OPUS-MT models the app may offer, load and credit.
 *
 * Every entry is a Transformers.js-loadable ONNX mirror (`Xenova/opus-mt-en-*`) of a Helsinki-NLP
 * OPUS-MT checkpoint. The Xenova mirrors declare no licence of their own (their card's frontmatter
 * names the Helsinki checkpoint as `base_model` and the weights are that checkpoint converted to
 * ONNX), so the licence recorded here is the UPSTREAM checkpoint's licence, verified per model ID
 * against the Hugging Face API (`cardData.license`) and cross-checked on the upstream card on
 * 2026-11-10:
 *
 *   Helsinki-NLP/opus-mt-en-es  Apache-2.0     Helsinki-NLP/opus-mt-en-hi  Apache-2.0
 *   Helsinki-NLP/opus-mt-en-de  CC-BY-4.0      Helsinki-NLP/opus-mt-en-it  Apache-2.0
 *   Helsinki-NLP/opus-mt-en-fr  Apache-2.0
 *
 * English→Portuguese is deliberately ABSENT: no `opus-mt-en-pt` repo exists under either
 * Helsinki-NLP or Xenova (the HF API returns an error for both), so the pair could not be
 * verified and, per the slice rule, an unverifiable pair is excluded — not greyed out.
 *
 * The /credits page renders THIS registry, so the notices surface can never drift from the code;
 * `translate.test.ts` pins that every entry carries a licence + attribution record.
 */

export interface TranslationModel {
  /** target language code (also the translated CaptionDoc's `language`) */
  targetLang: string;
  /** English name of the target language, for UI + notices */
  targetLabel: string;
  /** the Transformers.js-loadable ONNX repo actually downloaded in the browser */
  modelId: string;
  /** pinned commit of `modelId`: a later upload to `main` can never change what users download */
  revision: string;
  /** upstream checkpoint the ONNX mirror converts (the licence holder's repo) */
  upstreamId: string;
  /** verified licence of the upstream checkpoint (the mirror declares none of its own) */
  license: "Apache-2.0" | "CC-BY-4.0";
  /** who must be credited for this model, as rendered on /credits */
  attribution: string;
  /**
   * Approximate first-use download (MB): the quantized (q8) encoder + merged decoder ONNX files
   * transformers.js fetches for this repo, rounded — disclosed in the UI before translating.
   */
  approxDownloadMb: number;
}

const HELSINKI_ATTRIBUTION = "Helsinki-NLP (Language Technology Research Group, University of Helsinki)";

export const TRANSLATION_MODELS: readonly TranslationModel[] = [
  {
    targetLang: "es",
    targetLabel: "Spanish",
    modelId: "Xenova/opus-mt-en-es",
    revision: "4b002a4c7edd54a7ced58877258b87f7efd3f892",
    upstreamId: "Helsinki-NLP/opus-mt-en-es",
    license: "Apache-2.0",
    attribution: HELSINKI_ATTRIBUTION,
    approxDownloadMb: 113,
  },
  {
    targetLang: "de",
    targetLabel: "German",
    modelId: "Xenova/opus-mt-en-de",
    revision: "1ca130c44c4c5441ef16d48aae521a424ab644f7",
    upstreamId: "Helsinki-NLP/opus-mt-en-de",
    license: "CC-BY-4.0",
    attribution: HELSINKI_ATTRIBUTION,
    approxDownloadMb: 106,
  },
  {
    targetLang: "fr",
    targetLabel: "French",
    modelId: "Xenova/opus-mt-en-fr",
    revision: "28726206f80896b90035bd99cccd5cc1e151f916",
    upstreamId: "Helsinki-NLP/opus-mt-en-fr",
    license: "Apache-2.0",
    attribution: HELSINKI_ATTRIBUTION,
    approxDownloadMb: 108,
  },
  {
    targetLang: "hi",
    targetLabel: "Hindi",
    modelId: "Xenova/opus-mt-en-hi",
    revision: "7aad72006a1588a9c3485ed6203aed99eebbc872",
    upstreamId: "Helsinki-NLP/opus-mt-en-hi",
    license: "Apache-2.0",
    attribution: HELSINKI_ATTRIBUTION,
    approxDownloadMb: 110,
  },
  {
    targetLang: "it",
    targetLabel: "Italian",
    modelId: "Xenova/opus-mt-en-it",
    revision: "075406e3c8c2c30634d4a1bd8f00c21d9e162011",
    upstreamId: "Helsinki-NLP/opus-mt-en-it",
    license: "Apache-2.0",
    attribution: HELSINKI_ATTRIBUTION,
    approxDownloadMb: 129,
  },
] as const;

/** Target language codes the app may translate into — derived from the registry, never hand-listed. */
export const TRANSLATION_TARGET_LANGS = TRANSLATION_MODELS.map((m) => m.targetLang) as [string, ...string[]];

export const TranslationTargetSchema = z.enum(TRANSLATION_TARGET_LANGS as [string, ...string[]]);
export type TranslationTarget = z.infer<typeof TranslationTargetSchema>;

/** The registered model for a target language, or null when the pair is not verified/registered. */
export const translationModelFor = (targetLang: string | null | undefined): TranslationModel | null =>
  TRANSLATION_MODELS.find((m) => m.targetLang === targetLang) ?? null;
