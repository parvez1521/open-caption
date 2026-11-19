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
