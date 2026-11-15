import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Homepage scroll jank (owner report 2026-11-15): the Captionit homepage
 * felt glitchy next to SwitchRoute's smooth native scroll. The screen
 * recording showed a ~300px snap in 100ms after near-stillness — Lenis was
 * hijacking the wheel and animating scrollTop with an exponential ease
 * (half the distance in the first 10% of its 1.1s duration), and the pinned
 * showcase's scrubbed timeline lagged a further second behind.
 *
 * The fix: native scroll everywhere (SwitchRoute does exactly this — no
 * Lenis, no GSAP/ScrollTrigger, one passive scroll listener, reveals via a
 * one-shot IntersectionObserver hook). These pins keep the emulation from
 * coming back.
 */

const homePage = readFileSync(join(process.cwd(), "src/app/(home)/page.tsx"), "utf8");
const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const spatialScroll = readFileSync(
  join(process.cwd(), "src/components/spatial/SpatialScroll.tsx"),
  "utf8",
);
const showcaseKit = readFileSync(
  join(process.cwd(), "src/components/spatial/ShowcaseKit.tsx"),
  "utf8",
);
const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");

describe("homepage scroll is native — no Lenis (owner report 2026-11-15)", () => {
  it("the homepage never imports or constructs Lenis (a comment may name it)", () => {
    expect(homePage).not.toMatch(/import\s+.*\blenis\b/i);
    expect(homePage).not.toMatch(/new\s+Lenis\b/);
    expect(homePage).not.toContain("lenis.raf");
    expect(homePage).not.toContain("lenis.destroy");
  });

  it("the lenis dependency is gone from package.json", () => {
    expect(packageJson).not.toContain('"lenis"');
  });

  it("no dead .lenis CSS rules remain", () => {
    expect(globalsCss).not.toContain(".lenis");
  });

  it("anchor jumps stay smooth via CSS scroll-behavior (the wheel itself is native)", () => {
    expect(globalsCss).toContain("scroll-behavior: smooth");
  });
});

describe("pinned showcase follows the scroll (scrub lag)", () => {
  it("the showcase scrub is tight (0.4), not a full second of lag", () => {
    expect(spatialScroll).toContain("scrub: 0.4");
    expect(spatialScroll).not.toContain("scrub: 1,");
  });
});

describe("showcase players never force layout on a timer", () => {
  it("the ClipPlayer clock tick reads only the video clock, never getBoundingClientRect", () => {
    // the 100ms tick used to call getBoundingClientRect() 10x/s per player
    // (40 forced synchronous layouts a second) — the box width is now
    // measured by a ResizeObserver instead
    expect(showcaseKit).toContain("ResizeObserver");
    expect(showcaseKit.match(/getBoundingClientRect/g)?.length ?? 0).toBe(1);
  });
});
