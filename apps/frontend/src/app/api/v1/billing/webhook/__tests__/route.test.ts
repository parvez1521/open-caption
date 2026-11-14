// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../route";
import type { PaymentRow } from "@/lib/billing/settle";

/**
 * The webhook end-to-end (with a fake service-role client): a correctly
 * signed PAYMENT_SUCCESS settles the payment and grants the plan; the same
 * event delivered twice (Cashfree retries) settles once; a bad signature
 * changes nothing; a failed payment never grants.
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

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: () => ({
    from: (t: string) => new FakeBuilder(state.tables, t),
    // Minutes grant only: the in-memory grant_cycle_minutes. A grant
    // with a key already in minute_ledger is a no-op (idempotent by key).
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

const event = (type: string, orderId: string, paymentId = "cfpay-1") =>
  JSON.stringify({ type, data: { order: { order_id: orderId }, payment: { cf_payment_id: paymentId, payment_status: type.includes("SUCCESS") ? "SUCCESS" : "FAILED" } } });

const call = (body: string, ts = "1700000000") =>
  POST(
    new Request("https://example.test/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-webhook-signature": sign(ts, body), "x-webhook-timestamp": ts },
      body,
    }),
  );

const aPayment = (over: Partial<PaymentRow> = {}): Row => ({
  id: "pay-1",
  owner_id: "user-1",
  cf_order_id: "oc_order1",
  cf_payment_id: null,
  plan: "growth",
  amount: 499,
  currency: "INR",
  status: "created",
  created_at: "2026-11-11T00:00:00Z",
  paid_at: null,
  period_start: null,
  period_end: null,
  ...over,
});

beforeEach(() => {
  process.env.CASHFREE_WEBHOOK_SECRET = SECRET;
  state.tables = {
    profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
    payments: [aPayment()],
  };
});

describe("billing webhook", () => {
  it("a signed PAYMENT_SUCCESS settles the payment and grants the plan", async () => {
    const res = await call(event("PAYMENT_SUCCESS_WEBHOOK", "oc_order1"));
    expect(res.status).toBe(200);
    expect(state.tables.payments[0]!.status).toBe("paid");
    expect(state.tables.payments[0]!.cf_payment_id).toBe("cfpay-1");
    // The payment row keeps the old "growth" id as history, but the
    // profile is granted the plan it maps to today: Creator (2026-11-14
    // minutes model — a stored "growth" reads as Creator, never Free).
    expect(state.tables.profiles[0]!.plan).toBe("creator");
    expect(state.tables.profiles[0]!.plan_expires_at).toBeTruthy();
    // The settle also grants the Creator cycle minutes (100), once.
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.minute_ledger[0]).toMatchObject({ kind: "grant", minutes: 100, idempotency_key: "grant:payment:pay-1" });
    expect(state.tables.minute_balances[0]).toMatchObject({ user_id: "user-1", balance_minutes: 100 });
  });

  it("a duplicate delivery settles once (idempotent)", async () => {
    await call(event("PAYMENT_SUCCESS_WEBHOOK", "oc_order1"));
    const endAfterFirst = state.tables.profiles[0]!.plan_expires_at;
    const res = await call(event("PAYMENT_SUCCESS_WEBHOOK", "oc_order1"));
    expect(res.status).toBe(200);
    expect(state.tables.profiles[0]!.plan_expires_at).toBe(endAfterFirst);
    // The healing grant on the second delivery is a no-op by key.
    expect(state.tables.minute_ledger).toHaveLength(1);
    expect(state.tables.minute_balances[0]).toMatchObject({ balance_minutes: 100 });
  });

  it("a bad signature answers 401 and changes nothing", async () => {
    const body = event("PAYMENT_SUCCESS_WEBHOOK", "oc_order1");
    const res = await POST(
      new Request("https://example.test/api/v1/billing/webhook", {
        method: "POST",
        headers: { "x-webhook-signature": "bogus", "x-webhook-timestamp": "1700000000" },
        body,
      }),
    );
    expect(res.status).toBe(401);
    expect(state.tables.payments[0]!.status).toBe("created");
    expect(state.tables.profiles[0]!.plan).toBe("free");
  });

  it("PAYMENT_FAILED closes the payment and grants nothing", async () => {
    const res = await call(event("PAYMENT_FAILED_WEBHOOK", "oc_order1"));
    expect(res.status).toBe(200);
    expect(state.tables.payments[0]!.status).toBe("failed");
    expect(state.tables.profiles[0]!.plan).toBe("free");
  });

  it("an unknown order is acknowledged without side effects", async () => {
    const res = await call(event("PAYMENT_SUCCESS_WEBHOOK", "oc_unknown"));
    expect(res.status).toBe(200);
    expect(state.tables.profiles[0]!.plan).toBe("free");
  });
});
