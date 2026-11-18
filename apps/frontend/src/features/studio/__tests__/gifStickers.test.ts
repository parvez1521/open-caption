/**
 * GIF Stickers loader (2026-11-18): Openverse search over the documented API shape.
 * All network access is behind an injected fetch — these tests NEVER hit the network.
 * Pins: the search URL targets api.openverse.org only, asks for GIFs under commercial
 * licences, caps page_size at the anonymous limit (20), parses licence/creator/
 * attribution/tags, skips hits with no usable file URL, reports 429 as a rate limit,
 * caches repeat searches, and records per-item attribution.
 */
import { describe, expect, it, vi } from "vitest";
import {
  GIF_CATEGORIES,
  OPENVERSE_MAX_PAGE_SIZE,
  buildOpenverseGifSearchUrl,
  clearGifSearchCache,
  downloadGifBlob,
  gifAttributionFor,
  gifCreditLine,
  gifFileName,
  isOpenverseApiUrl,
  openverseLicenceLabel,
  parseOpenverseGif,
  parseOpenverseGifSearchResponse,
  saveGifAttribution,
  searchOpenverseGifs,
  type OpenverseFetch,
  type OpenverseGif,
} from "../gifStickers";

const HIT = {
  id: "abc-123",
  title: "Dancing cat",
  creator: "Jane Doe",
  creator_url: "https://example.com/jane",
  license: "by",
  license_version: "2.0",
  license_url: "https://creativecommons.org/licenses/by/2.0/",
  attribution: "\"Dancing cat\" by Jane Doe is licensed under CC BY 2.0.",
  foreign_landing_url: "https://www.flickr.com/photos/jane/1",
  url: "https://live.staticflickr.com/1/cat.gif",
  thumbnail: "https://live.staticflickr.com/1/cat_t.jpg",
  tags: [{ name: "cat" }, { name: "dance" }],
  width: 480,
  height: 360,
};

const RESPONSE = { result_count: 57, page_count: 3, page: 1, page_size: 20, results: [HIT] };

function fetchOk(json: unknown, status = 200): OpenverseFetch {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => json }));
}

describe("buildOpenverseGifSearchUrl", () => {
  it("targets api.openverse.org only, asks for GIFs under commercial licences", () => {
    const url = buildOpenverseGifSearchUrl({ query: "birthday" });
    expect(isOpenverseApiUrl(url)).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get("q")).toBe("birthday");
    expect(u.searchParams.get("extension")).toBe("gif");
    expect(u.searchParams.get("license_type")).toBe("commercial");
    expect(u.searchParams.get("page_size")).toBe("20");
  });

  it("caps page_size at the anonymous limit of 20", () => {
    expect(new URL(buildOpenverseGifSearchUrl({ query: "cat", perPage: 50 })).searchParams.get("page_size")).toBe("20");
    expect(OPENVERSE_MAX_PAGE_SIZE).toBe(20);
  });

  it("rejects non-Openverse hosts", () => {
    expect(isOpenverseApiUrl("https://api.openverse.org/v1/images/?q=x")).toBe(true);
    expect(isOpenverseApiUrl("https://evil.example.com/v1/images/?q=x")).toBe(false);
    expect(isOpenverseApiUrl("http://api.openverse.org/v1/images/?q=x")).toBe(false);
    expect(isOpenverseApiUrl("not a url")).toBe(false);
  });
});

describe("parseOpenverseGif", () => {
  it("parses licence, creator, attribution, source page and tags", () => {
    const g = parseOpenverseGif(HIT)!;
    expect(g.id).toBe("abc-123");
    expect(g.title).toBe("Dancing cat");
    expect(g.creator).toBe("Jane Doe");
    expect(g.licence).toBe("by");
    expect(g.licenceVersion).toBe("2.0");
    expect(g.attribution).toContain("Jane Doe");
    expect(g.sourceUrl).toBe("https://www.flickr.com/photos/jane/1");
    expect(g.tags).toEqual(["cat", "dance"]);
    expect(g.thumbnailUrl).toBe("https://live.staticflickr.com/1/cat_t.jpg");
    expect(openverseLicenceLabel(g)).toBe("CC BY 2.0");
  });

  it("labels CC0 and Public Domain Mark", () => {
    expect(openverseLicenceLabel({ licence: "cc0", licenceVersion: "1.0" })).toBe("CC0 1.0");
    expect(openverseLicenceLabel({ licence: "pdm", licenceVersion: null })).toBe("Public Domain Mark");
    expect(openverseLicenceLabel({ licence: "by-sa", licenceVersion: "4.0" })).toBe("CC BY-SA 4.0");
  });

  it("skips hits with no id or no usable file URL", () => {
    expect(parseOpenverseGif({ ...HIT, url: "" })).toBeNull();
    expect(parseOpenverseGif({ ...HIT, url: "http://insecure.example.com/x.gif" })).toBeNull();
    expect(parseOpenverseGif({ ...HIT, id: "" })).toBeNull();
    expect(parseOpenverseGif(null)).toBeNull();
    expect(parseOpenverseGif("nope")).toBeNull();
  });

  it("falls back to the file URL when no thumbnail is given", () => {
    const g = parseOpenverseGif({ ...HIT, thumbnail: "" })!;
    expect(g.thumbnailUrl).toBe(HIT.url);
  });

  it("credit line prefers the API attribution, else builds one", () => {
    const g = parseOpenverseGif(HIT)!;
    expect(gifCreditLine(g)).toBe(HIT.attribution);
    const noAttr = parseOpenverseGif({ ...HIT, attribution: "" })!;
    expect(gifCreditLine(noAttr)).toContain("Dancing cat");
    expect(gifCreditLine(noAttr)).toContain("Jane Doe");
    expect(gifCreditLine(noAttr)).toContain("CC BY 2.0");
  });
});

describe("parseOpenverseGifSearchResponse", () => {
  it("parses totals and drops unusable hits", () => {
    const res = parseOpenverseGifSearchResponse({ ...RESPONSE, results: [HIT, { ...HIT, id: "bad", url: "" }] });
    expect(res.total).toBe(57);
    expect(res.pageCount).toBe(3);
    expect(res.gifs).toHaveLength(1);
    expect(res.gifs[0]!.id).toBe("abc-123");
  });

  it("throws a plain message on a malformed body", () => {
    expect(() => parseOpenverseGifSearchResponse(null)).toThrow("couldn't read");
    expect(() => parseOpenverseGifSearchResponse("x")).toThrow("couldn't read");
  });
});

describe("searchOpenverseGifs", () => {
  it("returns parsed results from a mocked fetch and caches the repeat search", async () => {
    clearGifSearchCache();
    const fetchFn = fetchOk(RESPONSE);
    const first = await searchOpenverseGifs({ query: "cat" }, fetchFn);
    expect(first.gifs).toHaveLength(1);
    expect(first.total).toBe(57);
    const second = await searchOpenverseGifs({ query: "cat" }, fetchFn);
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    clearGifSearchCache();
  });

  it("reports a 429 as a rate limit, not a generic failure", async () => {
    clearGifSearchCache();
    await expect(searchOpenverseGifs({ query: "cat" }, fetchOk({}, 429))).rejects.toThrow("rate limit");
  });

  it("reports network failure plainly", async () => {
    clearGifSearchCache();
    const failing: OpenverseFetch = vi.fn(async () => { throw new Error("down"); });
    await expect(searchOpenverseGifs({ query: "cat" }, failing)).rejects.toThrow("Couldn't reach Openverse");
  });

  it("refuses an empty query", async () => {
    await expect(searchOpenverseGifs({ query: "   " }, fetchOk(RESPONSE))).rejects.toThrow("Type something");
  });
});

describe("downloadGifBlob", () => {
  it("downloads the GIF bytes from the indexed file URL", async () => {
    const blob = new Blob(["GIF89a"], { type: "image/gif" });
    const fetchFn: OpenverseFetch = vi.fn(async (url: string) => {
      expect(url).toBe(HIT.url);
      return { ok: true, status: 200, json: async () => ({}), blob: async () => blob };
    });
    const g = parseOpenverseGif(HIT)!;
    await expect(downloadGifBlob(g, fetchFn)).resolves.toBe(blob);
  });

  it("throws plainly on a failed download", async () => {
    const fetchFn: OpenverseFetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const g = parseOpenverseGif(HIT)!;
    await expect(downloadGifBlob(g, fetchFn)).rejects.toThrow("Couldn't download");
  });
});

describe("GIF_CATEGORIES", () => {
  it("has 10 browse categories, each with a plain-words query", () => {
    expect(GIF_CATEGORIES).toHaveLength(10);
    const ids = new Set(GIF_CATEGORIES.map((c) => c.id));
    expect(ids.size).toBe(10);
    for (const c of GIF_CATEGORIES) {
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(c.query.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("gifFileName + attribution store", () => {
  it("names the file per Openverse id so re-adding finds the existing asset", () => {
    const g = parseOpenverseGif(HIT)!;
    expect(gifFileName(g)).toBe("openverse-abc-123.gif");
  });

  it("records and reads back per-asset attribution (fake storage)", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    const g = parseOpenverseGif(HIT)!;
    expect(gifAttributionFor("asset-1", storage)).toBeNull();
    saveGifAttribution("asset-1", g, storage);
    const rec = gifAttributionFor("asset-1", storage)!;
    expect(rec.title).toBe("Dancing cat");
    expect(rec.creator).toBe("Jane Doe");
    expect(rec.licence).toBe("CC BY 2.0");
    expect(rec.sourceUrl).toBe("https://www.flickr.com/photos/jane/1");
    expect(rec.attribution).toContain("Jane Doe");
    expect(gifAttributionFor("asset-2", storage)).toBeNull();
  });
});
