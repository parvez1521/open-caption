// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { settleClosed, settlePaid, type PaymentRow } from "../settle";

/**
 * Settlement against a minimal fake of the service-role client: pins the
 * grant semantics — a paid webhook grants the plan for exactly 30 days, a
 * renewal of the SAME plan extends from the current period end, an early
 * plan SWITCH starts a fresh period, and terminal payments never move.
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

const fakeAdmin = (tables: Record<string, Row[]>) => ({
  from: (t: string) => new FakeBuilder(tables, t),
  // Minutes grant only: the in-memory grant_cycle_minutes. A grant with
  // a key already in minute_ledger is a no-op (idempotent by key).
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

const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: "pay-1",
  owner_id: "user-1",
  cf_order_id: "oc_1",
  cf_payment_id: null,
  plan: "starter",
  amount: 299,
  currency: "INR",
  status: "created",
  created_at: "2026-11-11T00:00:00Z",
  paid_at: null,
  period_start: null,
  period_end: null,
  ...over,
});

describe("settlePaid", () => {
  it("grants the plan and a 30-day period", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
      payments: [{ ...payment() }],
    };
    const before = Date.now();
    const settled = await settlePaid(fakeAdmin(tables), payment(), "cfpay-9");
    expect(settled.status).toBe("paid");
    expect(settled.cf_payment_id).toBe("cfpay-9");
    const profile = tables.profiles[0]!;
    expect(profile.plan).toBe("starter");
    const end = new Date(profile.plan_expires_at as string).getTime();
    expect(end).toBeGreaterThan(before + 29 * 24 * 3600 * 1000);
    expect(end).toBeLessThan(before + 31 * 24 * 3600 * 1000);
    // The settle grants the cycle's minutes with the payment (Starter 40).
    expect(tables.minute_balances?.[0]).toMatchObject({ user_id: "user-1", balance_minutes: 40 });
    expect(tables.minute_ledger).toHaveLength(1);
    expect(tables.minute_ledger?.[0]).toMatchObject({ kind: "grant", minutes: 40, idempotency_key: "grant:payment:pay-1" });
  });

  it("renewing the SAME plan extends from the current period end (no paid days eaten)", async () => {
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: future.toISOString() }],
      payments: [{ ...payment() }],
    };
    const settled = await settlePaid(fakeAdmin(tables), payment(), null);
    const end = new Date(settled.period_end!).getTime();
    // 10 remaining days + 30 new days ≈ 40 days out
    expect(end).toBeGreaterThan(future.getTime() + 29 * 24 * 3600 * 1000);
    expect(end).toBeLessThan(future.getTime() + 31 * 24 * 3600 * 1000);
  });

  it("switching plans starts a fresh 30-day period", async () => {
    const future = new Date(Date.now() + 20 * 24 * 3600 * 1000);
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: future.toISOString() }],
      payments: [{ ...payment({ plan: "growth" }) }],
    };
    const before = Date.now();
    const settled = await settlePaid(fakeAdmin(tables), payment({ plan: "growth" }), null);
    const end = new Date(settled.period_end!).getTime();
    expect(end).toBeLessThan(before + 31 * 24 * 3600 * 1000);
    // The payment row keeps the old "growth" id as history, but the
    // profile is granted the plan it maps to today: Creator (2026-11-14
    // minutes model — a stored "growth" reads as Creator, never Free).
    expect(tables.profiles[0]!.plan).toBe("creator");
    // ...and the minutes grant follows the mapped plan (Creator 100).
    expect(tables.minute_balances?.[0]).toMatchObject({ balance_minutes: 100 });
  });

  it("is idempotent: paid and terminal payments never settle again", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
      payments: [{ ...payment({ status: "paid" }) }],
    };
    const settled = await settlePaid(fakeAdmin(tables), payment({ status: "paid" }), "x");
    expect(settled.status).toBe("paid");
    expect(tables.profiles[0]!.plan).toBe("free"); // untouched
    const failed = await settlePaid(fakeAdmin(tables), payment({ status: "failed" }), "x");
    expect(failed.status).toBe("failed");
  });

  it("a paid payment re-settled later heals a missed minutes grant — once, never twice", async () => {
    const tables: Record<string, Row[]> = {
      profiles: [{ id: "user-1", plan: "starter", plan_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }],
      payments: [{ ...payment({ status: "paid", period_start: new Date().toISOString(), period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }) }],
    };
    await settlePaid(fakeAdmin(tables), payment({ status: "paid", period_start: tables.payments[0]!.period_start as string, period_end: tables.payments[0]!.period_end as string }), "x");
    expect(tables.minute_balances?.[0]).toMatchObject({ balance_minutes: 40 });
    await settlePaid(fakeAdmin(tables), payment({ status: "paid", period_start: tables.payments[0]!.period_start as string, period_end: tables.payments[0]!.period_end as string }), "x");
    expect(tables.minute_ledger).toHaveLength(1);
    expect(tables.minute_balances?.[0]).toMatchObject({ balance_minutes: 40 });
  });
});

describe("settleClosed", () => {
  it("closes a created payment and never a paid one", async () => {
    const tables: Record<string, Row[]> = { payments: [{ ...payment() }] };
    const closed = await settleClosed(fakeAdmin(tables), payment(), "failed");
    expect(closed.status).toBe("failed");
    const tables2: Record<string, Row[]> = { payments: [{ ...payment({ status: "paid" }) }] };
    const stillPaid = await settleClosed(fakeAdmin(tables2), payment({ status: "paid" }), "failed");
    expect(stillPaid.status).toBe("paid");
  });
});
