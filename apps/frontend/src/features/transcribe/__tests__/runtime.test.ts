import { afterEach, describe, expect, it, vi } from "vitest";
import { isConstrainedDevice, runtimeFor } from "../runtime";

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function setNavigator(value: Record<string, unknown>) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}
afterEach(() => {
  // @ts-expect-error test cleanup: vitest gives each file a fresh global anyway
  delete globalThis.navigator;
  vi.resetModules();
});

describe("constrained-device policy (phones must not get the heavy runtime)", () => {
  it("treats Android and iPhone browsers as constrained", () => {
    setNavigator({ userAgent: PHONE_UA });
    expect(isConstrainedDevice()).toBe(true);
    setNavigator({ userAgent: IPHONE_UA });
    expect(isConstrainedDevice()).toBe(true);
  });

  it("treats a low-memory desktop as constrained and a normal desktop as not", () => {
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 2 });
    expect(isConstrainedDevice()).toBe(true);
    setNavigator({ userAgent: DESKTOP_UA, deviceMemory: 8 });
    expect(isConstrainedDevice()).toBe(false);
    setNavigator({ userAgent: DESKTOP_UA });
    expect(isConstrainedDevice()).toBe(false);
  });

  it("the WASM runtime is the quantized (q8) one, for both model halves", () => {
    expect(runtimeFor("wasm").dtype).toEqual({ encoder_model: "q8", decoder_model_merged: "q8" });
    expect(runtimeFor("webgpu").dtype.encoder_model).toBe("fp16"); // desktop fast path unchanged
  });

  it("pickRuntime never picks WebGPU on a phone, even with an f16 adapter", async () => {
    const gpu = { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) };
    setNavigator({ userAgent: PHONE_UA, gpu });
    const rt = await import("../runtime");
    await expect(rt.pickRuntime()).resolves.toMatchObject({ device: "wasm" });
  });

  it("pickRuntime still picks WebGPU on a desktop with an f16 adapter", async () => {
    const gpu = { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) };
    setNavigator({ userAgent: DESKTOP_UA, gpu, deviceMemory: 8 });
    const rt = await import("../runtime");
    await expect(rt.pickRuntime()).resolves.toMatchObject({ device: "webgpu" });
  });
});
