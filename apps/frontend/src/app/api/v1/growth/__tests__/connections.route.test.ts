// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "./fake-db";

/**
 * Route tests for Growth Connect (P1): status honesty (no token ever leaves
 * the server), the start bounce when a platform is not switched on, the
 * signed-state callback, the first sync landing in growth_posts with
 * source 'youtube', re-sync updating in place, sync's pending-setup
 * degradation before APPLY-GROWTH-CONNECT.sql, and disconnect keeping the
 * already-synced posts.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));
const rateLimitCalls = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => fakeDb(state.current) }));
vi.mock("@/lib/api/rateLimit", () => ({
  rateLimit: async (...args: unknown[]) => {
    rateLimitCalls.calls.push(args);
  },
}));

import { GET as STATUS } from "../connections/route";
import { GET as START } from "../connect/[platform]/start/route";
import { GET as CALLBACK } from "../connect/[platform]/callback/route";
import { POST as SYNC } from "../connect/[platform]/sync/route";
import { POST as DISCONNECT } from "../connect/[platform]/disconnect/route";
import { signOAuthState, verifyOAuthState } from "@/lib/api/connections/state";

const ctx = (platform: string) => ({ params: Promise.resolve({ platform }) });
const get = (url: string) => new Request(url);
const post = (url: string) => new Request(url, { method: "POST" });

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** viewCount is mutable so a test can prove re-sync updates figures in place. */
const providerStats = { viewCount: "100" };

function stubProviderFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com/token")) return json({ access_token: "ya29.test", refresh_token: "rt-1", expires_in: 3600 });
      if (u.includes("/youtube/v3/channels")) {
        return json({ items: [{ id: "chan-1", snippet: { title: "My Channel" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] });
      }
      if (u.includes("/youtube/v3/playlistItems")) return json({ items: [{ contentDetails: { videoId: "vid-1" } }] });
      if (u.includes("/youtube/v3/videos")) {
        return json({
          items: [
            {
              id: "vid-1",
              snippet: { title: "Hello video", publishedAt: "2026-11-01T10:00:00Z" },
              statistics: { viewCount: providerStats.viewCount, likeCount: "5", commentCount: "2" },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    }),
  );
}

const connectionRow = (over: Partial<Row> = {}): Row => ({
  id: "conn-1",
  owner_id: "user-1",
  platform: "youtube",
  account_id: "chan-1",
  account_name: "My Channel",
  access_token: "SECRET-TOKEN-XYZ",
  refresh_token: "rt-1",
  expires_at: "2999-01-01T00:00:00.000Z",
  last_sync_at: null,
  created_at: "2026-11-10T00:00:00.000Z",
  updated_at: "2026-11-10T00:00:00.000Z",
  ...over,
});

const ENV_KEYS = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "META_APP_ID", "META_APP_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  providerStats.viewCount = "100";
  rateLimitCalls.calls = [];
  state.current = makeState({ growth_connections: [] });
  stubProviderFetch();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

const enableYoutube = () => {
  process.env.YOUTUBE_CLIENT_ID = "yt-id";
  process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
};

describe("GET /growth/connections", () => {
  it("with no credentials configured, both platforms read not-switched-on and not connected", async () => {
    const res = await STATUS(get("http://localhost/api/v1/growth/connections"));
    const body = (await res.json()) as { data: { setupPending: boolean; platforms: Array<Record<string, unknown>> } };
    expect(body.data.setupPending).toBe(false);
    expect(body.data.platforms).toEqual([
      { platform: "youtube", configured: false, connected: false, accountName: null, lastSyncAt: null },
      { platform: "instagram", configured: false, connected: false, accountName: null, lastSyncAt: null },
    ]);
  });

  it("before the APPLY file runs, answers setupPending instead of erroring", async () => {
    enableYoutube();
    state.current.missing = true;
    const res = await STATUS(get("http://localhost/api/v1/growth/connections"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { setupPending: boolean } };
    expect(body.data.setupPending).toBe(true);
  });

  it("a connected account shows name + last sync — and the token NEVER appears in the response", async () => {
    enableYoutube();
    state.current = makeState({ growth_connections: [connectionRow({ last_sync_at: "2026-11-10T09:00:00.000Z" })] });
    const res = await STATUS(get("http://localhost/api/v1/growth/connections"));
    const text = await res.text();
    expect(text).not.toContain("SECRET-TOKEN-XYZ");
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("refresh_token");
    const body = JSON.parse(text) as { data: { platforms: Array<Record<string, unknown>> } };
    const youtube = body.data.platforms.find((p) => p.platform === "youtube");
    expect(youtube).toMatchObject({ configured: true, connected: true, accountName: "My Channel", lastSyncAt: "2026-11-10T09:00:00.000Z" });
  });
});

describe("GET /growth/connect/[platform]/start", () => {
  it("answers the /growth bounce URL as JSON when the platform is not switched on", async () => {
    const res = await START(get("http://localhost/api/v1/growth/connect/youtube/start"), ctx("youtube"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    expect(body.data.url).toContain("/growth?connect=youtube-off");
  });

  it("answers the Google consent URL as JSON, with a state that verifies for this user + platform", async () => {
    enableYoutube();
    const res = await START(get("http://localhost/api/v1/growth/connect/youtube/start"), ctx("youtube"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string } };
    const location = body.data.url;
    expect(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth")).toBe(true);
    const stateParam = new URL(location).searchParams.get("state") ?? "";
    expect(verifyOAuthState(stateParam, "youtube")).toEqual({ userId: "user-1" });
  });

  it("404s an unknown platform", async () => {
    const res = await START(get("http://localhost/api/v1/growth/connect/tiktok/start"), ctx("tiktok"));
    expect(res.status).toBe(404);
  });
});

describe("GET /growth/connect/[platform]/callback", () => {
  it("rejects a forged/unsigned state and stores nothing", async () => {
    enableYoutube();
    const res = await CALLBACK(
      get("http://localhost/api/v1/growth/connect/youtube/callback?code=x&state=forged"),
      ctx("youtube"),
    );
    expect(res.headers.get("location")).toContain("connect_error=youtube");
    expect(state.current.tables.growth_connections).toHaveLength(0);
  });

  it("happy path: stores the connection (server-side) and lands the first sync in growth_posts", async () => {
    enableYoutube();
    const stateParam = signOAuthState("user-1", "youtube");
    const res = await CALLBACK(
      get(`http://localhost/api/v1/growth/connect/youtube/callback?code=code-1&state=${encodeURIComponent(stateParam)}`),
      ctx("youtube"),
    );
    expect(res.headers.get("location")).toContain("connected=youtube");
    const connections = state.current.tables.growth_connections!;
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ owner_id: "user-1", platform: "youtube", account_id: "chan-1", account_name: "My Channel" });
    const posts = (state.current.tables.growth_posts ?? []).filter((p) => p.source === "youtube");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ external_id: "vid-1", title: "Hello video", views: 100, likes: 5, platform: "youtube" });
    expect(connections[0]!.last_sync_at).not.toBeNull();
  });
});

describe("POST /growth/connect/[platform]/sync", () => {
  it("re-sync updates the same row in place (no duplicates) and stamps last_sync_at", async () => {
    enableYoutube();
    state.current = makeState({
      growth_connections: [connectionRow({ last_sync_at: "2026-11-10T09:00:00.000Z" })],
      growth_posts: [
        {
          id: "gp-1",
          owner_id: "user-1",
          platform: "youtube",
          title: "Hello video",
          post_url: "https://www.youtube.com/watch?v=vid-1",
          posted_at: "2026-11-01T10:00:00.000Z",
          views: 100,
          reach: null,
          likes: 5,
          comments: 2,
          shares: null,
          saves: null,
          source: "youtube",
          external_id: "vid-1",
          created_at: "2026-11-10T00:00:00.000Z",
          updated_at: "2026-11-10T00:00:00.000Z",
        },
      ],
    });
    providerStats.viewCount = "250";
    const res = await SYNC(post("http://localhost/api/v1/growth/connect/youtube/sync"), ctx("youtube"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { synced: number } };
    expect(body.data.synced).toBe(1);
    const rows = (state.current.tables.growth_posts ?? []).filter((p) => p.external_id === "vid-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "gp-1", views: 250 });
    expect(state.current.tables.growth_connections![0]!.last_sync_at).not.toBe("2026-11-10T09:00:00.000Z");
    expect(rateLimitCalls.calls).toContainEqual(["user-1", "growth_sync", 10, 3600]);
  });

  it("before the APPLY file runs, answers the plain pending-setup message", async () => {
    enableYoutube();
    state.current.missing = true;
    const res = await SYNC(post("http://localhost/api/v1/growth/connect/youtube/sync"), ctx("youtube"));
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("database update is pending");
  });
});

describe("POST /growth/connect/[platform]/disconnect", () => {
  it("deletes only the connection — already-synced posts stay", async () => {
    state.current = makeState({
      growth_connections: [connectionRow()],
      growth_posts: [{ id: "gp-1", owner_id: "user-1", source: "youtube", external_id: "vid-1" }],
    });
    const res = await DISCONNECT(post("http://localhost/api/v1/growth/connect/youtube/disconnect"), ctx("youtube"));
    expect(res.status).toBe(200);
    expect(state.current.tables.growth_connections).toHaveLength(0);
    expect(state.current.tables.growth_posts).toHaveLength(1);
  });
});
