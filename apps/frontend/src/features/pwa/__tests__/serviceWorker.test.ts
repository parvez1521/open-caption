// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the real public/sw.js in a stubbed service-worker global and drives
 * its install / activate / fetch handlers with fake caches and fetch.
 * This tests the worker's actual behaviour — not string presence.
 */

const SW_SOURCE = readFileSync(
  fileURLToPath(new URL("../../../../public/sw.js", import.meta.url)),
  "utf8",
);

const ORIGIN = "https://www.captionit.in";

type FakeResponse = Response & { url?: string };

function makeRequest(url: string, mode: "navigate" | "no-cors" = "no-cors") {
  return { method: "GET", mode, url };
}

function makeHarness() {
  const listeners = new Map<string, Array<(event: never) => void>>();
  const cachesByName = new Map<string, Map<string, FakeResponse>>();
  const waitUntilPromises: Array<Promise<unknown>> = [];

  const fakeSelf = {
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    addEventListener: (type: string, fn: (event: never) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
  };

  function cacheObject(name: string) {
    let store = cachesByName.get(name);
    if (!store) {
      store = new Map();
      cachesByName.set(name, store);
    }
    return {
      // The real Cache API returns a fresh copy on every match; clone here
      // so a test that reads a cached body never drains the stored one.
      match: async (request: { url: string }, options?: { ignoreSearch?: boolean }) => {
        const key = options?.ignoreSearch ? request.url.split("?")[0] : request.url;
        const hit = store!.get(key);
        return hit ? hit.clone() : undefined;
      },
      put: async (request: { url: string }, response: FakeResponse) => {
        store!.set(request.url, response);
      },
      delete: async (request: { url: string }) => store!.delete(request.url),
    };
  }

  const cachesStub = {
    keys: async () => [...cachesByName.keys()],
    open: async (name: string) => cacheObject(name),
    match: async (request: { url: string }, options?: { ignoreSearch?: boolean }) => {
      for (const name of cachesByName.keys()) {
        const hit = await cacheObject(name).match(request, options);
        if (hit) return hit;
      }
      return undefined;
    },
    delete: async (name: string) => cachesByName.delete(name),
  };

  const fetchMock = vi.fn();
  const context = vm.createContext({
    self: fakeSelf,
    caches: cachesStub,
    fetch: fetchMock,
    Response,
    URL,
    console,
  });
  vm.runInContext(SW_SOURCE, context, { filename: "sw.js" });

  async function fire(type: string, event: Record<string, unknown>) {
    const handlers = listeners.get(type) ?? [];
    let responded: Promise<unknown> | undefined;
    const fullEvent = {
      ...event,
      respondWith: (promise: Promise<unknown>) => {
        responded = promise;
      },
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      },
    };
    for (const handler of handlers) handler(fullEvent as never);
    await Promise.all(waitUntilPromises.splice(0));
    return responded;
  }

  return { fakeSelf, cachesByName, fetchMock, fire };
}

const ok = (body = "ok") => new Response(body, { status: 200 });

describe("service worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skipWaiting on install and clears stale caches + claims clients on activate", async () => {
    const h = makeHarness();
    await h.fire("install", {});
    expect(h.fakeSelf.skipWaiting).toHaveBeenCalledTimes(1);

    // A stale cache from an older version must be dropped; the current
    // versioned caches (created by use) must survive.
    h.cachesByName.set("captionit-static-old", new Map());
    h.cachesByName.set("captionit-static-captionit-v1", new Map());
    await h.fire("activate", {});
    expect(h.cachesByName.has("captionit-static-old")).toBe(false);
    expect(h.cachesByName.has("captionit-static-captionit-v1")).toBe(true);
    expect(h.fakeSelf.clients.claim).toHaveBeenCalledTimes(1);
  });

  it("cache-first for versioned static assets, and serves the cache when offline", async () => {
    const h = makeHarness();
    const request = makeRequest(`${ORIGIN}/_next/static/chunks/app.js`);
    h.fetchMock.mockResolvedValueOnce(ok("v1"));
    const first = await h.fire("fetch", { request });
    expect(await (first as Response).text()).toBe("v1");
    expect(h.fetchMock).toHaveBeenCalledTimes(1);

    h.fetchMock.mockClear();
    const second = await h.fire("fetch", { request });
    expect(await (second as Response).text()).toBe("v1");
    expect(h.fetchMock).not.toHaveBeenCalled();

    h.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const third = await h.fire("fetch", { request });
    expect(await (third as Response).text()).toBe("v1");
  });

  it("network-first for navigations, caches the page, and falls back to it offline", async () => {
    const h = makeHarness();
    const request = makeRequest(`${ORIGIN}/pricing`, "navigate");
    h.fetchMock.mockResolvedValueOnce(ok("<html>pricing</html>"));
    const first = await h.fire("fetch", { request });
    expect(await (first as Response).text()).toBe("<html>pricing</html>");

    h.fetchMock.mockClear();
    h.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const second = await h.fire("fetch", { request });
    expect(await (second as Response).text()).toBe("<html>pricing</html>");
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an honest offline page (503) when a navigation fails with nothing cached", async () => {
    const h = makeHarness();
    h.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const response = (await h.fire("fetch", {
      request: makeRequest(`${ORIGIN}/pricing`, "navigate"),
    })) as Response;
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("You're offline");
    expect(body).toContain("needs a connection");
  });

  it("never intercepts API calls — they go straight to the network, uncached", async () => {
    const h = makeHarness();
    const request = makeRequest(`${ORIGIN}/api/v1/billing/me`);
    // The worker does not call respondWith for API routes at all: the
    // browser performs the request itself. So fire() resolves undefined
    // and the worker's fetch is never called — that IS the network-only
    // behaviour, and nothing is written to any cache.
    const response = await h.fire("fetch", { request });
    expect(response).toBeUndefined();
    expect(h.fetchMock).not.toHaveBeenCalled();
    let cached = false;
    for (const store of h.cachesByName.values()) {
      if (store.has(request.url)) cached = true;
    }
    expect(cached).toBe(false);
  });

  it("ignores cross-origin and non-GET requests entirely", async () => {
    const h = makeHarness();
    const crossOrigin = await h.fire("fetch", {
      request: makeRequest("https://fonts.googleapis.com/css2?family=x"),
    });
    expect(crossOrigin).toBeUndefined();
    const post = await h.fire("fetch", {
      request: { method: "POST", mode: "no-cors", url: `${ORIGIN}/api/v1/x` },
    });
    expect(post).toBeUndefined();
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});
