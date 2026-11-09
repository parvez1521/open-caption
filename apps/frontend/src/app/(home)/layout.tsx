import type { Metadata } from "next";
import { FAQS } from "@/components/home/faqs";
import { faqPageJsonLd, softwareApplicationJsonLd } from "@/lib/seo";

// homepage only: other pages keep their own canonical URL
export const metadata: Metadata = {
  alternates: { canonical: "/" },
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
