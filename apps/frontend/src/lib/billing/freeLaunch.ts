/**
 * free launch window (owner order 2026-11-15; extended to 5 Dec by owner
 * order 2026-11-20): everything is free
 * until 5 Dec 2026, 23:59:59 IST — then paid resumes from 6 Dec (30-day
 * passes; minutes/subscription model dropped by owner 2026-11-17, so no
 * Cashfree Subscriptions approval is needed for the 6 Dec launch).
 *
 * One flag, one date: every bypass (video quota, checkout, pricing CTAs)
 * calls isFreeLaunchWindow() — the date is never hardcoded anywhere else,
 * so the window expires on its own with no manual step and no deploy on
 * 6 Dec. After the window, behaviour returns exactly to the pre-window
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
export const FREE_LAUNCH_UNTIL_ISO = "2026-12-05T18:29:59.000Z"; // 5 Dec 2026, 23:59:59 IST
export const FREE_LAUNCH_UNTIL = new Date(FREE_LAUNCH_UNTIL_ISO);

/** Short labels used on the pricing page, billing page and homepage. */
export const FREE_LAUNCH_END_LABEL = "5 Dec";
export const PAID_FROM_LABEL = "6 Dec";

/** True from the deploy until 5 Dec 2026, 23:59:59 IST (inclusive). */
export function isFreeLaunchWindow(now: Date = new Date()): boolean {
  return now.getTime() <= FREE_LAUNCH_UNTIL.getTime();
}
