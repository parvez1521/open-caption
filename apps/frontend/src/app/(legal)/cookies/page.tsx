import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Cookie Policy", description: "The small amount of browser storage Open Caption uses and why.", path: "/cookies" });

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
      intro={<>{LEGAL.product} uses <strong>no advertising or cross-site tracking cookies</strong>. We only store what the site needs to work: your sign-in session and a few editor preferences.</>}
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
        <p>All of these are strictly necessary or remember a choice you made, so they do not need consent under most cookie laws. If we ever add analytics or marketing cookies, we will ask for your consent first and update this page.</p>
      </Sec>

      <Sec id="third" title="Third-party requests">
        <p>The caption preview loads the fonts used by each look from Google Fonts, so your browser contacts Google&rsquo;s font servers when you open the studio or the looks gallery. Our hosting provider records basic request logs for security. See the <Link href="/subprocessors">subprocessors</Link>.</p>
      </Sec>

      <Sec id="control" title="Your control">
        <p>You can clear site data in your browser settings at any time. Clearing it signs you out and resets the editor preferences above; it does not delete your projects.</p>
      </Sec>
    </LegalDoc>
  );
}
