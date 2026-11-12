import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Subprocessors", description: "The service providers that process data for Open Caption.", path: "/subprocessors" });

const ROWS: [string, string, string, string][] = [
  ["Supabase", "Database, file storage, sign-in", "Account, projects, captions, exports, and videos sent to Companion exports", "India (Mumbai)"],
  ["Vercel", "Website and API hosting", "Requests to the site and API, request logs", "United States (global edge)"],
  ["Google", "Sign in with Google (optional); caption fonts", "Sign-in identity; font requests from your browser", "Global"],
  ["Google (AdSense)", "Advertising on this website, only when advertising is enabled", "Ad requests; advertising cookies for ad serving and personalisation (never your videos, transcripts or projects)", "Global"],
  ["Groq", "AI features: Growth Coach, the Create tools and Clipper highlights", "Only the text you send to those features — your question and the last few turns of that chat, your post titles and their views, reach, likes, comments, shares and saves, competitor names, handles and notes, the prompt text you write, and transcript text. Never audio or video.", "United States"],
  ["Hugging Face", "Speech and translation model downloads to your browser", "Your browser contacts Hugging Face to download the model files (about 90 MB per speech model). No audio, video or transcript is sent to Hugging Face.", "Global"],
  ["Sentry", "Error reporting", "Error reports when something goes wrong: the error message, where it happened, browser and device details, and, for a video that could not be read, its format, size and duration. Never the video itself, your audio or your captions. A session that hits an error may also include a screen recording, with video and images blocked.", "United States"],
  ["Cashfree", "Payment processing for paid plans", "Payment details you enter on Cashfree's checkout, order status (card data is handled by Cashfree, never by us)", "India"],
];

export default function SubprocessorsPage() {
  return (
    <LegalDoc
      title="Sub"
      accent="processors"
      intro={<>These companies process personal data on behalf of {LEGAL.operator} to run {LEGAL.product}. Each is bound by a data processing agreement or equivalent terms. We will update this list before adding a new subprocessor.</>}
    >
      <Sec id="list" title="Current subprocessors">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-obsidian/60">
                {["Provider", "What for", "Data", "Location"].map((h) => <th key={h} className="border-b border-obsidian/15 px-3 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) => <td key={i} className={`border-b border-obsidian/10 px-3 py-2.5 align-top ${i === 0 ? "font-semibold" : ""}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec id="local" title="Processed on your own device">
        <p>Speech recognition and MP4 export run in your browser, and transparent overlay exports run in the optional desktop Companion app on your own computer, so no third party processes that audio for transcription. The speech model itself is downloaded once from Hugging Face; no audio is sent to it. The exception is a link pasted on the Transcribe page: the linked file is fetched through our own server (hosted by Vercel, above) and streamed to your browser, and is not stored.</p>
      </Sec>
    </LegalDoc>
  );
}
