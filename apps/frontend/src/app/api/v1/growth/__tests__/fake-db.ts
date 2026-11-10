/**
 * Minimal chainable stand-in for the Supabase query builder, as the growth
 * routes use it (select / insert — including the import route's array
 * insert — / update / delete with eq filters, order, limit, single /
 * maybeSingle). Copied from the content route tests' fake-db pattern and
 * adapted: default tables are growth_posts + competitor_profiles, and
 * `missing: true` simulates the not-yet-applied migration (PGRST205).
 */

export type Row = Record<string, unknown>;

export interface FakeState {
  tables: Record<string, Row[]>;
  missing: boolean;
  inserts: Array<{ table: string; row: Row }>;
  updates: Array<{ table: string; row: Row }>;
  deletes: Array<{ table: string }>;
  seq: number;
}

export const makeState = (tables: Record<string, Row[]> = {}): FakeState => ({
  tables: { growth_posts: [], competitor_profiles: [], ...tables },
  missing: false,
  inserts: [],
  updates: [],
  deletes: [],
  seq: 0,
});

const missingError = (table: string) => ({
  code: "PGRST205",
  message: `Could not find the table 'public.${table}' in the schema cache`,
});

const TS = "2026-11-10T06:00:00.000Z";

class FakeBuilder {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<[string, unknown]> = [];
  private orderSpec: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private inserted: Row | null = null;
  private updateRow: Row | null = null;
  private executed: Row[] | null = null;

  constructor(
    private state: FakeState,
    private table: string,
  ) {}

  select() {
    return this;
  }

  insert(row: Row | Row[]) {
    this.mode = "insert";
    const rows = Array.isArray(row) ? row : [row];
    for (const r of rows) {
      this.state.inserts.push({ table: this.table, row: r });
      const full: Row = {
        id: `00000000-0000-4000-8000-${String(++this.state.seq).padStart(12, "0")}`,
        created_at: TS,
        updated_at: TS,
        ...r,
      };
      this.state.tables[this.table]!.push(full);
      this.inserted ??= full;
    }
    return this;
  }

  update(row: Row) {
    this.mode = "update";
    this.updateRow = row;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }

  is() {
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matches = (row: Row) => this.filters.every(([c, v]) => row[c] === v);

  private runWrite(): Row[] {
    if (this.executed) return this.executed;
    const rows = this.state.tables[this.table]!;
    if (this.mode === "update") {
      this.state.updates.push({ table: this.table, row: this.updateRow ?? {} });
      const hit = rows.filter(this.matches);
      for (const r of hit) Object.assign(r, this.updateRow);
      this.executed = hit;
    } else if (this.mode === "delete") {
      this.state.deletes.push({ table: this.table });
      const hit = rows.filter(this.matches);
      this.state.tables[this.table] = rows.filter((r) => !this.matches(r));
      this.executed = hit;
    } else {
      this.executed = [];
    }
    return this.executed;
  }

  private runSelect(): Row[] {
    let rows = (this.state.tables[this.table] ?? []).filter(this.matches);
    if (this.orderSpec) {
      const { col, ascending } = this.orderSpec;
      rows = [...rows].sort((a, b) => {
        const cmp = String(a[col] ?? "").localeCompare(String(b[col] ?? ""));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  async maybeSingle() {
    if (this.state.missing) return { data: null, error: missingError(this.table) };
    if (this.mode === "insert") return { data: this.inserted, error: null };
    if (this.mode === "update" || this.mode === "delete") {
      const hit = this.runWrite();
      return { data: hit[0] ?? null, error: null };
    }
    return { data: this.runSelect()[0] ?? null, error: null };
  }

  async single() {
    if (this.state.missing) return { data: null, error: missingError(this.table) };
    if (this.mode === "insert") return { data: this.inserted, error: null };
    if (this.mode === "update" || this.mode === "delete") {
      const hit = this.runWrite();
      return hit[0]
        ? { data: hit[0], error: null }
        : { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
    }
    const hit = this.runSelect();
    return hit[0]
      ? { data: hit[0], error: null }
      : { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
  }

  then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
    if (this.state.missing) return Promise.resolve({ data: null, error: missingError(this.table) }).then(onOk, onErr);
    if (this.mode === "insert") return Promise.resolve({ data: null, error: null }).then(onOk, onErr);
    if (this.mode === "update" || this.mode === "delete") {
      this.runWrite();
      return Promise.resolve({ data: null, error: null }).then(onOk, onErr);
    }
    return Promise.resolve({ data: this.runSelect(), error: null }).then(onOk, onErr);
  }
}

export const fakeDb = (state: FakeState) => ({
  from: (table: string) => new FakeBuilder(state, table),
});
