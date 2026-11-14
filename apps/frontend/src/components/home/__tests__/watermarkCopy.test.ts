import { describe, expect, it } from "vitest";
import { FAQS } from "../faqs";
import { AUTO_CAPTION_FAQS } from "@/app/auto-caption-generator/faqs";
import { softwareApplicationJsonLd } from "@/lib/seo";
import { WATERMARK_REMOVAL_PRICE_INR, WATERMARK_TEXT } from "@capseasy/shared";

/**
 * Watermark copy pins (monetization, Builder 3): the homepage and the
 * auto-caption-generator page must never again promise "no watermark" —
 * free MP4 exports carry a small Captionit watermark, paid plans export
 * clean, and ₹69 once removes it from one video. The FAQ answers and the
 * SoftwareApplication JSON-LD are the importable sources; the .tsx copy
 * (Sections, UploadPanel, Section4, layout meta) is covered by the same
 * wording and checked by grep in review, since it is not importable here.
 */
describe("watermark copy", () => {
  it("no FAQ answer promises 'no watermark' any more", () => {
    for (const faq of [...FAQS, ...AUTO_CAPTION_FAQS]) {
      expect(faq.a.toLowerCase()).not.toContain("no watermark");
    }
  });

  it("the free FAQ answers state the watermark rule honestly, in short sentences", () => {
    const free = FAQS.find((f) => f.q === "Is Captionit really free?");
    expect(free).toBeDefined();
    expect(free!.a).toContain("Free MP4 exports carry a small Captionit watermark.");
    expect(free!.a).toContain("Paid plans export clean");
    expect(free!.a).toContain("₹69 once removes it from one video");
    // SRT has no picture: the answer keeps SRT free without implying it is watermarked.
    expect(free!.a).toContain("SRT exports are free");
    const acg = AUTO_CAPTION_FAQS.find((f) => f.q === "Is the automatic caption generator free?");
    expect(acg).toBeDefined();
    expect(acg!.a).toBe(free!.a);
  });

  it("the SoftwareApplication JSON-LD drops 'No watermark' for the honest feature", () => {
    const jsonLd = softwareApplicationJsonLd();
    const features = jsonLd.featureList as string[];
    expect(features).not.toContain("No watermark");
    expect(features).toContain("Watermark removal available");
  });

  it("the removal is ₹69, and the mark reads Captionit", () => {
    expect(WATERMARK_REMOVAL_PRICE_INR).toBe(69);
    expect(WATERMARK_TEXT).toBe("Captionit");
  });
});
