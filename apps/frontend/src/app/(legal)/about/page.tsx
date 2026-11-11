import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "Open Caption is a browser-based caption and video studio — transcription, animated captions, a multi-track editor and creator tools that run on your own device. Run by Parvez Achhan Ali Siddiqui, a sole proprietor in India.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <LegalDoc
      title="About"
      accent="Open Caption"
      intro={
        <>
          {LEGAL.product} is a caption and video studio that runs in your browser: it transcribes your videos on
          your own device, styles the words with animated caption templates, and gives you a full multi-track editor
          and a set of creator tools around it — no uploads to a rendering farm, no software to install.
        </>
      }
    >
      <Sec id="what" title="What you can do here">
        <ul>
          <li>
            <strong>Captions:</strong> speech recognition runs in your browser (English, Roman Hinglish and
            Devanagari Hindi), timed word by word, with 150 animated templates and a word-level editor.
          </li>
          <li>
            <strong>Editing:</strong> a multi-track timeline with trims, splits, text and media overlays, effects,
            transitions, speed changes and an audio studio — and what you preview is what the export renders.
          </li>
          <li>
            <strong>Clipper:</strong> find the moments worth posting from a longer video — suggestions measured
            on the device from silence and scene changes, plus an AI Clipping Studio that ranks moments from
            the transcript with an editorial estimate — then reframe them for vertical formats.
          </li>
          <li>
            <strong>Creator Studio:</strong> hook ideas, scripts, captions and hashtags, a reel analyzer, a content
            planner, a teleprompter and growth tracking — the AI writing tools run on a free model and say so when
            they fall back to templates.
          </li>
          <li>
            <strong>Exports:</strong> MP4 video plus SRT, VTT, ASS, plain-text and JSON caption files, and
            transparent overlays for other editors (rendered by the free desktop Companion app).
          </li>
        </ul>
      </Sec>

      <Sec id="how" title="How it works">
        <p>
          The heavy work — transcription, editing previews and MP4 rendering — happens on your device, in the
          browser. Your video files live in your browser&rsquo;s storage on this device; an account only syncs your
          projects, captions and settings so you can pick them up elsewhere. That design is also the privacy story:
          your audio is never sent to a third-party speech service. The{" "}
          <Link href="/privacy">Privacy Policy</Link> describes exactly what is stored where.
        </p>
      </Sec>

      <Sec id="who" title="Who runs it">
        <p>
          {LEGAL.product} is built and run by {LEGAL.operator}, based in {LEGAL.address}. It is a one-person
          operation: the same person designs the templates, writes the code, answers support email and handles
          payments and refunds. Support is at <strong>{LEGAL.email}</strong> — you will get a person, not a ticket
          queue.
        </p>
      </Sec>

      <Sec id="money" title="How it's paid for">
        <p>
          The full editor is free. Paid plans are 30-day passes that raise limits — more projects, bigger uploads,
          longer videos, longer export retention — at the prices on the <Link href="/pricing">Pricing page</Link>;
          they never renew automatically. The site may also show advertising in the future; if it does, the{" "}
          <Link href="/privacy">Privacy Policy</Link> and <Link href="/cookies">Cookie Policy</Link> describe how
          that works and how to opt out of personalised ads.
        </p>
      </Sec>
    </LegalDoc>
  );
}
