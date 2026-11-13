// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google Identity Services + signInWithIdToken (2026-11-13 sign-in branding fix).
 *
 * What these tests prove — and what they CANNOT prove: the nonce pairing (Google gets the
 * SHA-256 hex, Supabase gets the raw nonce), the loader/fallback behaviour, and that
 * exchange errors surface instead of being swallowed. They cannot prove Google's account
 * chooser will say "captionit.in" — only a real live login after deploy can.
 */

const h = vi.hoisted(() => {
  // Loose on purpose: the tests swap this mock between success and the
  // error/no-session variants, so the mock's own type must admit all of them
  // (a mock typed from the success shape alone rejects the error variants
  // at typecheck time — the previous attempt's tsc failure).
  type Args = { provider: string; token: string; nonce: string };
  type Result = {
    data: { user: { id: string } | null; session: { access_token: string } | null };
    error: { message: string } | null;
  };
  return {
    signInWithIdToken: vi.fn(async (_args: Args): Promise<Result> => ({
      data: { user: { id: "user-1" }, session: { access_token: "session-token" } },
      error: null,
    })),
  };
});

vi.mock("../supabaseClient", () => ({
  supabase: { auth: { signInWithIdToken: h.signInWithIdToken } },
  isSupabaseConfigured: () => true,
}));

import {
  GOOGLE_IDENTITY_SERVICES_SCRIPT_URL,
  createNonce,
  exchangeGoogleCredential,
  loadGoogleIdentityServices,
  renderGoogleSignInButton,
  resetGoogleIdentityServicesForTests,
  sha256Hex,
} from "../googleIdToken";

const TEST_CLIENT_ID = "1234567890-abcdef.apps.googleusercontent.com";

const scriptInHead = () =>
  document.head.querySelector(`script[src="${GOOGLE_IDENTITY_SERVICES_SCRIPT_URL}"]`);

const installFakeGoogle = () => {
  const initialize = vi.fn();
  const renderButton = vi.fn();
  Object.defineProperty(window, "google", {
    value: { accounts: { id: { initialize, renderButton } } },
    configurable: true,
    writable: true,
  });
  return { initialize, renderButton };
};

const removeFakeGoogle = () => {
  Reflect.deleteProperty(window, "google");
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = TEST_CLIENT_ID;
  resetGoogleIdentityServicesForTests();
  removeFakeGoogle();
  h.signInWithIdToken.mockClear();
  h.signInWithIdToken.mockImplementation(async (_args: unknown) => ({
    data: { user: { id: "user-1" }, session: { access_token: "session-token" } },
    error: null,
  }));
});

afterEach(() => {
  document.head
    .querySelectorAll(`script[src="${GOOGLE_IDENTITY_SERVICES_SCRIPT_URL}"]`)
    .forEach((s) => s.remove());
  removeFakeGoogle();
  resetGoogleIdentityServicesForTests();
  delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
});

describe("sha256Hex", () => {
  it("matches known SHA-256 vectors", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("hello world")).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });
});

describe("createNonce", () => {
  it("returns a fresh value per attempt", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/); // crypto.randomUUID
  });
});

describe("loadGoogleIdentityServices", () => {
  it("resolves immediately when window.google is already present (no script injected)", async () => {
    const fake = installFakeGoogle();
    const gis = await loadGoogleIdentityServices();
    expect(gis).toBeDefined();
    expect(scriptInHead()).toBeNull();
    expect(fake.initialize).not.toHaveBeenCalled();
  });

  it("injects the GIS script and resolves on load", async () => {
    const p = loadGoogleIdentityServices();
    const script = scriptInHead();
    expect(script).not.toBeNull();
    expect(script?.getAttribute("src")).toBe(GOOGLE_IDENTITY_SERVICES_SCRIPT_URL);
    const fake = installFakeGoogle();
    script?.dispatchEvent(new Event("load"));
    const gis = await p;
    expect(gis).toBeDefined();
    expect(fake.initialize).not.toHaveBeenCalled();
  });

  it("rejects when the script errors, and a later call retries (no poisoned cache)", async () => {
    const p = loadGoogleIdentityServices();
    scriptInHead()?.dispatchEvent(new Event("error"));
    await expect(p).rejects.toThrow(/failed to load/i);
    // retry after failure: a fresh script element is injected, not the dead promise
    const p2 = loadGoogleIdentityServices();
    const retryScript = scriptInHead();
    expect(retryScript).not.toBeNull();
    installFakeGoogle();
    retryScript?.dispatchEvent(new Event("load"));
    await expect(p2).resolves.toBeDefined();
  });

  it("rejects on timeout", async () => {
    await expect(loadGoogleIdentityServices(5)).rejects.toThrow(/timed out/i);
  });
});

describe("renderGoogleSignInButton", () => {
  it("returns 'unavailable' with no client ID set (old OAuth flow stays)", async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const container = document.createElement("div");
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    expect(await renderGoogleSignInButton(container, { onSignedIn, onError })).toBe("unavailable");
    expect(scriptInHead()).toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("returns 'unavailable' when the GIS script fails to load", async () => {
    const container = document.createElement("div");
    const p = renderGoogleSignInButton(container, { onSignedIn: vi.fn(), onError: vi.fn() });
    scriptInHead()?.dispatchEvent(new Event("error"));
    expect(await p).toBe("unavailable");
  });

  it("initialises GIS with the client ID + hashed nonce and renders the pre-built button", async () => {
    const fake = installFakeGoogle();
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const result = await renderGoogleSignInButton(container, {
        onSignedIn: vi.fn(),
        onError: vi.fn(),
      });
      expect(result).toBe("gis");
      expect(fake.initialize).toHaveBeenCalledTimes(1);
      const init = fake.initialize.mock.calls[0][0];
      expect(init.client_id).toBe(TEST_CLIENT_ID);
      expect(init.use_fedcm_for_prompt).toBe(true);
      expect(init.nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof init.callback).toBe("function");
      expect(fake.renderButton).toHaveBeenCalledTimes(1);
      expect(fake.renderButton.mock.calls[0][0]).toBe(container);
      expect(fake.renderButton.mock.calls[0][1]).toMatchObject({
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "signin_with",
      });
      expect(typeof fake.renderButton.mock.calls[0][1].width).toBe("number");
    } finally {
      container.remove();
    }
  });

  it("can render into a second container after the first unmounts (login mode toggle)", async () => {
    // The login page renders the same Google button in both modes (google branch
    // and below the email form), so a google↔email toggle unmounts the button's
    // container. The page re-renders into the new container — that only works if
    // a second renderGoogleSignInButton call re-initialises and renders again.
    const fake = installFakeGoogle();
    const first = document.createElement("div");
    document.body.appendChild(first);
    const handlers = { onSignedIn: vi.fn(), onError: vi.fn() };
    try {
      expect(await renderGoogleSignInButton(first, handlers)).toBe("gis");
      expect(fake.renderButton).toHaveBeenCalledTimes(1);
      expect(fake.renderButton.mock.calls[0][0]).toBe(first);
      first.remove();
      const second = document.createElement("div");
      document.body.appendChild(second);
      try {
        expect(await renderGoogleSignInButton(second, handlers)).toBe("gis");
        expect(fake.initialize).toHaveBeenCalledTimes(2);
        expect(fake.renderButton).toHaveBeenCalledTimes(2);
        expect(fake.renderButton.mock.calls[1][0]).toBe(second);
        // each render gets a fresh nonce (a new button = a new sign-in attempt)
        expect(fake.initialize.mock.calls[0][0].nonce).not.toBe(
          fake.initialize.mock.calls[1][0].nonce,
        );
      } finally {
        second.remove();
      }
    } finally {
      first.remove();
    }
  });

  it("passes the credential + RAW nonce to signInWithIdToken, where the raw nonce hashes to the nonce given to Google", async () => {
    const fake = installFakeGoogle();
    const container = document.createElement("div");
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    expect(await renderGoogleSignInButton(container, { onSignedIn, onError })).toBe("gis");
    const init = fake.initialize.mock.calls[0][0];
    init.callback({ credential: "google-id-token-123" });
    await vi.waitFor(() => expect(h.signInWithIdToken).toHaveBeenCalledTimes(1));
    const exchanged = h.signInWithIdToken.mock.calls[0][0];
    expect(exchanged).toEqual({
      provider: "google",
      token: "google-id-token-123",
      nonce: expect.any(String),
    });
    // THE pairing rule: Google got sha256(raw), Supabase got raw.
    expect(await sha256Hex(exchanged.nonce)).toBe(init.nonce);
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces a missing credential as an error and never calls Supabase", async () => {
    const fake = installFakeGoogle();
    const container = document.createElement("div");
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    expect(await renderGoogleSignInButton(container, { onSignedIn, onError })).toBe("gis");
    fake.initialize.mock.calls[0][0].callback({});
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toMatch(/didn't return a sign-in credential/i);
    expect(h.signInWithIdToken).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase exchange error (not swallowed) and does not report success", async () => {
    const fake = installFakeGoogle();
    h.signInWithIdToken.mockImplementation(async (_args: unknown) => ({
      data: { user: null, session: null },
      error: { message: "Invalid ID token" },
    }));
    const container = document.createElement("div");
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    expect(await renderGoogleSignInButton(container, { onSignedIn, onError })).toBe("gis");
    fake.initialize.mock.calls[0][0].callback({ credential: "bad-token" });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0].message).toBe("Invalid ID token");
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe("exchangeGoogleCredential", () => {
  it("returns the session on success and throws the Supabase message on failure", async () => {
    const ok = await exchangeGoogleCredential("token-1", "raw-nonce-1");
    expect(ok.session.access_token).toBe("session-token");
    expect(h.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "token-1",
      nonce: "raw-nonce-1",
    });
    h.signInWithIdToken.mockImplementation(async (_args: unknown) => ({
      data: { user: null, session: null },
      error: { message: "Token expired" },
    }));
    await expect(exchangeGoogleCredential("token-2", "raw-nonce-2")).rejects.toThrow(
      "Token expired",
    );
  });

  it("throws when Supabase returns no session (error swallowed nowhere)", async () => {
    h.signInWithIdToken.mockImplementation(async (_args: unknown) => ({
      data: { user: null, session: null },
      error: null,
    }));
    await expect(exchangeGoogleCredential("token-3", "raw-nonce-3")).rejects.toThrow(
      /no session returned/i,
    );
  });
});
