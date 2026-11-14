/**
 * Plans: the entitlements (PlanLimits) AND the prices (PLAN_PRICING) for every
 * tier live in this one file — the single config the owner edits. The limits
 * are enforced server-side (project count in the projects route, upload size
 * + duration in the videos route, device storage + duration in the studio
 * route, export retention in the exports route), all reading the signed-in
 * user's profiles.plan through planFor / effectivePlanId.
 *
 * NEW MODEL (owner brief 2026-11-14 ~10:50 IST): minutes, not videos.
 * Free gets 5 processing minutes ONCE, ever — not per month. Starter gets
 * 40, Creator 100, Pro 250 processing minutes per billing cycle. Unused
 * minutes never roll over. Prices are INR only for now: ₹0 / ₹149 / ₹349 /
 * ₹749. No USD prices are set — do not invent them. A null priceUsd means
 * "USD price not set yet"; display and checkout fall back to INR.
 *
 * OLD MODEL (kept, legacy only): Free ₹0 / Starter ₹299 / Plus ₹499 /
 * Pro ₹799 as 30-day passes with a monthly video quota (videosPerMonth).
 * The quota code is LIVE in main and stays enforced until the minutes
 * cutover (Builder 2), so videosPerMonth stays on every tier, unchanged.
 * Old passes are honoured to expiry and never auto-converted.
 *
 * FREE IS FROZEN at the values it has always had: paid tiers only raise the
 * same scale limits (more projects, longer videos, bigger uploads, longer
 * export retention). No editor feature is paywalled — a paid plan buys
 * headroom, not tools. The new-model exceptions are the watermark (Free
 * exports carry one; paid plans do not) and the looks split (Free gets 25
 * of 150 looks; paid plans get all 150).
 *
 * Do NOT confuse the new processing minutes with cloudAsrMinutesPerMonth
 * below. That field is an old, UNENFORCED transcription allowance (no code
 * reads it outside this file). It is left alone here on purpose; whether
 * it stays, merges into processing minutes, or is removed is an open
 * owner decision. Never use it as the minutes balance.
 */
export type PlanId = "free" | "starter" | "creator" | "pro";

/**
 * Legacy plan id, kept readable only. "growth" was the billing/webhook
 * identity of the old Plus tier (₹499, 20 videos a month). It is NOT a
 * current plan id: planIdFor maps a stored "growth" to "creator", so a
 * live old Plus pass keeps working and reads as Creator until it expires
 * — never as Free. The old Plus record itself lives in LEGACY_PLANS /
 * LEGACY_PLAN_PRICING below, for payment history and the quota code.
 */
export type LegacyPlanId = "growth";

export interface PlanLimits {
  maxUploadBytes: number;
  /** biggest file kept on the device (videos are never uploaded; this only protects the browser's storage quota) */
  maxLocalBytes: number;
  maxDurationSec: number;
  /** Old, unenforced transcription allowance. NOT the processing-minutes balance. Left alone on purpose. */
  cloudAsrMinutesPerMonth: number;
  exportRetentionDays: number;
  maxProjects: number;
  /** finished video exports per 30-day window (1 video = 1 finished export). Live until the minutes cutover. */
  videosPerMonth: number;
  /** processing minutes granted per billing cycle under the new model. */
  minutesPerCycle: number;
  /** true only for Free: its 5 minutes are a one-time grant, not per cycle. */
  minutesOneTime: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { maxUploadBytes: 50 * 1024 * 1024, maxLocalBytes: 2 * 1024 * 1024 * 1024, maxDurationSec: 5 * 60, cloudAsrMinutesPerMonth: 30, exportRetentionDays: 7, maxProjects: 10, videosPerMonth: 3, minutesPerCycle: 5, minutesOneTime: true },
  starter: { maxUploadBytes: 200 * 1024 * 1024, maxLocalBytes: 4 * 1024 * 1024 * 1024, maxDurationSec: 30 * 60, cloudAsrMinutesPerMonth: 120, exportRetentionDays: 30, maxProjects: 50, videosPerMonth: 10, minutesPerCycle: 40, minutesOneTime: false },
  creator: { maxUploadBytes: 500 * 1024 * 1024, maxLocalBytes: 8 * 1024 * 1024 * 1024, maxDurationSec: 60 * 60, cloudAsrMinutesPerMonth: 300, exportRetentionDays: 60, maxProjects: 200, videosPerMonth: 20, minutesPerCycle: 100, minutesOneTime: false },
  pro: { maxUploadBytes: 2 * 1024 * 1024 * 1024, maxLocalBytes: 8 * 1024 * 1024 * 1024, maxDurationSec: 3 * 3600, cloudAsrMinutesPerMonth: 600, exportRetentionDays: 60, maxProjects: 1000, videosPerMonth: 40, minutesPerCycle: 250, minutesOneTime: false },
};

/**
 * The old Plus tier's limits, kept verbatim so a live old pass and the
 * quota code keep reading the values that pass was sold on. Its minutes
 * grant is 0: the old model had no minutes, and an old pass stays on
 * video counts until it expires — it is never silently given minutes.
 */
export const LEGACY_PLANS: Record<LegacyPlanId, PlanLimits> = {
  growth: { maxUploadBytes: 500 * 1024 * 1024, maxLocalBytes: 8 * 1024 * 1024 * 1024, maxDurationSec: 60 * 60, cloudAsrMinutesPerMonth: 300, exportRetentionDays: 60, maxProjects: 200, videosPerMonth: 20, minutesPerCycle: 0, minutesOneTime: false },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const LEGACY_PLAN_IDS = Object.keys(LEGACY_PLANS) as LegacyPlanId[];

export const isLegacyPlanId = (plan: string | null | undefined): plan is LegacyPlanId => plan === "growth";

/**
 * A stored plan string → a known tier. A stored "growth" (old Plus pass)
 * maps to "creator", so it keeps working until expiry. Unknown values
 * (incl. legacy/garbage) read as free.
 */
export const planIdFor = (plan: string | null | undefined): PlanId =>
  plan === "starter" || plan === "pro" ? plan : plan === "growth" || plan === "creator" ? "creator" : "free";

export const planFor = (plan: string | null | undefined): PlanLimits => PLANS[planIdFor(plan)];

/** Limits for a stored legacy id, without mapping it forward. */
export const legacyPlanFor = (plan: LegacyPlanId): PlanLimits => LEGACY_PLANS[plan];

/**
 * The tier a profile is ACTUALLY entitled to right now: a paid tier whose
 * paid period has ended (profiles.plan_expires_at in the past) counts as
 * free until it is renewed. Free never expires. A live old Plus pass
 * ("growth") reads as Creator here.
 */
export const effectivePlanId = (
  plan: string | null | undefined,
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): PlanId => {
  const id = planIdFor(plan);
  if (id === "free" || !expiresAt) return id;
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Number.isFinite(end.getTime()) && end.getTime() <= now.getTime() ? "free" : id;
};

/** Days in one billing cycle. Paid plans are monthly; minutes reset each cycle and never roll over. */
export const PLAN_PERIOD_DAYS = 30;

/** One-time watermark removal for a Free video project: ₹69, INR only for now (no USD price set). */
export const WATERMARK_REMOVAL_PRICE_INR = 69;
export const WATERMARK_REMOVAL_PRICE_USD: number | null = null;

/** The mark painted on Free MP4 exports (paid plans and ₹69-removed projects render clean). */
export const WATERMARK_TEXT = "Captionit";

/** Caption looks: Free gets 25 of 150. Paid plans get all 150. */
export const FREE_LOOKS_COUNT = 25;
export const TOTAL_LOOKS_COUNT = 150;

export interface PlanPricing {
  id: PlanId | LegacyPlanId;
  name: string;
  tagline: string;
  /** per billing cycle (monthly). Free is ₹0, forever. */
  priceInr: number;
  /**
   * USD price per billing cycle. Null means "not set yet — INR only for
   * now". Never guess a conversion. Free is 0, not null. The legacy Plus
   * record keeps its old $6 so payment history still shows what was paid.
   */
  priceUsd: number | null;
  /** true only for Creator, the Most Popular plan. */
  isMostPopular?: boolean;
  /** honest bullets: each maps to an enforced limit above, or is labelled support */
  features: string[];
}

/**
 * Display order + prices. Currency rule (owner): the visitor's country picks
 * ONE currency — India sees INR, everywhere else USD; the two are never shown
 * together on the page. Until USD prices are set, non-India visitors see
 * the INR price with a plain note, never a guessed conversion.
 */
export const PLAN_PRICING: PlanPricing[] = [
  {
    id: "free",
    name: "Free",
    tagline: "The full studio, free while you find your feet.",
    priceInr: 0,
    priceUsd: 0,
    features: [
      "5 processing minutes, one-time only",
      "25 caption looks",
      "Exports with watermark",
      "10 projects",
      "Videos up to 5 minutes",
      "Uploads up to 50 MB",
      "Exports kept for 7 days",
      "Editor, Clipper and Creator Studio included",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "More room for a posting habit.",
    priceInr: 149,
    priceUsd: null,
    features: [
      "40 processing minutes a month",
      "All 150 caption looks",
      "No watermark on exports",
      "ProRes overlay export (MOV)",
      "50 projects",
      "Videos up to 30 minutes",
      "Uploads up to 200 MB",
      "Exports kept for 30 days",
      "Email support",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    tagline: "For creators publishing every day.",
    priceInr: 349,
    priceUsd: null,
    isMostPopular: true,
    features: [
      "100 processing minutes a month",
      "All 150 caption looks",
      "No watermark on exports",
      "ProRes overlay export (MOV)",
      "200 projects",
      "Videos up to 1 hour",
      "Uploads up to 500 MB",
      "Exports kept for 60 days",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "The most headroom we offer.",
    priceInr: 749,
    priceUsd: null,
    features: [
      "250 processing minutes a month",
      "All 150 caption looks",
      "No watermark on exports",
      "ProRes overlay export (MOV)",
      "1,000 projects",
      "Videos up to 3 hours",
      "Uploads up to 2 GB",
      "Exports kept for 60 days",
      "Priority email support",
    ],
  },
];

/**
 * The old Plus tier's pricing, kept verbatim for payment history and the
 * live quota code. Not shown on the pricing page. "growth" is the id
 * stored on old profiles and payments; the display name stays "Plus".
 */
export const LEGACY_PLAN_PRICING: PlanPricing[] = [
  {
    id: "growth",
    name: "Plus",
    tagline: "For creators publishing every day.",
    priceInr: 499,
    priceUsd: 6,
    features: [
      "20 videos a month",
      "200 projects",
      "Videos up to 1 hour",
      "Uploads up to 500 MB",
      "Exports kept for 60 days",
      "Email support",
    ],
  },
];

/**
 * Pricing for a plan id, current or legacy. A stored "growth" returns the
 * old Plus record (₹499, 20 videos a month) — what that pass was actually
 * sold on. New code that wants the plan a "growth" pass reads as today
 * should use planIdFor + pricingFor("creator") instead.
 */
export const pricingFor = (id: PlanId | LegacyPlanId): PlanPricing =>
  PLAN_PRICING.find((p) => p.id === id) ?? LEGACY_PLAN_PRICING.find((p) => p.id === id) ?? PLAN_PRICING[0]!;

/** Pricing for a stored plan string, legacy included. Unknown values read as Free. */
export const pricingForStoredPlan = (plan: string | null | undefined): PlanPricing =>
  isLegacyPlanId(plan) ? LEGACY_PLAN_PRICING[0]! : pricingFor(planIdFor(plan));
