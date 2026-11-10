import { describe, expect, it } from "vitest";
import { OVERLAY_SOCIAL_VARIANTS, OverlayItemSchema, ProjectSettingsSchema } from "./settings";

describe("social overlay items (schema)", () => {
  const base = { id: "s1", startMs: 0, endMs: 4000, x: 0.5, y: 0.78, scale: 1, rotation: 0, color: "#FFA946" };
  it("a social item with a variant parses; without one it is rejected", () => {
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "subscribe-pill", text: "Subscribe\nSubscribed" }).success).toBe(true);
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", text: "x" }).success).toBe(false);
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "made-up" }).success).toBe(false);
  });
  it("old projects (text/shape/image only) still parse unchanged — the addition is defaulted, not breaking", () => {
    const s = ProjectSettingsSchema.parse({ overlays: [{ ...base, kind: "shape", shape: "star" }, { ...base, id: "t1", kind: "text", text: "hi" }] });
    expect(s.overlays).toHaveLength(2);
    expect(ProjectSettingsSchema.parse({}).overlays).toEqual([]);
  });
  it("every social variant name is accepted", () => {
    for (const variant of ["subscribe-pill", "subscribe-banner", "follow-banner", "comment-popup", "like-pop", "heart-pop", "counter", "chat-stack", "orbit-badge", "search-bar"]) {
      expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant }).success, variant).toBe(true);
    }
  });
  it("every new Motion Studio variant is accepted and made-up ones rejected", () => {
    const NEW = ["profile-card", "notification-pop", "dm-popup", "story-ring", "lower-third", "logo-reveal", "qr-frame", "kinetic-title", "glitch-title", "neon-sign", "particle-burst", "typing-post", "upvote-card", "live-badge", "product-tag", "form-card", "audio-bars"];
    expect(OVERLAY_SOCIAL_VARIANTS).toHaveLength(30);
    for (const variant of NEW) {
      expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant }).success, variant).toBe(true);
    }
    for (const variant of OVERLAY_SOCIAL_VARIANTS) {
      expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant }).success, variant).toBe(true);
    }
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "hologram" }).success).toBe(false);
  });
  it("every Wave 1.5 parity variant (post-card / repost-card / voice-card) is accepted", () => {
    for (const variant of ["post-card", "repost-card", "voice-card"]) {
      expect(OVERLAY_SOCIAL_VARIANTS).toContain(variant);
      expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant }).success, variant).toBe(true);
    }
    // avatar slots on the two post cards accept an image asset; the voice card needs none
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "post-card", assetId: "a1", assetName: "me.png" }).success).toBe(true);
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "repost-card", assetId: "a1", assetName: "me.png" }).success).toBe(true);
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "voice-card" }).success).toBe(true);
  });
  it("social items may carry an optional image asset for avatar / QR slots", () => {
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "profile-card", assetId: "a1", assetName: "me.png" }).success).toBe(true);
    expect(OverlayItemSchema.safeParse({ ...base, kind: "social", variant: "qr-frame" }).success).toBe(true);
  });
});
