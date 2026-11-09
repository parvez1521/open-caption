import type { Metadata } from "next";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";
import { LEGAL_PAGES } from "@/lib/legal";

/**
 * SEO foundation — one place for the canonical site URL, the indexable route
 * list, per-page metadata, the Search Console verification slot and the
 * homepage structured data. Audit categories follow the OpenSEO site-audit
 * checklist discipline (crawlability, indexation, titles/descriptions,
 * canonicals, headings, image alt text, structured data) — reference only,
 * nothing from that project is deployed here.
 *
 * The production origin today is the Vercel deployment URL. NEXT_PUBLIC_APP_URL
 * overrides it (set it to the custom domain when Open Caption gets one). The
 * fallback is deliberately the production URL, never localhost: before this
 * module existed the live site shipped canonical and og:image URLs pointing at
 * http://localhost:3000 because the env var was unset in Vercel.
 */
export const PRODUCTION_URL = "https://open-caption-ten.vercel.app";

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_URL).replace(/\/$/, "");

/** Routes search engines may index: public marketing, auth and legal only. */
export const INDEXABLE_PATHS = ["/", "/login", ...LEGAL_PAGES.map((p) => p.href as string), "/credits"] as const;

/** App routes behind sign-in: never indexed (metadata noindex + robots disallow). */
export const APP_PATHS = [
  "/dashboard",
  "/projects",
  "/captions",
  "/editor",
  "/clipper",
  "/exports",
  "/brand",
  "/create",
  "/settings",
  "/start",
  "/pair",
  "/forgot-password",
  "/reset-password",
] as const;

/**
 * Google Search Console verification token, from env only. Returns undefined
 * when the env var is unset so the root layout renders NO verification meta
 * tag at all (Next omits undefined verification entries).
 */
export function googleSiteVerification(): string | undefined {
  const value = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  return value ? value : undefined;
}

/**
 * Metadata for one route. Indexable pages get a canonical URL plus matching
 * Open Graph / Twitter cards; app pages get robots noindex instead (a
 * canonical on a noindex page would contradict it, so it is omitted).
 * The document <title> picks up the "· Open Caption" suffix from the root
 * layout title template; the OG/Twitter titles spell it out here because
 * those fields do not go through the template.
 */
export function pageMetadata({
  title,
  description,
  path,
  index = true,
}: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const socialTitle = `${title} · ${BRAND_NAME}`;
  return {
    title,
    description,
    ...(index ? { alternates: { canonical: path } } : {}),
    openGraph: { type: "website", siteName: BRAND_NAME, title: socialTitle, description, ...(index ? { url: path } : {}) },
    twitter: { card: "summary_large_image", title: socialTitle, description },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * Homepage SoftwareApplication JSON-LD. Honest fields only: the product is a
 * free in-browser tool today, so the offer is price 0 and there are NO
 * ratings, reviews or invented prices.
 */
export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    url: SITE_URL,
    description: BRAND_DESCRIPTION,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web browser",
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
  };
}

/**
 * FAQPage JSON-LD built from the exact same FAQS array the visible FAQ
 * section renders (src/components/home/faqs.ts), so the schema can never
 * diverge from the copy on the page.
 */
export function faqPageJsonLd(faqs: readonly { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
