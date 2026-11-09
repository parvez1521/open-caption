import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import QueryProvider from "@/providers/QueryProvider";
import { introScript } from "@/components/home/intro";
import { authReturnScript } from "@/lib/authReturn";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TAGLINE, BRAND_TITLE, BRAND_URL } from "@/lib/brand";
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

const SITE_URL = BRAND_URL;
const SITE_TITLE = BRAND_TITLE;
const SITE_DESCRIPTION = BRAND_DESCRIPTION;

// og:image / twitter:image come from app/opengraph-image.jpg and app/twitter-image.jpg
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: BRAND_NAME,
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: BRAND_TAGLINE,
    description: SITE_DESCRIPTION,
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
      </head>
      <body
        className="h-full bg-major text-obsidian font-sans selection:bg-side selection:text-obsidian"
        suppressHydrationWarning
      >
        <QueryProvider>{children}</QueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

