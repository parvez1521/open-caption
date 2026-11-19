import type { Metadata } from "next";
import { FAQS } from "@/components/home/faqs";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TITLE } from "@/lib/brand";
import { DEFAULT_OPENGRAPH_IMAGES, DEFAULT_TWITTER_IMAGES, SITE_URL, faqPageJsonLd, softwareApplicationJsonLd } from "@/lib/seo";

// Homepage: explicit title + description (the root layout's defaults would
// otherwise be the only copy), and the OG/Twitter titles spell out the SAME
// title the <title> tag carries — the root layout's BRAND_TAGLINE differs
// from it, so the homepage overrides both here. Next REPLACES the whole
// openGraph/twitter object at this level instead of merging it, so the
// override must re-state url, siteName, locale, card and the default
// images — omitting them silently dropped og:url, og:site_name, the
// twitter card type and both images from the homepage.
export const metadata: Metadata = {
  title: { absolute: BRAND_TITLE },
  description: BRAND_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [...DEFAULT_OPENGRAPH_IMAGES],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
    images: [...DEFAULT_TWITTER_IMAGES],
  },
};

/**
 * Structured data for the homepage. The FAQPage block is built from the same
 * FAQS array the visible FAQ section renders, so schema and page copy cannot
 * diverge. The SoftwareApplication block carries honest fields only (free
 * product, price 0, no ratings or reviews).
 */
const structuredData = [softwareApplicationJsonLd(), faqPageJsonLd(FAQS)];

export default function HomeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
