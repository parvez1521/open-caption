import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMediaLink, linkFileName } from "../fetchMediaLink";

const LIMITS = { maxBytes: 50 * 1024 * 1024 };

function headers(map: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v;
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function response(opts: { ok?: boolean; status?: number; type?: string; length?: number; blob?: Blob }) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: headers({
      ...(opts.type ? { "content-type": opts.type } : {}),
      ...(opts.length !== undefined ? { "content-length": String(opts.length) } : {}),
    }),
    blob: async () => opts.blob ?? new Blob(["x".repeat(10)], { type: opts.type ?? "video/mp4" }),
  };
}

describe("fetchMediaLink", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a bad URL and a non-http(s) URL without fetching", async () => {
    await expect(fetchMediaLink("not a link", LIMITS)).rejects.toThrow("Paste a full link starting with http:// or https://.");
    await expect(fetchMediaLink("ftp://example.com/video.mp4", LIMITS)).rejects.toThrow("Paste a full link starting with http:// or https://.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names YouTube, short YouTube and Instagram links instead of failing as a mystery", async () => {
    await expect(fetchMediaLink("https://www.youtube.com/watch?v=oFwB6gZLRmc", LIMITS)).rejects.toThrow(
      "Links from youtube.com don't share the video file",
    );
    await expect(fetchMediaLink("https://youtu.be/oFwB6gZLRmc", LIMITS)).rejects.toThrow(
      "Links from youtu.be don't share the video file",
    );
    await expect(fetchMediaLink("https://www.instagram.com/reel/abc123/", LIMITS)).rejects.toThrow(
      "Links from instagram.com don't share the video file",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a file the HEAD pre-check says is over the limit", async () => {
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4", length: LIMITS.maxBytes + 1 }));
    await expect(fetchMediaLink("https://example.com/big.mp4", LIMITS)).rejects.toThrow("over the");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tells a dead link from a CORS block with the no-cors probe", async () => {
    // HEAD fails silently, GET fails, probe fails too -> dead link.
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchMediaLink("https://example.com/gone.mp4", LIMITS)).rejects.toThrow("Couldn't reach this link");

    // HEAD fails, GET fails, probe succeeds (opaque) -> the host is up, CORS is the block.
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 0, type: "opaque" });
    await expect(fetchMediaLink("https://example.com/blocked.mp4", LIMITS)).rejects.toThrow("This link blocks downloads");
  });

  it("reports an HTTP error status plainly", async () => {
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4" })); // HEAD: no length
    fetchMock.mockResolvedValueOnce(response({ ok: false, status: 404, type: "video/mp4" }));
    await expect(fetchMediaLink("https://example.com/missing.mp4", LIMITS)).rejects.toThrow("HTTP 404");
  });

  it("refuses a link that serves HTML or audio instead of video", async () => {
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4" }));
    fetchMock.mockResolvedValueOnce(response({ type: "text/html; charset=utf-8" }));
    await expect(fetchMediaLink("https://example.com/page", LIMITS)).rejects.toThrow("isn't a video file");

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response({ type: "audio/mpeg" }));
    fetchMock.mockResolvedValueOnce(response({ type: "audio/mpeg" }));
    await expect(fetchMediaLink("https://example.com/song.mp3", LIMITS)).rejects.toThrow("isn't a video file");
  });

  it("refuses a video over the limit from the GET headers, and an empty file", async () => {
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4" }));
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4", length: LIMITS.maxBytes + 1 }));
    await expect(fetchMediaLink("https://example.com/big.mp4", LIMITS)).rejects.toThrow("over the");

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4" }));
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4", blob: new Blob([], { type: "video/mp4" }) }));
    await expect(fetchMediaLink("https://example.com/empty.mp4", LIMITS)).rejects.toThrow("This link is empty.");
  });

  it("returns a File named from the URL, or a plain name when the URL has none", async () => {
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4" }));
    fetchMock.mockResolvedValueOnce(response({ type: "video/mp4", length: 10 }));
    const file = await fetchMediaLink("https://cdn.example.com/clips/trailer.mp4?x=1", LIMITS);
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("trailer.mp4");
    expect(file.type).toBe("video/mp4");

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(response({ type: "video/webm" }));
    fetchMock.mockResolvedValueOnce(response({ type: "video/webm", length: 10 }));
    const unnamed = await fetchMediaLink("https://cdn.example.com/watch/abc123", LIMITS);
    expect(unnamed.name).toBe("linked-video.webm");
  });
});

describe("linkFileName", () => {
  it("keeps a media filename from the URL and falls back to the served type", () => {
    expect(linkFileName(new URL("https://cdn.example.com/a/b.mp4"), "video/mp4")).toBe("b.mp4");
    expect(linkFileName(new URL("https://cdn.example.com/a/b"), "video/webm")).toBe("linked-video.webm");
    expect(linkFileName(new URL("https://cdn.example.com/a/b"), null)).toBe("linked-video.mp4");
  });
});
