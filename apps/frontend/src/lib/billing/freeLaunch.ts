/**
 * free launch window (owner order 2026-11-15; extended to 30 Nov by owner
 * order 2026-11-17): everything is free
 * until 30 Nov 2026, 23:59:59 IST — then paid resumes from 1 Dec (minutes
 * pricing, a separate deploy gated on Cashfree Subscriptions approval).
 *
 * One flag, one date: every bypass (video quota, checkout, pricing CTAs)
 * calls isFreeLaunchWindow() — the date is never hardcoded anywhere else,
 * so the window expires on its own with no manual step and no deploy on
 * 1 Dec. After the window, behaviour returns exactly to the pre-window
 * state (old quota model + old pricing) unless the minutes deploy has
 * landed by then.
 *
 * When the minutes branch lands, the same window must gate minute
 * deduction — port this helper at rebase (minutes ledger reserve must
 * skip while isFreeLaunchWindow() is true, same as the quota reserve).
 *
 * No "server-only" here on purpose: client components (billing page,
 * homepage pricing) import this too — it is pure date math.
 */
export const FREE_LAUNCH_UNTIL_ISO = "2026-11-30T18:29:59.000Z"; // 30 Nov 2026, 23:59:59 IST
export const FREE_LAUNCH_UNTIL = new Date(FREE_LAUNCH_UNTIL_ISO);

/** Short labels used on the pricing page, billing page and homepage. */
export const FREE_LAUNCH_END_LABEL = "30 Nov";
export const PAID_FROM_LABEL = "1 Dec";

/** True from the deploy until 30 Nov 2026, 23:59:59 IST (inclusive). */
export function isFreeLaunchWindow(now: Date = new Date()): boolean {
  return now.getTime() <= FREE_LAUNCH_UNTIL.getTime();
}
