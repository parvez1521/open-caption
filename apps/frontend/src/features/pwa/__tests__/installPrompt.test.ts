import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInstallPromptStore,
  isIosDevice,
  isStandaloneMode,
  registerServiceWorker,
  type InstallPromptEvent,
} from "../installPrompt";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPADOS_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("isIosDevice", () => {
  it("matches iPhone and iPad user agents", () => {
    expect(isIosDevice(IPHONE_UA)).toBe(true);
    expect(isIosDevice(IPAD_UA)).toBe(true);
  });

  it("matches iPadOS 13+ (Macintosh UA with touch points), not a real Mac", () => {
    expect(isIosDevice(IPADOS_MAC_UA, 5)).toBe(true);
    expect(isIosDevice(IPADOS_MAC_UA, 0)).toBe(false);
  });

  it("does not match Android or desktop user agents", () => {
    expect(isIosDevice(ANDROID_UA)).toBe(false);
    expect(isIosDevice(DESKTOP_UA)).toBe(false);
  });
});

describe("isStandaloneMode", () => {
  it("is true when display-mode is standalone or navigator.standalone is set", () => {
    const standaloneWindow = {
      matchMedia: () => ({ matches: true }),
      navigator: {},
    } as unknown as Window;
    expect(isStandaloneMode(standaloneWindow)).toBe(true);

    const iosStandaloneWindow = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    } as unknown as Window;
    expect(isStandaloneMode(iosStandaloneWindow)).toBe(true);
  });

  it("is false in a normal browser tab", () => {
    const browserWindow = {
      matchMedia: () => ({ matches: false }),
      navigator: {},
    } as unknown as Window;
    expect(isStandaloneMode(browserWindow)).toBe(false);
  });
});

describe("createInstallPromptStore", () => {
  it("keeps the first captured event until it is taken, then forgets it", () => {
    const store = createInstallPromptStore();
    expect(store.has()).toBe(false);
    expect(store.take()).toBeNull();
    const first = { prompt: async () => {} } as unknown as InstallPromptEvent;
    const second = { prompt: async () => {} } as unknown as InstallPromptEvent;
    store.capture(first);
    store.capture(second);
    expect(store.has()).toBe(true);
    expect(store.take()).toBe(first);
    expect(store.has()).toBe(false);
    expect(store.take()).toBeNull();
  });
});

describe("registerServiceWorker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing outside production unless the test seam allows it", async () => {
    // vitest runs with NODE_ENV=test, so the production gate must hold.
    expect(process.env.NODE_ENV).not.toBe("production");
    const register = vi.fn();
    await expect(
      registerServiceWorker({ navigatorRef: { serviceWorker: { register } as never } }),
    ).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("returns null when the browser has no service-worker support", async () => {
    await expect(
      registerServiceWorker({ allowNonProduction: true, navigatorRef: {} }),
    ).resolves.toBeNull();
  });

  it("registers /sw.js with root scope and returns the registration", async () => {
    const registration = { scope: "/" };
    const register = vi.fn().mockResolvedValue(registration);
    await expect(
      registerServiceWorker({
        allowNonProduction: true,
        navigatorRef: { serviceWorker: { register } as never },
      }),
    ).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("returns null instead of throwing when registration fails", async () => {
    const register = vi.fn().mockRejectedValue(new Error("denied"));
    await expect(
      registerServiceWorker({
        allowNonProduction: true,
        navigatorRef: { serviceWorker: { register } as never },
      }),
    ).resolves.toBeNull();
  });
});
