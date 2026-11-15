import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdSenseLoader } from "../AdSenseLoader";
import { ConsentBanner } from "../ConsentBanner";
import { AD_CONSENT_KEY, readAdConsent } from "@/lib/adConsent";

/**
 * A-13 (2026-11-15): first-party ad consent.
 * - The banner asks once, persists Accept / Decline in localStorage, and
 *   never asks again on this browser.
 * - The AdSense loader injects Google's script only after Accept.
 * - GA4 is NOT gated: it stays a plain script in the root layout.
 */

const PUB_ID = "pub-1234567890123456";
const ADSENSE_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${PUB_ID}`;

function adsenseScript(): HTMLScriptElement | null {
  return document.querySelector('script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  document.querySelectorAll('script[src^="https://pagead2.googlesyndication.com"]').forEach((s) => s.remove());
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

describe("GA4 is NOT gated on ad consent", () => {
  it("the root layout still ships the GA4 tag with no consent wiring", () => {
    // Source pins use process.cwd() (not import.meta.url: vitest serves
    // some test modules over http:, where fileURLToPath throws).
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    // The GA4 tag lives in <head> and loads whenever its env var is set.
    // The <head> block must carry no consent wiring at all: the banner
    // and the gated loader live in <body>, GA4 does not depend on them.
    const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
    expect(head).toContain("https://www.googletagmanager.com/gtag/js?id=");
    // No consent component is rendered in <head> (the comment may name
    // the loader, so pin the JSX tags, not the word).
    expect(head).not.toContain("<ConsentBanner");
    expect(head).not.toContain("<AdSenseLoader");
    expect(layout).not.toContain("pagead2.googlesyndication.com");
  });

  it("the loader gates only AdSense, on the accepted choice", () => {
    const loader = readFileSync(join(process.cwd(), "src/components/ads/AdSenseLoader.tsx"), "utf8");
    expect(loader).toContain('readAdConsent() !== "accepted"');
    expect(loader).not.toContain("gtag");
    expect(loader).not.toContain("googletagmanager");
  });
});
