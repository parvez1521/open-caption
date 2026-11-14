import "server-only";
import { effectivePlanId, type PlanId } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";

/**
 * MOV-export gating (monetization). MOV here means the ProRes overlay
 * export (mov_alpha): there is NO plain-MOV kind in this codebase, and
 * the pricing page presents it as "ProRes overlay export (MOV)".
 * Free users cannot export MOV; paid plans include it.
 *
 * The decision, server-side truth:
 * - Paid user (effective plan not Free) → mov_alpha exports.
 * - Free user + mov_alpha → the export is refused (402), with a clear
 *   error. No minutes are reserved and no job is created.
 * - Any other kind passes: webm_alpha (the transparent WebM overlay —
 *   the brief gates MOV only), mp4, and the text kinds (SRT/VTT/ASS/
 *   TXT/JSON) are never refused by this gate.
 * - An expired paid period reads as Free — the same rule the minutes,
 *   watermark and premium-look gates apply.
 *
 * Browser-path honesty: the reserve endpoint refuses the reservation
 * before rendering, and the server export route refuses before queuing —
 * but a modified client can skip the reserve call on the browser path.
 * The browser gate is therefore a deterrent there and a guarantee only
 * on the server path (the render job), exactly like the watermark and
 * the minutes reserve. The Export modal hides the MOV row for Free
 * users; that is display only.
 */

/** Refusal message: short sentences, no price, no urgency. */
export const MOV_EXPORT_MESSAGE = "MOV export is a paid plan feature.";

/**
 * Refuse a MOV (mov_alpha) export for a user without a paid
 * entitlement. Throws LIMIT_EXCEEDED (402) with the message above;
 * anything else passes. Pure: no database read, so unit tests need no
 * fake client.
 */
export function assertMovAllowedForPlan(
  kind: string | null | undefined,
  plan: string | null | undefined,
  expiresAt: string | Date | null | undefined = null,
  now: Date = new Date(),
): void {
  if (kind !== "mov_alpha") return;
  const effective: PlanId = effectivePlanId(plan, expiresAt, now);
  if (effective !== "free") return;
  throw new ApiFailure("LIMIT_EXCEEDED", MOV_EXPORT_MESSAGE);
}
