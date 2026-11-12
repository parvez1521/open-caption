// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState } from "../../../../app/api/v1/growth/__tests__/fake-db";

/**
 * Instagram Login flow tests (Business Login for Instagram): the code
 * exchange is a form POST to api.instagram.com, the long-lived exchange
 * and all data calls run on graph.instagram.com, and the account comes
 * from the token's own /me — there is no Facebook Page and no
 * pages_show_list anywhere in this flow. The connectInstagram test drives
 * the whole callback path (exchange → /me → store → first sync) against
 * the stubbed provider + the fake growth tables, proving the connection
 * is stored on the fixed path.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => fakeDb(state.current) }));

import {
  exchangeInstagramCode,
  fetchInstagramAccount,
  fetchInstagramMedia,
  refreshInstagramToken,
} from "../instagram";
import { connectInstagram, ProviderSyncError } from "../sync";
import { getConnection } from "../store";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const IG_ID = "17841400000000001";
const CONFIG = { appId: "ig-app-id", appSecret: "ig-secret" };

const ENV_KEYS = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.INSTAGRAM_APP_ID = "ig-app-id";
  process.env.INSTAGRAM_APP_SECRET = "ig-secret";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  state.current = makeState({ growth_connections: [] });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

/** Full Instagram Login provider stub: token POST, long-lived exchange, /me, media, insights. */
function stubInstagramFetch(opts: { me?: unknown; media?: unknown } = {}) {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
    if (u === "https://api.instagram.com/oauth/access_token") {
      return json({ access_token: "short-1", user_id: IG_ID, expires_in: 3600, permissions: ["instagram_business_basic"] });
    }
    if (u.includes("graph.instagram.com/v21.0/access_token")) {
      return json({ access_token: "long-1", token_type: "bearer", expires_in: 5184000 });
    }
    if (u.includes("/v21.0/me?")) {
      return json(opts.me ?? { id: IG_ID, username: "tech_hacks.ai" });
    }
    if (u.includes(`/v21.0/${IG_ID}/media`)) {
      return json(
        opts.media ?? {
          data: [
            {
              id: "m1",
              caption: "Hello\nworld",
              timestamp: "2026-11-03T08:30:00+0000",
              permalink: "https://instagram.com/p/x",
              like_count: 12,
              comments_count: 3,
            },
          ],
        },
      );
    }
    if (u.includes("/insights")) {
      return json({ data: [{ name: "views", values: [{ value: 900 }] }, { name: "reach", values: [{ value: 700 }] }] });
    }
    if (u.includes("graph.instagram.com/v21.0/refresh_access_token")) {
      return json({ access_token: "long-2", token_type: "bearer", expires_in: 5184000 });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("exchangeInstagramCode", () => {
  it("POSTs the code as a form to api.instagram.com, then exchanges for a 60-day token on graph.instagram.com", async () => {
    const { fetchImpl, calls } = stubInstagramFetch();
    const tokens = await exchangeInstagramCode({ config: CONFIG, code: "code-1", redirectUri: "https://app.example/cb", fetchImpl });
    expect(tokens.accessToken).toBe("long-1");
    expect(tokens.expiresAt).not.toBeNull();
    const post = calls.find((c) => c.url === "https://api.instagram.com/oauth/access_token");
    expect(post?.method).toBe("POST");
    const body = new URLSearchParams(post?.body ?? "");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("redirect_uri")).toBe("https://app.example/cb");
    expect(body.get("client_id")).toBe("ig-app-id");
    expect(calls.some((c) => c.url.includes("graph.instagram.com/v21.0/access_token?grant_type=ig_exchange_token"))).toBe(true);
    expect(calls.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
  });
});

describe("fetchInstagramAccount", () => {
  it("reads the account from the token's own /me on graph.instagram.com", async () => {
    const { fetchImpl, calls } = stubInstagramFetch();
    const account = await fetchInstagramAccount("long-1", fetchImpl);
    expect(account).toEqual({ igUserId: IG_ID, username: "tech_hacks.ai" });
    expect(calls.some((c) => c.url.startsWith("https://graph.instagram.com/v21.0/me?fields=id,username"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/me/accounts"))).toBe(false);
  });

  it("fails honestly when /me returns no account id", async () => {
    const { fetchImpl } = stubInstagramFetch({ me: { username: "nobody" } });
    await expect(fetchInstagramAccount("long-1", fetchImpl)).rejects.toThrow("did not return a professional account");
  });
});

describe("refreshInstagramToken", () => {
  it("refreshes on graph.instagram.com (no client secret in the refresh call)", async () => {
    const { fetchImpl, calls } = stubInstagramFetch();
    const tokens = await refreshInstagramToken({ config: CONFIG, accessToken: "long-1", fetchImpl });
    expect(tokens.accessToken).toBe("long-2");
    const call = calls.find((c) => c.url.includes("refresh_access_token"));
    expect(call?.url).toContain("grant_type=ig_refresh_token");
    expect(call?.url).not.toContain("client_secret");
  });
});

describe("fetchInstagramMedia on graph.instagram.com", () => {
  it("lists media + insights from the IG host, same shapes as before", async () => {
    const { fetchImpl, calls } = stubInstagramFetch();
    const posts = await fetchInstagramMedia("long-1", IG_ID, fetchImpl);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ externalId: "m1", title: "Hello", views: 900, reach: 700, likes: 12, comments: 3 });
    expect(calls.every((c) => !c.url.includes("graph.facebook.com"))).toBe(true);
  });
});

describe("connectInstagram end-to-end (callback path)", () => {
  it("exchanges the code, resolves /me, STORES the connection, and the first sync writes the posts", async () => {
    const { fetchImpl } = stubInstagramFetch();
    const result = await connectInstagram("user-1", "code-1", "https://app.example/cb", fetchImpl);
    expect(result).toEqual({ accountName: "tech_hacks.ai", syncFailed: false });

    const stored = await getConnection("user-1", "instagram");
    expect(stored).toMatchObject({
      platform: "instagram",
      accountId: IG_ID,
      accountName: "tech_hacks.ai",
      accessToken: "long-1",
      refreshToken: null,
    });
    expect(stored?.expiresAt).not.toBeNull();

    const posts = state.current.tables["growth_posts"] ?? [];
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ external_id: "m1", source: "instagram", views: 900, reach: 700 });
  });

  it("a /me with no account fails the connect and stores nothing", async () => {
    const { fetchImpl } = stubInstagramFetch({ me: {} });
    await expect(connectInstagram("user-1", "code-1", "https://app.example/cb", fetchImpl)).rejects.toBeInstanceOf(ProviderSyncError);
    expect(await getConnection("user-1", "instagram")).toBeNull();
    expect(state.current.tables["growth_connections"]).toHaveLength(0);
  });
});
