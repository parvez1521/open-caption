import { describe, expect, it } from "vitest";
import {
  PLATFORM_SUGGESTIONS,
  engagementOf,
  summariseMetric,
  validatePostRow,
  type GrowthPost,
} from "./model";

/**
 * The shared Growth Studio validator + metric helpers. These rules are the
 * single source for the API routes and the CSV importer, so each rejection
 * class is pinned here once.
 */

const validRow = {
  platform: "instagram",
  title: "Launch reel",
  postUrl: "https://instagram.com/reel/abc",
  postedAt: "2026-02-13T10:30:00.000Z",
  views: 1200,
  reach: 900,
  likes: 80,
  comments: 12,
  shares: 5,
  saves: 20,
};

describe("validatePostRow — happy path", () => {
  it("accepts a full row and trims text fields", () => {
    const res = validatePostRow({ ...validRow, platform: "  instagram  ", title: "  Launch reel " });
    expect(res).toEqual({ ok: true, value: validRow });
  });

  it("defaults title to '' and every unentered metric / url to null", () => {
    const res = validatePostRow({ platform: "youtube", postedAt: "2026-01-01" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      platform: "youtube",
      title: "",
      postUrl: null,
      postedAt: "2026-01-01T00:00:00.000Z",
      views: null,
      reach: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
    });
  });

  it("treats empty-string metrics and postUrl as not entered (null)", () => {
    const res = validatePostRow({ platform: "x", postedAt: "2026-01-01", views: "", postUrl: "  " });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.views).toBeNull();
    expect(res.value.postUrl).toBeNull();
  });

  it("coerces numeric-string metrics to numbers", () => {
    const res = validatePostRow({ platform: "x", postedAt: "2026-01-01", views: "4200", likes: " 17 " });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.views).toBe(4200);
    expect(res.value.likes).toBe(17);
  });

  it("accepts a metric of 0 and the 1e12 ceiling as real, entered values", () => {
    const res = validatePostRow({ platform: "x", postedAt: "2026-01-01", views: 0, reach: 1e12 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.views).toBe(0);
    expect(res.value.reach).toBe(1e12);
  });
});

describe("validatePostRow — rejections", () => {
  it("rejects a non-object row", () => {
    expect(validatePostRow(null).ok).toBe(false);
    expect(validatePostRow("nope").ok).toBe(false);
    expect(validatePostRow([1, 2]).ok).toBe(false);
  });

  it("rejects a missing, blank or over-long platform", () => {
    for (const platform of [undefined, "", "   ", "x".repeat(41), 42]) {
      const res = validatePostRow({ ...validRow, platform });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.join(" ")).toContain("platform");
    }
  });

  it("rejects an over-long title and a non-text title", () => {
    for (const title of ["x".repeat(201), 7]) {
      const res = validatePostRow({ ...validRow, title });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.join(" ")).toContain("title");
    }
  });

  it("rejects a postUrl without http(s), an over-long one, and a non-text one", () => {
    for (const postUrl of ["instagram.com/reel/abc", "ftp://x", `https://${"x".repeat(500)}`, 9]) {
      const res = validatePostRow({ ...validRow, postUrl });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.join(" ")).toContain("postUrl");
    }
    expect(validatePostRow({ ...validRow, postUrl: "http://example.com/a" }).ok).toBe(true);
  });

  it("rejects a missing or unparseable postedAt", () => {
    for (const postedAt of [undefined, "", "not a date", "2026-13-40", 12345]) {
      const res = validatePostRow({ ...validRow, postedAt });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.join(" ")).toContain("postedAt");
    }
  });

  it("rejects negative, float, NaN, over-ceiling and non-numeric metrics, naming the field", () => {
    const bad: Array<[string, unknown]> = [
      ["views", -1],
      ["likes", 1.5],
      ["comments", Number.NaN],
      ["shares", 1e12 + 1],
      ["saves", "lots"],
      ["reach", "12.5"],
      ["views", "-3"],
      ["likes", true],
    ];
    for (const [key, value] of bad) {
      const res = validatePostRow({ ...validRow, [key]: value });
      expect(res.ok, `${key}=${String(value)}`).toBe(false);
      if (!res.ok) expect(res.errors.join(" ")).toContain(key);
    }
  });

  it("collects multiple errors at once", () => {
    const res = validatePostRow({ platform: "", postedAt: "junk", views: -2 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });
});

const post = (over: Partial<GrowthPost>): GrowthPost => ({
  id: "p1",
  platform: "instagram",
  title: "",
  postUrl: null,
  postedAt: "2026-01-01T00:00:00.000Z",
  views: null,
  reach: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("engagementOf", () => {
  it("sums likes + comments + shares + saves", () => {
    expect(engagementOf(post({ likes: 10, comments: 2, shares: 3, saves: 4 }))).toBe(19);
  });

  it("counts unentered (null) metrics as 0 for this per-post number", () => {
    expect(engagementOf(post({ likes: 10 }))).toBe(10);
    expect(engagementOf(post({}))).toBe(0);
  });

  it("does not include views or reach", () => {
    expect(engagementOf(post({ views: 9999, reach: 8888 }))).toBe(0);
  });
});

describe("summariseMetric", () => {
  it("sums only reported values and counts how many posts reported", () => {
    const posts = [post({ views: 100 }), post({ views: null }), post({ views: 250 }), post({ views: 0 })];
    expect(summariseMetric(posts, "views")).toEqual({ total: 350, reportedCount: 3 });
  });

  it("reports 0 / 0 when nobody reported the metric — never an invented total", () => {
    expect(summariseMetric([post({}), post({})], "likes")).toEqual({ total: 0, reportedCount: 0 });
    expect(summariseMetric([], "likes")).toEqual({ total: 0, reportedCount: 0 });
  });
});

describe("PLATFORM_SUGGESTIONS", () => {
  it("is the documented suggestion list", () => {
    expect(PLATFORM_SUGGESTIONS).toEqual(["instagram", "youtube", "linkedin", "x", "facebook", "threads"]);
  });
});
