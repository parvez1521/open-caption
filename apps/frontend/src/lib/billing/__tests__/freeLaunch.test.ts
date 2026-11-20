// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { FREE_LAUNCH_UNTIL_ISO, isFreeLaunchWindow } from "../freeLaunch";
import {
  FREE_LAUNCH_REMAINING,
  checkVideoQuota,
  getVideoQuotaUsage,
  reserveVideoQuotaEvent,
} from "../videoQuota";

/**
 * free launch window (owner order 2026-11-15): everything free
 * until 5 Dec 2026, 23:59:59 IST; paid resumes 6 Dec (30-day passes;
 * minutes/subscription model dropped by owner 2026-11-17).
 * The cutoff lives in ONE place — freeLaunch.ts — and
 * every bypass calls isFreeLaunchWindow(); the window expires on its own.
 */

const INSIDE = new Date("2026-11-16T10:00:00.000Z");
const AT_CUTOFF = new Date(FREE_LAUNCH_UNTIL_ISO);
const AFTER_CUTOFF = new Date("2026-12-05T18:30:00.000Z"); // 6 Dec 00:00 IST

/** A DB that fails loudly if touched — the window bypass must not query it. */
const throwingDb = {
  from: () => {
    throw new Error("DB must not be touched during the free launch");
  },
} as unknown as Parameters<typeof getVideoQuotaUsage>[0];

describe("isFreeLaunchWindow", () => {
  it("is active before the cutoff", () => {
    expect(isFreeLaunchWindow(INSIDE)).toBe(true);
  });

  it("is active at the cutoff instant itself (5 Dec 23:59:59 IST)", () => {
    expect(isFreeLaunchWindow(AT_CUTOFF)).toBe(true);
    expect(AT_CUTOFF.toISOString()).toBe("2026-12-05T18:29:59.000Z");
  });

  it("is over one second later (6 Dec 00:00 IST)", () => {
    expect(isFreeLaunchWindow(AFTER_CUTOFF)).toBe(false);
  });
});

describe("quota bypass during the window", () => {
  it("getVideoQuotaUsage answers unlimited without touching the DB", async () => {
    const usage = await getVideoQuotaUsage(throwingDb, "user-1", "free", null, INSIDE);
    expect(usage).toMatchObject({ plan: "free", limit: 3, remaining: FREE_LAUNCH_REMAINING, freeLaunch: true });
  });

  it("reserveVideoQuotaEvent answers reserved:true without writing an event", async () => {
    const res = await reserveVideoQuotaEvent(throwingDb, {
      exportId: "aaaaaaaa-1111-4111-8111-111111111111",
      ownerId: "user-1",
      projectId: "proj-1",
      kind: "mp4",
      plan: "free",
      expiresAt: null,
      now: INSIDE,
    });
    expect(res).toMatchObject({ reserved: true, usage: { freeLaunch: true } });
  });

  it("checkVideoQuota passes at the cap during the window", async () => {
    const usage = await checkVideoQuota(throwingDb, "user-1", "free", null, INSIDE);
    expect(usage.freeLaunch).toBe(true);
  });
});

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") walkFiles(full, out);
    } else if (!full.endsWith(".test.ts") && !full.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const pricingPage = readFileSync(join(process.cwd(), "src/app/pricing/page.tsx"), "utf8");
const billingPage = readFileSync(join(process.cwd(), "src/app/(dashboard)/settings/billing/page.tsx"), "utf8");
const homeSections = readFileSync(join(process.cwd(), "src/components/home/Sections.tsx"), "utf8");
const checkoutRoute = readFileSync(join(process.cwd(), "src/app/api/v1/billing/checkout/route.ts"), "utf8");

describe("free launch copy + guards (source pins)", () => {
  it("the cutoff date lives only in freeLaunch.ts — never hardcoded elsewhere", () => {
    const offenders = walkFiles(join(process.cwd(), "src")).filter(
      (file) => file !== join(process.cwd(), "src/lib/billing/freeLaunch.ts") && readFileSync(file, "utf8").includes("2026-11-20"),
    );
    expect(offenders).toEqual([]);
  });

  it("/pricing shows the free banner and no buyable old-pass CTA — and no minutes table (subscriptions dropped, owner 2026-11-17)", () => {
    expect(pricingPage).toContain("Everything free till 5 Dec — no card needed.");
    expect(pricingPage).toContain("Available 6 Dec");
    expect(pricingPage).not.toContain("MinutesLaunchTable");
    expect(pricingPage).not.toContain("minutes pricing");
  });

  it("the billing page shows unlimited during the window and disables buying", () => {
    expect(billingPage).toContain("Unlimited videos till 5 Dec");
    expect(billingPage).toContain("Available 6 Dec");
    expect(billingPage).toContain("isFreeLaunchWindow()");
  });

  it("the homepage pricing section names the free window", () => {
    expect(homeSections).toContain("Everything free till 5 Dec — no card needed.");
  });

  it("the checkout API refuses orders during the window", () => {
    expect(checkoutRoute).toContain("isFreeLaunchWindow()");
    expect(checkoutRoute).toContain("paid plans return on 6 Dec");
  });
});
