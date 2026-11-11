/**
 * Placeholder avatars in previews (owner order 2026-11-11, P3).
 *
 * Pins the two sides of the rule:
 *  1. PREVIEW path: every avatar-bearing template, rendered the way the preview
 *     surfaces render it (OverlayView fed the generated placeholder), contains a
 *     non-blank avatar node — an <img> whose src is the generated SVG face.
 *  2. PROJECT path: the same render WITHOUT a placeholder (what the Studio
 *     preview and every export draw when the user uploaded nothing) contains
 *     NO generated face — the initial-letter disc is what a project shows until
 *     the user uploads their own image. Placeholders never reach an export.
 */
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OverlayItem } from "@capseasy/shared";
import { OverlayView } from "@capseasy/compositions";
import { MOTION_TEMPLATES, placeholderAvatarForTemplate, templateHasAvatarField } from "@capseasy/motion";
import { makeSocialOverlay } from "@/features/studio/panels/overlayItems";

const avatarTemplates = MOTION_TEMPLATES.filter(templateHasAvatarField);

describe("avatar placeholders (P3)", () => {
  it("the registry still has its avatar-bearing set", () => {
    expect(avatarTemplates.length).toBe(11);
  });

  it.each(avatarTemplates.map((t) => [t.id] as const))(
    "preview render of %s contains a non-blank generated avatar",
    (variant) => {
      const item: OverlayItem = { ...makeSocialOverlay(variant, 0, 30000), x: 0.5, y: 0.5 };
      const placeholder = placeholderAvatarForTemplate(variant);
      expect(placeholder).toMatch(/^data:image\/svg\+xml;utf8,/);
      const { container } = render(<OverlayView item={item} sc={1} localMs={2600} assetSrc={placeholder!} />);
      const imgs = [...container.querySelectorAll("img")];
      const avatarImg = imgs.find((img) => (img.getAttribute("src") ?? "").startsWith("data:image/svg+xml"));
      expect(avatarImg, variant).toBeTruthy();
      // the generated face itself: decoded SVG carries a head — not an empty box
      expect(decodeURIComponent(avatarImg!.getAttribute("src")!)).toContain('data-face="head"');
    },
  );

  it.each(avatarTemplates.map((t) => [t.id] as const))(
    "project render of %s without an uploaded image has NO generated face",
    (variant) => {
      const item: OverlayItem = { ...makeSocialOverlay(variant, 0, 30000), x: 0.5, y: 0.5 };
      const { container } = render(<OverlayView item={item} sc={1} localMs={2600} />);
      const dataImgs = [...container.querySelectorAll("img")].filter((img) => (img.getAttribute("src") ?? "").startsWith("data:"));
      expect(dataImgs, variant).toHaveLength(0);
    },
  );
});
