// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../route";

/**
 * Subscription reconcile: Cashfree server-side is the truth. An
 * ACTIVE subscription with a not-yet-active row settles the first
 * cycle; an ACTIVE one with a newer period grants the renewal; the
 * same period grants nothing new; CANCELLED keeps access to period
 * end; EXPIRED ends the row. Another user's subscription is not
 * found.
 */
type Row = Record<string, unknown>;

class FakeBuilder {
  private filters: Array<[string, unknown]> = [];
  private updateRow: Row | null = null;
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
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  then(resolve: (v: { data: null; error: null }) => void) {
    if (this.updateRow) {
      const row = (this.tables[this.table] ?? []).find((r) => this.filters.every(([c, v]) => r[c] === v));
      if (row) Object.assign(row, this.updateRow);
    }
    resolve({ data: null, error: null });
  }
  async maybeSingle() {
    const rows = (this.tables[this.table] ?? []).filter((r) => this.filters.every(([c, v]) => r[c] === v));
    if (this.updateRow) {
      const row = rows[0];
      if (!row) return { data: null, error: null };
      Object.assign(row, this.updateRow);
      return { data: row, error: null };
    }
    return { data: rows[0] ?? null, error: null };
  }
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  fetched: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", email: "user@example.test", token: "tok", guest: false, db: {} }),
}));

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
}));

vi.mock("@/lib/billing/cashfreeSubscriptions", () => ({
  fetchCashfreeSubscription: async () => {
    if (!state.fetched) throw new Error("fetchCashfreeSubscription not stubbed");
    return state.fetched;
  },
}));

vi.mock("@/lib/billing/cashfree", () => ({
  fetchCashfreeOrder: async () => ({ status: "ACTIVE", paymentId: null, amount: null }),
}));

const call = (body: Record<string, unknown>) =>
  POST(
    new Request("https://example.test/api/v1/billing/reconcile", {
      method: "POST",
      headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

beforeEach(() => {
  state.tables = {
    profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
    subscriptions: [aSubscription()],
    payments: [],
  };
  state.fetched = null;
});

describe("billing reconcile (subscriptions)", () => {
  it("settles the first cycle when Cashfree says ACTIVE", async () => {
    state.fetched = {
      status: "active",
      rawStatus: "ACTIVE",
      planId: "cf-plan-starter",
      nextChargeAt: "2026-12-14T00:00:00Z",
      periodStart: "2026-11-14T00:00:00Z",
      periodEnd: "2026-12-14T00:00:00Z",
      authorizationPaymentId: "cfpay-1",
    };
    const res = await call({ subscriptionId: "ocs_1" });
    const body = (await res.json()) as { success: boolean; data?: { subscription?: Record<string, unknown>; cashfreeStatus?: string } };
    expect(res.status).toBe(200);
    expect(body.data?.cashfreeStatus).toBe("active");
    expect(body.data?.subscription?.status).toBe("active");
    expect(state.tables.profiles[0]!.plan).toBe("starter");
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.minute_ledger[0]).toMatchObject({ minutes: 40, idempotency_key: "grant:subscription:ocs_1:activation" });
  });

  it("grants a renewal when Cashfree shows a newer period, and nothing when the period is the same", async () => {
    state.tables.subscriptions[0] = aSubscription({ status: "active", period_start: "2026-11-14T00:00:00Z", period_end: "2026-12-14T00:00:00Z" });
    state.tables.profiles[0] = { id: "user-1", plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" };
    (state.tables.minute_ledger ??= []).push({ user_id: "user-1", kind: "grant", minutes: 40, idempotency_key: "grant:subscription:ocs_1:activation" });
    (state.tables.minute_balances ??= []).push({ user_id: "user-1", balance_minutes: 40 });
    state.fetched = {
      status: "active",
      rawStatus: "ACTIVE",
      planId: "cf-plan-starter",
      nextChargeAt: "2027-01-13T00:00:00Z",
      periodStart: "2026-12-14T00:00:00Z",
      periodEnd: "2027-01-13T00:00:00Z",
      authorizationPaymentId: null,
    };
    const res = await call({ subscriptionId: "ocs_1" });
    expect(res.status).toBe(200);
    expect(state.tables.minute_ledger).toHaveLength(2);
    expect(state.tables.minute_balances[0]).toMatchObject({ balance_minutes: 80 });
    expect(state.tables.subscriptions[0]!.period_end).toBe("2027-01-13T00:00:00Z");

    // Same period again: no new grant.
    state.fetched = { ...state.fetched, nextChargeAt: "2027-01-13T00:00:00Z", periodEnd: "2027-01-13T00:00:00Z" };
    await call({ subscriptionId: "ocs_1" });
    expect(state.tables.minute_ledger).toHaveLength(2);
  });

  it("marks the row cancelled when Cashfree says CANCELLED, and keeps the plan", async () => {
    state.tables.subscriptions[0] = aSubscription({ status: "active", period_end: "2026-12-14T00:00:00Z" });
    state.tables.profiles[0] = { id: "user-1", plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" };
    state.fetched = { status: "cancelled", rawStatus: "CANCELLED", planId: null, nextChargeAt: null, periodStart: null, periodEnd: "2026-12-14T00:00:00Z", authorizationPaymentId: null };
    const res = await call({ subscriptionId: "ocs_1" });
    expect(res.status).toBe(200);
    expect(state.tables.subscriptions[0]!.status).toBe("cancelled");
    expect(state.tables.profiles[0]).toMatchObject({ plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" });
    expect(state.tables.minute_ledger ?? []).toHaveLength(0);
  });

  it("marks the row expired when Cashfree says EXPIRED", async () => {
    state.fetched = { status: "expired", rawStatus: "EXPIRED", planId: null, nextChargeAt: null, periodStart: null, periodEnd: "2026-12-14T00:00:00Z", authorizationPaymentId: null };
    const res = await call({ subscriptionId: "ocs_1" });
    expect(res.status).toBe(200);
    expect(state.tables.subscriptions[0]!.status).toBe("expired");
  });

  it("does not find another user's subscription", async () => {
    state.tables.subscriptions[0] = aSubscription({ owner_id: "user-2" });
    state.fetched = { status: "active", rawStatus: "ACTIVE", planId: null, nextChargeAt: null, periodStart: null, periodEnd: null, authorizationPaymentId: null };
    const res = await call({ subscriptionId: "ocs_1" });
    expect(res.status).toBe(404);
  });

  it("requires an orderId or a subscriptionId", async () => {
    const res = await call({});
    expect(res.status).toBe(422);
  });
});
