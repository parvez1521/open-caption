// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

/**
 * Route-level tests for POST /projects/:id/exports with the database, storage and job queue
 * faked at the module boundary. These pin the slice-2.4 behaviour: every creatable kind the
 * Export UI offers is really created by this route (text kinds instantly, video kinds as a
 * companion render job), png is rejected, and guests get the signup response for every kind.
 */

const state = vi.hoisted(() => ({
  guest: false,
  companionOnline: false,
  userDb: null as unknown,
  adminDb: null as unknown,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
  upserts: [] as Array<{ table: string; row: Record<string, unknown>; opts: Record<string, unknown> }>,
  puts: [] as Array<{ path: string; body: string; mime: string }>,
  signedGets: [] as Array<{ path: string; name?: string }>,
  enqueued: [] as Array<Record<string, unknown>>,
  reserves: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  settles: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  minutesBlocked: false,
  enqueueFails: false,
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: state.guest, db: state.userDb }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => undefined }));
vi.mock("@/lib/api/jobs", () => ({
  enqueueJob: async (input: Record<string, unknown>) => {
    if (state.enqueueFails) throw new Error("queue down");
    state.enqueued.push(input);
    return { id: "job-1" };
  },
  hasOnlineCompanion: async () => state.companionOnline,
}));
vi.mock("@/lib/api/storage", () => ({
  putObject: async (path: string, body: string, mime: string) => {
    state.puts.push({ path, body, mime });
  },
  signedGet: async (path: string, _ttl: number, name?: string) => {
    state.signedGets.push({ path, name });
    return `signed:${path}`;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => state.adminDb }));

import { POST } from "../route";

const DOC = {
  version: 2,
  words: [
    { id: "w1", text: "Hello", startMs: 0, endMs: 400 },
    { id: "w2", text: "world", startMs: 400, endMs: 900 },
  ],
};

const ROWS: Record<string, unknown> = {
  projects: { id: "proj-1", title: "My Video", look_id: "look-1", style_json: {}, settings_json: {} },
  caption_documents: { revision: 3, doc: DOC },
  videos: { id: "vid-1", width: 1080, height: 1920, fps: 30, duration_ms: 10_000 },
  profiles: { plan: "free" },
};

/** Minimal chainable stand-in for the supabase query builder, as this route uses it. */
class FakeBuilder {
  constructor(private table: string) {}
  select() { return this; }
  eq() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  gte() { return this; }
  lt() { return this; }
  insert(row: Record<string, unknown>) {
    state.inserts.push({ table: this.table, row });
    return this;
  }
  update(row: Record<string, unknown>) {
    state.updates.push({ table: this.table, row });
    return this;
  }
  upsert(row: Record<string, unknown>, opts: Record<string, unknown>) {
    state.upserts.push({ table: this.table, row, opts });
    return this;
  }
  async maybeSingle() {
    return { data: ROWS[this.table] ?? null, error: null };
  }
  then(onOk: (v: { data: Array<{ id: string }> | null; error: null }) => unknown, onErr?: (e: unknown) => unknown) {
    return Promise.resolve({ data: null, error: null }).then(onOk, onErr);
  }
}

const fakeDb = () => ({
  from: (table: string) => new FakeBuilder(table),
  // Minutes ledger rpc: reserve succeeds unless the test blocks it; settle always lands.
  rpc: async (fn: string, args: Record<string, unknown>) => {
    if (fn === "reserve_minutes") {
      if (state.minutesBlocked) {
        return { data: { ok: false, code: "INSUFFICIENT", balance: 0, minutes: args.p_minutes }, error: null };
      }
      state.reserves.push({ fn, args });
      return { data: { ok: true, already_reserved: false, reservation_key: `reserve:${args.p_export_id}`, minutes: args.p_minutes, balance: 4 }, error: null };
    }
    if (fn === "settle_reservation") {
      state.settles.push({ fn, args });
      return { data: { settled: true, outcome: args.p_outcome, minutes_charged: 0, refunded: 0, balance: 4 }, error: null };
    }
    return { data: null, error: { message: `fake rpc: unknown function ${fn}` } };
  },
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/projects/proj-1/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj-1" }) },
  );

beforeEach(() => {
  state.guest = false;
  state.companionOnline = false;
  state.userDb = fakeDb();
  state.adminDb = fakeDb();
  state.inserts = [];
  state.updates = [];
  state.upserts = [];
  state.puts = [];
  state.signedGets = [];
  state.enqueued = [];
  state.reserves = [];
  state.settles = [];
  state.minutesBlocked = false;
  state.enqueueFails = false;
});

describe("text exports — created right away, with the right extension and content", () => {
  const cases = [
    { kind: "srt", ext: "srt", mime: "application/x-subrip", check: (c: string) => c.includes("00:00:00,000 -->") && c.includes("Hello world") },
    { kind: "vtt", ext: "vtt", mime: "text/vtt", check: (c: string) => c.startsWith("WEBVTT") && c.includes("00:00:00.000 -->") },
    { kind: "ass", ext: "ass", mime: "text/plain", check: (c: string) => c.includes("[Script Info]") && c.includes("Dialogue:") },
    { kind: "txt", ext: "txt", mime: "text/plain", check: (c: string) => c === "Hello world" },
    { kind: "json", ext: "json", mime: "application/json", check: (c: string) => (JSON.parse(c) as typeof DOC).words?.length === 2 },
  ] as const;

  it.each(cases)("$kind → 201 ready, .$ext file, no render job queued", async ({ kind, ext, mime, check }) => {
    const res = await post({ kind });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { ready: boolean; downloadUrl: string } };
    expect(json.data.ready).toBe(true);
    expect(json.data.downloadUrl).toContain(`.${ext}`);

    expect(state.puts).toHaveLength(1);
    expect(state.puts[0]!.path).toMatch(new RegExp(`^user-1/proj-1/exports/[0-9a-f-]+\\.${ext}$`));
    expect(state.puts[0]!.mime).toBe(mime);
    expect(check(state.puts[0]!.body)).toBe(true);
    expect(state.signedGets[0]!.name).toBe(`My_Video.${ext}`);

    const row = state.inserts.find((i) => i.table === "exports")!.row;
    expect(row).toMatchObject({ kind, status_v2: "ready", status: "completed" });
    expect(row.storage_path).toBe(state.puts[0]!.path);
    expect(state.enqueued).toHaveLength(0);
  });

  it("ignores range/dims for text kinds: the whole document is exported", async () => {
    const res = await post({ kind: "srt", width: 720, height: 1280, fps: 60, range: { startMs: 5000, endMs: 9000 } });
    expect(res.status).toBe(201);
    expect(state.puts[0]!.body).toContain("Hello world"); // the words live at 0–900 ms, outside the range
  });
});

describe("video exports — queued as a companion render job with the right shape", () => {
  const cases = [
    { kind: "mp4", ext: "mp4" },
    { kind: "mov_alpha", ext: "mov" },
    { kind: "webm_alpha", ext: "webm" },
  ] as const;

  it.each(cases)("$kind → 202 queued, render job carries format/range/dims", async ({ kind }) => {
    const range = { startMs: 1000, endMs: 5000 };
    const res = await post({ kind, width: 1080, height: 1920, fps: 30, crf: 20, range });
    expect(res.status).toBe(202);
    const json = (await res.json()) as { data: { exportId: string; ready: boolean; jobId: string; companionOnline: boolean } };
    expect(json.data.ready).toBe(false);
    expect(json.data.jobId).toBe("job-1");
    expect(json.data.companionOnline).toBe(false); // no companion paired: the job just queues

    const row = state.inserts.find((i) => i.table === "exports")!.row;
    expect(row).toMatchObject({ kind, status_v2: "queued", resolution: "1080x1920" });
    expect(row.settings).toMatchObject({ width: 1080, height: 1920, fps: 30, crf: 20, range });
    expect(state.updates).toEqual([{ table: "exports", row: { job_id: "job-1" } }]);

    expect(state.enqueued).toHaveLength(1);
    const job = state.enqueued[0]!;
    expect(job).toMatchObject({ ownerId: "user-1", projectId: "proj-1", kind: "render", idempotencyKey: `render:${json.data.exportId}` });
    expect(job.payload).toMatchObject({
      kind: "render", exportId: json.data.exportId, format: kind,
      width: 1080, height: 1920, fps: 30, crf: 20, range, sourceVideoId: "vid-1",
    });
    expect(state.puts).toHaveLength(0);
  });

  it("reports companionOnline honestly when a companion is paired", async () => {
    state.companionOnline = true;
    const res = await post({ kind: "mov_alpha" });
    const json = (await res.json()) as { data: { companionOnline: boolean } };
    expect(json.data.companionOnline).toBe(true);
  });
});

describe("kinds that are not creatable, and guest gating", () => {
  it("rejects png with VALIDATION and creates nothing", async () => {
    const res = await post({ kind: "png" });
    expect(res.status).toBe(422); // ERROR_STATUS maps VALIDATION → 422, as the old explicit png check did
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VALIDATION");
    expect(state.inserts).toHaveLength(0);
    expect(state.enqueued).toHaveLength(0);
    expect(state.puts).toHaveLength(0);
  });

  it.each(["mp4", "srt", "vtt", "ass", "txt", "json", "mov_alpha", "webm_alpha", "png"])(
    "guest creating %s gets the signup response, unchanged for every kind",
    async (kind) => {
      state.guest = true;
      const res = await post({ kind });
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error: { code: string; message: string; details?: { signupRequired?: boolean } } };
      expect(json.error.code).toBe("FORBIDDEN");
      expect(json.error.message).toBe("Create a free account to export your video.");
      expect(json.error.details?.signupRequired).toBe(true);
      expect(state.inserts).toHaveLength(0);
      expect(state.enqueued).toHaveLength(0);
      expect(state.puts).toHaveLength(0);
    },
  );
});

describe("minutes ledger (owner decision 2026-11-14: minutes replace the video quota — one meter only)", () => {
  it("a video export reserves its minutes BEFORE the job is queued", async () => {
    const res = await post({ kind: "mp4" });
    expect(res.status).toBe(202);
    expect(state.enqueued).toHaveLength(1);
    expect(state.reserves).toHaveLength(1);
    const reserve = state.reserves[0]!;
    const json = (await res.json()) as { data: { exportId: string } };
    expect(reserve.args).toMatchObject({
      p_user_id: "user-1",
      p_project_id: "proj-1",
      p_export_id: json.data.exportId,
      p_minutes: 1, // the 10-second source rounds up to 1 minute
      p_idempotency_key: `reserve:${json.data.exportId}`,
    });
    // No quota event is written any more: the reservation IS the charge.
    expect(state.upserts.filter((u) => u.table === "video_quota_events")).toHaveLength(0);
  });

  it("blocks a video export with no minutes left with a 402 upsell message and queues nothing", async () => {
    state.minutesBlocked = true;
    const res = await post({ kind: "mp4" });
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
    expect(json.error.message).toContain("Monthly minutes used up");
    expect(json.error.message).toContain("Upgrade for more minutes");
    expect(state.enqueued).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.reserves).toHaveLength(0);
  });

  it("a text export with no minutes left still succeeds — text files never count", async () => {
    state.minutesBlocked = true;
    const res = await post({ kind: "srt" });
    expect(res.status).toBe(201);
    expect(state.reserves).toHaveLength(0);
    expect(state.settles).toHaveLength(0);
  });

  it("a failed queue refunds the reservation, so a failed queue never consumes minutes", async () => {
    state.enqueueFails = true;
    const res = await post({ kind: "mp4" });
    expect(res.status).toBe(500);
    expect(state.reserves).toHaveLength(1);
    expect(state.settles).toHaveLength(1);
    expect(state.settles[0]!.args).toMatchObject({ p_outcome: "failed" });
    expect(state.enqueued).toHaveLength(0);
  });
});
