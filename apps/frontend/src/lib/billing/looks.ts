import "server-only";
import { effectivePlanId, type PlanId } from "@capseasy/shared";
import { isPremiumLookId } from "@capseasy/templates/src/looks/tiers";
import { ApiFailure } from "@/lib/api/http";

/**
 * Premium-look gating (monetization, Builder 4). Free plans get the 25
 * looks in FREE_LOOK_IDS; paid plans get all 150. The tier lives on the
 * look in the templates registry — this file only reads it, so the picker
 * and the server can never disagree about which looks are premium.
 *
 * The tier data comes from the pure-data leaf
 * `@capseasy/templates/src/looks/tiers` (deep import, on purpose): the
 * templates barrel re-exports client-only modules (videoFrame's
 * createContext, fonts' useEffect) that Next.js refuses in a route
 * handler, so importing the barrel here fails the production build.
 * The leaf has no imports except the permanent number list (also pure),
 * so it is safe in a server route. The registry reads the same file.
 *
 * The decision, server-side truth:
 * - Paid user (effective plan not Free) → any look may export.
 * - Free user + free look → exports.
 * - Free user + premium look → the export is refused (402), with a clear
 *   error telling them to pick a free look or upgrade. The look is NEVER
 *   silently swapped: swapping would change their video without consent.
 * - A look id the registry does not resolve (a user-saved template, an
 *   unknown id) is allowed: user templates are the creator's own style,
 *   and an unknown id cannot carry a premium style.
 * - A retired premium look still resolves, so an old project that used one
 *   is refused for a Free user too — same rule, same message.
 *
 * Browser-path honesty: MP4s render on the user's device, so the server
 * cannot observe the render. The reserve endpoint refuses the reservation
 * before rendering, and the server export route refuses before queuing —
 * but a modified client can skip the reserve call on the browser path.
 * The browser gate is therefore a deterrent there and a guarantee only on
 * the server path (the render job), exactly like the watermark and the
 * minutes reserve. If hard blocking of local renders ever becomes a
 * requirement, rendering must move server-side.
 */

/** Refusal message: short sentences, no price, no urgency. */
export const PREMIUM_LOOK_EXPORT_MESSAGE =
  "This project uses a Premium look. Pick a free look or upgrade to export it.";

/** True when the look id resolves to a premium look in the registry. */
export { isPremiumLookId };

/**
 * Refuse a premium look for a user without a paid entitlement. Throws
 * LIMIT_EXCEEDED (402) with the upgrade message; anything else passes.
 * An expired paid period reads as Free — the same rule the minutes and
 * watermark gates apply. Pure: no database read, so unit tests need no
 * fake client.
 */
export function assertLookAllowedForPlan(
  lookId: string | null | undefined,
  plan: string | null | undefined,
  expiresAt: string | Date | null | undefined = null,
  now: Date = new Date(),
): void {
  const effective: PlanId = effectivePlanId(plan, expiresAt, now);
  if (effective !== "free") return;
  if (isPremiumLookId(lookId)) throw new ApiFailure("LIMIT_EXCEEDED", PREMIUM_LOOK_EXPORT_MESSAGE);
}
