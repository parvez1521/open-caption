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
 * 5-day free launch window (owner order 2026-11-15): everything free
 * until 20 Nov 2026, 23:59:59 IST; paid resumes 21 Nov (minutes pricing,
 * separate deploy). The cutoff lives in ONE place — freeLaunch.ts — and
 * every bypass calls isFreeLaunchWindow(); the window expires on its own.
 */

const INSIDE = new Date("2026-11-16T10:00:00.000Z");
const AT_CUTOFF = new Date(FREE_LAUNCH_UNTIL_ISO);
const AFTER_CUTOFF = new Date("2026-11-20T18:30:00.000Z"); // 21 Nov 00:00 IST

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

  it("is active at the cutoff instant itself (20 Nov 23:59:59 IST)", () => {
    expect(isFreeLaunchWindow(AT_CUTOFF)).toBe(true);
    expect(AT_CUTOFF.toISOString()).toBe("2026-11-20T18:29:59.000Z");
  });

  it("is over one second later (21 Nov 00:00 IST)", () => {
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
const minutesTable = readFileSync(join(process.cwd(), "src/components/pricing/MinutesLaunchTable.tsx"), "utf8");
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

  it("/pricing shows the free banner, the minutes table and no buyable old-pass CTA", () => {
    expect(pricingPage).toContain("Everything free till 20 Nov — no card needed.");
    expect(pricingPage).toContain("Available 21 Nov");
    expect(pricingPage).toContain("<MinutesLaunchTable />");
  });

  it("the minutes table shows ₹149 / ₹349 / ₹749, labelled from 21 Nov, CTAs disabled", () => {
    for (const price of ["₹149", "₹349", "₹749"]) expect(minutesTable).toContain(price);
    // The heading and CTA render "From 21 Nov" / "Available 21 Nov" via
    // PAID_FROM_LABEL — the literal strings are pinned by the render test.
    expect(minutesTable).toContain("PAID_FROM_LABEL");
    expect(minutesTable).toContain("minutes pricing");
    expect(minutesTable).toContain("disabled");
  });

  it("the billing page shows unlimited during the window and disables buying", () => {
    expect(billingPage).toContain("Unlimited videos till 20 Nov");
    expect(billingPage).toContain("Available 21 Nov");
    expect(billingPage).toContain("isFreeLaunchWindow()");
  });

  it("the homepage pricing section names the free window", () => {
    expect(homeSections).toContain("Everything free till 20 Nov — no card needed.");
  });

  it("the checkout API refuses orders during the window", () => {
    expect(checkoutRoute).toContain("isFreeLaunchWindow()");
    expect(checkoutRoute).toContain("paid plans return on 21 Nov");
  });
});
