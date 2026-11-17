import { getMotionTemplate, type MotionTemplate } from "@capseasy/motion";
import type { OverlaySocialVariant } from "@capseasy/shared";

/**
 * Motion Graphics Pack (2026-11-18): the everyday-use curation of the motion
 * registry — grouped by WHAT the graphic is for, not by platform. Every id must
 * exist in MOTION_TEMPLATES (pinned by motionPack.test.ts). The panel renders one
 * section per group, in this order.
 */
export interface MotionPackGroup {
  id: string;
  title: string;
  ids: OverlaySocialVariant[];
}

export const MOTION_PACK_GROUPS: MotionPackGroup[] = [
  { id: "lower-thirds", title: "Lower Thirds", ids: ["lower-third", "lower-third-bar"] },
  { id: "callouts", title: "Callouts", ids: ["callout"] },
  { id: "subscribe-cta", title: "Subscribe & CTA", ids: ["subscribe-pill", "subscribe-banner", "cursor-subscribe", "follow-banner"] },
  { id: "counters", title: "Counters", ids: ["counter", "like-pop"] },
  { id: "text-reveals", title: "Text Reveals", ids: ["kinetic-title", "glitch-title", "type-title"] },
  { id: "progress", title: "Progress", ids: ["progress-fill", "watch-next"] },
];

/** The registry templates for one pack group, in the group's own order. */
export function motionPackTemplates(group: MotionPackGroup): MotionTemplate[] {
  return group.ids
    .map((id) => getMotionTemplate(id))
    .filter((t): t is MotionTemplate => t !== undefined);
}

/** Every template id the pack lists, in group order. */
export function motionPackTemplateIds(): OverlaySocialVariant[] {
  return MOTION_PACK_GROUPS.flatMap((g) => g.ids);
}
