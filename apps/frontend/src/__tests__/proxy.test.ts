// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * D-5 (r3): the proxy is what sets the real 404 status for document
 * requests to /projects/<unknown-id> — route-level notFound() cannot,
 * because the shell streams before any segment's async work resolves
 * (verified live with curl + a delayed database stub). The layout's own
 * check stays for client-side (RSC) navigations, which the proxy lets
 * through. Fail-open everywhere: no env, a bad answer, a timeout or any
 * fetch error passes the request through.
 */

const KNOWN_ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "22222222-2222-4222-8222-222222222222";

const fetchMock = vi.fn();

const request = (path: string, rsc = false) =>
  new NextRequest(`http://test.local${path}`, rsc ? { headers: { RSC: "1" } } : {});

import proxy, { config } from "../proxy";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://stub.local";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("D-5 projects proxy", () => {
  it("matches the studio route and its sub-paths only", () => {
    expect(config.matcher).toEqual(["/projects/:id", "/projects/:id/:path*"]);
  });

  it("404s a non-UUID id without touching the database", async () => {
    const res = await proxy(request("/projects/does-not-exist-xyz"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await res.text()).toContain("This page");
  });

  it("404s an unknown-but-valid UUID after the existence check", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await proxy(request(`/projects/${UNKNOWN_ID}`));
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`id=eq.${UNKNOWN_ID}`);
    expect(url).toContain("deleted_at=is.null");
    expect(url).toContain("limit=1");
    expect((init.headers as Record<string, string>).apikey).toBe("service-key");
  });

  it("passes a known project id through", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: KNOWN_ID }] });
    const res = await proxy(request(`/projects/${KNOWN_ID}`));
    expect(res.status).toBe(200);
  });

  it("passes sub-paths (e.g. settings) through the same check", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await proxy(request(`/projects/${UNKNOWN_ID}/settings`));
    expect(res.status).toBe(404);
  });

  // NOTE (live, builds 4-6): in this Next 16.4.5 the RSC bypass below
  // is inert in `next start` — the server consumes every flight
  // signal before middleware runs, so live RSC fetches get the
  // proxy's plain 404 and the client falls back to a full navigation
  // onto this same 404 page. These tests pin the intended behaviour
  // at the unit level; see proxy.ts for the full finding.
  it("lets RSC (client-side) navigations through — the layout renders the 404 UI for those", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await proxy(request(`/projects/${UNKNOWN_ID}`, true));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets RSC requests through on the Next-Router-State-Tree header — the rsc header and ?_rsc param are stripped before the proxy live", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const req = new NextRequest(`http://test.local/projects/${UNKNOWN_ID}?_rsc=abc123`, {
      headers: { "Next-Router-State-Tree": "%5B%22%22%5D" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets prefetches through on the Next-Router-Prefetch header", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const req = new NextRequest(`http://test.local/projects/${UNKNOWN_ID}`, {
      headers: { "Next-Router-Prefetch": "1" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT bypass on ?_rsc alone — live, the server strips that param before middleware runs", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await proxy(request(`/projects/${UNKNOWN_ID}?_rsc=abc123`));
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails open when the database check errors", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const res = await proxy(request(`/projects/${UNKNOWN_ID}`));
    expect(res.status).toBe(200);
  });

  it("fails open on a non-2xx answer", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const res = await proxy(request(`/projects/${UNKNOWN_ID}`));
    expect(res.status).toBe(200);
  });

  it("fails open without env", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await proxy(request(`/projects/${UNKNOWN_ID}`));
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
