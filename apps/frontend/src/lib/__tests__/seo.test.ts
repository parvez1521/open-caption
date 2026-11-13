import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_PATHS,
  INDEXABLE_PATHS,
  PRODUCTION_URL,
  SITE_URL,
  faqPageJsonLd,
  gaMeasurementId,
  googleSiteVerification,
  adsensePublisherId,
  pageMetadata,
  productJsonLd,
  softwareApplicationJsonLd,
} from "../seo";
import { FAQS } from "../../components/home/faqs";
import { AUTO_CAPTION_FAQS } from "../../app/auto-caption-generator/faqs";
import { metadata as autoCaptionMetadata } from "../../app/auto-caption-generator/layout";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";
import { GET as adsTxtGET } from "../../app/ads.txt/route";
import { metadata as homeMetadata } from "../../app/(home)/layout";
import { metadata as notFoundMetadata } from "../../app/not-found";
import { metadata as loginMetadata } from "../../app/login/layout";
import { metadata as onboardingMetadata } from "../../app/onboarding/layout";
import { metadata as startMetadata } from "../../app/start/layout";
import { metadata as dashboardMetadata } from "../../app/(dashboard)/dashboard/layout";
import { metadata as billingMetadata } from "../../app/(dashboard)/settings/billing/layout";
import { generateMetadata as motionTemplateMetadata } from "../../app/(dashboard)/motion/[templateId]/layout";
import { metadata as motionMetadata } from "../../app/(dashboard)/motion/layout";
import { metadata as analyticsMetadata } from "../../app/(dashboard)/analytics/layout";
import { metadata as analyzerMetadata } from "../../app/(dashboard)/analyzer/layout";
import { metadata as growthMetadata } from "../../app/(dashboard)/growth/layout";
import { metadata as plannerMetadata } from "../../app/(dashboard)/planner/layout";
import { metadata as prompterMetadata } from "../../app/(dashboard)/prompter/layout";
import { metadata as privacyMetadata } from "../../app/(legal)/privacy/page";
import { metadata as termsMetadata } from "../../app/(legal)/terms/page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site URL", () => {
  it("falls back to the production custom domain (www), never localhost, when NEXT_PUBLIC_APP_URL is unset", () => {
    // vitest does not set NEXT_PUBLIC_APP_URL, so the module resolved the fallback
    expect(SITE_URL).toBe(PRODUCTION_URL);
    expect(SITE_URL).toBe("https://www.captionit.in");
    expect(SITE_URL).not.toContain("localhost");
    expect(SITE_URL).not.toContain("captionseasy.com");
    expect(SITE_URL).not.toContain("open-caption-ten.vercel.app");
  });
});

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists exactly the indexable public routes on the production origin", () => {
    expect(urls).toEqual(INDEXABLE_PATHS.map((p) => (p === "/" ? `${SITE_URL}/` : `${SITE_URL}${p}`)));
    expect(urls).toContain("https://www.captionit.in/");
    expect(urls).toContain("https://www.captionit.in/login");
    expect(urls).toContain("https://www.captionit.in/privacy");
    expect(urls).toContain("https://www.captionit.in/credits");
  });

  it("carries a lastmod on every entry (the build date — no per-page dates are invented)", () => {
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it("never lists an app, auth-flow or API route", () => {
    for (const appPath of APP_PATHS) {
      expect(urls).not.toContain(`${SITE_URL}${appPath}`);
    }
    expect(urls.some((u) => u.includes("/api/"))).toBe(false);
  });

  it("lists every URL exactly once (deep-audit B4: /credits was duplicated via LEGAL_PAGES + a manual append)", () => {
    expect(new Set(urls).size).toBe(urls.length);
    expect(new Set(INDEXABLE_PATHS).size).toBe(INDEXABLE_PATHS.length);
  });

  it("keeps the JSON-LD feature list in step with the site's own copy (150 looks)", () => {
    const ld = softwareApplicationJsonLd();
    expect(ld.featureList).toContain("150 animated caption looks");
    expect(ld.featureList.join(" ")).not.toContain("20+ animated");
  });

  it("does not list /motion or any /motion/<template> detail URL (Wave-4 audit decision)", () => {
    // Motion Studio is an app route behind sign-in, like every other dashboard
    // section: sitemap.ts lists exactly INDEXABLE_PATHS, the customize pages are
    // per-template views of that one noindex route, so neither /motion nor the
    // 46 template URLs belong in the sitemap. Crawl protection for them is the
    // noindex metadata (motion/layout.tsx) + the robots disallow below.
    expect(APP_PATHS).toContain("/motion");
    expect(urls).not.toContain(`${SITE_URL}/motion`);
    expect(urls.some((u) => u.includes("/motion"))).toBe(false);
  });

  it("gives the homepage top priority", () => {
    expect(entries[0]).toMatchObject({ url: `${SITE_URL}/`, priority: 1 });
  });
});

describe("robots", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

  it("points at the production sitemap", () => {
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("disallows the API and every app/auth-flow surface but allows the public site", () => {
    expect(rules?.allow).toBe("/");
    const disallow = rules?.disallow as string[];
    for (const p of ["/api/", "/dashboard", "/projects/", "/captions", "/editor", "/exports", "/brand", "/settings", "/start", "/pair", "/onboarding", "/transcribe", "/ai-clipper", "/forgot-password", "/reset-password"]) {
      expect(disallow).toContain(p);
    }
    // every app path in APP_PATHS is disallowed too (the /projects entry is the
    // trailing-slash form, which covers the same route tree)
    for (const p of APP_PATHS) {
      expect(disallow.some((d) => d === p || d === `${p}/`), `robots should disallow ${p}`).toBe(true);
    }
    expect(disallow).toContain("/motion");
    // /monitoring was a dead entry: no such route exists in src/app (it is
    // only the Sentry tunnelRoute, a POST-only endpoint crawlers never fetch).
    expect(disallow).not.toContain("/monitoring");
    expect(disallow).not.toContain("/login");
    expect(disallow).not.toContain("/");
  });
});

describe("ads.txt route", () => {
  it("404s while ADSENSE_PUBLISHER_ID is unset — no fake sellers line", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "");
    vi.stubEnv("ADSENSE_PUBLISHER_ID", "");
    const res = adsTxtGET();
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("google.com");
  });

  it("404s for a malformed publisher id", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "");
    vi.stubEnv("ADSENSE_PUBLISHER_ID", "ca-pub-123");
    const res = adsTxtGET();
    expect(res.status).toBe(404);
  });

  it("serves the exact sellers line when a valid publisher id is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "");
    vi.stubEnv("ADSENSE_PUBLISHER_ID", "pub-1234567890123456");
    const res = adsTxtGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("serves the sellers line from NEXT_PUBLIC_ADSENSE_PUBLISHER_ID alone (the loader's variable)", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "pub-9999888877776666");
    vi.stubEnv("ADSENSE_PUBLISHER_ID", "");
    const res = adsTxtGET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("google.com, pub-9999888877776666, DIRECT, f08c47fec0942fa0\n");
  });
});

describe("adsensePublisherId (loader gate)", () => {
  it("is undefined while the env var is unset or malformed — no ad code ships", () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "");
    expect(adsensePublisherId()).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "ca-pub-123");
    expect(adsensePublisherId()).toBeUndefined();
  });

  it("returns the id once a valid one is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "pub-1234567890123456");
    expect(adsensePublisherId()).toBe("pub-1234567890123456");
  });
});

describe("gaMeasurementId (GA4 loader gate)", () => {
  it("is undefined while the env var is unset or malformed — no analytics code ships", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    expect(gaMeasurementId()).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "UA-12345678-1");
    expect(gaMeasurementId()).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-abc-def");
    expect(gaMeasurementId()).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-abc");
    expect(gaMeasurementId()).toBeUndefined();
  });

  it("returns the id once a valid one is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-ABC123DEF4");
    expect(gaMeasurementId()).toBe("G-ABC123DEF4");
  });
});

describe("Search Console verification slot", () => {
  it("returns undefined while the env var is unset, so no meta tag renders", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "");
    expect(googleSiteVerification()).toBeUndefined();
  });

  it("returns the token once configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "test-token-123");
    expect(googleSiteVerification()).toBe("test-token-123");
  });
});

describe("pageMetadata", () => {
  it("gives indexable pages a canonical and social cards, with no robots restriction", () => {
    const m = pageMetadata({ title: "Sign in", description: "d", path: "/login" });
    expect(m.alternates?.canonical).toBe("/login");
    expect(m.openGraph).toMatchObject({ title: "Sign in · Captionit", url: "/login" });
    expect(m.robots).toBeUndefined();
    // the default social image must survive here: Next replaces (never
    // merges) openGraph/twitter per segment, so a pageMetadata page that
    // omitted images would ship no og:image at all despite the root layout.
    expect(m.openGraph?.images).toMatchObject([{ url: "/opengraph-image.jpg", width: 1200, height: 630 }]);
    expect(m.twitter?.images).toEqual(["/twitter-image.jpg"]);
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("marks app pages noindex/no-follow and omits the canonical", () => {
    const m = pageMetadata({ title: "Dashboard", description: "d", path: "/dashboard", index: false });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.alternates).toBeUndefined();
  });
});

describe("per-route metadata (shipped modules)", () => {
  it("/login is indexable with its own title and canonical", () => {
    expect(loginMetadata.title).toBe("Sign in");
    expect(loginMetadata.alternates?.canonical).toBe("/login");
    expect(loginMetadata.description).toContain("Captionit");
  });

  it("/start and /dashboard are noindex", () => {
    expect(startMetadata.robots).toEqual({ index: false, follow: false });
    expect(dashboardMetadata.robots).toEqual({ index: false, follow: false });
    expect(dashboardMetadata.title).toBe("Dashboard");
  });

  it("/onboarding is noindex with its own title (it used to inherit the homepage and duplicate it)", () => {
    expect(APP_PATHS).toContain("/onboarding");
    expect(onboardingMetadata.robots).toEqual({ index: false, follow: false });
    expect(onboardingMetadata.title).toBe("Onboarding");
    expect(onboardingMetadata.alternates).toBeUndefined();
  });

  it("/transcribe and /ai-clipper are app paths (noindex layouts + robots defence-in-depth)", () => {
    expect(APP_PATHS).toContain("/transcribe");
    expect(APP_PATHS).toContain("/ai-clipper");
  });

  it("/settings/billing has its own title instead of inheriting Settings", () => {
    expect(billingMetadata.robots).toEqual({ index: false, follow: false });
    expect(billingMetadata.title).toBe("Billing");
    expect(billingMetadata.alternates).toBeUndefined();
  });

  it("the 404 page has its own title/description instead of the homepage's verbatim", () => {
    expect(notFoundMetadata.title).toBe("Page not found");
    expect(notFoundMetadata.description).toContain("doesn't exist");
  });

  it("the homepage title and OG title agree (both the full <title> copy)", () => {
    expect(homeMetadata.title).toEqual({ absolute: expect.stringContaining("Word-timed captions") });
    expect(homeMetadata.openGraph?.title).toBe("Word-timed captions for Reels, Shorts and TikTok, made in your browser | Captionit");
    expect(homeMetadata.alternates?.canonical).toBe("/");
    expect(homeMetadata.description).toContain("animated captions timed to every word");
    // the home-layout override replaces the root openGraph/twitter wholesale,
    // so it must re-state everything the root provides (url, siteName,
    // locale, card, images) or the homepage silently loses them.
    expect(homeMetadata.openGraph?.url).toBe(SITE_URL);
    expect(homeMetadata.openGraph?.siteName).toBe("Captionit");
    expect(homeMetadata.openGraph?.images).toMatchObject([{ url: "/opengraph-image.jpg", width: 1200, height: 630 }]);
    expect(homeMetadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(homeMetadata.twitter?.images).toEqual(["/twitter-image.jpg"]);
  });

  it("motion template pages get per-template noindex metadata", async () => {
    const meta = await motionTemplateMetadata({ params: Promise.resolve({ templateId: "subscribe-pill" }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toBeUndefined();
    expect(meta.title).toBe("Subscribe Pill · Motion Studio");
    expect(meta.description).toContain("Pill that flips");
    const unknown = await motionTemplateMetadata({ params: Promise.resolve({ templateId: "no-such-template" }) });
    expect(unknown.title).toBe("Motion Studio");
    expect(unknown.robots).toEqual({ index: false, follow: false });
  });

  it("/motion (Motion Studio) is noindex with its own title, like its dashboard siblings", () => {
    expect(motionMetadata.robots).toEqual({ index: false, follow: false });
    expect(motionMetadata.title).toBe("Motion Studio");
    expect(motionMetadata.alternates).toBeUndefined();
    expect(motionMetadata.description).toContain("motion graphics");
  });

  it("the Phase 6/7 routes carry the same noindex metadata as their siblings (deep-audit B7: they had none)", () => {
    // Titles are the surfaces' own names — nav label and page H1 agree on each.
    const expected: Array<[typeof analyticsMetadata, string]> = [
      [analyticsMetadata, "Creator Analytics"],
      [analyzerMetadata, "Reel Analyzer"],
      [growthMetadata, "Growth Studio"],
      [plannerMetadata, "Content Planner"],
      [prompterMetadata, "Teleprompter"],
    ];
    for (const [meta, title] of expected) {
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.title).toBe(title);
      expect(meta.alternates).toBeUndefined();
    }
    const titles = expected.map(([, t]) => t);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("legal pages carry unique titles and canonicals", () => {
    expect(privacyMetadata.title).toBe("Privacy Policy");
    expect(privacyMetadata.alternates?.canonical).toBe("/privacy");
    expect(termsMetadata.title).toBe("Terms of Service");
    expect(termsMetadata.alternates?.canonical).toBe("/terms");
    expect(privacyMetadata.title).not.toBe(termsMetadata.title);
  });
});

describe("homepage JSON-LD", () => {
  it("SoftwareApplication is honest: free offer, web browser OS, no ratings or reviews", () => {
    const ld = softwareApplicationJsonLd() as unknown as Record<string, unknown>;
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.operatingSystem).toBe("Web browser");
    expect(ld.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "INR" });
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("review");
    expect(ld.url).toBe(SITE_URL);
  });

  it("FAQPage mirrors the visible FAQ copy exactly (same source array)", () => {
    const ld = faqPageJsonLd(FAQS);
    expect(ld.mainEntity).toHaveLength(FAQS.length);
    ld.mainEntity.forEach((entity, i) => {
      expect(entity.name).toBe(FAQS[i]!.q);
      expect(entity.acceptedAnswer.text).toBe(FAQS[i]!.a);
    });
  });
});

describe("competitor-intelligence programme (2026-11-13)", () => {
  it("/auto-caption-generator is indexable: in the sitemap at priority 0.8, not disallowed by robots", () => {
    expect(INDEXABLE_PATHS).toContain("/auto-caption-generator");
    const entries = sitemap();
    const entry = entries.find((e) => e.url === `${SITE_URL}/auto-caption-generator`);
    expect(entry).toMatchObject({ priority: 0.8, changeFrequency: "monthly" });
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = rules?.disallow as string[];
    expect(disallow).not.toContain("/auto-caption-generator");
  });

  it("/auto-caption-generator has its own title, description and canonical, and is indexable", () => {
    expect(autoCaptionMetadata.title).toContain("Automatic Video Caption Generator");
    expect(autoCaptionMetadata.description).toContain("150");
    expect(autoCaptionMetadata.alternates?.canonical).toBe("/auto-caption-generator");
    expect(autoCaptionMetadata.robots).toBeUndefined();
    expect(autoCaptionMetadata.title).not.toBe("Pricing");
  });

  it("the new page's FAQPage mirrors its visible FAQ copy exactly (same source array)", () => {
    const ld = faqPageJsonLd(AUTO_CAPTION_FAQS);
    expect(ld.mainEntity).toHaveLength(AUTO_CAPTION_FAQS.length);
    expect(new Set(AUTO_CAPTION_FAQS.map((f) => f.q)).size).toBe(AUTO_CAPTION_FAQS.length);
    ld.mainEntity.forEach((entity, i) => {
      expect(entity.name).toBe(AUTO_CAPTION_FAQS[i]!.q);
      expect(entity.acceptedAnswer.text).toBe(AUTO_CAPTION_FAQS[i]!.a);
    });
  });

  it("productJsonLd lists every plan price from the same config the pricing page renders", () => {
    const ld = productJsonLd() as unknown as Record<string, unknown>;
    expect(ld["@type"]).toBe("Product");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("review");
    const offers = ld.offers as Array<Record<string, unknown>>;
    // Free (one zero offer) + 3 paid plans x 2 currencies = 7 offers.
    expect(offers).toHaveLength(7);
    const pairs = offers.map((o) => `${o.priceCurrency}:${o.price}`);
    for (const expected of ["INR:0", "INR:299", "INR:499", "INR:799", "USD:4", "USD:6", "USD:10"]) {
      expect(pairs).toContain(expected);
    }
    // One currency per Offer: the geo rule is honoured in structured data too.
    for (const o of offers) {
      expect(typeof o.priceCurrency).toBe("string");
      expect(o.url).toBe(`${SITE_URL}/pricing`);
    }
    // It serialises cleanly — what the page embeds is what was tested.
    expect(() => JSON.parse(JSON.stringify(ld))).not.toThrow();
  });
});
