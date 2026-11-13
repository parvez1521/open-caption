// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState } from "../../../../app/api/v1/growth/__tests__/fake-db";

/**
 * Instagram Unified Login flow tests (Facebook Login for Business): the
 * authorize URL carries a config_id and no scope, the code exchanges in
 * ONE hop on graph.facebook.com (no ig_exchange_token, no
 * fb_exchange_token), the account is discovered from
 * /me/assigned_instagram_accounts, and media + insights are read on
 * graph.facebook.com. There is no refresh endpoint in this flow. The
 * connectInstagram test drives the whole callback path (exchange →
 * discovery → store → first sync) against the stubbed provider + the
 * fake growth tables, proving the connection is stored on the fixed
 * path.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => fakeDb(state.current) }));

import {
  exchangeInstagramCode,
  fetchInstagramAccount,
  fetchInstagramMedia,
} from "../instagram";
import { connectInstagram, ProviderSyncError } from "../sync";
import { getConnection } from "../store";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const IG_ID = "17841400000000001";
const IG_ID_2 = "17841400000000002";
const CONFIG = { appId: "ig-app-id", appSecret: "ig-secret", configId: "cfg-1" };

const ENV_KEYS = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_CONFIG_ID", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.INSTAGRAM_APP_ID = "ig-app-id";
  process.env.INSTAGRAM_APP_SECRET = "ig-secret";
  process.env.INSTAGRAM_CONFIG_ID = "cfg-1";
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

/**
 * Full Unified Login provider stub: one-hop token exchange on
 * graph.facebook.com, assigned-accounts discovery, media + insights on
 * the same host. Options shape the discovery response (and the exchange
 * expiry) for the failure-path tests.
 */
function stubUnifiedFetch(opts: { accounts?: unknown; accountsPages?: unknown[]; expiresIn?: number | null; media?: unknown } = {}) {
  const calls: Array<{ url: string; method?: string; body?: string; auth?: string | null }> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const headers = new Headers(init?.headers);
    calls.push({ url: u, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined, auth: headers.get("authorization") });
    if (u.includes("graph.facebook.com/v21.0/oauth/access_token")) {
      const body: Record<string, unknown> = { access_token: "suat-1", token_type: "bearer" };
      if (opts.expiresIn !== null) body.expires_in = opts.expiresIn ?? 5184000;
      return json(body);
    }
    if (u.includes("/me/assigned_instagram_accounts")) {
      const after = new URL(u).searchParams.get("after");
      const page = opts.accountsPages?.find((p) => ((p as { after?: string }).after ?? null) === after) as { body?: unknown } | undefined;
      if (page?.body !== undefined) return json(page.body);
      return json(
        opts.accounts ?? {
          data: [{ id: IG_ID, username: "tech_hacks.ai" }],
        },
      );
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
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("exchangeInstagramCode", () => {
  it("exchanges the code in ONE hop on graph.facebook.com — no second exchange, no instagram.com host", async () => {
    const { fetchImpl, calls } = stubUnifiedFetch();
    const tokens = await exchangeInstagramCode({ config: CONFIG, code: "code-1", redirectUri: "https://app.example/cb", fetchImpl });
    expect(tokens.accessToken).toBe("suat-1");
    expect(tokens.expiresAt).not.toBeNull();
    const exchange = calls.find((c) => c.url.includes("/oauth/access_token"));
    expect(exchange).toBeDefined();
    const params = new URL(exchange!.url).searchParams;
    expect(params.get("client_id")).toBe("ig-app-id");
    expect(params.get("client_secret")).toBe("ig-secret");
    expect(params.get("redirect_uri")).toBe("https://app.example/cb");
    expect(params.get("code")).toBe("code-1");
    expect(params.get("grant_type")).toBeNull();
    expect(calls.some((c) => c.url.includes("ig_exchange_token") || c.url.includes("fb_exchange_token"))).toBe(false);
    expect(calls.some((c) => c.url.includes("instagram.com"))).toBe(false);
  });

  it("a non-expiring configuration (no expires_in) is a valid token with no expiry", async () => {
    const { fetchImpl } = stubUnifiedFetch({ expiresIn: null });
    const tokens = await exchangeInstagramCode({ config: CONFIG, code: "code-1", redirectUri: "https://app.example/cb", fetchImpl });
    expect(tokens.accessToken).toBe("suat-1");
    expect(tokens.expiresAt).toBeNull();
  });
});

describe("fetchInstagramAccount", () => {
  it("discovers the one shared account from /me/assigned_instagram_accounts on graph.facebook.com", async () => {
    const { fetchImpl, calls } = stubUnifiedFetch();
    const account = await fetchInstagramAccount("suat-1", fetchImpl);
    expect(account).toEqual({ igUserId: IG_ID, username: "tech_hacks.ai" });
    const discovery = calls.find((c) => c.url.includes("/me/assigned_instagram_accounts"));
    expect(discovery).toBeDefined();
    expect(discovery!.url.startsWith("https://graph.facebook.com/v21.0/me/assigned_instagram_accounts")).toBe(true);
    expect(discovery!.auth).toBe("Bearer suat-1");
    expect(calls.some((c) => c.url.includes("/me/accounts"))).toBe(false);
    expect(calls.some((c) => c.url.includes("graph.instagram.com"))).toBe(false);
  });

  it("fails honestly when no account was shared — nothing is invented", async () => {
    const { fetchImpl } = stubUnifiedFetch({ accounts: { data: [] } });
    await expect(fetchInstagramAccount("suat-1", fetchImpl)).rejects.toThrow("did not share a professional account");
  });

  it("walks discovery pages until the cursor ends", async () => {
    const { fetchImpl, calls } = stubUnifiedFetch({
      accountsPages: [
        { after: null, body: { data: [], paging: { cursors: { after: "tok-2" } } } },
        { after: "tok-2", body: { data: [{ id: IG_ID, username: "tech_hacks.ai" }] } },
      ],
    });
    const account = await fetchInstagramAccount("suat-1", fetchImpl);
    expect(account).toEqual({ igUserId: IG_ID, username: "tech_hacks.ai" });
    expect(calls.filter((c) => c.url.includes("/me/assigned_instagram_accounts"))).toHaveLength(2);
  });

  it("several shared accounts fail unless the already-connected one is among them", async () => {
    const two = { data: [{ id: IG_ID, username: "tech_hacks.ai" }, { id: IG_ID_2, username: "second" }] };
    const { fetchImpl } = stubUnifiedFetch({ accounts: two });
    await expect(fetchInstagramAccount("suat-1", fetchImpl)).rejects.toThrow("Several Instagram accounts were shared");
    const kept = await fetchInstagramAccount("suat-1", fetchImpl, IG_ID_2);
    expect(kept).toEqual({ igUserId: IG_ID_2, username: "second" });
  });

  it("a repeated discovery cursor stops the walk instead of paging forever", async () => {
    // Cursor cycle: null → "b" → "a" → "b" again — the guard must throw.
    const cycling = vi.fn(async (url: string) => {
      const after = new URL(String(url)).searchParams.get("after");
      const next = after === null ? "b" : after === "b" ? "a" : "b";
      return json({ data: [], paging: { cursors: { after: next } } });
    }) as unknown as typeof fetch;
    await expect(fetchInstagramAccount("suat-1", cycling)).rejects.toThrow("repeated page cursor");
  });
});

describe("fetchInstagramMedia on graph.facebook.com", () => {
  it("lists media + insights from the Facebook host, same shapes as before", async () => {
    const { fetchImpl, calls } = stubUnifiedFetch();
    const posts = await fetchInstagramMedia("suat-1", IG_ID, fetchImpl);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ externalId: "m1", title: "Hello", views: 900, reach: 700, likes: 12, comments: 3 });
    expect(calls.every((c) => c.url.startsWith("https://graph.facebook.com/v21.0/"))).toBe(true);
    expect(calls.every((c) => !c.url.includes("graph.instagram.com"))).toBe(true);
  });
});

describe("connectInstagram end-to-end (callback path)", () => {
  it("exchanges the code, discovers the account, STORES the connection, and the first sync writes the posts", async () => {
    const { fetchImpl } = stubUnifiedFetch();
    const result = await connectInstagram("user-1", "code-1", "https://app.example/cb", fetchImpl);
    expect(result).toEqual({ accountName: "tech_hacks.ai", syncFailed: false });

    const stored = await getConnection("user-1", "instagram");
    expect(stored).toMatchObject({
      platform: "instagram",
      accountId: IG_ID,
      accountName: "tech_hacks.ai",
      accessToken: "suat-1",
      refreshToken: null,
    });
    expect(stored?.expiresAt).not.toBeNull();

    const posts = state.current.tables["growth_posts"] ?? [];
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ external_id: "m1", source: "instagram", views: 900, reach: 700 });
  });

  it("an empty discovery fails the connect and stores nothing", async () => {
    const { fetchImpl } = stubUnifiedFetch({ accounts: { data: [] } });
    await expect(connectInstagram("user-1", "code-1", "https://app.example/cb", fetchImpl)).rejects.toBeInstanceOf(ProviderSyncError);
    expect(await getConnection("user-1", "instagram")).toBeNull();
    expect(state.current.tables["growth_connections"]).toHaveLength(0);
  });

  it("a bad code fails the connect and stores nothing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("provider request failed (400)");
    }) as unknown as typeof fetch;
    await expect(connectInstagram("user-1", "bad-code", "https://app.example/cb", failing)).rejects.toBeInstanceOf(ProviderSyncError);
    expect(await getConnection("user-1", "instagram")).toBeNull();
    expect(state.current.tables["growth_connections"]).toHaveLength(0);
  });
});
