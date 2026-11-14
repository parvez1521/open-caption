import type { Metadata } from "next";
import { AUTO_CAPTION_FAQS } from "./faqs";
import { faqPageJsonLd, pageMetadata, softwareApplicationJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Automatic Video Caption Generator — Free, In Your Browser",
  description:
    "Generate word-timed captions for your video automatically, free and in your browser. 150 animated looks, 14 languages including Hindi and Hinglish, MP4 and SRT export, nothing to install.",
  path: "/auto-caption-generator",
});

/**
 * Structured data for the tool landing page. The FAQPage block is built from
 * the same AUTO_CAPTION_FAQS array the visible FAQ section renders, so schema
 * and page copy cannot diverge. The SoftwareApplication block is the honest
 * product block shared with the homepage (free product, price 0, no ratings
 * or reviews).
 */
const structuredData = [softwareApplicationJsonLd(), faqPageJsonLd(AUTO_CAPTION_FAQS)];

export default function AutoCaptionGeneratorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
