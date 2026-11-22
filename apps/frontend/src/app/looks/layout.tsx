import type { Metadata } from "next";
import { pageMetadata, SITE_URL, softwareApplicationJsonLd } from "@/lib/seo";

/**
 * Static metadata: the registry count (150, verified against LOOKS) is the
 * site's own canonical claim — the homepage and the product JSON-LD say
 * "150 looks" too, and a test pins it. The count cannot be computed here:
 * @capseasy/templates is client-only (React hooks, Remotion), so this
 * server layout may not import it. If looks are added or retired, update
 * the number here alongside the homepage copy. The gallery page itself
 * always renders the live LOOKS.length.
 */
export const metadata: Metadata = pageMetadata({
  title: "Looks — 150 Animated Caption Looks",
  description:
    "Browse all 150 animated caption looks for Shorts, Reels and TikTok. Tap any look to start a project with it — free, in your browser, no watermark.",
  path: "/looks",
});

/**
 * Structured data for the gallery page. The SoftwareApplication block is
 * the honest product block shared with the homepage (free product, price 0,
 * no ratings or reviews) — with this page's own canonical as its url, not
 * the homepage. No FAQ schema: this page has no FAQ section.
 */
const structuredData = [softwareApplicationJsonLd({ url: `${SITE_URL}/looks` })];

export default function LooksLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
