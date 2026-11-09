import type { Metadata } from "next";
import { FAQS } from "@/components/home/faqs";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_URL } from "@/lib/brand";

const SITE_URL = BRAND_URL;

// homepage only: other pages keep their own canonical URL
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: BRAND_NAME,
    url: SITE_URL,
    description: BRAND_DESCRIPTION,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires a modern browser with WebAssembly. WebGPU makes captioning faster.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    featureList: [
      "Automatic word-timed captions",
      "20+ animated caption styles",
      "English and Hindi / Hinglish speech recognition",
      "MP4 export with burned-in captions",
      "SRT subtitle export",
      "No watermark",
      "Video never leaves your device",
    ],
    image: `${SITE_URL}/opengraph-image.jpg`,
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  },
];

export default function HomeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
