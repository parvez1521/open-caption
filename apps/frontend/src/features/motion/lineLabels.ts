import { SOCIAL_META } from "@capseasy/compositions";
import type { OverlaySocialVariant } from "@capseasy/shared";

/**
 * What each text line of a variant means, read from the compositions package's own hint copy
 * ("… Lines: name / handle / follower line. …") — the same words the Studio's Elements panel
 * shows, so the customize page's line labels can never drift from the renderer's meaning.
 * Returns null when the hint carries no line list (single-line variants).
 */
export function lineLabelsFor(variant: OverlaySocialVariant): string[] | null {
  const hint = SOCIAL_META.find((m) => m.id === variant)?.hint ?? "";
  const marker = "Lines:";
  const at = hint.indexOf(marker);
  if (at < 0) return null;
  const rest = hint.slice(at + marker.length);
  const end = rest.indexOf(".");
  const list = (end >= 0 ? rest.slice(0, end) : rest).trim();
  if (!list) return null;
  return list.split("/").map((s) => s.trim()).filter(Boolean);
}

/** Clamp a text value to a field's maxLines (extra lines are dropped, never merged silently). */
export function clampTextLines(text: string, maxLines?: number): string {
  if (!maxLines || maxLines <= 0) return text;
  const lines = text.split("\n");
  return lines.length <= maxLines ? text : lines.slice(0, maxLines).join("\n");
}
