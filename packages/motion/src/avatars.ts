import type { MotionTemplate } from "./registry";

/**
 * Default avatar photos for Motion templates (owner order 2026-11-12: the
 * procedural SVG smiley placeholders were replaced by real generated photos).
 *
 * What these are: AI-generated photorealistic headshots of FICTIONAL people —
 * four distinct personas (Alex, Priya, Sam, Creator), generated in-house and
 * bundled with the app under `apps/frontend/public/motion-avatars/`. They are
 * not real people's photos, not stock faces, and they depict nobody real — so
 * no credit line is owed anywhere (see /credits: only third-party sources are
 * listed there) and nothing here may be presented as a real person.
 *
 * Where they appear: every surface that shows a template BEFORE the user has
 * chosen their own photo — template cards, the customize stage, picker
 * previews — AND the standalone motion export, which carries the default
 * photo through the same overlayAssets path a user upload takes
 * (exportConfig.ts). A user-uploaded photo ALWAYS wins: every call site
 * resolves `userAsset ?? defaultAvatarForTemplate(...)`, and Add-to-project
 * copies the default photo into the project's media bin only when no upload
 * was staged, so the user's own image replaces it through the normal path.
 *
 * What they are NOT: the old procedural SVG faces are gone — there is no
 * drawn smiley anywhere in this module any more. The QR slot (qr-frame)
 * deliberately gets NO default: a fake QR code would look scannable and
 * isn't. Templates with no avatar at all (notification-pop is a bell card,
 * not a face) likewise get none.
 */

/** Bundled default avatar photos, by persona. Served from the app's public dir. */
export const DEFAULT_AVATAR_DIR = "/motion-avatars";
export type DefaultAvatarPersona = "alex" | "priya" | "sam" | "creator";
export const DEFAULT_AVATAR_PHOTOS: Record<DefaultAvatarPersona, string> = {
  alex: `${DEFAULT_AVATAR_DIR}/alex.jpg`,
  priya: `${DEFAULT_AVATAR_DIR}/priya.jpg`,
  sam: `${DEFAULT_AVATAR_DIR}/sam.jpg`,
  creator: `${DEFAULT_AVATAR_DIR}/creator.jpg`,
};

/**
 * Which fictional persona a template's single avatar depicts, from its
 * default text: the "Alex" templates (dm-popup, dm-typing) get Alex; every
 * other single-avatar template shows the generic creator / viewer and gets
 * the Creator photo. Null = no single avatar slot (voice-card has three
 * member slots instead — see defaultVoiceMemberAvatars; notification-pop has
 * no face at all; qr-frame's slot is a QR code, not a face).
 */
const SINGLE_AVATAR_PERSONA: Record<string, DefaultAvatarPersona> = {
  "dm-popup": "alex",
  "dm-typing": "alex",
  "subscribe-banner": "creator",
  "follow-banner": "creator",
  "comment-popup": "creator",
  "profile-card": "creator",
  "story-ring": "creator",
  "typing-post": "creator",
  "post-card": "creator",
  "repost-card": "creator",
  "cursor-follow": "creator",
  "share-pop": "creator",
  "follow-plus": "creator",
};

/** The persona for a template id, or null when it has no single avatar slot. */
export function defaultAvatarPersonaForTemplate(templateId: string): DefaultAvatarPersona | null {
  return SINGLE_AVATAR_PERSONA[templateId] ?? null;
}

/** The default avatar photo URL for a template id, or null when it has no single avatar slot. */
export function defaultAvatarForTemplate(templateId: string): string | null {
  const persona = defaultAvatarPersonaForTemplate(templateId);
  return persona ? DEFAULT_AVATAR_PHOTOS[persona] : null;
}

/**
 * Voice-card's three member photos, in member order (Alex, Priya, Sam —
 * the template's own default member names). The voice card has no single
 * avatar slot and no image field, so its members always show these defaults
 * unless a caller passes per-member images.
 */
export function defaultVoiceMemberAvatars(): [string, string, string] {
  return [DEFAULT_AVATAR_PHOTOS.alex, DEFAULT_AVATAR_PHOTOS.priya, DEFAULT_AVATAR_PHOTOS.sam];
}

/** The voice-card member photo at an index, or undefined past the member list. */
export function defaultVoiceMemberAvatar(index: number): string | undefined {
  return defaultVoiceMemberAvatars()[index];
}

/**
 * The synthetic media-asset id a standalone export gives a template's
 * default avatar, so the photo travels through the exact overlayAssets path
 * a user upload takes (CaptionedVideo resolves item.assetId -> URL).
 */
export function defaultAvatarAssetId(templateId: string): string {
  return `default-avatar-${templateId}`;
}

/** True when the template has an image field whose slot depicts a person. */
export function templateHasAvatarField(template: Pick<MotionTemplate, "fields">): boolean {
  return template.fields.some((f) => f.kind === "image" && f.role === "avatar");
}
