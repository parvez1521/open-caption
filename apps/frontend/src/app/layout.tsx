import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import QueryProvider from "@/providers/QueryProvider";
import { introScript } from "@/components/home/intro";
import { authReturnScript } from "@/lib/authReturn";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TAGLINE, BRAND_TITLE } from "@/lib/brand";
import { DEFAULT_OPENGRAPH_IMAGES, DEFAULT_TWITTER_IMAGES, SITE_URL, adsensePublisherId, gaMeasurementId, googleSiteVerification } from "@/lib/seo";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { AdSenseLoader } from "@/components/ads/AdSenseLoader";
import { GaLoader } from "@/components/ads/GaLoader";
import { ConsentBanner } from "@/components/ads/ConsentBanner";
import "./globals.css";

/**
 * The site uses exactly two fonts (locked; see globals.css):
 *  - Plus Jakarta Sans: all text, UI and headings
 *  - Instrument Serif Italic: the slightly cursive accent ("Easy" in the logo, emphasised words in headings)
 * Caption fonts inside the video preview are separate: they belong to each look.
 */
const fontNormal = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-normal-sys",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const fontAccent = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-accent-sys",
  weight: "400",
  style: ["normal", "italic"],
});

const SITE_DESCRIPTION = BRAND_DESCRIPTION;

// og:image / twitter:image come from app/opengraph-image.jpg and app/twitter-image.jpg
// Search Console: verification renders ONLY when NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
// is set in the environment (see lib/seo.ts) — no empty meta tag otherwise.
const googleVerification = googleSiteVerification();

// AdSense: the loader renders ONLY when NEXT_PUBLIC_ADSENSE_PUBLISHER_ID holds a
// valid publisher id — no env, zero ad code on any page (see lib/seo.ts).
// It is NOT a script tag here any more: the loader is a client component
// (components/ads/AdSenseLoader.tsx) that injects the script only after
// the visitor accepts ads in the consent banner (A-13, 2026-11-15).
// Server rendering cannot know the stored choice, so a <script> here
// would load Google's ad code before consent.
const adsenseId = adsensePublisherId();

// GA4: same env gate as AdSense — the loader renders ONLY when
// NEXT_PUBLIC_GA_MEASUREMENT_ID holds a valid G- id (see lib/seo.ts).
// It is NOT a script tag here any more: the loader is a client component
// (components/ads/GaLoader.tsx) that injects the tag only after the
// visitor accepts in the consent banner (CAP-S07, r3) — the same single
// choice that gates AdSense. Server rendering cannot know the stored
// choice, so a <script> here would load Google's analytics code before
// consent. No id exists yet and none is hardcoded; no env, zero analytics
// code.
const gaId = gaMeasurementId();
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND_TITLE, template: `%s · ${BRAND_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: BRAND_NAME,
  // PWA: the Apple touch icon comes from src/app/apple-icon.png (180x180,
  // served automatically as /apple-icon.png by Next.js).
  appleWebApp: {
    capable: true,
    title: BRAND_NAME,
    statusBarStyle: "black-translucent",
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: BRAND_TAGLINE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    // Sitewide default social image (1200x630): pages that set their own
    // openGraph fields without images inherit this one. The file also lives
    // at app/opengraph-image.jpg, but an explicit image here is what every
    // indexable page actually carries.
    images: [...DEFAULT_OPENGRAPH_IMAGES],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_TAGLINE,
    description: SITE_DESCRIPTION,
    images: [...DEFAULT_TWITTER_IMAGES],
  },
};

export const viewport: Viewport = {
  themeColor: "#141412",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontNormal.variable} ${fontAccent.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* first: a Google / email sign-in return goes straight to the studio, never the homepage */}
        <script dangerouslySetInnerHTML={{ __html: authReturnScript() }} />
        <script dangerouslySetInnerHTML={{ __html: introScript(process.env.NODE_ENV !== "production") }} />
        {/* GA4 and AdSense scripts are NOT here any more — they load
            through GaLoader / AdSenseLoader in <body>, gated on the
            visitor's consent choice (CAP-S07). The banner below asks once
            whenever either is configured. */}
      </head>
      <body
        className="h-full bg-major text-obsidian font-sans selection:bg-emerald-accent selection:text-[#141412]"
        suppressHydrationWarning
      >
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <ServiceWorkerRegister />
        <AdSenseLoader publisherId={adsenseId} />
        <GaLoader measurementId={gaId} />
        <ConsentBanner enabled={Boolean(adsenseId || gaId)} adsEnabled={Boolean(adsenseId)} analyticsEnabled={Boolean(gaId)} />
        <QueryProvider>{children}</QueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

