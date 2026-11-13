// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { instagramConfig, platformConfigured, youtubeConfig } from "../config";
import { signOAuthState, verifyOAuthState } from "../state";
import {
  exchangeYoutubeCode,
  fetchYoutubeUploads,
  mapYoutubeVideo,
  youtubeAuthUrl,
  YOUTUBE_SCOPES,
} from "../youtube";
import {
  fetchInstagramMedia,
  instagramAuthUrl,
  mapInstagramMedia,
  parseInstagramInsights,
  NO_INSIGHTS,
} from "../instagram";

/**
 * Provider units for Growth Connect (P1): the OAuth state signature, the
 * env gates, the consent URLs (lightest read-only scopes), and the PURE
 * mappers — a metric the provider does not report must land as null
 * (missing), never as an invented zero.
 */

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const ENV_KEYS = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_CONFIG_ID", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("env gates", () => {
  it("no credentials configured → both platforms off", () => {
    expect(youtubeConfig()).toBeNull();
    expect(instagramConfig()).toBeNull();
    expect(platformConfigured("youtube")).toBe(false);
    expect(platformConfigured("instagram")).toBe(false);
  });

  it("both halves of a credential pair are required", () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-id";
    expect(youtubeConfig()).toBeNull();
    process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
    expect(youtubeConfig()).toEqual({ clientId: "yt-id", clientSecret: "yt-secret" });
    expect(platformConfigured("youtube")).toBe(true);
    expect(platformConfigured("instagram")).toBe(false);
  });

  it("all three Instagram parts are required (app id + secret + Unified Login config id)", () => {
    process.env.INSTAGRAM_APP_ID = "ig-id";
    expect(instagramConfig()).toBeNull();
    process.env.INSTAGRAM_APP_SECRET = "ig-secret";
    expect(instagramConfig()).toBeNull();
    process.env.INSTAGRAM_CONFIG_ID = "cfg-1";
    expect(instagramConfig()).toEqual({ appId: "ig-id", appSecret: "ig-secret", configId: "cfg-1" });
    expect(platformConfigured("instagram")).toBe(true);
  });
});

describe("OAuth state", () => {
  it("round-trips the user id for the right platform", () => {
    const state = signOAuthState("user-1", "youtube");
    expect(verifyOAuthState(state, "youtube")).toEqual({ userId: "user-1" });
  });

  it("rejects a state minted for another platform, a tampered state, and an expired one", () => {
    const state = signOAuthState("user-1", "youtube");
    expect(verifyOAuthState(state, "instagram")).toBeNull();
    const tampered = `${state.slice(0, -2)}xx`;
    expect(verifyOAuthState(tampered, "youtube")).toBeNull();
    const old = signOAuthState("user-1", "youtube", Date.now() - 11 * 60 * 1000);
    expect(verifyOAuthState(old, "youtube")).toBeNull();
    expect(verifyOAuthState("garbage", "youtube")).toBeNull();
  });
});

describe("consent URLs", () => {
  it("YouTube asks only for the read-only scope, with offline access for refresh", () => {
    const url = new URL(youtubeAuthUrl({ config: { clientId: "yt-id", clientSecret: "s" }, redirectUri: "https://app.example/cb", state: "st" }));
    expect(url.searchParams.get("scope")).toBe(YOUTUBE_SCOPES.join(" "));
    expect(YOUTUBE_SCOPES).toEqual(["https://www.googleapis.com/auth/youtube.readonly"]);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/cb");
  });

  it("Instagram authorizes through the Facebook dialog with a Unified Login config_id — no scope, no instagram.com host", () => {
    const url = new URL(instagramAuthUrl({ config: { appId: "ig-app-id", appSecret: "s", configId: "cfg-1" }, redirectUri: "https://app.example/cb", state: "st" }));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("ig-app-id");
    expect(url.searchParams.get("config_id")).toBe("cfg-1");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/cb");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.has("scope")).toBe(false); // the configuration selects permissions, not the URL
    expect(url.toString()).not.toContain("instagram.com");
  });
});

describe("mapYoutubeVideo", () => {
  it("maps statistics strings to numbers; unreported metrics stay null", () => {
    const post = mapYoutubeVideo({
      id: "vid-1",
      snippet: { title: "Hello world", publishedAt: "2026-11-01T10:00:00Z" },
      statistics: { viewCount: "1200", likeCount: "45", commentCount: "6" },
    });
    expect(post).toMatchObject({
      externalId: "vid-1",
      source: "youtube",
      platform: "youtube",
      title: "Hello world",
      postUrl: "https://www.youtube.com/watch?v=vid-1",
      views: 1200,
      likes: 45,
      comments: 6,
      reach: null,
      shares: null,
      saves: null,
    });
  });

  it("hidden like counts and bad items degrade to nulls / null", () => {
    const post = mapYoutubeVideo({ id: "v2", snippet: { title: "x", publishedAt: "2026-11-01T10:00:00Z" }, statistics: { viewCount: "10" } });
    expect(post?.likes).toBeNull();
    expect(mapYoutubeVideo({ snippet: {} })).toBeNull();
    expect(mapYoutubeVideo({ id: "v3", snippet: { publishedAt: "not-a-date" } })).toBeNull();
    expect(mapYoutubeVideo(null)).toBeNull();
  });
});

describe("YouTube fetch flow (stubbed fetch)", () => {
  it("exchanges a code for tokens, surfacing the refresh token + expiry", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(String(init?.body)).toContain("grant_type=authorization_code");
      return json({ access_token: "ya29.x", refresh_token: "rt-1", expires_in: 3600 });
    }) as unknown as typeof fetch;
    const tokens = await exchangeYoutubeCode({ config: { clientId: "i", clientSecret: "s" }, code: "code-1", redirectUri: "https://app/cb", fetchImpl });
    expect(tokens.accessToken).toBe("ya29.x");
    expect(tokens.refreshToken).toBe("rt-1");
    expect(tokens.expiresAt).not.toBeNull();
  });

  it("walks uploads playlist → video stats", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("playlistItems")) return json({ items: [{ contentDetails: { videoId: "vid-1" } }, { contentDetails: { videoId: "vid-2" } }] });
      if (url.includes("/videos?")) {
        return json({
          items: [
            { id: "vid-1", snippet: { title: "One", publishedAt: "2026-11-02T09:00:00Z" }, statistics: { viewCount: "10" } },
            { id: "vid-2", snippet: { title: "Two", publishedAt: "2026-11-01T09:00:00Z" }, statistics: { viewCount: "20" } },
          ],
        });
      }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    const result = await fetchYoutubeUploads("tok", "UU1", fetchImpl);
    expect(result.posts.map((p) => p.externalId)).toEqual(["vid-1", "vid-2"]);
    expect(result.posts[1]?.views).toBe(20);
    expect(result.walkedIds).toBe(2);
    expect(result.totalResults).toBeNull(); // this stub reports no pageInfo
  });
});

describe("YouTube full-channel walk (pagination)", () => {
  const TOTAL = 137; // 50 + 50 + 37 — the channel is bigger than one page
  const idAt = (i: number) => `vid-${i + 1}`;

  /** A 3-page uploads playlist; page sizes 50/50/37; one upload is a Short (id 100). */
  function pagedFetch(opts: { failOnPage?: number } = {}) {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("playlistItems")) {
        const token = new URL(url).searchParams.get("pageToken");
        const page = token === null ? 1 : token === "tok-2" ? 2 : token === "tok-3" ? 3 : 0;
        if (page === 0) throw new Error(`unexpected pageToken ${token}`);
        if (opts.failOnPage === page) throw new Error("provider blew up mid-walk");
        const start = (page - 1) * 50;
        const count = Math.min(50, TOTAL - start);
        return json({
          pageInfo: { totalResults: TOTAL, resultsPerPage: 50 },
          ...(page < 3 ? { nextPageToken: `tok-${page + 1}` } : {}),
          items: Array.from({ length: count }, (_, k) => ({ contentDetails: { videoId: idAt(start + k) } })),
        });
      }
      if (url.includes("/videos?")) {
        const ids = (new URL(url).searchParams.get("id") ?? "").split(",");
        return json({
          items: ids.map((id) => {
            const n = Number(id.replace("vid-", ""));
            return {
              id,
              snippet: {
                title: n === 100 ? "Quick tip #shorts" : `Video ${n}`,
                publishedAt: "2026-11-01T09:00:00Z",
              },
              statistics: { viewCount: String(n * 10), likeCount: "3", commentCount: "1" },
            };
          }),
        });
      }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it("walks EVERY page: 50 + 50 + 37 uploads come back in order, statistics merged, Shorts included", async () => {
    const { fetchImpl, calls } = pagedFetch();
    const pages: number[] = [];
    const result = await fetchYoutubeUploads("tok", "UU1", fetchImpl, (pagePosts) => {
      pages.push(pagePosts.length);
    });
    expect(result.posts).toHaveLength(TOTAL);
    expect(result.posts.map((p) => p.externalId)).toEqual(Array.from({ length: TOTAL }, (_, i) => idAt(i)));
    expect(result.posts[99]).toMatchObject({ externalId: "vid-100", title: "Quick tip #shorts", views: 1000 });
    expect(result.posts[136]?.views).toBe(1370);
    expect(result.totalResults).toBe(TOTAL);
    expect(result.walkedIds).toBe(TOTAL);
    expect(pages).toEqual([50, 50, 37]); // onPosts streamed per page
    expect(calls.filter((u) => u.includes("playlistItems"))).toHaveLength(3);
    expect(calls.filter((u) => u.includes("/videos?"))).toHaveLength(3); // one batch of ≤50 per page
  });

  it("a page-2 failure throws — and page 1 was already handed to onPosts (progress is kept by the caller)", async () => {
    const { fetchImpl } = pagedFetch({ failOnPage: 2 });
    const handed: string[] = [];
    await expect(
      fetchYoutubeUploads("tok", "UU1", fetchImpl, (pagePosts) => {
        handed.push(...pagePosts.map((p) => p.externalId));
      }),
    ).rejects.toThrow("provider blew up mid-walk");
    expect(handed).toEqual(Array.from({ length: 50 }, (_, i) => idAt(i)));
  });

  it("a repeated nextPageToken stops the walk instead of paging forever", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("playlistItems")) {
        return json({
          nextPageToken: "same-token",
          items: [{ contentDetails: { videoId: "vid-1" } }],
        });
      }
      if (url.includes("/videos?")) {
        return json({
          items: [{ id: "vid-1", snippet: { title: "One", publishedAt: "2026-11-01T09:00:00Z" }, statistics: { viewCount: "1" } }],
        });
      }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    const result = await fetchYoutubeUploads("tok", "UU1", fetchImpl);
    expect(result.walkedIds).toBe(2); // first page + the one repeat, then the guard stops it
  });
});

describe("Instagram mappers", () => {
  it("parses the insights rows; absent metrics stay null", () => {
    const parsed = parseInstagramInsights({
      data: [
        { name: "views", values: [{ value: 321 }] },
        { name: "saved", values: [{ value: 7 }] },
      ],
    });
    expect(parsed).toEqual({ views: 321, reach: null, shares: null, saves: 7 });
    expect(parseInstagramInsights({})).toEqual(NO_INSIGHTS);
  });

  it("maps a media item: caption's first line is the title, counts land, insights fill their slots", () => {
    const post = mapInstagramMedia(
      { id: "m1", caption: "Big news today\nsecond line", timestamp: "2026-11-03T08:30:00+0000", permalink: "https://instagram.com/p/x", like_count: 12, comments_count: 3 },
      { views: 900, reach: 700, shares: 4, saves: 9 },
    );
    expect(post).toMatchObject({
      externalId: "m1",
      source: "instagram",
      title: "Big news today",
      views: 900,
      reach: 700,
      likes: 12,
      comments: 3,
      shares: 4,
      saves: 9,
    });
    expect(mapInstagramMedia({ id: "m2" })).toBeNull();
  });

  it("a failing insights call degrades to nulls instead of failing the sync", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/insights")) throw new Error("permission not granted");
      return json({ data: [{ id: "m1", caption: "Hi", timestamp: "2026-11-03T08:30:00+0000", like_count: 1, comments_count: 0 }] });
    }) as unknown as typeof fetch;
    const posts = await fetchInstagramMedia("tok", "ig-1", fetchImpl);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ views: null, reach: null, shares: null, saves: null, likes: 1 });
  });
});
