import type { Metadata } from "next";
import { TRANSLATION_MODELS } from "@capseasy/shared";
import { pageMetadata } from "@/lib/seo";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import credits from "../../../../public/hero/credits.json";
import stockManifest from "../../../../public/stock-sfx/manifest.json";

export const metadata: Metadata = pageMetadata({ title: "Credits", description: "Sources and licences of the footage and the on-device translation models used by Captionit.", path: "/credits" });

type Credit = { title: string; license: string; source: string; lookName: string };
type StockCredit = { title: string; author: string; sourceUrl: string; licence: string; retrievedAt: string; originalFile: string };

export default function CreditsPage() {
  return (
    <LegalDoc
      title="Footage"
      accent="credits"
      intro={<>The talking-head clips on the home page come from Wikimedia Commons under the licences below. Each was trimmed, cropped, transcribed and captioned with Captionit; the captions are our addition and are shared under the same licence as the clip.</>}
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
      <Sec id="stock-sfx" title="Bundled sound effects">
        <p>
          The starter pack&apos;s files are CC0 (public domain) works by the authors below, recorded
          per file at ingestion. The meme sounds are our own original synthesized effects — generated
          in code in the style of the classic sounds, never copies of the famous recordings — and are
          likewise dedicated CC0. CC0 needs no attribution — these credits are kept so the record
          stays checkable. The same record travels with each copy added to a project&apos;s media bin.
        </p>
        <ul className="space-y-3">
          {(stockManifest.items as StockCredit[]).map((c) => (
            <li key={`${c.sourceUrl}-${c.originalFile}`}>
              <a href={c.sourceUrl} className="font-semibold underline underline-offset-2" target="_blank" rel="noreferrer">{c.title}</a>
              <span className="text-obsidian/60"> · {c.author} · {c.licence} · retrieved {c.retrievedAt}</span>
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
      <Sec id="face-model" title="Face detection model">
        <p>
          The clipper&rsquo;s optional face-centring runs on-device in your browser with{" "}
          <a href="https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet" className="font-semibold underline underline-offset-2" target="_blank" rel="noreferrer">
            YuNet (face_detection_yunet_2023mar)
          </a>{" "}
          from the OpenCV Zoo · MIT licence · © Shiqi Yu · about 0.23 MB, loaded from this site only when you ask
          it to centre a crop window. It detects faces only — no recognition, nothing about the frames leaves
          your device, and no detection result is stored: the outcome is a crop position you can change, exactly
          like one you set by dragging. Inference uses ONNX Runtime Web (MIT), the same runtime the speech and
          text models already use.
        </p>
      </Sec>
    </LegalDoc>
  );
}
