import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdSenseLoader } from "../AdSenseLoader";
import { GaLoader } from "../GaLoader";
import { ConsentBanner } from "../ConsentBanner";
import { AD_CONSENT_KEY, readAdConsent } from "@/lib/adConsent";

/**
 * A-13 (2026-11-15): first-party ad consent.
 * - The banner asks once, persists Accept / Decline in localStorage, and
 *   never asks again on this browser.
 * - The AdSense loader injects Google's script only after Accept.
 * - GA4 is gated on the same choice (CAP-S07, r3): the GaLoader injects
 *   gtag only after Accept, and the banner asks whenever either is
 *   configured. No analytics code loads before consent.
 */

const PUB_ID = "pub-1234567890123456";
const ADSENSE_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${PUB_ID}`;
const GA_ID = "G-TEST123456";
const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;

function gtagScript(): HTMLScriptElement | null {
  return document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]');
}

function gtagConfigScript(): HTMLScriptElement | null {
  return Array.from(document.querySelectorAll("script")).find((s) => s.textContent?.includes(`gtag('config','${GA_ID}')`)) ?? null;
}

function adsenseScript(): HTMLScriptElement | null {
  return document.querySelector('script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  document.querySelectorAll('script[src^="https://pagead2.googlesyndication.com"]').forEach((s) => s.remove());
  document.querySelectorAll('script[src^="https://www.googletagmanager.com"]').forEach((s) => s.remove());
  Array.from(document.querySelectorAll("script"))
    .filter((s) => s.textContent?.includes("gtag('config'"))
    .forEach((s) => s.remove());
});

describe("ConsentBanner", () => {
  it("renders nothing while advertising is not configured", () => {
    const { container } = render(<ConsentBanner enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks once when no choice is stored", () => {
    render(<ConsentBanner enabled />);
    expect(screen.getByRole("dialog", { name: "Advertising consent" })).toBeInTheDocument();
    expect(screen.getByText("Ads keep Captionit free. Allow personalised ads from Google?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  }, 30_000);

  it("Accept persists accepted and hides the banner", () => {
    render(<ConsentBanner enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(window.localStorage.getItem(AD_CONSENT_KEY)).toBe("accepted");
    expect(readAdConsent()).toBe("accepted");
    expect(screen.queryByRole("dialog", { name: "Advertising consent" })).toBeNull();
  });

  it("Decline persists declined and hides the banner", () => {
    render(<ConsentBanner enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(window.localStorage.getItem(AD_CONSENT_KEY)).toBe("declined");
    expect(readAdConsent()).toBe("declined");
    expect(screen.queryByRole("dialog", { name: "Advertising consent" })).toBeNull();
  });

  it("never asks again once a choice is stored", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "accepted");
    const { container } = render(<ConsentBanner enabled />);
    expect(container).toBeEmptyDOMElement();
    window.localStorage.setItem(AD_CONSENT_KEY, "declined");
    const second = render(<ConsentBanner enabled />);
    expect(second.container).toBeEmptyDOMElement();
  });

  it("names analytics only when no ads are configured", () => {
    render(<ConsentBanner enabled adsEnabled={false} analyticsEnabled />);
    expect(screen.getByRole("dialog", { name: "Analytics consent" })).toBeInTheDocument();
    expect(screen.getByText("Help improve Captionit by allowing anonymous usage analytics from Google?")).toBeInTheDocument();
  });

  it("names both ads and analytics when both are configured", () => {
    render(<ConsentBanner enabled adsEnabled analyticsEnabled />);
    expect(screen.getByRole("dialog", { name: "Advertising consent" })).toBeInTheDocument();
    expect(screen.getByText("Ads keep Captionit free. Allow personalised ads and anonymous usage analytics from Google?")).toBeInTheDocument();
  });
});

describe("AdSenseLoader — gated on consent", () => {
  it("loads nothing with no stored choice", () => {
    render(<AdSenseLoader publisherId={PUB_ID} />);
    expect(adsenseScript()).toBeNull();
  });

  it("loads nothing after Decline", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "declined");
    render(<AdSenseLoader publisherId={PUB_ID} />);
    expect(adsenseScript()).toBeNull();
  });

  it("loads the script when consent was already accepted", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "accepted");
    render(<AdSenseLoader publisherId={PUB_ID} />);
    expect(adsenseScript()?.getAttribute("src")).toBe(ADSENSE_SRC);
  });

  it("loads the script when the visitor accepts in the same session", () => {
    render(
      <>
        <AdSenseLoader publisherId={PUB_ID} />
        <ConsentBanner enabled />
      </>,
    );
    expect(adsenseScript()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(adsenseScript()?.getAttribute("src")).toBe(ADSENSE_SRC);
  });

  it("still loads nothing when the visitor declines in the same session", () => {
    render(
      <>
        <AdSenseLoader publisherId={PUB_ID} />
        <ConsentBanner enabled />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(adsenseScript()).toBeNull();
  });

  it("loads nothing without a publisher id, even after Accept", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "accepted");
    render(<AdSenseLoader publisherId={undefined} />);
    expect(adsenseScript()).toBeNull();
  });
});

describe("GaLoader — gated on the same consent (CAP-S07)", () => {
  it("loads nothing with no stored choice", () => {
    render(<GaLoader measurementId={GA_ID} />);
    expect(gtagScript()).toBeNull();
    expect(gtagConfigScript()).toBeNull();
  });

  it("loads nothing after Decline", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "declined");
    render(<GaLoader measurementId={GA_ID} />);
    expect(gtagScript()).toBeNull();
    expect(gtagConfigScript()).toBeNull();
  });

  it("loads the tag + config when consent was already accepted", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "accepted");
    render(<GaLoader measurementId={GA_ID} />);
    expect(gtagScript()?.getAttribute("src")).toBe(GTAG_SRC);
    expect(gtagConfigScript()?.textContent).toContain(`gtag('config','${GA_ID}')`);
  });

  it("loads the tag when the visitor accepts in the same session", () => {
    render(
      <>
        <GaLoader measurementId={GA_ID} />
        <ConsentBanner enabled />
      </>,
    );
    expect(gtagScript()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(gtagScript()?.getAttribute("src")).toBe(GTAG_SRC);
    expect(gtagConfigScript()?.textContent).toContain(`gtag('config','${GA_ID}')`);
  });

  it("still loads nothing when the visitor declines in the same session", () => {
    render(
      <>
        <GaLoader measurementId={GA_ID} />
        <ConsentBanner enabled />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(gtagScript()).toBeNull();
    expect(gtagConfigScript()).toBeNull();
  });

  it("loads nothing without a measurement id, even after Accept", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "accepted");
    render(<GaLoader measurementId={undefined} />);
    expect(gtagScript()).toBeNull();
    expect(gtagConfigScript()).toBeNull();
  });
});

describe("GA4 is gated on consent (CAP-S07)", () => {
  it("the root layout ships no GA4 tag in <head> — it renders the gated loader", () => {
    // Source pins use process.cwd() (not import.meta.url: vitest serves
    // some test modules over http:, where fileURLToPath throws).
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    // No analytics code in <head>: the server cannot know the stored
    // choice, so a <script> there would load gtag before consent.
    const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
    expect(head).not.toContain("googletagmanager");
    expect(head).not.toContain("gtag");
    // The gated loader + the banner (enabled whenever either is
    // configured) live in <body> instead.
    expect(layout).toContain("<GaLoader");
    expect(layout).toContain("measurementId={gaId}");
    expect(layout).toContain("enabled={Boolean(adsenseId || gaId)}");
    expect(layout).not.toContain("pagead2.googlesyndication.com");
  });

  it("the GA loader gates on the accepted choice, like AdSense", () => {
    const loader = readFileSync(join(process.cwd(), "src/components/ads/GaLoader.tsx"), "utf8");
    expect(loader).toContain('readAdConsent() !== "accepted"');
    expect(loader).toContain("https://www.googletagmanager.com/gtag/js?id=");
    expect(loader).toContain("gtag('config'");
  });
});
