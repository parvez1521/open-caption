/**
 * Default avatar photos in previews (owner order 2026-11-12).
 *
 * Pins the two sides of the rule:
 *  1. PREVIEW path: every avatar-bearing template, rendered the way the preview
 *     surfaces render it (OverlayView fed the template's default photo),
 *     contains a non-blank avatar node — an <img> whose src is the bundled
 *     photo under /motion-avatars/. Voice-card's three members get their own
 *     photos (Alex / Priya / Sam).
 *  2. OVERRIDE path: a user-supplied asset wins over the default — the render
 *     then shows the user's image and NOT the default photo.
 *  3. DIRECT render: OverlayView on its own (what the Studio preview and
 *     exports draw for a placed item with no asset) still shows the
 *     initial-letter disc — the default is applied by the template surfaces
 *     and the export builder, never inside the renderer itself.
 */
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OverlayItem } from "@capseasy/shared";
import { OverlayView } from "@capseasy/compositions";
import {
  MOTION_TEMPLATES,
  defaultAvatarForTemplate,
  defaultVoiceMemberAvatars,
  templateHasAvatarField,
} from "@capseasy/motion";
import { makeSocialOverlay } from "@/features/studio/panels/overlayItems";

const avatarTemplates = MOTION_TEMPLATES.filter(templateHasAvatarField);

describe("default avatar photos in previews", () => {
  it("the registry still has its avatar-bearing set (11 templates)", () => {
    expect(avatarTemplates.length).toBe(11);
  });

  it.each(avatarTemplates.map((t) => [t.id] as const))(
    "preview render of %s contains the bundled default photo",
    (variant) => {
      const item: OverlayItem = { ...makeSocialOverlay(variant, 0, 30000), x: 0.5, y: 0.5 };
      const photo = defaultAvatarForTemplate(variant);
      expect(photo, variant).toMatch(/^\/motion-avatars\/[a-z]+\.jpg$/);
      const { container } = render(<OverlayView item={item} sc={1} localMs={2600} assetSrc={photo!} />);
      const imgs = [...container.querySelectorAll("img")];
      const avatarImg = imgs.find((img) => (img.getAttribute("src") ?? "").startsWith("/motion-avatars/"));
      expect(avatarImg, variant).toBeTruthy();
    },
  );

  it("voice-card preview shows the three member photos, not initials", () => {
    const item: OverlayItem = { ...makeSocialOverlay("voice-card", 0, 30000), x: 0.5, y: 0.5 };
    const { container } = render(
      <OverlayView item={item} sc={1} localMs={1000} memberAssetSrcs={defaultVoiceMemberAvatars()} />,
    );
    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toEqual(defaultVoiceMemberAvatars());
  });

  it.each(avatarTemplates.map((t) => [t.id] as const))(
    "a user-supplied asset wins over the default photo for %s",
    (variant) => {
      const item: OverlayItem = { ...makeSocialOverlay(variant, 0, 30000), x: 0.5, y: 0.5 };
      const { container } = render(<OverlayView item={item} sc={1} localMs={2600} assetSrc="blob:user-photo" />);
      const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
      expect(srcs).toContain("blob:user-photo");
      expect(srcs.filter((s) => s?.startsWith("/motion-avatars/"))).toHaveLength(0);
    },
  );

  it.each(avatarTemplates.map((t) => [t.id] as const))(
    "direct render of %s without any asset shows the initial disc, not a photo",
    (variant) => {
      const item: OverlayItem = { ...makeSocialOverlay(variant, 0, 30000), x: 0.5, y: 0.5 };
      const { container } = render(<OverlayView item={item} sc={1} localMs={2600} />);
      const photoImgs = [...container.querySelectorAll("img")].filter((img) =>
        (img.getAttribute("src") ?? "").startsWith("/motion-avatars/"),
      );
      expect(photoImgs, variant).toHaveLength(0);
    },
  );

  it("no bundled default photo is a drawn smiley: the old placeholder module is gone", async () => {
    const mod = await import("@capseasy/motion");
    expect("placeholderAvatarForTemplate" in mod).toBe(false);
    expect("placeholderAvatarDataUri" in mod).toBe(false);
  });
});
