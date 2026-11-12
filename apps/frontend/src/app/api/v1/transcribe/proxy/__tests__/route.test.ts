// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PLANS } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";

/**
 * Route tests for GET /api/v1/transcribe/proxy — the same-origin proxy for
 * Transcribe link mode. Upstream fetch is mocked; auth and rate limiting are
 * stubbed, like the /content route tests.
 */

const auth = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "user-1", guest: false, db: null })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => auth);
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => {} }));

import { GET } from "../route";

const MAX_BYTES = PLANS.free.maxUploadBytes;

const headers = (init: Record<string, string>) => new Headers(init);

const get = (qs = "") => GET(new Request(`http://localhost/api/v1/transcribe/proxy${qs}`));

const mediaResponse = (body: BodyInit, contentType = "video/mp4", length?: number) =>
  new Response(body, {
    status: 200,
    headers: headers({
      "content-type": contentType,
      ...(length !== undefined ? { "content-length": String(length) } : {}),
    }),
  });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  auth.requireUser.mockResolvedValue({ id: "user-1", guest: false, db: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/v1/transcribe/proxy", () => {
  it("streams a direct mp4 link back with its type and file name", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(mediaResponse(new Blob(["x"], { type: "video/mp4" }), "video/mp4", 1000));
    const res = await get("?url=https%3A%2F%2Fcdn.example.com%2Fclip.mp4");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("1000");
    expect(res.headers.get("x-file-name")).toBe("clip.mp4");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("x");
    expect(fetch).toHaveBeenCalledWith("https://cdn.example.com/clip.mp4", { redirect: "manual" });
  });

  it("names a link with no media filename from its content-type", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(mediaResponse(new Blob(["x"], { type: "audio/mpeg" }), "audio/mpeg"));
    const res = await get("?url=https%3A%2F%2Fcdn.example.com%2Fdownload%3Fid%3D7");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-file-name")).toBe("transcribed-file.mp3");
  });

  it("passes a link with no content-type through — the browser-side probe decides", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(new Response(new Blob(["x"]), { status: 200, headers: headers({}) }));
    const res = await get("?url=https%3A%2F%2Fcdn.example.com%2Fclip.mp4");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-file-name")).toBe("clip.mp4");
    expect(await res.text()).toBe("x");
  });

  it("rejects a missing, non-http(s), or malformed url with VALIDATION", async () => {
    for (const qs of ["", "?url=notaurl", "?url=ftp%3A%2F%2Fexample.com%2Fclip.mp4"]) {
      const res = await get(qs);
      expect(res.status).toBe(422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      expect(json.error.code).toBe("VALIDATION");
      expect(json.error.message).toMatch(/http:\/\/ or https:\/\//);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses private and loopback addresses without fetching them", async () => {
    for (const raw of [
      "http://127.0.0.1/x.mp4",
      "http://10.0.0.5/x.mp4",
      "http://192.168.1.20/x.mp4",
      "http://localhost/x.mp4",
      "http://169.254.169.254/x.mp4",
      "http://[::1]/x.mp4",
    ]) {
      const res = await get(`?url=${encodeURIComponent(raw)}`);
      expect(res.status).toBe(422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      expect(json.error.code).toBe("VALIDATION");
      expect(json.error.message).toMatch(/private address/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a link the content-length already shows is over the limit, without streaming", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(mediaResponse(new Blob(["x"]), "video/mp4", MAX_BYTES + 1));
    const res = await get("?url=https%3A%2F%2Fcdn.example.com%2Fbig.mp4");
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
    expect(json.error.message).toMatch(/over the 50 MB limit/);
  });

  it("cuts off a body that runs over the limit with no content-length", async () => {
    // Raw bytes as the Response body: a Blob handed to the Response loses its size here,
    // so the oversize body has to be built from bytes, not from a Blob.
    (fetch as unknown as Mock).mockResolvedValueOnce(
      new Response(new Uint8Array(MAX_BYTES + 1), { status: 200, headers: headers({ "content-type": "video/mp4" }) }),
    );
    const res = await get("?url=https%3A%2F%2Fcdn.example.com%2Fbig.mp4");
    expect(res.status).toBe(200);
    await expect(res.arrayBuffer()).rejects.toThrow(/over the 50 MB limit/);
  });

  it("refuses a link that isn't a video or audio file", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(mediaResponse("<html/>", "text/html; charset=utf-8", 7));
    const res = await get("?url=https%3A%2F%2Fexample.com%2Fpage");
    expect(res.status).toBe(415);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("UNSUPPORTED_MEDIA");
    expect(json.error.message).toMatch(/isn't a video or audio file/);
  });

  it("reports an HTTP error status plainly", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(new Response("nope", { status: 404, headers: headers({}) }));
    const res = await get("?url=https%3A%2F%2Fcdn.example.com%2Fgone.mp4");
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("UPSTREAM_FAILED");
    expect(json.error.message).toMatch(/couldn't be opened \(HTTP 404\)/);
  });

  it("reports an unreachable link plainly", async () => {
    (fetch as unknown as Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const res = await get("?url=https%3A%2F%2Fdead.example.com%2Fclip.mp4");
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("UPSTREAM_FAILED");
    expect(json.error.message).toMatch(/Couldn't reach this link/);
  });

  it("follows a redirect to a public media file, re-checking the target", async () => {
    (fetch as unknown as Mock)
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: headers({ location: "https://cdn.example.com/clip.mp4" }) }))
      .mockResolvedValueOnce(mediaResponse(new Blob(["x"], { type: "video/mp4" }), "video/mp4", 1000));
    const res = await get("?url=https%3A%2F%2Fshort.example.com%2Fabc");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("x");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect to a private address", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: headers({ location: "http://127.0.0.1/secret" }) }),
    );
    const res = await get("?url=https%3A%2F%2Fshort.example.com%2Fabc");
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.message).toMatch(/private address/);
  });

  it("refuses a link that redirects too many times", async () => {
    (fetch as unknown as Mock).mockImplementation(async () =>
      new Response(null, { status: 302, headers: headers({ location: "https://short.example.com/abc" }) }),
    );
    const res = await get("?url=https%3A%2F%2Fshort.example.com%2Fabc");
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.message).toMatch(/redirects too many times/);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("requires a bearer token, like every other /api/v1 route", async () => {
    auth.requireUser.mockRejectedValueOnce(new ApiFailure("UNAUTHORIZED", "Missing bearer token"));
    const res = await get("?url=https%3A%2F%2Fcdn.example.com%2Fclip.mp4");
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(fetch).not.toHaveBeenCalled();
  });
});
