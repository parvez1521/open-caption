import type { Metadata } from "next";
import { pageMetadata, SITE_URL, softwareApplicationJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Face Swap — Put Your Face in Any Thumbnail, Free",
  description:
    "Swap your face into a YouTube thumbnail, free and in your browser. Your face comes from a live selfie only — never an upload — and nothing leaves this tab. 5 swaps a day.",
  path: "/face-swap",
});

/**
 * Structured data for the tool landing page: the honest product block
 * shared with the homepage (free product, price 0, no ratings or
 * reviews) with this page's own canonical as its url.
 */
const structuredData = [softwareApplicationJsonLd({ url: `${SITE_URL}/face-swap` })];

export default function FaceSwapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
