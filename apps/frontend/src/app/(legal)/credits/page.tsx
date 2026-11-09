import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import credits from "../../../../public/hero/credits.json";

export const metadata: Metadata = pageMetadata({ title: "Credits", description: "Sources and licences of the footage shown on the Open Caption website.", path: "/credits" });

type Credit = { title: string; license: string; source: string; lookName: string };

export default function CreditsPage() {
  return (
    <LegalDoc
      title="Footage"
      accent="credits"
      intro={<>The talking-head clips on the home page come from Wikimedia Commons under the licences below. Each was trimmed, cropped, transcribed and captioned with CaptionsEasy; the captions are our addition and are shared under the same licence as the clip.</>}
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
    </LegalDoc>
  );
}
