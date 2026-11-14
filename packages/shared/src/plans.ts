/**
 * Plans: the entitlements (PlanLimits) AND the prices (PLAN_PRICING) for every
 * tier live in this one file — the single config the owner edits. The limits
 * are enforced server-side (project count in the projects route, upload size
 * + duration in the videos route, device storage + duration in the studio
 * route, export retention in the exports route), all reading the signed-in
 * user's profiles.plan through planFor / effectivePlanId.
 *
 * FREE IS FROZEN at the values it has always had: paid tiers only raise the
 * same scale limits (more projects, longer videos, bigger uploads, longer
 * export retention). No editor feature is paywalled — a paid plan buys
 * headroom, not tools.
 *
 * ONE owner-approved exception (2026-11-14): the monthly video quota
 * (videosPerMonth) DOES cap Free at 3 videos a month — the quota is the
 * subscription model itself (1 video = 1 finished export; transcription
 * and editing stay unlimited; unused videos never roll over).
 */
export type PlanId = "free" | "starter" | "growth" | "pro";

export interface PlanLimits {
  maxUploadBytes: number;
  /** biggest file kept on the device (videos are never uploaded; this only protects the browser's storage quota) */
  maxLocalBytes: number;
  maxDurationSec: number;
  cloudAsrMinutesPerMonth: number;
  exportRetentionDays: number;
  maxProjects: number;
  /** finished video exports per 30-day window (1 video = 1 finished export). */
  videosPerMonth: number;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { maxUploadBytes: 50 * 1024 * 1024, maxLocalBytes: 2 * 1024 * 1024 * 1024, maxDurationSec: 5 * 60, cloudAsrMinutesPerMonth: 30, exportRetentionDays: 7, maxProjects: 10, videosPerMonth: 3 },
  starter: { maxUploadBytes: 200 * 1024 * 1024, maxLocalBytes: 4 * 1024 * 1024 * 1024, maxDurationSec: 30 * 60, cloudAsrMinutesPerMonth: 120, exportRetentionDays: 30, maxProjects: 50, videosPerMonth: 10 },
  growth: { maxUploadBytes: 500 * 1024 * 1024, maxLocalBytes: 8 * 1024 * 1024 * 1024, maxDurationSec: 60 * 60, cloudAsrMinutesPerMonth: 300, exportRetentionDays: 60, maxProjects: 200, videosPerMonth: 20 },
  pro: { maxUploadBytes: 2 * 1024 * 1024 * 1024, maxLocalBytes: 8 * 1024 * 1024 * 1024, maxDurationSec: 3 * 3600, cloudAsrMinutesPerMonth: 600, exportRetentionDays: 60, maxProjects: 1000, videosPerMonth: 40 },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** A stored plan string → a known tier. Unknown values (incl. legacy/garbage) read as free. */
export const planIdFor = (plan: string | null | undefined): PlanId =>
  plan === "starter" || plan === "growth" || plan === "pro" ? plan : "free";

export const planFor = (plan: string | null | undefined): PlanLimits => PLANS[planIdFor(plan)];

/**
 * The tier a profile is ACTUALLY entitled to right now: a paid tier whose
 * paid period has ended (profiles.plan_expires_at in the past) counts as
 * free until it is renewed. Free never expires.
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

/** Days of access one payment buys. Plans are 30-day passes, renewed by paying again — there is no auto-charge. */
export const PLAN_PERIOD_DAYS = 30;

export interface PlanPricing {
  id: PlanId;
  name: string;
  tagline: string;
  /** per 30 days, charged once via Cashfree — no subscription, no auto-renew */
  priceInr: number;
  priceUsd: number;
  /** honest bullets: each maps to an enforced limit above, or is labelled support */
  features: string[];
}

/**
 * Display order + prices. Currency rule (owner): the visitor's country picks
 * ONE currency — India sees INR, everywhere else USD; the two are never shown
 * together on the page.
 */
export const PLAN_PRICING: PlanPricing[] = [
  {
    id: "free",
    name: "Free",
    tagline: "The full studio, free while you find your feet.",
    priceInr: 0,
    priceUsd: 0,
    features: [
      "3 videos a month",
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
    priceInr: 299,
    priceUsd: 4,
    features: [
      "10 videos a month",
      "50 projects",
      "Videos up to 30 minutes",
      "Uploads up to 200 MB",
      "Exports kept for 30 days",
      "Email support",
    ],
  },
  {
    // Display name renamed Growth → Plus (owner, 2026-11-11) to end the clash
    // with the Growth Studio product. The id stays "growth" on purpose: it is
    // the billing/webhook identity stored on profiles and payments.
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
  {
    id: "pro",
    name: "Pro",
    tagline: "The most headroom we offer.",
    priceInr: 799,
    priceUsd: 10,
    features: [
      "40 videos a month",
      "1,000 projects",
      "Videos up to 3 hours",
      "Uploads up to 2 GB",
      "Exports kept for 60 days",
      "Priority email support",
    ],
  },
];

export const pricingFor = (id: PlanId): PlanPricing => PLAN_PRICING.find((p) => p.id === id) ?? PLAN_PRICING[0]!;
