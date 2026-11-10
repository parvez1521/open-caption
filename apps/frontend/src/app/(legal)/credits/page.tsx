import type { Metadata } from "next";
import { TRANSLATION_MODELS } from "@capseasy/shared";
import { pageMetadata } from "@/lib/seo";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import credits from "../../../../public/hero/credits.json";

export const metadata: Metadata = pageMetadata({ title: "Credits", description: "Sources and licences of the footage and the on-device translation models used by Open Caption.", path: "/credits" });

type Credit = { title: string; license: string; source: string; lookName: string };

export default function CreditsPage() {
  return (
    <LegalDoc
      title="Footage"
      accent="credits"
      intro={<>The talking-head clips on the home page come from Wikimedia Commons under the licences below. Each was trimmed, cropped, transcribed and captioned with Open Caption; the captions are our addition and are shared under the same licence as the clip.</>}
    >
      <Sec id="hero" title="Home page clips">
        <ul className="space-y-3">
          {Object.values(credits as Record<string, Credit>).map((c) => (
            <li key={c.source}>
              <a href={c.source} className="font-semibold underline underline-offset-2" target="_blank" rel="noreferrer">{c.title}</a>
              <span className="text-obsidian/60"> · {c.license} · captioned with the {c.lookName} look</span>
            </li>
          ))}
        </ul>
      </Sec>
      <Sec id="translation-models" title="Translation models">
        <p>
          Caption translation runs on-device in your browser with OPUS-MT models by{" "}
          <span className="font-semibold">Helsinki-NLP (Language Technology Research Group, University of Helsinki)</span>,
          converted to ONNX for Transformers.js. Nothing you translate is uploaded. Each model below is credited under
          its licence; the German model is CC-BY-4.0 and is used with attribution to Helsinki-NLP as its licence requires.
        </p>
        <ul className="space-y-3">
          {TRANSLATION_MODELS.map((m) => (
            <li key={m.modelId}>
              <a href={`https://huggingface.co/${m.upstreamId}`} className="font-semibold underline underline-offset-2" target="_blank" rel="noreferrer">
                English → {m.targetLabel}: {m.upstreamId}
              </a>
              <span className="text-obsidian/60">
                {" "}· {m.license} · © {m.attribution} · ONNX mirror: {m.modelId}
              </span>
            </li>
          ))}
        </ul>
      </Sec>
    </LegalDoc>
  );
}
