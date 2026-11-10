// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for the Brand Voice profiles API, with the database faked at
 * the module boundary (the same approach as the exports route test). The fake is
 * an in-memory brand_kits table behind a minimal chainable builder; flipping
 * `state.missingColumns` simulates the database before the voice migration —
 * any query naming `voice` / `is_active` then fails the way PostgREST fails it.
 */

const NOT_READY =
  "Brand voice profiles are not set up on the server yet — a database update is pending. Your colours and font still save from the Brand Kit page.";

type Row = Record<string, unknown> & { id: string; owner_id: string; created_at: string };

const state = vi.hoisted(() => ({
  userDb: null as unknown,
  rows: [] as Row[],
  missingColumns: false,
  seq: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: state.userDb }),
}));
vi.mock("@/services/api-client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import { GET, POST } from "../route";
import { DELETE, PUT } from "../[id]/route";
import { POST as ACTIVATE } from "../[id]/activate/route";

const missingError = (col: string) => ({ code: "42703", message: `column brand_kits.${col} does not exist` });

interface ExecResult {
  data: unknown;
  error: unknown;
}

/** Minimal chainable stand-in for the supabase query builder, as these routes use it. */
class FakeBuilder {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private selectCols = "";
  private returning = false;
  private payload: Record<string, unknown> | null = null;
  private filters: Array<{ col: string; val: unknown; neg: boolean }> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  select(cols?: string) {
    this.selectCols = cols ?? "";
    if (this.op !== "select") this.returning = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val, neg: false });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ col, val, neg: true });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(row: Record<string, unknown>) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(row: Record<string, unknown>) {
    this.op = "update";
    this.payload = row;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private missingCheck(): unknown {
    if (!state.missingColumns) return null;
    if (this.selectCols.includes("voice")) return missingError("voice");
    if (this.selectCols.includes("is_active")) return missingError("is_active");
    if (this.payload && "voice" in this.payload) return missingError("voice");
    if (this.payload && "is_active" in this.payload) return missingError("is_active");
    return null;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => (f.neg ? row[f.col] !== f.val : row[f.col] === f.val));
  }

  /** Only the selected columns come back — this is what makes the legacy (pre-migration) shape real in the GET fallback test. */
  private project(row: Row): Row {
    if (!this.selectCols || this.selectCols === "*") return row;
    const out: Record<string, unknown> = {};
    for (const col of this.selectCols.split(",").map((c) => c.trim())) {
      if (col in row) out[col] = row[col];
    }
    return out as Row;
  }

  private exec(): ExecResult {
    const miss = this.missingCheck();
    if (miss) return { data: null, error: miss };
    if (this.op === "insert") {
      state.seq += 1;
      const stamp = new Date(Date.UTC(2026, 0, 1) + state.seq * 60_000).toISOString();
      const row = { id: `profile-${state.seq}`, created_at: stamp, updated_at: stamp, ...(this.payload ?? {}) } as unknown as Row;
      state.rows.push(row);
      return { data: this.returning ? this.project({ ...row }) : null, error: null };
    }
    if (this.op === "update") {
      const matched = state.rows.filter((r) => this.matches(r));
      for (const row of matched) Object.assign(row, this.payload);
      return { data: this.returning ? matched.map((r) => this.project({ ...r })) : null, error: null };
    }
    if (this.op === "delete") {
      state.rows = state.rows.filter((r) => !this.matches(r));
      return { data: null, error: null };
    }
    let rows = state.rows.filter((r) => this.matches(r));
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const cmp = String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return { data: rows.map((r) => this.project({ ...r })), error: null };
  }

  async single(): Promise<ExecResult> {
    const res = this.exec();
    if (res.error) return res;
    if (Array.isArray(res.data)) {
      return res.data.length === 1
        ? { data: res.data[0], error: null }
        : { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
    }
    return res;
  }

  async maybeSingle(): Promise<ExecResult> {
    const res = this.exec();
    if (res.error) return res;
    if (Array.isArray(res.data)) return { data: res.data[0] ?? null, error: null };
    return res;
  }

  then(onOk: (v: ExecResult) => unknown, onErr?: (e: unknown) => unknown) {
    return Promise.resolve(this.exec()).then(onOk, onErr);
  }
}

const fakeDb = () => ({ from: () => new FakeBuilder() });

const seed = (over: Partial<Row>): Row => {
  const row: Row = {
    id: "p1",
    owner_id: "user-1",
    name: "Kit",
    colors: [],
    font_ids: [],
    voice: {},
    is_active: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
  state.rows.push(row);
  return row;
};

const jsonReq = (method: string, body?: unknown) =>
  new Request("http://localhost/api/v1/brand/profiles", {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const getProfiles = () => GET(jsonReq("GET"));
const postProfile = (body: unknown) => POST(jsonReq("POST", body));
const putProfile = (id: string, body: unknown) => PUT(jsonReq("PUT", body), ctx(id));
const deleteProfile = (id: string) => DELETE(jsonReq("DELETE"), ctx(id));
const activateProfile = (id: string) => ACTIVATE(jsonReq("POST"), ctx(id));

beforeEach(() => {
  state.rows = [];
  state.missingColumns = false;
  state.seq = 0;
  state.userDb = fakeDb();
});

describe("GET /brand/profiles", () => {
  it("lists the caller's profiles oldest-first with mapping, activeId and voiceReady", async () => {
    seed({ id: "p2", name: "Second", created_at: "2026-01-02T00:00:00Z", colors: ["#112233"], font_ids: ["font-9"], voice: { niche: "fitness" } });
    seed({ id: "p1", name: "First", created_at: "2026-01-01T00:00:00Z", is_active: true });
    seed({ id: "px", owner_id: "someone-else", name: "Not yours", created_at: "2025-12-31T00:00:00Z" });
    const res = await getProfiles();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { profiles: Array<Record<string, unknown>>; activeId: string; voiceReady: boolean } };
    expect(json.data.voiceReady).toBe(true);
    expect(json.data.activeId).toBe("p1");
    expect(json.data.profiles.map((p) => p.id)).toEqual(["p1", "p2"]); // oldest first, other owner's row excluded
    const second = json.data.profiles[1]!;
    expect(second.fontId).toBe("font-9"); // font_ids[0]
    expect(second.colors).toEqual(["#112233"]);
    expect((second.voice as { niche: string }).niche).toBe("fitness");
    expect(second.isActive).toBe(false);
  });

  it("returns an empty list honestly when the user has no profiles yet", async () => {
    const res = await getProfiles();
    const json = (await res.json()) as { data: { profiles: unknown[]; activeId: null; voiceReady: boolean } };
    expect(json.data).toEqual({ profiles: [], activeId: null, voiceReady: true });
  });

  it("degrades to the legacy shape when the voice columns do not exist yet", async () => {
    state.missingColumns = true;
    seed({ id: "p2", name: "Newer", created_at: "2026-01-02T00:00:00Z", voice: { niche: "stored but unreadable pre-migration" } });
    seed({ id: "p1", name: "Oldest", created_at: "2026-01-01T00:00:00Z", voice: { niche: "also unreadable" } });
    const res = await getProfiles();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { profiles: Array<{ id: string; isActive: boolean; voice: { niche: string } }>; activeId: string; voiceReady: boolean };
    };
    expect(json.data.voiceReady).toBe(false);
    expect(json.data.activeId).toBe("p1"); // the oldest kit is synthesised as active
    expect(json.data.profiles.map((p) => [p.id, p.isActive])).toEqual([
      ["p1", true],
      ["p2", false],
    ]);
    for (const p of json.data.profiles) expect(p.voice.niche).toBe(""); // empty voice, never invented
  });
});

describe("POST /brand/profiles", () => {
  it("makes the first-ever profile active automatically", async () => {
    const res = await postProfile({
      name: "Fitness",
      colors: ["#aabbcc"],
      fontId: "font-1",
      voice: { niche: "home fitness", wordsToAvoid: ["spam"] },
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: string; name: string; isActive: boolean; colors: string[]; fontId: string; voice: { niche: string } } };
    expect(json.data.name).toBe("Fitness");
    expect(json.data.isActive).toBe(true);
    expect(json.data.colors).toEqual(["#AABBCC"]); // normalised like the legacy brand route
    expect(json.data.fontId).toBe("font-1");
    expect(json.data.voice.niche).toBe("home fitness");
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]!.is_active).toBe(true);
  });

  it("keeps later profiles inactive unless makeActive asks, and then swaps the active one", async () => {
    seed({ id: "p1", is_active: true });
    const plain = await postProfile({ name: "Second" });
    const plainJson = (await plain.json()) as { data: { isActive: boolean } };
    expect(plainJson.data.isActive).toBe(false);
    expect(state.rows.find((r) => r.id === "p1")!.is_active).toBe(true);

    const swap = await postProfile({ name: "Third", makeActive: true });
    const swapJson = (await swap.json()) as { data: { id: string; isActive: boolean } };
    expect(swapJson.data.isActive).toBe(true);
    expect(state.rows.find((r) => r.id === "p1")!.is_active).toBe(false);
    expect(state.rows.find((r) => r.id === swapJson.data.id)!.is_active).toBe(true);
    expect(state.rows.filter((r) => r.is_active)).toHaveLength(1);
  });

  it("rejects invalid bodies with 422 and writes nothing", async () => {
    for (const body of [
      { name: "", colors: [] }, // name too short
      { name: "Ok", colors: ["red"] }, // not a hex colour
      { name: "Ok", colors: [], voice: { wordsToUse: Array.from({ length: 31 }, () => "x") } }, // too many voice items
      { name: "Ok", colors: [], voice: { niche: "x".repeat(501) } }, // voice string too long
    ]) {
      const res = await postProfile(body);
      expect(res.status).toBe(422);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("VALIDATION");
    }
    expect(state.rows).toHaveLength(0);
  });

  it("refuses with the pending-database message before the migration, and writes nothing", async () => {
    state.missingColumns = true;
    const res = await postProfile({ name: "Fitness", voice: { niche: "fitness" } });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INTERNAL");
    expect(json.error.message).toBe(NOT_READY);
    expect(state.rows).toHaveLength(0);
  });
});

describe("PUT /brand/profiles/:id", () => {
  it("updates fields and merges a partial voice over the stored one", async () => {
    seed({ id: "p1", name: "Old name", voice: { niche: "fitness", tone: "calm", wordsToUse: ["progress"] } });
    const res = await putProfile("p1", { name: "New name", voice: { tone: "bold" } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { name: string; voice: { niche: string; tone: string; wordsToUse: string[] } } };
    expect(json.data.name).toBe("New name");
    expect(json.data.voice.tone).toBe("bold");
    expect(json.data.voice.niche).toBe("fitness"); // untouched voice fields survive a partial patch
    expect(json.data.voice.wordsToUse).toEqual(["progress"]);
  });

  it("404s for a profile that is not the caller's, and 422s an empty patch", async () => {
    seed({ id: "p1", owner_id: "someone-else" });
    const missing = await putProfile("p1", { name: "X" });
    expect(missing.status).toBe(404);
    seed({ id: "p2" });
    const empty = await putProfile("p2", {});
    expect(empty.status).toBe(422);
  });
});

describe("DELETE /brand/profiles/:id", () => {
  it("promotes the oldest remaining profile when the active one is deleted", async () => {
    seed({ id: "p1", is_active: true, created_at: "2026-01-01T00:00:00Z" });
    seed({ id: "p2", created_at: "2026-01-02T00:00:00Z" });
    seed({ id: "p3", created_at: "2026-01-03T00:00:00Z" });
    const res = await deleteProfile("p1");
    expect(res.status).toBe(200);
    expect(state.rows.map((r) => r.id)).toEqual(["p2", "p3"]);
    expect(state.rows.find((r) => r.id === "p2")!.is_active).toBe(true);
    expect(state.rows.find((r) => r.id === "p3")!.is_active).toBe(false);
  });

  it("leaves the active profile alone when an inactive one is deleted, and allows deleting the last one", async () => {
    seed({ id: "p1", is_active: true });
    seed({ id: "p2", created_at: "2026-01-02T00:00:00Z" });
    await deleteProfile("p2");
    expect(state.rows.find((r) => r.id === "p1")!.is_active).toBe(true);
    const last = await deleteProfile("p1");
    expect(last.status).toBe(200);
    expect(state.rows).toHaveLength(0); // none left is an allowed end state
  });

  it("404s for an unknown profile", async () => {
    const res = await deleteProfile("nope");
    expect(res.status).toBe(404);
  });
});

describe("POST /brand/profiles/:id/activate", () => {
  it("activates the target and deactivates every other profile", async () => {
    seed({ id: "p1", is_active: true });
    seed({ id: "p2", created_at: "2026-01-02T00:00:00Z" });
    const res = await activateProfile("p2");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { activeId: string } };
    expect(json.data.activeId).toBe("p2");
    expect(state.rows.find((r) => r.id === "p2")!.is_active).toBe(true);
    expect(state.rows.find((r) => r.id === "p1")!.is_active).toBe(false);
  });

  it("404s for an unknown profile and changes nothing", async () => {
    seed({ id: "p1", is_active: true });
    const res = await activateProfile("nope");
    expect(res.status).toBe(404);
    expect(state.rows.find((r) => r.id === "p1")!.is_active).toBe(true);
  });

  it("refuses with the pending-database message before the migration, and changes nothing", async () => {
    state.missingColumns = true;
    seed({ id: "p1", is_active: true });
    seed({ id: "p2", created_at: "2026-01-02T00:00:00Z" });
    const res = await activateProfile("p2");
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INTERNAL");
    expect(json.error.message).toBe(NOT_READY);
    expect(state.rows.find((r) => r.id === "p1")!.is_active).toBe(true);
    expect(state.rows.find((r) => r.id === "p2")!.is_active).toBe(false);
  });
});
