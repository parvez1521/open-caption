import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import QueryProvider from "@/providers/QueryProvider";
import { introScript } from "@/components/home/intro";
import { authReturnScript } from "@/lib/authReturn";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TAGLINE, BRAND_TITLE } from "@/lib/brand";
import { SITE_URL, adsensePublisherId, googleSiteVerification } from "@/lib/seo";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
const adsenseId = adsensePublisherId();
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND_TITLE, template: `%s · ${BRAND_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: BRAND_NAME,
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: BRAND_TAGLINE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_TAGLINE,
    description: SITE_DESCRIPTION,
  },
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
        {adsenseId ? (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${adsenseId}`} crossOrigin="anonymous" />
        ) : null}
      </head>
      <body
        className="h-full bg-major text-obsidian font-sans selection:bg-emerald-accent selection:text-[#141412]"
        suppressHydrationWarning
      >
        <QueryProvider>{children}</QueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

