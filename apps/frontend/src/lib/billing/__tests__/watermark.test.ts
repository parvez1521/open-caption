// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  WATERMARK_NOT_SET_UP,
  getWatermarkStatus,
  grantWatermarkEntitlement,
  hasWatermarkEntitlement,
  isWatermarkPayment,
  resolveWatermark,
  revokeWatermarkEntitlement,
  settleWatermarkPaid,
  settleWatermarkRefunded,
} from "../watermark";
import { settlePaid, type PaymentRow } from "../settle";

/**
 * Watermark decision + ₹69 entitlement against a minimal fake of the
 * service-role client. Pins the decision matrix (free without an
 * entitlement → watermarked; paid → clean; free with an entitlement →
 * clean), the one-entitlement-per-project rule (duplicate webhooks grant
 * once), the refund revoke, and the hard boundary: an entitlement touches
 * ONLY `watermark_entitlements` + `payments` — never the minutes ledger,
 * never profiles.plan, never looks or MOV gating (nothing else reads this
 * table).
 */
type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ tableMissing: false }));

class FakeBuilder {
  private filters: Array<[string, unknown]> = [];
  private updateRow: Row | null = null;
  private insertRow: Row | null = null;
  constructor(
    private tables: Record<string, Row[]>,
    private table: string,
  ) {}
  select() {
    return this;
  }
  update(row: Row) {
    this.updateRow = row;
    return this;
  }
  insert(row: Row) {
    this.insertRow = row;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  async maybeSingle() {
    if (state.tableMissing && this.table === "watermark_entitlements") {
      return { data: null, error: { code: "42P01", message: 'relation "public.watermark_entitlements" does not exist' } };
    }
    const rows = (this.tables[this.table] ?? []).filter((r) => this.filters.every(([c, v]) => r[c] === v));
    if (this.insertRow) {
      // Unique keys, like the real table: one entitlement per project, one per order.
      const clash = (this.tables[this.table] ?? []).find(
        (r) => (this.insertRow!.project_id && r.project_id === this.insertRow!.project_id) || (this.insertRow!.cf_order_id && r.cf_order_id === this.insertRow!.cf_order_id),
      );
      if (clash) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      const row: Row = { id: `ent-${(this.tables[this.table] ?? []).length + 1}`, ...this.insertRow, paid_at: "2026-11-14T00:00:00Z", created_at: "2026-11-14T00:00:00Z" };
      (this.tables[this.table] ??= []).push(row);
      return { data: row, error: null };
    }
    if (this.updateRow) {
      const row = rows[0];
      if (!row) return { data: null, error: null };
      Object.assign(row, this.updateRow);
      return { data: row, error: null };
    }
    return { data: rows[0] ?? null, error: null };
  }
}

const fakeAdmin = (tables: Record<string, Row[]>) =>
  ({
    from: (t: string) => new FakeBuilder(tables, t),
    // The minutes ledger must never be touched by watermark code: any rpc
    // call is a test failure, not a stubbed success.
    rpc: async () => {
      throw new Error("fake rpc must not be called by watermark code");
    },
  }) as never;

const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: "pay-wm-1",
  owner_id: "user-1",
  cf_order_id: "oc_wm_order1",
  cf_payment_id: null,
  plan: "watermark",
  product: "watermark",
  project_id: "proj-1",
  amount: 69,
  currency: "INR",
  status: "created",
  created_at: "2026-11-14T00:00:00Z",
  paid_at: null,
  period_start: null,
  period_end: null,
  ...over,
});

const statusInput = (over: Record<string, unknown> = {}) => ({
  ownerId: "user-1",
  projectId: "proj-1",
  plan: "free",
  expiresAt: null,
  ...over,
});

describe("watermark decision", () => {
  it("a Free user without an entitlement gets the watermark on MP4", async () => {
    const tables: Record<string, Row[]> = {};
    expect(await resolveWatermark(fakeAdmin(tables), statusInput())).toEqual({ text: "Captionit" });
  });

  it("a Free user WITH a paid entitlement for the project exports clean", async () => {
    const tables: Record<string, Row[]> = {
      watermark_entitlements: [{ project_id: "proj-1", owner_id: "user-1", cf_order_id: "oc_wm_order1", amount: 69, currency: "INR", status: "paid" }],
    };
    expect(await resolveWatermark(fakeAdmin(tables), statusInput())).toBeNull();
    expect(await hasWatermarkEntitlement(fakeAdmin(tables), "proj-1")).toBe(true);
  });

  it("an entitlement for ANOTHER project does not clear this project's watermark", async () => {
    const tables: Record<string, Row[]> = {
      watermark_entitlements: [{ project_id: "proj-2", owner_id: "user-1", cf_order_id: "oc_wm_order2", amount: 69, currency: "INR", status: "paid" }],
    };
    // The fake applies eq() filters, so proj-1 finds nothing.
    expect(await resolveWatermark(fakeAdmin(tables), statusInput())).toEqual({ text: "Captionit" });
  });

  it("a paid plan exports clean, with or without an entitlement", async () => {
    const tables: Record<string, Row[]> = {};
    expect(await resolveWatermark(fakeAdmin(tables), statusInput({ plan: "starter", expiresAt: "2026-12-14T00:00:00Z" }))).toBeNull();
    expect(await resolveWatermark(fakeAdmin(tables), statusInput({ plan: "creator", expiresAt: "2026-12-14T00:00:00Z" }))).toBeNull();
  });

  it("an expired paid plan reads as Free — watermarked again", async () => {
    const tables: Record<string, Row[]> = {};
    expect(await resolveWatermark(fakeAdmin(tables), statusInput({ plan: "starter", expiresAt: "2026-11-01T00:00:00Z" }))).toEqual({ text: "Captionit" });
  });

  it("a missing entitlement table fails closed: watermarked, ready false (Free); paid stays clean", async () => {
    state.tableMissing = true;
    try {
      const tables: Record<string, Row[]> = {};
      const free = await getWatermarkStatus(fakeAdmin(tables), statusInput());
      expect(free).toEqual({ watermark: { text: "Captionit" }, entitled: false, ready: false });
      const paid = await getWatermarkStatus(fakeAdmin(tables), statusInput({ plan: "starter", expiresAt: "2026-12-14T00:00:00Z" }));
      expect(paid).toEqual({ watermark: null, entitled: false, ready: true });
    } finally {
      state.tableMissing = false;
    }
  });
});

describe("watermark entitlement grant", () => {
  it("grants one row per project: ₹69, INR, paid", async () => {
    const tables: Record<string, Row[]> = {};
    const res = await grantWatermarkEntitlement(fakeAdmin(tables), { ownerId: "user-1", projectId: "proj-1", paymentId: "pay-wm-1", orderId: "oc_wm_order1", amount: 69, currency: "INR" });
    expect(res.granted).toBe(true);
    expect(res.alreadyGranted).toBe(false);
    expect(tables.watermark_entitlements).toHaveLength(1);
    expect(tables.watermark_entitlements![0]).toMatchObject({ project_id: "proj-1", owner_id: "user-1", payment_id: "pay-wm-1", cf_order_id: "oc_wm_order1", amount: 69, currency: "INR", status: "paid" });
  });

  it("a duplicate grant for the same project (re-delivered webhook) creates no second row", async () => {
    const tables: Record<string, Row[]> = {};
    const admin = fakeAdmin(tables);
    await grantWatermarkEntitlement(admin, { ownerId: "user-1", projectId: "proj-1", paymentId: "pay-wm-1", orderId: "oc_wm_order1", amount: 69, currency: "INR" });
    const again = await grantWatermarkEntitlement(admin, { ownerId: "user-1", projectId: "proj-1", paymentId: "pay-wm-2", orderId: "oc_wm_order2", amount: 69, currency: "INR" });
    expect(again.granted).toBe(false);
    expect(again.alreadyGranted).toBe(true);
    expect(tables.watermark_entitlements).toHaveLength(1);
    expect(tables.watermark_entitlements![0]!.cf_order_id).toBe("oc_wm_order1");
  });

  it("a duplicate order id for another project also grants nothing twice", async () => {
    const tables: Record<string, Row[]> = {};
    const admin = fakeAdmin(tables);
    await grantWatermarkEntitlement(admin, { ownerId: "user-1", projectId: "proj-1", paymentId: "pay-wm-1", orderId: "oc_wm_order1", amount: 69, currency: "INR" });
    const again = await grantWatermarkEntitlement(admin, { ownerId: "user-1", projectId: "proj-2", paymentId: "pay-wm-1", orderId: "oc_wm_order1", amount: 69, currency: "INR" });
    expect(again.alreadyGranted).toBe(true);
    expect(tables.watermark_entitlements).toHaveLength(1);
  });

  it("a missing table throws the honest not-set-up error, never a fake grant", async () => {
    state.tableMissing = true;
    try {
      await expect(
        grantWatermarkEntitlement(fakeAdmin({}), { ownerId: "user-1", projectId: "proj-1", paymentId: "pay-wm-1", orderId: "oc_wm_order1", amount: 69, currency: "INR" }),
      ).rejects.toMatchObject({ message: WATERMARK_NOT_SET_UP });
    } finally {
      state.tableMissing = false;
    }
  });
});

describe("watermark settle + refund", () => {
  it("settleWatermarkPaid marks the payment paid and grants the entitlement — and nothing else", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
      payments: [payment() as unknown as Row],
      minute_ledger: [],
      minute_balances: [],
    };
    const settled = await settleWatermarkPaid(fakeAdmin(tables), payment(), "cfpay-9");
    expect(settled.status).toBe("paid");
    expect(settled.cf_payment_id).toBe("cfpay-9");
    expect(tables.watermark_entitlements).toHaveLength(1);
    // The boundary: no minutes granted, no plan changed.
    expect(tables.minute_ledger).toHaveLength(0);
    expect(tables.minute_balances).toHaveLength(0);
    expect(tables.profiles![0]).toMatchObject({ plan: "free", plan_expires_at: null });
  });

  it("a duplicate settle (already paid) heals the grant without a second row", async () => {
    const tables: Record<string, Row[]> = { payments: [payment({ status: "paid" }) as unknown as Row] };
    const admin = fakeAdmin(tables);
    await settleWatermarkPaid(admin, payment({ status: "paid" }), "cfpay-9");
    await settleWatermarkPaid(admin, payment({ status: "paid" }), "cfpay-9");
    expect(tables.watermark_entitlements).toHaveLength(1);
  });

  it("settleWatermarkPaid refuses a plan payment", async () => {
    await expect(settleWatermarkPaid(fakeAdmin({}), payment({ plan: "starter", product: "plan", project_id: null }), "cfpay-9")).rejects.toThrow(
      "settleWatermarkPaid called for a plan payment",
    );
  });

  it("settlePaid refuses a watermark payment (it would mint Free minutes)", async () => {
    await expect(settlePaid(fakeAdmin({}), payment(), "cfpay-9")).rejects.toThrow("settlePaid called for a watermark payment");
  });

  it("a refund revokes the removal: payment refunded, entitlement refunded, watermark back on", async () => {
    const tables: Record<string, Row[]> = {
      payments: [payment({ status: "paid" }) as unknown as Row],
      watermark_entitlements: [{ project_id: "proj-1", owner_id: "user-1", cf_order_id: "oc_wm_order1", amount: 69, currency: "INR", status: "paid" }],
    };
    const admin = fakeAdmin(tables);
    const refunded = await settleWatermarkRefunded(admin, payment({ status: "paid" }));
    expect(refunded.status).toBe("refunded");
    expect(tables.watermark_entitlements![0]!.status).toBe("refunded");
    expect(await resolveWatermark(admin, statusInput())).toEqual({ text: "Captionit" });
    // A re-delivered refund is a no-op.
    expect(await revokeWatermarkEntitlement(admin, "oc_wm_order1")).toBe(false);
  });

  it("settleWatermarkRefunded refuses a plan payment", async () => {
    await expect(settleWatermarkRefunded(fakeAdmin({}), payment({ plan: "starter", product: "plan", project_id: null, status: "paid" }))).rejects.toThrow(
      "settleWatermarkRefunded called for a plan payment",
    );
  });
});

describe("isWatermarkPayment", () => {
  it("reads the product discriminator, falling back to plan for pre-migration rows", () => {
    expect(isWatermarkPayment({ plan: "watermark", product: "watermark" })).toBe(true);
    expect(isWatermarkPayment({ plan: "watermark", product: null })).toBe(true);
    expect(isWatermarkPayment({ plan: "starter", product: "plan" })).toBe(false);
    expect(isWatermarkPayment({ plan: "starter" })).toBe(false);
    expect(isWatermarkPayment({ plan: "free" })).toBe(false);
  });
});
