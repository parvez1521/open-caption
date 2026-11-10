import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_PATHS,
  INDEXABLE_PATHS,
  PRODUCTION_URL,
  SITE_URL,
  faqPageJsonLd,
  googleSiteVerification,
  adsensePublisherId,
  pageMetadata,
  softwareApplicationJsonLd,
} from "../seo";
import { FAQS } from "../../components/home/faqs";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";
import { GET as adsTxtGET } from "../../app/ads.txt/route";
import { metadata as loginMetadata } from "../../app/login/layout";
import { metadata as startMetadata } from "../../app/start/layout";
import { metadata as dashboardMetadata } from "../../app/(dashboard)/dashboard/layout";
import { metadata as motionMetadata } from "../../app/(dashboard)/motion/layout";
import { metadata as privacyMetadata } from "../../app/(legal)/privacy/page";
import { metadata as termsMetadata } from "../../app/(legal)/terms/page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site URL", () => {
  it("falls back to the production Vercel URL, never localhost, when NEXT_PUBLIC_APP_URL is unset", () => {
    // vitest does not set NEXT_PUBLIC_APP_URL, so the module resolved the fallback
    expect(SITE_URL).toBe(PRODUCTION_URL);
    expect(SITE_URL).toBe("https://open-caption-ten.vercel.app");
    expect(SITE_URL).not.toContain("localhost");
    expect(SITE_URL).not.toContain("captionseasy.com");
  });
});

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists exactly the indexable public routes on the production origin", () => {
    expect(urls).toEqual(INDEXABLE_PATHS.map((p) => (p === "/" ? `${SITE_URL}/` : `${SITE_URL}${p}`)));
    expect(urls).toContain("https://open-caption-ten.vercel.app/");
    expect(urls).toContain("https://open-caption-ten.vercel.app/login");
    expect(urls).toContain("https://open-caption-ten.vercel.app/privacy");
    expect(urls).toContain("https://open-caption-ten.vercel.app/credits");
  });

  it("never lists an app, auth-flow or API route", () => {
    for (const appPath of APP_PATHS) {
      expect(urls).not.toContain(`${SITE_URL}${appPath}`);
    }
    expect(urls.some((u) => u.includes("/api/"))).toBe(false);
  });

  it("does not list /motion or any /motion/<template> detail URL (Wave-4 audit decision)", () => {
    // Motion Studio is an app route behind sign-in, like every other dashboard
    // section: sitemap.ts lists exactly INDEXABLE_PATHS, the customize pages are
    // per-template views of that one noindex route, so neither /motion nor the
    // 30 template URLs belong in the sitemap. Crawl protection for them is the
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
    for (const p of ["/api/", "/dashboard", "/projects/", "/captions", "/editor", "/exports", "/brand", "/settings", "/start", "/pair", "/forgot-password", "/reset-password"]) {
      expect(disallow).toContain(p);
    }
    // every app path in APP_PATHS is disallowed too (the /projects entry is the
    // trailing-slash form, which covers the same route tree)
    for (const p of APP_PATHS) {
      expect(disallow.some((d) => d === p || d === `${p}/`), `robots should disallow ${p}`).toBe(true);
    }
    expect(disallow).toContain("/motion");
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
    expect(m.openGraph).toMatchObject({ title: "Sign in · Open Caption", url: "/login" });
    expect(m.robots).toBeUndefined();
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
    expect(loginMetadata.description).toContain("Open Caption");
  });

  it("/start and /dashboard are noindex", () => {
    expect(startMetadata.robots).toEqual({ index: false, follow: false });
    expect(dashboardMetadata.robots).toEqual({ index: false, follow: false });
    expect(dashboardMetadata.title).toBe("Dashboard");
  });

  it("/motion (Motion Studio) is noindex with its own title, like its dashboard siblings", () => {
    expect(motionMetadata.robots).toEqual({ index: false, follow: false });
    expect(motionMetadata.title).toBe("Motion Studio");
    expect(motionMetadata.alternates).toBeUndefined();
    expect(motionMetadata.description).toContain("motion graphics");
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
