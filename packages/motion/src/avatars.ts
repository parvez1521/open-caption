import { getMotionTemplate, type MotionTemplate } from "./registry";

/**
 * Procedural placeholder avatars for Motion template PREVIEWS (owner order
 * 2026-11-11: avatar areas in template previews looked blank).
 *
 * What these are: original, code-drawn SVG faces — a flat person (head,
 * shoulders, simple hair/face variants) on a solid brand-neutral colour,
 * chosen deterministically from the template id. They exist so a template
 * card shows what the graphic looks like WITH a profile picture in place.
 *
 * What they are NOT: not a photo, not a real person's likeness, not scraped
 * or hotlinked from anywhere — every byte is generated here, in code.
 *
 * Where they may appear: preview/sample surfaces only (template cards, the
 * customize stage, picker previews). A project render or export NEVER uses
 * them: there, the slot shows the user's own uploaded image, or the
 * renderer's initial-letter disc when no image was uploaded. The moment a
 * user uploads their own image it replaces the placeholder everywhere,
 * through the existing upload path — nothing to switch off.
 *
 * The QR slot (qr-frame) deliberately gets NO placeholder: a fake QR code
 * would look scannable and isn't. Its honest "your QR image" placeholder in
 * the renderer stays.
 */

/** Solid, brand-neutral background colours (no purple, no gradients). */
const BACKGROUNDS = ["#33424F", "#3E5641", "#7A4E2D", "#8C5E58", "#365A7A", "#6B705C", "#94524A", "#44403C"] as const;
const SKIN_TONES = ["#F1C27D", "#E0AC69", "#C68642", "#8D5524", "#FFDBAC", "#A9744F"] as const;
const HAIR_COLOURS = ["#1F2937", "#3B2F2F", "#6B4423", "#B5522C", "#9CA3AF", "#111827"] as const;
const SHIRTS = ["#E8E3D9", "#2F3E46", "#A63D40", "#52796F", "#E9C46A", "#3D5A80", "#BC6C25", "#606C38"] as const;

/** FNV-1a — tiny deterministic string hash (stable across runs and platforms). */
function hashOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = <T,>(list: readonly T[], n: number): T => list[n % list.length] as T;

/**
 * The placeholder avatar for a seed (usually the template id) as an SVG
 * data URI, ready for an <img src>. Deterministic: same seed, same face.
 * The SVG marks its parts (`data-face="head"` etc.) so tests can prove the
 * avatar node is a drawn face, not an empty box.
 */
export function placeholderAvatarDataUri(seed: string): string {
  const h = hashOf(seed);
  const bg = pick(BACKGROUNDS, h);
  const skin = pick(SKIN_TONES, h >>> 3);
  const hair = pick(HAIR_COLOURS, h >>> 5);
  const shirt = pick(SHIRTS, h >>> 7);
  const hairStyle = (h >>> 9) % 4;
  const hairShape =
    hairStyle === 0
      ? `<path data-face="hair" d="M120 38 a52 52 0 0 1 52 52 l0 -14 a52 40 0 0 0 -104 0 l0 14 a52 52 0 0 1 52 -52z" fill="${hair}"/>`
      : hairStyle === 1
        ? `<circle data-face="hair" cx="120" cy="34" r="17" fill="${hair}"/><path data-face="hair" d="M68 96 a52 52 0 0 1 104 0 l0 -10 a52 42 0 0 0 -104 0z" fill="${hair}"/>`
        : hairStyle === 2
          ? `<path data-face="hair" d="M70 88 a50 50 0 0 1 100 0 l0 -16 a50 34 0 0 0 -100 0z" fill="${hair}"/>`
          : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">` +
    `<rect data-face="background" width="240" height="240" fill="${bg}"/>` +
    `<path data-face="shoulders" d="M28 240 c6 -52 44 -78 92 -78 s86 26 92 78z" fill="${shirt}"/>` +
    `<rect data-face="neck" x="106" y="128" width="28" height="34" rx="10" fill="${skin}"/>` +
    `<circle data-face="head" cx="120" cy="96" r="52" fill="${skin}"/>` +
    hairShape +
    `<circle data-face="eye" cx="100" cy="100" r="5.5" fill="#26221F"/>` +
    `<circle data-face="eye" cx="140" cy="100" r="5.5" fill="#26221F"/>` +
    `<path data-face="smile" d="M104 122 a18 14 0 0 0 32 0" fill="none" stroke="#26221F" stroke-width="5" stroke-linecap="round"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** True when the template has an image field whose slot depicts a person. */
export function templateHasAvatarField(template: Pick<MotionTemplate, "fields">): boolean {
  return template.fields.some((f) => f.kind === "image" && f.role === "avatar");
}

/**
 * The preview placeholder for a template id, or null when the template has
 * no avatar slot (including qr-frame, whose slot is a QR code, not a face).
 */
export function placeholderAvatarForTemplate(templateId: string): string | null {
  const template = getMotionTemplate(templateId);
  if (!template || !templateHasAvatarField(template)) return null;
  return placeholderAvatarDataUri(templateId);
}
