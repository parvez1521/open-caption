import { describe, expect, it } from "vitest";
import { FEEDBACK_MAILTO, LEGAL } from "../legal";

describe("legal operator identity", () => {
  it("names the current owner as operator of Open Caption", () => {
    expect(LEGAL.operator).toBe(
      "Parvez Achhan Ali Siddiqui, an individual (sole proprietor) trading as Open Caption",
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
