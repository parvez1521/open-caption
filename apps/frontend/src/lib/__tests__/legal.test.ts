import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FEEDBACK_MAILTO, LEGAL } from "../legal";

describe("legal operator identity", () => {
  it("names the current owner as operator of Captionit", () => {
    expect(LEGAL.operator).toBe(
      "Parvez Achhan Ali Siddiqui, an individual (sole proprietor) trading as Captionit",
    );
  });

  it("uses the work inbox for legal contact and feedback", () => {
    expect(LEGAL.email).toBe("work.techhacksai@gmail.com");
    expect(FEEDBACK_MAILTO).toContain("mailto:work.techhacksai@gmail.com");
  });

  it("publishes no street address — country only", () => {
    expect(LEGAL.address).toBe("India");
    expect(LEGAL.courts).toBe("the courts of India");
  });

  it("carries no trace of the previous operator or brand", () => {
    const rendered = Object.values(LEGAL).join(" ");
    expect(rendered).not.toMatch(/Ishaan/i);
    expect(rendered).not.toMatch(/CaptionsEasy/i);
    expect(rendered).not.toMatch(/captionseasy\.com/i);
    expect(rendered).not.toMatch(/Bengaluru/i);
  });
});

// MA-A6-003 (CAP-S01 follow-up): the Terms page must disclose the automatic
// ≤50 MB cloud backup in the same place it says video files stay on the
// device — the Privacy page already does, Terms used to carry the
// unqualified claim on its own.
describe("terms page — cloud-backup disclosure (MA-A6-003)", () => {
  it("states the 50 MB automatic backup alongside the stays-on-device claim", () => {
    const terms = readFileSync(path.resolve(__dirname, "../../app/(legal)/terms/page.tsx"), "utf8");
    expect(terms).toContain("automatically backed up");
    expect(terms).toContain("50 MB");
    expect(terms).toContain("cloud storage");
  });
});

describe("legal nav (production-pages audit)", () => {
  it("lists the Security page alongside the other legal pages", async () => {
    const { LEGAL_PAGES } = await import("../legal");
    expect(LEGAL_PAGES.map((p) => p.href)).toContain("/security");
    expect(LEGAL_PAGES.map((p) => p.href)).toContain("/cookies");
  });
});

describe("GA4 wording (production-pages audit)", () => {
  it("states GA4 runs only when configured — never as a deployed fact", () => {
    const privacy = readFileSync(path.resolve(__dirname, "../../app/(legal)/privacy/page.tsx"), "utf8");
    const cookies = readFileSync(path.resolve(__dirname, "../../app/(legal)/cookies/page.tsx"), "utf8");
    for (const page of [privacy, cookies]) {
      expect(page).toContain("only runs when a measurement ID is configured");
      expect(page).not.toContain("also runs on this site");
      expect(page).not.toContain("also runs on every page");
    }
  });

  it("completes the Cookie Policy storage table with the keys used in code", () => {
    const cookies = readFileSync(path.resolve(__dirname, "../../app/(legal)/cookies/page.tsx"), "utf8");
    for (const key of [
      "ce:after-signin",
      "ce:create-drafts",
      "ce:gif-attributions",
      "ce:guest-claim",
      "ce:had-account",
      "ce:pixabay-api-key",
      "ce:speech-language",
      "ce:tutorial-seen:v2",
      "ce:webgpu-broken",
      "oc:onboarding-answers",
      "oc:onboarding-done",
      "oc:ai-edit-project:",
      "oc:project-mode:",
      "captionseasy-videos",
    ]) {
      expect(cookies).toContain(key);
    }
  });

  it("lists Puter, Pixabay, Openverse, DiceBear and Instagram/YouTube as subprocessors", () => {
    const sub = readFileSync(path.resolve(__dirname, "../../app/(legal)/subprocessors/page.tsx"), "utf8");
    for (const name of ["Puter", "Pixabay", "Openverse", "DiceBear", "Instagram / YouTube"]) {
      expect(sub).toContain(name);
    }
  });
});
