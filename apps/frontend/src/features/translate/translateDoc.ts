import { translationModelFor, type CaptionDoc, type ProjectSettings } from "@capseasy/shared";
import { buildTranslatedDoc, translationUnits } from "@motion-ai/caption-engine/core";
import { translateLines, type TranslateProgress } from "./browserTranslate";

/**
 * The full slice-5.1 pipeline, end to end: source CaptionDoc -> card units -> on-device OPUS-MT
 * (worker) -> translated CaptionDoc. `runLines` is the worker boundary — production passes the
 * real browserTranslate.translateLines; tests pass a fake, so the pipeline is verified without a
 * model download. The result is a REAL second CaptionDoc (persisted via the translations API,
 * rendered by the composition, exported like the primary doc) — never a display-only overlay.
 */
export type LineTranslator = (
  targetLang: string,
  lines: string[],
  onProgress?: (p: TranslateProgress) => void,
) => Promise<string[]>;

export async function translateCaptionDoc(args: {
  doc: CaptionDoc;
  settings: ProjectSettings;
  targetLang: string;
  onProgress?: (p: TranslateProgress) => void;
  runLines?: LineTranslator;
}): Promise<CaptionDoc> {
  const model = translationModelFor(args.targetLang);
  if (!model) throw new Error(`"${args.targetLang}" is not a verified translation language.`);
  const units = translationUnits(args.doc, args.settings);
  if (units.length === 0) throw new Error("There are no captions to translate yet.");
  const run = args.runLines ?? ((lang, lines, onProgress) => translateLines(lang, lines, onProgress));
  const translated = await run(args.targetLang, units.map((u) => u.text), args.onProgress);
  return buildTranslatedDoc(args.doc, units, translated, model);
}
