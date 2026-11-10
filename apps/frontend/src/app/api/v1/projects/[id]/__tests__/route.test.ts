// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for PATCH /projects/:id, with the database faked at the
 * module boundary (the same approach as the exports route test). These pin
 * the Stage-C activation plumbing (stageC.ts checklist step 3): the PATCH
 * allow-list accepts `composition_json` alongside `settings_json`, validates
 * it through CompositionSettingsSchema, and persists it when present — while
 * a malformed composition is rejected and nothing is written.
 */

const state = vi.hoisted(() => ({
  userDb: null as unknown,
  updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: state.userDb }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => state.userDb }));

import { CompositionSettingsSchema } from "@capseasy/shared";
import { PATCH } from "../route";

/** Minimal chainable stand-in for the supabase query builder, as this route uses it. */
class FakeBuilder {
  constructor(private table: string) {}
  select() { return this; }
  eq() { return this; }
  is() { return this; }
  update(row: Record<string, unknown>) {
    state.updates.push({ table: this.table, row });
    return this;
  }
  async maybeSingle() {
    const last = state.updates[state.updates.length - 1]?.row ?? {};
    return { data: { id: "proj-1", title: "My Video", status: "ready", ...last }, error: null };
  }
}

const fakeDb = () => ({ from: (table: string) => new FakeBuilder(table) });

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/v1/projects/proj-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj-1" }) },
  );

const VALID_COMPOSITION = {
  version: 1,
  videoSegments: [{ id: "seg-1", sourceInMs: 0, sourceOutMs: 12_000 }],
  markers: [{ id: "mk-1", atMs: 4_250, label: "Hook lands" }],
  tracks: {
    video: { locked: true, visible: true, muted: false },
    captions: { locked: false, visible: true, muted: false },
    text: { locked: false, visible: true, muted: false },
    graphics: { locked: false, visible: true, muted: false },
  },
};

beforeEach(() => {
  state.userDb = fakeDb();
  state.updates = [];
});

describe("PATCH /projects/:id — composition_json (Stage C step 3)", () => {
  it("accepts a valid composition_json and persists it on the projects row", async () => {
    const res = await patch({ composition_json: VALID_COMPOSITION });
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]!.table).toBe("projects");
    // persisted exactly in the schema's canonical form
    expect(state.updates[0]!.row.composition_json).toEqual(
      CompositionSettingsSchema.parse(VALID_COMPOSITION),
    );
    const json = (await res.json()) as { data: { composition_json: unknown } };
    expect(json.data.composition_json).toEqual(CompositionSettingsSchema.parse(VALID_COMPOSITION));
  });

  it("accepts composition_json alongside settings_json in one patch (the dual-write body)", async () => {
    const res = await patch({ settings_json: {}, composition_json: VALID_COMPOSITION });
    expect(res.status).toBe(200);
    expect(state.updates[0]!.row).toHaveProperty("settings_json");
    expect(state.updates[0]!.row.composition_json).toEqual(
      CompositionSettingsSchema.parse(VALID_COMPOSITION),
    );
  });

  it("fills schema defaults for a partial composition (canonical column form)", async () => {
    const res = await patch({ composition_json: { videoSegments: [{ id: "s1", sourceInMs: 0, sourceOutMs: 5000 }] } });
    expect(res.status).toBe(200);
    const persisted = state.updates[0]!.row.composition_json as { version: number; markers: unknown[] };
    expect(persisted.version).toBe(1);
    expect(persisted.markers).toEqual([]);
  });

  it.each([
    ["an unknown version", { version: 99 }],
    ["a segment with out <= in", { videoSegments: [{ id: "s1", sourceInMs: 5000, sourceOutMs: 5000 }] }],
    ["a negative marker position", { markers: [{ id: "m1", atMs: -1 }] }],
    ["a non-object value", "nope"],
  ])("rejects a malformed composition_json (%s) with VALIDATION and writes nothing", async (_label, bad) => {
    const res = await patch({ composition_json: bad });
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VALIDATION");
    expect(state.updates).toHaveLength(0);
  });

  it("a patch without composition_json does not gain one (pre-Stage-C bodies unchanged)", async () => {
    const res = await patch({ title: "Renamed" });
    expect(res.status).toBe(200);
    expect(state.updates[0]!.row).not.toHaveProperty("composition_json");
  });
});
