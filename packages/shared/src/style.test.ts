/**
 * Shadow opacity (Package 2 item C): the style model field + shadowColorOf, the one helper
 * every caption-renderer shadow string goes through. The byte-identical guarantee matters:
 * opacity absent or 1 returns the colour verbatim (existing styles render unchanged); only
 * an explicit opacity < 1 rewrites the colour with its alpha multiplied.
 */
import { describe, expect, it } from "vitest";
import { CaptionStyleSchema, defaultStyle, shadowColorOf } from "./style";

describe("shadowColorOf", () => {
  it("returns the colour verbatim when opacity is absent or 1 (byte-identical renders)", () => {
    expect(shadowColorOf({ color: "#0A0A0A" })).toBe("#0A0A0A");
    expect(shadowColorOf({ color: "#0A0A0A", opacity: 1 })).toBe("#0A0A0A");
    expect(shadowColorOf({ color: "rgba(0,0,0,0.6)" })).toBe("rgba(0,0,0,0.6)");
    expect(shadowColorOf({ color: "rgba(0,0,0,0.6)", opacity: 1 })).toBe("rgba(0,0,0,0.6)");
  });
  it("multiplies a hex colour's alpha by the opacity", () => {
    expect(shadowColorOf({ color: "#000000", opacity: 0.5 })).toBe("rgba(0,0,0,0.5)");
    expect(shadowColorOf({ color: "#FF0000", opacity: 0.25 })).toBe("rgba(255,0,0,0.25)");
    expect(shadowColorOf({ color: "#000", opacity: 0 })).toBe("rgba(0,0,0,0)");
  });
  it("multiplies an rgba colour's existing alpha", () => {
    expect(shadowColorOf({ color: "rgba(0,0,0,0.6)", opacity: 0.5 })).toBe("rgba(0,0,0,0.3)");
    expect(shadowColorOf({ color: "rgba(255,0,60,0.85)", opacity: 0.5 })).toBe("rgba(255,0,60,0.425)");
  });
  it("handles 8-digit hex (its own alpha multiplies too) and passes unparseable colours through", () => {
    expect(shadowColorOf({ color: "#00000080", opacity: 0.5 })).toBe("rgba(0,0,0,0.251)");
    expect(shadowColorOf({ color: "currentColor", opacity: 0.5 })).toBe("currentColor");
  });
});

describe("CaptionStyleSchema shadow opacity", () => {
  it("round-trips an explicit opacity and leaves it absent by default", () => {
    const withOpacity = defaultStyle({ shadows: [{ x: 0, y: 4, blur: 6, color: "#000000", opacity: 0.4 }] });
    expect(withOpacity.shadows[0]!.opacity).toBe(0.4);
    const plain = defaultStyle({ shadows: [{ x: 0, y: 4, blur: 6, color: "#000000" }] });
    expect(plain.shadows[0]!.opacity).toBeUndefined();
    expect(CaptionStyleSchema.safeParse({ shadows: [{ x: 0, y: 4, blur: 6, color: "#000", opacity: 1.5 }] }).success).toBe(false);
  });
});
