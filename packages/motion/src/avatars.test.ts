import { describe, expect, it } from "vitest";
import { MOTION_TEMPLATES } from "./registry";
import { placeholderAvatarDataUri, placeholderAvatarForTemplate, templateHasAvatarField } from "./avatars";

/**
 * Placeholder avatars (2026-11-11): previews of avatar-bearing templates must
 * never show a blank avatar area. These are generated in code — the tests pin
 * that every avatar-field template yields a real drawn face (an SVG with a
 * head), deterministically, and that the QR slot never gets a fake face.
 */
const decode = (uri: string): string => decodeURIComponent(uri.replace(/^data:image\/svg\+xml;utf8,/, ""));

describe("placeholderAvatarDataUri", () => {
  it("draws a face: background, head, shoulders, eyes, smile", () => {
    const svg = decode(placeholderAvatarDataUri("subscribe-banner"));
    expect(svg).toContain("<svg");
    expect(svg).toContain('data-face="background"');
    expect(svg).toContain('data-face="head"');
    expect(svg).toContain('data-face="shoulders"');
    expect(svg.match(/data-face="eye"/g)).toHaveLength(2);
    expect(svg).toContain('data-face="smile"');
  });

  it("is deterministic and varies by seed", () => {
    expect(placeholderAvatarDataUri("profile-card")).toBe(placeholderAvatarDataUri("profile-card"));
    expect(placeholderAvatarDataUri("profile-card")).not.toBe(placeholderAvatarDataUri("follow-banner"));
  });

  it("contains no external references, no undefined fills and no purple", () => {
    for (const t of MOTION_TEMPLATES) {
      const svg = decode(placeholderAvatarDataUri(t.id)).toLowerCase();
      // the xmlns namespace string is an identifier, not a fetch — what must
      // never appear is a reference that loads something (href / <image / url())
      expect(svg).not.toContain("href");
      expect(svg).not.toContain("<image");
      expect(svg).not.toContain("url(");
      expect(svg).not.toContain("undefined");
      expect(svg).not.toContain("8b5cf6");
      expect(svg).not.toContain("a855f7");
    }
  });
});

describe("placeholderAvatarForTemplate", () => {
  it("covers EVERY template with an avatar field", () => {
    const avatarTemplates = MOTION_TEMPLATES.filter(templateHasAvatarField);
    // the registry's avatar-bearing set (qr-frame excluded — its slot is a QR code)
    expect(avatarTemplates.map((t) => t.id).sort()).toEqual(
      [
        "cursor-follow", "dm-popup", "dm-typing", "follow-banner", "follow-plus",
        "post-card", "profile-card", "repost-card", "story-ring", "subscribe-banner", "typing-post",
      ].sort(),
    );
    for (const t of avatarTemplates) {
      const uri = placeholderAvatarForTemplate(t.id);
      expect(uri, t.id).toMatch(/^data:image\/svg\+xml;utf8,/);
      expect(decode(uri!), t.id).toContain('data-face="head"');
    }
  });

  it("gives no face to the QR slot or to templates without an image field", () => {
    expect(placeholderAvatarForTemplate("qr-frame")).toBeNull();
    expect(placeholderAvatarForTemplate("subscribe-pill")).toBeNull();
    expect(placeholderAvatarForTemplate("kinetic-title")).toBeNull();
    expect(placeholderAvatarForTemplate("not-a-template")).toBeNull();
  });
});
