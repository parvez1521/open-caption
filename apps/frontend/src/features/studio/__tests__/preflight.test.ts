import { afterEach, describe, expect, it } from "vitest";
import { exportPreflightNote, fourKBlockReason, transcribePreflightWarning } from "../preflight";

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function setNavigator(value: Record<string, unknown>) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}
afterEach(() => {
  // @ts-expect-error test cleanup: vitest gives each file a fresh global anyway
  delete globalThis.navigator;
});

describe("fourKBlockReason (4K gate reuses the existing constrained-device signal)", () => {
  it("blocks 4K on a phone and says so in one line", () => {
    setNavigator({ userAgent: PHONE_UA });
    const reason = fourKBlockReason();
    expect(reason).toContain("4K is off");
    expect(reason).toContain("2K");
  });
  it("blocks 4K on a ≤4 GB desktop and names the reported memory", () => {
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 4 });
    expect(fourKBlockReason()).toContain("4 GB");
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 2 });
    expect(fourKBlockReason()).toContain("2 GB");
  });
  it("does not block 4K on an 8 GB desktop", () => {
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 8 });
    expect(fourKBlockReason()).toBeNull();
  });
  it("does not block 4K when the browser reports no memory", () => {
    setNavigator({ userAgent: DESKTOP_UA });
    expect(fourKBlockReason()).toBeNull();
  });
});

describe("transcribePreflightWarning", () => {
  it("warns for a long clip on a constrained device", () => {
    setNavigator({ userAgent: PHONE_UA });
    const w = transcribePreflightWarning(4 * 60 * 1000);
    expect(w).toContain("4-minute");
    expect(w).toContain("limited memory");
  });
  it("stays silent for a short clip on a constrained device", () => {
    setNavigator({ userAgent: PHONE_UA });
    expect(transcribePreflightWarning(60 * 1000)).toBeNull();
    expect(transcribePreflightWarning(2 * 60 * 1000)).toBeNull();
  });
  it("stays silent on a strong desktop whatever the length", () => {
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 8 });
    expect(transcribePreflightWarning(30 * 60 * 1000)).toBeNull();
  });
});

describe("exportPreflightNote", () => {
  it("notes 2K slowness on a constrained device only", () => {
    setNavigator({ userAgent: PHONE_UA });
    expect(exportPreflightNote("2k")).toContain("1080p");
    expect(exportPreflightNote("1080p")).toBeNull();
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 8 });
    expect(exportPreflightNote("2k")).toBeNull();
  });
});
