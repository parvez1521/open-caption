// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../route";

/**
 * Subscription webhooks end-to-end (fake service-role client): an
 * activation grants the cycle minutes once, auth + first-charge in
 * either order still grant once, a duplicate delivery grants once, a
 * renewal charge grants a fresh cycle, a failed charge marks past-due
 * and grants nothing, cancel keeps access to period end, expiry ends
 * the row, a refunded charge never grants again, and a plan-order
 * refund marks the payment refunded without touching the plan.
 * The exact Cashfree payload shape is unverified live, so these tests
 * use the documented 2025-01-01 shape (data.subscription +
 * data.payment); the handler also reads the older flat spellings.
 */
type Row = Record<string, unknown>;

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
  in(col: string, vals: unknown[]) {
    this.filters.push([col, vals]);
    return this;
  }
  order() {
    return this;
  }
  then(resolve: (v: { data: null; error: null }) => void) {
    if (this.updateRow) {
      const row = (this.tables[this.table] ?? []).find((r) => this.filters.every(([c, v]) => r[c] === v));
      if (row) Object.assign(row, this.updateRow);
    }
    if (this.insertRow) {
      const clash = (this.tables[this.table] ?? []).find(
        (r) => (this.insertRow!.event_key && r.event_key === this.insertRow!.event_key) || (this.insertRow!.cf_subscription_id && r.cf_subscription_id === this.insertRow!.cf_subscription_id),
      );
      if (clash) {
        resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } as never });
        return;
      }
      const row: Row = { id: `row-${(this.tables[this.table] ?? []).length + 1}`, ...this.insertRow };
      (this.tables[this.table] ??= []).push(row);
    }
    resolve({ data: null, error: null });
  }
  async maybeSingle() {
    const rows = (this.tables[this.table] ?? []).filter((r) => this.filters.every(([c, v]) => r[c] === v));
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

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: () => ({
    from: (t: string) => new FakeBuilder(state.tables, t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "grant_cycle_minutes") throw new Error(`fake rpc: unknown function ${fn}`);
      const userId = args.p_user_id as string;
      const key = args.p_idempotency_key as string;
      const ledger = (state.tables.minute_ledger ??= []);
      const balances = (state.tables.minute_balances ??= []);
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
  }),
  getUserClient: () => {
    throw new Error("not used");
  },
}));

const SECRET = "test-signing-value-123";
const sign = (ts: string, body: string) => createHmac("sha256", SECRET).update(ts + body).digest("base64");

const subEvent = (
  type: string,
  sub: Record<string, unknown>,
  payment?: Record<string, unknown>,
) => JSON.stringify({ type, data: { subscription: sub, ...(payment ? { payment } : {}) } });

const call = (body: string, ts = "1700000000") =>
  POST(
    new Request("https://example.test/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-webhook-signature": sign(ts, body), "x-webhook-timestamp": ts },
      body,
    }),
  );

const aSubscription = (over: Record<string, unknown> = {}): Row => ({
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

const aPayment = (over: Record<string, unknown> = {}): Row => ({
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

beforeEach(() => {
  process.env.CASHFREE_WEBHOOK_SECRET = SECRET;
  state.tables = {
    profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
    subscriptions: [aSubscription()],
    payments: [aPayment(), aPayment({ id: "pay-sub-1", cf_order_id: "ocs_1", product: "subscription", status: "created", paid_at: null, period_start: null, period_end: null })],
  };
});

describe("subscription webhook", () => {
  it("SUBSCRIPTION_PAYMENT_SUCCESS activates and grants the cycle minutes once", async () => {
    const res = await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z", subscription_first_charge_time: "2026-11-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    expect(res.status).toBe(200);
    expect(state.tables.subscriptions[0]!.status).toBe("active");
    expect(state.tables.subscriptions[0]!.period_end).toBe("2026-12-14T00:00:00Z");
    expect(state.tables.profiles[0]!.plan).toBe("starter");
    expect(state.tables.profiles[0]!.plan_expires_at).toBe("2026-12-14T00:00:00Z");
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.minute_ledger[0]).toMatchObject({ kind: "grant", minutes: 40, idempotency_key: "grant:subscription:ocs_1:activation" });
    expect(state.tables.minute_balances[0]).toMatchObject({ balance_minutes: 40 });
    expect(state.tables.webhook_events).toHaveLength(1);
  });

  it("auth success then first-charge success still grant once (one activation key)", async () => {
    await call(
      subEvent("SUBSCRIPTION_AUTH_STATUS", {
        subscription_id: "ocs_1",
        subscription_status: "ACTIVE",
        next_schedule_date: "2026-12-14T00:00:00Z",
        authorisation_details: { authorization_status: "SUCCESS", payment_id: "cfpay-auth-1" },
      }),
    );
    const res = await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    expect(res.status).toBe(200);
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.minute_balances[0]).toMatchObject({ balance_minutes: 40 });
  });

  it("a duplicate delivery grants once (event log dedupe)", async () => {
    const body = subEvent(
      "SUBSCRIPTION_PAYMENT_SUCCESS",
      { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
      { cf_payment_id: "cfpay-1" },
    );
    await call(body);
    const res = await call(body);
    expect(res.status).toBe(200);
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.minute_balances[0]).toMatchObject({ balance_minutes: 40 });
    expect(state.tables.webhook_events).toHaveLength(1);
  });

  it("a renewal charge with a later period grants a fresh cycle", async () => {
    await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    const res = await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2027-01-13T00:00:00Z" },
        { cf_payment_id: "cfpay-2" },
      ),
    );
    expect(res.status).toBe(200);
    expect(state.tables.minute_ledger).toHaveLength(2);
    expect(state.tables.minute_balances[0]).toMatchObject({ balance_minutes: 80 });
    expect(state.tables.subscriptions[0]!.last_charge_id).toBe("cfpay-2");
  });

  it("a renewal charge for the already-granted cycle grants nothing", async () => {
    await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    // Same cycle end, different charge id (e.g. the first charge's
    // auth payment arriving late): no second grant.
    await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-other" },
      ),
    );
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.minute_balances[0]).toMatchObject({ balance_minutes: 40 });
  });

  it("SUBSCRIPTION_PAYMENT_FAILED marks past-due and grants nothing", async () => {
    await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    const res = await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_FAILED",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE" },
        { cf_payment_id: "cfpay-2" },
      ),
    );
    expect(res.status).toBe(200);
    expect(state.tables.subscriptions[0]!.status).toBe("past_due");
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.profiles[0]!.plan).toBe("starter");
  });

  it("SUBSCRIPTION_STATUS_CHANGED to CANCELLED keeps access to period end", async () => {
    await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    const expiryBefore = state.tables.profiles[0]!.plan_expires_at;
    const res = await call(subEvent("SUBSCRIPTION_STATUS_CHANGED", { subscription_id: "ocs_1", subscription_status: "CANCELLED" }));
    expect(res.status).toBe(200);
    expect(state.tables.subscriptions[0]!.status).toBe("cancelled");
    expect(state.tables.profiles[0]).toMatchObject({ plan: "starter", plan_expires_at: expiryBefore });
  });

  it("SUBSCRIPTION_STATUS_CHANGED to EXPIRED ends the row; the plan reads as Free after the period", async () => {
    state.tables.subscriptions[0] = aSubscription({ status: "active", period_end: "2026-12-14T00:00:00Z" });
    state.tables.profiles[0] = { id: "user-1", plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" };
    const res = await call(
      subEvent("SUBSCRIPTION_STATUS_CHANGED", { subscription_id: "ocs_1", subscription_status: "EXPIRED", next_schedule_date: "2026-12-14T00:00:00Z" }),
    );
    expect(res.status).toBe(200);
    expect(state.tables.subscriptions[0]!.status).toBe("expired");
    expect(state.tables.profiles[0]!.plan_expires_at).toBe("2026-12-14T00:00:00Z");
  });

  it("the legacy SUBSCRIPTION_NEW_PAYMENT alias also grants", async () => {
    const res = await call(
      subEvent(
        "SUBSCRIPTION_NEW_PAYMENT",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    expect(res.status).toBe(200);
    expect(state.tables.minute_ledger).toHaveLength(1);
  });

  it("a refunded charge never grants again, even when its success is re-sent", async () => {
    await call(
      subEvent(
        "SUBSCRIPTION_PAYMENT_SUCCESS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2026-12-14T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    const refund = await call(
      subEvent(
        "SUBSCRIPTION_REFUND_STATUS",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    expect(refund.status).toBe(200);
    expect((state.tables.subscriptions[0]!.refunded_charge_ids as string[])).toContain("cfpay-1");
    // The profile keeps its access to period end after the refund.
    expect(state.tables.profiles[0]!.plan).toBe("starter");
    // A re-sent success for the refunded charge grants nothing. It is
    // sent under the _WEBHOOK alias so it is not deduped by the event
    // log — the refund block itself must stop the grant.
    await call(
      subEvent(
        "SUBSCRIPTION_CHARGED_WEBHOOK",
        { subscription_id: "ocs_1", subscription_status: "ACTIVE", next_schedule_date: "2027-01-13T00:00:00Z" },
        { cf_payment_id: "cfpay-1" },
      ),
    );
    expect(state.tables.minute_ledger).toHaveLength(1);
  });

  it("REFUND_SUCCESS_WEBHOOK for a paid plan order marks it refunded and keeps the plan", async () => {
    const body = JSON.stringify({
      type: "REFUND_SUCCESS_WEBHOOK",
      data: { order: { order_id: "oc_order1" }, payment: { cf_payment_id: "cfpay-1" } },
    });
    const res = await call(body);
    expect(res.status).toBe(200);
    expect(state.tables.payments[0]!.status).toBe("refunded");
    expect(state.tables.profiles[0]!.plan).toBe("free");
  });

  it("an unknown subscription is acknowledged without side effects", async () => {
    const res = await call(
      subEvent("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "ocs_unknown", subscription_status: "ACTIVE" }, { cf_payment_id: "cfpay-1" }),
    );
    expect(res.status).toBe(200);
    expect(state.tables.minute_ledger ?? []).toHaveLength(0);
  });

  it("a bad signature on a subscription event answers 401 and changes nothing", async () => {
    const body = subEvent("SUBSCRIPTION_PAYMENT_SUCCESS", { subscription_id: "ocs_1", subscription_status: "ACTIVE" }, { cf_payment_id: "cfpay-1" });
    const res = await POST(
      new Request("https://example.test/api/v1/billing/webhook", {
        method: "POST",
        headers: { "x-webhook-signature": "bogus", "x-webhook-timestamp": "1700000000" },
        body,
      }),
    );
    expect(res.status).toBe(401);
    expect(state.tables.subscriptions[0]!.status).toBe("initialized");
  });
});
