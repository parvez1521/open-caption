import { describe, expect, it } from "vitest";
import { MOTION_TEMPLATES } from "./registry";
import {
  DEFAULT_AVATAR_PHOTOS,
  defaultAvatarAssetId,
  defaultAvatarForTemplate,
  defaultAvatarPersonaForTemplate,
  defaultVoiceMemberAvatar,
  defaultVoiceMemberAvatars,
  templateHasAvatarField,
} from "./avatars";

/**
 * Default avatar photos (owner order 2026-11-12): the procedural SVG smiley
 * placeholders are gone. Every template whose renderer draws an avatar gets a
 * bundled AI-generated photo of a fictional person instead — Alex for the
 * "Alex" templates, the Creator photo for the rest — and voice-card's three
 * members get Alex / Priya / Sam. Templates with no face (notification-pop,
 * qr-frame's QR slot, text-only templates) get nothing.
 */
describe("defaultAvatarForTemplate", () => {
  it("covers EVERY template whose renderer draws a single avatar", () => {
    // the renderer (social.tsx avatar()) draws for these 12 variants: the
    // registry's 11 avatar-field templates + comment-popup (avatar in the
    // renderer, no image field). Voice-card has three member slots, not one —
    // it is covered by defaultVoiceMemberAvatars instead.
    const singleAvatar = [
      "cursor-follow", "comment-popup", "dm-popup", "dm-typing", "follow-banner", "follow-plus",
      "post-card", "profile-card", "repost-card", "story-ring", "subscribe-banner", "typing-post",
    ];
    expect(singleAvatar).toHaveLength(12);
    for (const id of singleAvatar) {
      expect(defaultAvatarForTemplate(id), id).toMatch(/^\/motion-avatars\/[a-z]+\.jpg$/);
    }
    // and the registry's avatar-field set is a subset of it (comment-popup aside)
    const registrySet = MOTION_TEMPLATES.filter(templateHasAvatarField).map((t) => t.id);
    expect(registrySet).toHaveLength(11);
    for (const id of registrySet) expect(singleAvatar).toContain(id);
  });

  it("gives Alex to the Alex templates and the Creator photo to the rest", () => {
    expect(defaultAvatarPersonaForTemplate("dm-popup")).toBe("alex");
    expect(defaultAvatarPersonaForTemplate("dm-typing")).toBe("alex");
    expect(defaultAvatarForTemplate("dm-popup")).toBe(DEFAULT_AVATAR_PHOTOS.alex);
    expect(defaultAvatarForTemplate("dm-typing")).toBe(DEFAULT_AVATAR_PHOTOS.alex);
    for (const id of ["subscribe-banner", "follow-banner", "comment-popup", "profile-card", "story-ring", "typing-post", "post-card", "repost-card", "cursor-follow", "share-pop", "follow-plus"]) {
      expect(defaultAvatarPersonaForTemplate(id), id).toBe("creator");
      expect(defaultAvatarForTemplate(id), id).toBe(DEFAULT_AVATAR_PHOTOS.creator);
    }
  });

  it("gives no single photo to the QR slot, the bell card, voice-card or text-only templates", () => {
    expect(defaultAvatarForTemplate("qr-frame")).toBeNull();
    expect(defaultAvatarForTemplate("notification-pop")).toBeNull();
    expect(defaultAvatarForTemplate("voice-card")).toBeNull();
    expect(defaultAvatarForTemplate("subscribe-pill")).toBeNull();
    expect(defaultAvatarForTemplate("kinetic-title")).toBeNull();
    expect(defaultAvatarForTemplate("not-a-template")).toBeNull();
  });

  it("all four photos are distinct bundled files", () => {
    const photos = Object.values(DEFAULT_AVATAR_PHOTOS);
    expect(new Set(photos).size).toBe(4);
    for (const p of photos) expect(p).toMatch(/^\/motion-avatars\/(alex|priya|sam|creator)\.jpg$/);
  });
});

describe("defaultVoiceMemberAvatars", () => {
  it("returns Alex, Priya, Sam in member order", () => {
    expect(defaultVoiceMemberAvatars()).toEqual([
      DEFAULT_AVATAR_PHOTOS.alex,
      DEFAULT_AVATAR_PHOTOS.priya,
      DEFAULT_AVATAR_PHOTOS.sam,
    ]);
    expect(defaultVoiceMemberAvatar(0)).toBe(DEFAULT_AVATAR_PHOTOS.alex);
    expect(defaultVoiceMemberAvatar(1)).toBe(DEFAULT_AVATAR_PHOTOS.priya);
    expect(defaultVoiceMemberAvatar(2)).toBe(DEFAULT_AVATAR_PHOTOS.sam);
    expect(defaultVoiceMemberAvatar(3)).toBeUndefined();
  });
});

describe("defaultAvatarAssetId", () => {
  it("is a stable synthetic id per template", () => {
    expect(defaultAvatarAssetId("dm-popup")).toBe("default-avatar-dm-popup");
    expect(defaultAvatarAssetId("dm-popup")).not.toBe(defaultAvatarAssetId("story-ring"));
  });
});
