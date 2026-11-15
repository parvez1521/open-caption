import type { Metadata } from "next";
import { REELS_FAQS } from "./faqs";
import { faqPageJsonLd, pageMetadata, SITE_URL, softwareApplicationJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Auto Captions for Reels — Free, In Your Browser",
  description:
    "Add auto captions to your Reels with AI. Free, in your browser. 9:16 word-by-word captions, 150 looks, 14 languages including Hindi and Hinglish. MP4 export, no watermark. Nothing to install.",
  path: "/auto-captions-for-reels",
});

/**
 * Structured data for the Reels landing page. The FAQPage block is built from
 * the same REELS_FAQS array the visible FAQ section renders, so schema and
 * page copy cannot diverge. The SoftwareApplication block is the honest
 * product block shared with the homepage (free product, price 0, no ratings
 * or reviews) — with this page's own canonical as its url, not the homepage.
 */
const structuredData = [softwareApplicationJsonLd({ url: `${SITE_URL}/auto-captions-for-reels` }), faqPageJsonLd(REELS_FAQS)];

export default function AutoCaptionsForReelsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
