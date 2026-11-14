// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  findSubscriptionByCfId,
  findWebhookEvent,
  markSubscriptionCancelled,
  markSubscriptionExpired,
  markSubscriptionPastDue,
  recordSubscription,
  recordSubscriptionRefund,
  recordWebhookEvent,
  settlePlanRefunded,
  settleSubscriptionCycle,
  subscriptionActivationGrantKey,
  subscriptionChargeGrantKey,
  webhookEventKey,
  type SubscriptionRow,
} from "../subscriptions";
import type { PaymentRow } from "../settle";

/**
 * Subscription lifecycle against a minimal fake of the service-role
 * client: activation grants one cycle of minutes and sets the plan,
 * a retried grant is a no-op by key, a renewal charge grants a fresh
 * cycle, a refunded charge never grants, cancel keeps access to the
 * paid period end, expiry shortens the stored expiry to the period
 * end, past-due grants nothing, and a plan refund marks the payment
 * refunded without touching the plan.
 */
type Row = Record<string, unknown>;
type Fail = { code: string; message: string };

class FakeBuilder {
  private filters: Array<[string, unknown]> = [];
  private updateRow: Row | null = null;
  private insertRow: Row | null = null;
  constructor(
    private tables: Record<string, Row[]>,
    private table: string,
    private failError: Fail | null = null,
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
  in(col: string, vals: unknown[]) {
    this.filters.push([col, vals]);
    return this;
  }
  order() {
    return this;
  }
  then(resolve: (v: { data: null; error: Fail | null }) => void) {
    if (this.failError) {
      resolve({ data: null, error: this.failError });
      return;
    }
    if (this.updateRow) {
      const row = (this.tables[this.table] ?? []).find((r) => this.matches(r));
      if (row) Object.assign(row, this.updateRow);
    }
    if (this.insertRow) {
      const clash = (this.tables[this.table] ?? []).find(
        (r) => (this.insertRow!.event_key && r.event_key === this.insertRow!.event_key) || (this.insertRow!.cf_subscription_id && r.cf_subscription_id === this.insertRow!.cf_subscription_id),
      );
      if (clash) {
        resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
        return;
      }
      const row: Row = { id: `row-${(this.tables[this.table] ?? []).length + 1}`, ...this.insertRow };
      (this.tables[this.table] ??= []).push(row);
    }
    resolve({ data: null, error: null });
  }
  private matches(r: Row): boolean {
    return this.filters.every(([c, v]) => (Array.isArray(v) ? (v as unknown[]).includes(r[c]) : r[c] === v));
  }
  async maybeSingle() {
    if (this.failError) return { data: null, error: this.failError };
    const rows = (this.tables[this.table] ?? []).filter((r) => this.matches(r));
    if (this.insertRow) {
      const clash = (this.tables[this.table] ?? []).find(
        (r) => (this.insertRow!.event_key && r.event_key === this.insertRow!.event_key) || (this.insertRow!.cf_subscription_id && r.cf_subscription_id === this.insertRow!.cf_subscription_id),
      );
      if (clash) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      const row: Row = { id: `row-${(this.tables[this.table] ?? []).length + 1}`, ...this.insertRow, created_at: "2026-11-14T00:00:00Z" };
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

const fakeAdmin = (tables: Record<string, Row[]>, fail?: Record<string, Fail>) =>
  ({
    from: (t: string) => new FakeBuilder(tables, t, fail?.[t] ?? null),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "grant_cycle_minutes") throw new Error(`fake rpc: unknown function ${fn}`);
      const userId = args.p_user_id as string;
      const key = args.p_idempotency_key as string;
      const ledger = (tables.minute_ledger ??= []);
      const balances = (tables.minute_balances ??= []);
      const existing = balances.find((r) => r.user_id === userId);
      if (ledger.some((r) => r.idempotency_key === key)) {
        return { data: { granted: false, already_granted: true, balance: (existing?.balance_minutes as number) ?? 0 }, error: null };
      }
      const minutes = args.p_minutes as number;
      let bal = existing;
      if (!bal) {
        bal = { user_id: userId, balance_minutes: 0, cycle_start: null, cycle_end: null };
        balances.push(bal);
      }
      bal.balance_minutes = (bal.balance_minutes as number) + minutes;
      bal.cycle_start = args.p_cycle_start as string;
      bal.cycle_end = args.p_cycle_end as string | null;
      ledger.push({ user_id: userId, kind: "grant", minutes, balance_after: bal.balance_minutes, idempotency_key: key });
      return { data: { granted: true, already_granted: false, balance: bal.balance_minutes }, error: null };
    },
  }) as never;

const aSubscription = (over: Partial<SubscriptionRow> = {}): Row => ({
  id: "sub-1",
  owner_id: "user-1",
  cf_subscription_id: "ocs_1",
  cf_plan_id: "cf-plan-starter",
  plan: "starter",
  amount: 149,
  currency: "INR",
  status: "initialized",
  period_start: null,
  period_end: null,
  next_charge_at: null,
  last_charge_id: null,
  last_charge_at: null,
  refunded_charge_ids: [],
  cancelled_at: null,
  created_at: "2026-11-14T00:00:00Z",
  ...over,
});

const aPayment = (over: Partial<PaymentRow> = {}): Row => ({
  id: "pay-1",
  owner_id: "user-1",
  cf_order_id: "oc_order1",
  cf_payment_id: "cfpay-1",
  plan: "starter",
  amount: 149,
  currency: "INR",
  status: "paid",
  created_at: "2026-11-11T00:00:00Z",
  paid_at: "2026-11-11T00:00:00Z",
  period_start: "2026-11-11T00:00:00Z",
  period_end: "2026-12-11T00:00:00Z",
  ...over,
});

describe("settleSubscriptionCycle", () => {
  it("activates: grants the cycle minutes once and sets the plan + period", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
      subscriptions: [aSubscription()],
      payments: [{ ...aPayment(), cf_order_id: "ocs_1", status: "created", paid_at: null, period_start: null, period_end: null }],
    };
    const before = Date.now();
    const settled = await settleSubscriptionCycle(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, {
      periodStart: null,
      periodEnd: null,
      chargeId: "cfpay-auth-1",
      grantKey: subscriptionActivationGrantKey("ocs_1"),
    });
    expect(settled.status).toBe("active");
    expect(tables.profiles[0]!.plan).toBe("starter");
    const end = new Date(tables.profiles[0]!.plan_expires_at as string).getTime();
    expect(end).toBeGreaterThan(before + 29 * 24 * 3600 * 1000);
    expect(end).toBeLessThan(before + 31 * 24 * 3600 * 1000);
    expect(tables.minute_balances?.[0]).toMatchObject({ user_id: "user-1", balance_minutes: 40 });
    expect(tables.minute_ledger).toHaveLength(1);
    expect(tables.minute_ledger?.[0]).toMatchObject({ kind: "grant", minutes: 40, idempotency_key: "grant:subscription:ocs_1:activation" });
    // The checkout payments row (keyed by subscription id) moves to paid.
    expect(tables.payments[0]!.status).toBe("paid");
  });

  it("is idempotent: the same activation key grants once even when settled twice", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
      subscriptions: [aSubscription()],
      payments: [],
    };
    const sub = tables.subscriptions[0] as unknown as SubscriptionRow;
    await settleSubscriptionCycle(fakeAdmin(tables), sub, {
      periodStart: null,
      periodEnd: null,
      chargeId: "cfpay-auth-1",
      grantKey: subscriptionActivationGrantKey("ocs_1"),
    });
    await settleSubscriptionCycle(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, {
      periodStart: null,
      periodEnd: null,
      chargeId: "cfpay-auth-1",
      grantKey: subscriptionActivationGrantKey("ocs_1"),
    });
    expect(tables.minute_ledger).toHaveLength(1);
    expect(tables.minute_balances?.[0]).toMatchObject({ balance_minutes: 40 });
  });

  it("a renewal charge grants a fresh cycle under its own charge key", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }],
      subscriptions: [aSubscription({ status: "active", period_start: "2026-11-14T00:00:00Z", period_end: "2026-12-14T00:00:00Z" })],
      payments: [],
    };
    // Seed the first cycle's grant so the renewal is the second grant.
    (tables.minute_ledger ??= []).push({ user_id: "user-1", kind: "grant", minutes: 40, idempotency_key: "grant:subscription:ocs_1:activation" });
    (tables.minute_balances ??= []).push({ user_id: "user-1", balance_minutes: 40 });
    const settled = await settleSubscriptionCycle(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, {
      periodStart: "2026-12-14T00:00:00Z",
      periodEnd: "2027-01-13T00:00:00Z",
      chargeId: "cfpay-renew-1",
      grantKey: subscriptionChargeGrantKey("ocs_1", "cfpay-renew-1"),
    });
    expect(settled.status).toBe("active");
    expect(settled.last_charge_id).toBe("cfpay-renew-1");
    expect(tables.minute_balances?.[0]).toMatchObject({ balance_minutes: 80 });
    expect(tables.minute_ledger).toHaveLength(2);
  });

  it("a refunded charge never grants, even when its success event is re-sent", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }],
      subscriptions: [aSubscription({ status: "active", refunded_charge_ids: ["cfpay-renew-9"] })],
      payments: [],
    };
    const settled = await settleSubscriptionCycle(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, {
      periodStart: "2026-12-14T00:00:00Z",
      periodEnd: "2027-01-13T00:00:00Z",
      chargeId: "cfpay-renew-9",
      grantKey: subscriptionChargeGrantKey("ocs_1", "cfpay-renew-9"),
    });
    expect(tables.minute_ledger ?? []).toHaveLength(0);
    expect(settled.last_charge_id).toBeNull();
  });
});

describe("cancel / expire / past-due", () => {
  it("cancel keeps the plan and the paid period end (access to period end)", async () => {
    const expiry = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: expiry }],
      subscriptions: [aSubscription({ status: "active", period_end: expiry })],
    };
    const cancelled = await markSubscriptionCancelled(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelled_at).toBeTruthy();
    expect(tables.profiles[0]).toMatchObject({ plan: "starter", plan_expires_at: expiry });
    expect(tables.minute_ledger ?? []).toHaveLength(0);
  });

  it("expiry shortens the stored expiry to the period end; the plan row itself stays", async () => {
    const stored = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: stored }],
      subscriptions: [aSubscription({ status: "active", period_end: periodEnd })],
    };
    const expired = await markSubscriptionExpired(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, periodEnd);
    expect(expired.status).toBe("expired");
    expect(tables.profiles[0]!.plan).toBe("starter");
    expect(tables.profiles[0]!.plan_expires_at).toBe(periodEnd);
  });

  it("past-due grants nothing and keeps the plan", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString() }],
      subscriptions: [aSubscription({ status: "active" })],
    };
    const pastDue = await markSubscriptionPastDue(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, "cfpay-fail-1");
    expect(pastDue.status).toBe("past_due");
    expect(pastDue.last_charge_id).toBe("cfpay-fail-1");
    expect(tables.minute_ledger ?? []).toHaveLength(0);
  });
});

describe("plan refunds", () => {
  it("a paid plan payment is marked refunded; the plan and period are untouched", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: "2026-12-11T00:00:00Z" }],
      payments: [aPayment()],
    };
    const refunded = await settlePlanRefunded(fakeAdmin(tables), tables.payments[0] as unknown as PaymentRow);
    expect(refunded.status).toBe("refunded");
    expect(tables.profiles[0]).toMatchObject({ plan: "starter", plan_expires_at: "2026-12-11T00:00:00Z" });
    // A refunded payment never settles again: a second refund is a no-op.
    const again = await settlePlanRefunded(fakeAdmin(tables), tables.payments[0] as unknown as PaymentRow);
    expect(again.status).toBe("refunded");
  });

  it("a payment that was never paid has nothing to refund", async () => {
    const tables: Record<string, Row[]> = { payments: [aPayment({ status: "created" })] };
    const out = await settlePlanRefunded(fakeAdmin(tables), tables.payments[0] as unknown as PaymentRow);
    expect(out.status).toBe("created");
  });

  it("recordSubscriptionRefund records the charge id so its grant is blocked", async () => {
    const tables: Record<string, Row[]> = {
      subscriptions: [aSubscription({ status: "active" })],
      payments: [aPayment({ cf_payment_id: "cfpay-renew-1" })],
    };
    const sub = await recordSubscriptionRefund(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, "cfpay-renew-1");
    expect(sub.refunded_charge_ids).toContain("cfpay-renew-1");
    expect(tables.payments[0]!.status).toBe("refunded");
    // Recording the same refund twice does not duplicate the id.
    const again = await recordSubscriptionRefund(fakeAdmin(tables), tables.subscriptions[0] as unknown as SubscriptionRow, "cfpay-renew-1");
    expect(again.refunded_charge_ids).toHaveLength(1);
  });
});

describe("subscription lookup + event log", () => {
  it("find returns null (not an error) when the subscriptions table is not applied yet", async () => {
    const tables: Record<string, Row[]> = {};
    const found = await findSubscriptionByCfId(
      fakeAdmin(tables, { subscriptions: { code: "42P01", message: 'relation "public.subscriptions" does not exist' } }),
      "ocs_1",
    );
    expect(found).toBeNull();
  });

  it("recordSubscription inserts the row", async () => {
    const tables: Record<string, Row[]> = {};
    const row = await recordSubscription(fakeAdmin(tables), {
      ownerId: "user-1",
      cfSubscriptionId: "ocs_9",
      cfPlanId: "cf-plan-pro",
      plan: "pro",
      amount: 749,
      currency: "INR",
    });
    expect(row.cf_subscription_id).toBe("ocs_9");
    expect(row.status).toBe("initialized");
    expect(tables.subscriptions).toHaveLength(1);
  });

  it("the event log dedupes whole deliveries; different statuses have different keys", async () => {
    const tables: Record<string, Row[]> = {};
    const admin = fakeAdmin(tables);
    const keyA = webhookEventKey({ idempotencyHeader: null, type: "SUBSCRIPTION_STATUS_CHANGED", subscriptionId: "ocs_1", status: "ACTIVE", chargeId: null });
    const keyB = webhookEventKey({ idempotencyHeader: null, type: "SUBSCRIPTION_STATUS_CHANGED", subscriptionId: "ocs_1", status: "CANCELLED", chargeId: null });
    expect(keyA).not.toBe(keyB);
    expect(await findWebhookEvent(admin, keyA)).toBe(false);
    await recordWebhookEvent(admin, { key: keyA, type: "SUBSCRIPTION_STATUS_CHANGED", subscriptionId: "ocs_1" });
    expect(await findWebhookEvent(admin, keyA)).toBe(true);
    expect(await findWebhookEvent(admin, keyB)).toBe(false);
    // A re-record of the same key is swallowed (audit-only, never fatal).
    await recordWebhookEvent(admin, { key: keyA, type: "SUBSCRIPTION_STATUS_CHANGED", subscriptionId: "ocs_1" });
    expect(await findWebhookEvent(admin, keyA)).toBe(true);
    // The Cashfree idempotency header, when present, is the key.
    expect(webhookEventKey({ idempotencyHeader: "hdr-123", type: "SUBSCRIPTION_PAYMENT_SUCCESS", subscriptionId: "ocs_1", status: "ACTIVE", chargeId: "cfpay-1" })).toBe("hdr:hdr-123");
  });
});
