"use client";

import React, { useMemo, useState } from "react";
import { TRANSLATION_MODELS, translationModelFor, type CaptionDoc, type ProjectSettings } from "@capseasy/shared";
import { studioService } from "@/services/studio";
import { canTranslateInBrowser, type TranslateProgress } from "@/features/translate/browserTranslate";
import { translateCaptionDoc } from "@/features/translate/translateDoc";
import { Button, Section } from "../controls";

/**
 * Translate (slice 5.1): on-device machine translation of the caption track with OPUS-MT.
 * The picker lists ONLY the verified pairs from the shared registry — a pair whose licence
 * could not be verified (e.g. English→Portuguese, which has no OPUS-MT repo) is absent, not
 * greyed out. Translating builds a real second CaptionDoc and saves it through the
 * translations API; the bilingual toggle shows it as a secondary line in the one composition,
 * so preview and export agree.
 */
export const TranslatePanel: React.FC<{
  projectId: string;
  doc: CaptionDoc;
  settings: ProjectSettings;
  patch: (p: Partial<ProjectSettings>) => void;
  /** saved translated tracks by language code, owned by StudioPage (feeds the composition input) */
  translations: Record<string, CaptionDoc>;
  onTranslated: (lang: string, doc: CaptionDoc) => void;
}> = ({ projectId, doc, settings, patch, translations, onTranslated }) => {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TranslateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneNote, setDoneNote] = useState<string | null>(null);

  const target = settings.translateTo;
  const model = translationModelFor(target);
  const existing = target ? translations[target] : undefined;
  const supported = canTranslateInBrowser();
  const cardCount = useMemo(() => doc.words.length, [doc]);

  const run = async () => {
    if (!target || !model || busy) return;
    setBusy(true);
    setError(null);
    setDoneNote(null);
    setProgress({ stage: "download", progress: 0 });
    try {
      const translated = await translateCaptionDoc({ doc, settings, targetLang: target, onProgress: setProgress });
      await studioService.saveTranslation(projectId, target, translated);
      onTranslated(target, translated);
      setDoneNote(`${model.targetLabel} track saved — ${translated.words.length} words. Turn on Bilingual to show it under your captions.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const progressLabel = !progress
    ? null
    : progress.stage === "download"
      ? `Downloading the ${model?.targetLabel ?? ""} model — first time only… ${Math.round(progress.progress * 100)}%`
      : progress.stage === "load"
        ? "Loading the model…"
        : `Translating captions… ${Math.round(progress.progress * 100)}%`;

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title="Translate"
        hint="Runs entirely in your browser — nothing is uploaded."
      >
        <label className="block text-sm text-st-text/90">
          <span className="mb-1.5 block text-xs font-medium text-st-muted">Translate captions from English into</span>
          <select
            value={target ?? ""}
            onChange={(e) => patch({ translateTo: (e.target.value || null) as ProjectSettings["translateTo"] })}
            className="w-full rounded-lg border border-st-line bg-st-panel px-2.5 py-2 text-sm text-st-text outline-none"
            aria-label="Translation target language"
          >
            <option value="">Choose a language…</option>
            {TRANSLATION_MODELS.map((m) => (
              <option key={m.targetLang} value={m.targetLang}>
                {m.targetLabel}
              </option>
            ))}
          </select>
        </label>

        {model ? (
          <p className="text-xs text-st-faint">
            OPUS-MT {model.targetLabel} model · {model.license}.{" "}
            <a href="/credits" target="_blank" rel="noreferrer" className="underline underline-offset-2">Licence + credits</a>
          </p>
        ) : null}
        <details className="text-xs text-st-faint">
          <summary className="cursor-pointer font-medium text-st-muted">How the translated timings work</summary>
          <p className="mt-1">First use of a language downloads its model once (~110 MB); after that it works on this device.</p>
        </details>

        <Button tone="primary" onClick={run} disabled={!target || busy || !supported || cardCount === 0} className="w-full">
          {busy ? "Translating…" : existing ? `Translate again into ${model?.targetLabel ?? ""}` : `Translate into ${model?.targetLabel ?? "…"}`}
        </Button>
        {!supported ? <p className="text-xs text-st-faint">This browser can&apos;t run the on-device translation model. A current version of Chrome, Edge or Firefox should work.</p> : null}
        {progressLabel ? <p className="text-xs text-st-muted" role="status">{progressLabel}</p> : null}
        {error ? <p className="text-xs text-red-300" role="alert">{error}</p> : null}
        {doneNote ? <p className="text-xs text-st-muted" role="status">{doneNote}</p> : null}

        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-st-text/90">
          <span>
            Bilingual captions
            <span className="block text-xs text-st-faint">Show the translated line under each caption. In the preview and in exports.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.bilingual}
            onChange={(e) => patch({ bilingual: e.target.checked })}
            className="h-4 w-4 shrink-0 accent-[#34D399]"
            aria-label="Bilingual captions"
          />
        </label>
        {settings.bilingual && !existing ? (
          <p className="text-xs text-st-faint">Translate first — there is no {model?.targetLabel ?? "translated"} track for this project yet.</p>
        ) : null}

        {Object.keys(translations).length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-st-muted">Saved tracks</p>
            {Object.entries(translations).map(([lang, t]) => (
              <p key={lang} className="flex items-center justify-between text-xs text-st-faint">
                <span>{translationModelFor(lang)?.targetLabel ?? lang}</span>
                <span>{t.words.length} words</span>
              </p>
            ))}
          </div>
        ) : null}
      </Section>
    </div>
  );
};
