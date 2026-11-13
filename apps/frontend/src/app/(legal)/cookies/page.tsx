import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Cookie Policy", description: "The small amount of browser storage Captionit uses and why.", path: "/cookies" });

const ITEMS: [string, string, string, string][] = [
  ["sb-…-auth-token", "Local storage", "Keeps you signed in (your session with our authentication provider).", "Until you sign out"],
  ["ce_tl_mode, ce_tl_snap, ce_tl_ripple", "Local storage", "Remembers your timeline view (words or lines, snapping, linked moves).", "Until you clear it"],
  ["ce_intro", "Session storage", "Shows the landing-page intro animation once per visit.", "Until you close the tab"],
];

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Cookie"
      accent="Policy"
      intro={<>{LEGAL.product} itself stores only what the site needs to work: your sign-in session and a few editor preferences — no advertising or cross-site tracking cookies of our own. Analytics on this site (Vercel Analytics and Speed Insights) set no cookies. If advertising is ever enabled on the site, Google and its partners may set advertising cookies as described below.</>}
    >
      <Sec id="what" title="What we store">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-obsidian/60">
                {["Name", "Type", "Purpose", "Kept"].map((h) => <th key={h} className="border-b border-obsidian/15 px-3 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) => <td key={i} className={`border-b border-obsidian/10 px-3 py-2.5 align-top ${i === 0 ? "font-mono text-xs" : ""}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>All of these are strictly necessary or remember a choice you made, so they do not need consent under most cookie laws. Analytics already runs on this site, but it sets no cookies (see below). If we ever add marketing cookies, we will ask for your consent first and update this page.</p>
      </Sec>

      <Sec id="analytics" title="Analytics (no cookies)">
        <p>Every page loads Vercel Analytics and Speed Insights, which record page visits and a few product events: a video added (with its language and length), captions ready or failed, and an export finished or failed (with its format, quality, resolution and frame rate). They never receive your video, audio or transcripts, and they set no cookies.</p>
      </Sec>

      <Sec id="ads" title="Advertising cookies (only if ads are enabled)">
        <p>If advertising is enabled on this site, it is served by Google AdSense. Third-party vendors, including Google, may then use cookies to serve ads based on your prior visits to this and other websites, and Google and its partners may serve ads based on those visits. While advertising is not enabled, none of these cookies are set and no ad requests are made.</p>
        <p>You can opt out of personalised advertising at <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer">Google Ads Settings</a> or <a href="https://www.aboutads.info/choices/" target="_blank" rel="noreferrer">aboutads.info</a>. Where consent is required by law (for example in the EEA and the UK), personalised ads require a consent choice through a Google-certified consent management platform first.</p>
      </Sec>

      <Sec id="third" title="Third-party requests">
        <p>The caption preview loads the fonts used by each look from Google Fonts, so your browser contacts Google&rsquo;s font servers when you open the studio or the looks gallery. Speech and translation models are downloaded from Hugging Face when you first use them. When you use an AI feature (Growth Coach, the Create tools or Clipper highlights), the text you send goes to Groq. When something goes wrong, an error report goes to Sentry. Searching stock media contacts Pixabay directly from your browser, using a key you provide. Our hosting provider records basic request logs for security. See the <Link href="/subprocessors">subprocessors</Link>.</p>
      </Sec>

      <Sec id="control" title="Your control">
        <p>You can clear site data in your browser settings at any time. Clearing it signs you out and resets the editor preferences above; it does not delete your projects.</p>
      </Sec>
    </LegalDoc>
  );
}
