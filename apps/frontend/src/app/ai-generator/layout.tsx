import type { Metadata } from "next";
import { pageMetadata, SITE_URL, softwareApplicationJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "AI Generator — Free Text, Image and Video",
  description:
    "Generate text, images and short video clips from a prompt, free in your browser. Powered by Puter.js — it runs on your own free Puter account and its allowance. Captionit charges nothing and stores nothing.",
  path: "/ai-generator",
});

/**
 * Structured data for the tool landing page. The SoftwareApplication block is
 * the honest product block shared with the homepage (free product, price 0,
 * no ratings or reviews) — with this page's own canonical as its url, not
 * the homepage. No FAQ schema: this page has no FAQ section.
 */
const structuredData = [softwareApplicationJsonLd({ url: `${SITE_URL}/ai-generator` })];

export default function AiGeneratorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
