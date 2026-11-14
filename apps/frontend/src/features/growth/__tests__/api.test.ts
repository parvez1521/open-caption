// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/services/api-client", () => ({ apiClient: {} }));
import { mapGrowthPost } from "../api";

/**
 * C-03: the client mapper used to drop every synced post — server stamps
 * synced rows source 'youtube' | 'instagram', but asSource accepted only
 * 'manual' | 'csv', so /growth starters and /analytics saw "No posts yet"
 * for a fully-synced user.
 */
const row = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  platform: "instagram",
  title: "Test post",
  postUrl: null,
  postedAt: "2026-11-14T00:00:00Z",
  views: 10,
  reach: null,
  likes: 2,
  comments: 1,
  shares: 0,
  saves: 0,
  source: "manual",
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T00:00:00Z",
  ...over,
});

describe("mapGrowthPost source", () => {
  it.each(["manual", "csv", "youtube", "instagram"])("keeps a %s post", (source) => {
    const post = mapGrowthPost(row({ source }));
    expect(post).not.toBeNull();
    expect(post!.source).toBe(source);
  });

  it("drops a row whose source is anything else", () => {
    expect(mapGrowthPost(row({ source: "tiktok" }))).toBeNull();
    expect(mapGrowthPost(row({ source: undefined }))).toBeNull();
  });
});
