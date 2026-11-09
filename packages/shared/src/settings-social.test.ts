import { describe, expect, it } from "vitest";
import { OverlayItemSchema, ProjectSettingsSchema } from "./settings";

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
});
