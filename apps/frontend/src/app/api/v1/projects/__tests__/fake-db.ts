/**
 * Minimal chainable stand-in for the Supabase query builder, as the projects
 * routes use it (select with count / insert / update with eq + is + contains
 * filters, order, range, single / maybeSingle). Adapted from the growth
 * routes' fake-db pattern.
 *
 * `missingOrg: true` simulates the not-yet-applied A15 migration: any query
 * that NAMES the folder/tags columns fails the way PostgREST reports it —
 * a select naming them gets the Postgres 42703 shape, an insert/update
 * carrying them gets the PGRST204 schema-cache shape. Queries that never
 * mention folder/tags succeed, exactly like the real pre-APPLY database.
 */

export type Row = Record<string, unknown>;

export interface FakeState {
  tables: Record<string, Row[]>;
  missingOrg: boolean;
  inserts: Array<{ table: string; row: Row }>;
  updates: Array<{ table: string; row: Row }>;
  selects: Array<{ table: string; columns: string }>;
  seq: number;
}

export const makeState = (tables: Record<string, Row[]> = {}): FakeState => ({
  tables: { projects: [], profiles: [{ id: "user-1", plan: "free" }], ...tables },
  missingOrg: false,
  inserts: [],
  updates: [],
  selects: [],
  seq: 0,
});

const selectMissingError = { code: "42703", message: "column projects.folder does not exist" };
const writeMissingError = { code: "PGRST204", message: "Could not find the 'folder' column of 'projects' in the schema cache" };

const TS = "2026-11-10T06:00:00.000Z";

class FakeBuilder {
  private mode: "select" | "insert" | "update" = "select";
  private filters: Array<{ kind: "eq" | "is" | "contains"; col: string; val: unknown }> = [];
  private rangeSpec: { from: number; to: number } | null = null;
  private inserted: Row | null = null;
  private updateRow: Row | null = null;
  private columns = "";
  private error: { code: string; message: string } | null = null;

  constructor(
    private state: FakeState,
    private table: string,
  ) {}

  private orgTouchedByColumns(): boolean {
    return /(^|,)\s*(folder|tags)\s*(,|$)/.test(this.columns);
  }

  private orgTouchedByRow(row: Row | null): boolean {
    return !!row && ("folder" in row || "tags" in row);
  }

  select(columns?: string) {
    if (typeof columns === "string") {
      this.columns = columns;
      this.state.selects.push({ table: this.table, columns });
      if (this.state.missingOrg && this.table === "projects" && this.orgTouchedByColumns()) this.error = selectMissingError;
    }
    return this;
  }

  insert(row: Row) {
    this.mode = "insert";
    if (this.state.missingOrg && this.table === "projects" && this.orgTouchedByRow(row)) {
      this.error = writeMissingError;
      return this;
    }
    this.state.inserts.push({ table: this.table, row });
    const full: Row = {
      id: `00000000-0000-4000-8000-${String(++this.state.seq).padStart(12, "0")}`,
      status: "CREATED",
      description: null,
      style: null,
      look_id: null,
      template_id: null,
      thumbnail_url: null,
      language: null,
      aspect_ratio: null,
      platform: null,
      archived_at: null,
      deleted_at: null,
      composition_json: null,
      created_at: TS,
      updated_at: TS,
      ...row,
    };
    this.state.tables[this.table]!.push(full);
    this.inserted = full;
    return this;
  }

  update(row: Row) {
    this.mode = "update";
    this.updateRow = row;
    if (this.state.missingOrg && this.table === "projects" && this.orgTouchedByRow(row)) this.error = writeMissingError;
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  is(col: string, val: unknown) {
    this.filters.push({ kind: "is", col, val });
    return this;
  }

  contains(col: string, val: unknown) {
    this.filters.push({ kind: "contains", col, val });
    return this;
  }

  order() {
    return this;
  }

  range(from: number, to: number) {
    this.rangeSpec = { from, to };
    return this;
  }

  private matches = (row: Row) =>
    this.filters.every((f) => {
      if (f.kind === "contains") {
        const arr = row[f.col];
        return Array.isArray(arr) && Array.isArray(f.val) && f.val.every((v) => arr.includes(v));
      }
      return row[f.col] === f.val;
    });

  private runSelect(): Row[] {
    let rows = (this.state.tables[this.table] ?? []).filter(this.matches);
    if (this.rangeSpec) rows = rows.slice(this.rangeSpec.from, this.rangeSpec.to + 1);
    return rows;
  }

  private runUpdate(): Row[] {
    if (!this.updateRow) return [];
    this.state.updates.push({ table: this.table, row: this.updateRow });
    const hit = (this.state.tables[this.table] ?? []).filter(this.matches);
    for (const r of hit) Object.assign(r, this.updateRow);
    return hit;
  }

  async maybeSingle() {
    if (this.error) return { data: null, error: this.error };
    if (this.mode === "insert") return { data: this.inserted, error: null };
    if (this.mode === "update") return { data: this.runUpdate()[0] ?? null, error: null };
    return { data: this.runSelect()[0] ?? null, error: null };
  }

  async single() {
    if (this.error) return { data: null, error: this.error };
    if (this.mode === "insert") return { data: this.inserted, error: null };
    if (this.mode === "update") {
      const hit = this.runUpdate();
      return hit[0] ? { data: hit[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    const hit = this.runSelect();
    return hit[0] ? { data: hit[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
  }

  then(onOk: (v: { data: unknown; count: number | null; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
    if (this.error) return Promise.resolve({ data: null, count: null, error: this.error }).then(onOk, onErr);
    if (this.mode === "update") this.runUpdate();
    if (this.mode === "insert") return Promise.resolve({ data: null, count: null, error: null }).then(onOk, onErr);
    const rows = this.runSelect();
    return Promise.resolve({ data: rows, count: rows.length, error: null }).then(onOk, onErr);
  }
}

export const fakeDb = (state: FakeState) => ({
  from: (table: string) => new FakeBuilder(state, table),
});
