import type { OverlaySocialVariant } from "@capseasy/shared";

/**
 * Preview stage geometry for social graphics (shared by the Elements picker preview and the
 * Motion Studio previews, so both frame a graphic the same way).
 *
 * The stage is a zoomed window in reference px (see AnimatedSocialPreview): 700 wide at sc = 1.
 * Most graphics are wide and short, so 360 high frames them well. A few are TALL — their natural
 * height (plus the 26 px entrance rise) meets or exceeds 360, so in the flat window their top or
 * bottom was clipped in the picker:
 *  - qr-frame: 280 px QR box + label line ≈ 331 px, +26 entrance rise ≈ 357 — right at the edge;
 *  - kinetic-title: up to 4 words at 84 px / 1.05 line-height ≈ 353 px before the rise;
 *  - profile-card: named with the tall set — its ring + card + pointer row must never clip when
 *    the card's text lines wrap at card width.
 * Tall variants get an adaptive, taller stage (700×540) so the WHOLE graphic fits; the card's
 * aspect follows the stage, so nothing is letterboxed or cropped.
 */
export interface SocialStageSize {
  width: number;
  height: number;
  tall: boolean;
}

export const SOCIAL_STAGE_WIDTH = 700;
export const SOCIAL_STAGE_HEIGHT = 360;
export const SOCIAL_STAGE_TALL_HEIGHT = 540;

const TALL_VARIANTS: ReadonlySet<string> = new Set(["qr-frame", "kinetic-title", "profile-card"]);

export function socialStageFor(variant: OverlaySocialVariant): SocialStageSize {
  const tall = TALL_VARIANTS.has(variant);
  return { width: SOCIAL_STAGE_WIDTH, height: tall ? SOCIAL_STAGE_TALL_HEIGHT : SOCIAL_STAGE_HEIGHT, tall };
}
