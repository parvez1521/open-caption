/**
 * Alpha capability probe: the decision logic is tested with injected fakes — the sandbox
 * has no real encoder, so what is pinned here is the LOGIC (every branch fails closed:
 * unknown = unavailable), plus the live probe's wiring against a fake VideoEncoder.
 */
import { describe, expect, it, vi } from "vitest";
import {
  alphaEncoderConfig,
  evaluateAlphaCapability,
  preferredAlphaCodec,
  probeAlphaCapability,
  type AlphaProbeInputs,
  type VideoEncoderLike,
} from "../alphaCapability";

const inputs = (patch: Partial<AlphaProbeInputs> = {}): AlphaProbeInputs => ({
  hasVideoEncoder: true,
  vp9AlphaKeep: null,
  vp8AlphaKeep: null,
  dualStream: null,
  ...patch,
});

describe("evaluateAlphaCapability (pure decision, fails closed)", () => {
  it("no WebCodecs -> unavailable, whatever else claims true", () => {
    expect(evaluateAlphaCapability(inputs({ hasVideoEncoder: false, vp9AlphaKeep: true, dualStream: true }))).toEqual({
      available: false,
      reason: "no-webcodecs",
      codec: null,
    });
  });

  it("encoder present but no alpha-capable codec proven -> unavailable (nulls count as no)", () => {
    expect(evaluateAlphaCapability(inputs())).toEqual({ available: false, reason: "no-alpha-codec", codec: null });
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: false, vp8AlphaKeep: false, dualStream: true })).reason).toBe("no-alpha-codec");
  });

  it("an alpha codec without proven dual-stream -> unavailable, codec still reported", () => {
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: true, dualStream: null }))).toEqual({
      available: false,
      reason: "single-encoder-only",
      codec: "vp9",
    });
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: true, dualStream: false })).reason).toBe("single-encoder-only");
  });

  it("VP9 preferred when both codecs pass; VP8 is the fallback; unknowns do not block a proven codec", () => {
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: true, vp8AlphaKeep: true, dualStream: true }))).toEqual({
      available: true,
      reason: "supported",
      codec: "vp9",
    });
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: false, vp8AlphaKeep: true, dualStream: true })).codec).toBe("vp8");
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: null, vp8AlphaKeep: true, dualStream: true }))).toEqual({
      available: true,
      reason: "supported",
      codec: "vp8",
    });
  });

  it("preferredAlphaCodec: vp9 > vp8 > null, and only an exact true counts", () => {
    expect(preferredAlphaCodec({ vp9AlphaKeep: true, vp8AlphaKeep: true })).toBe("vp9");
    expect(preferredAlphaCodec({ vp9AlphaKeep: null, vp8AlphaKeep: true })).toBe("vp8");
    expect(preferredAlphaCodec({ vp9AlphaKeep: false, vp8AlphaKeep: null })).toBeNull();
  });
});

describe("alphaEncoderConfig", () => {
  it("asks for alpha:'keep' with the full-frame codec strings", () => {
    expect(alphaEncoderConfig("vp9")).toMatchObject({ codec: "vp09.00.10.08", alpha: "keep", width: 640, height: 360 });
    expect(alphaEncoderConfig("vp8")).toMatchObject({ codec: "vp08.00.10.08", alpha: "keep" });
  });
});

describe("probeAlphaCapability (live probe against injected fakes)", () => {
  const fakeEncoder = (supported: (config: VideoEncoderConfig) => boolean): VideoEncoderLike => ({
    isConfigSupported: vi.fn(async (config: VideoEncoderConfig) => ({ supported: supported(config) })),
  });

  it("no VideoEncoder in the environment -> no-webcodecs (this sandbox's truthful answer)", async () => {
    await expect(probeAlphaCapability({})).resolves.toEqual({ available: false, reason: "no-webcodecs", codec: null });
    await expect(probeAlphaCapability()).resolves.toMatchObject({ available: false, reason: "no-webcodecs" });
  });

  it("VP9 alpha + dual configs supported -> available on vp9, and the probe really asked with alpha keep", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp09"));
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toEqual({ available: true, reason: "supported", codec: "vp9" });
    const calls = (enc.isConfigSupported as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as VideoEncoderConfig);
    expect(calls.length).toBeGreaterThanOrEqual(4); // vp9 + vp8 checks, then the dual pair
    expect(calls.every((c) => c.alpha === "keep")).toBe(true);
    const dualPair = calls.slice(2);
    expect(new Set(dualPair.map((c) => `${c.width}x${c.height}`)).size).toBe(2); // two distinct simultaneous configs
  });

  it("VP8-only support -> available on vp8", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp08"));
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toEqual({ available: true, reason: "supported", codec: "vp8" });
  });

  it("alpha codec supported but the second simultaneous config refused -> single-encoder-only", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp09") && (c.width ?? 0) >= 640);
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toEqual({
      available: false,
      reason: "single-encoder-only",
      codec: "vp9",
    });
  });

  it("a throwing isConfigSupported is an unknown, and an unknown is a no", async () => {
    const enc: VideoEncoderLike = {
      isConfigSupported: vi.fn(async () => {
        throw new Error("not a video encoder config");
      }),
    };
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toEqual({ available: false, reason: "no-alpha-codec", codec: null });
  });

  it("no codec supports alpha keep -> no-alpha-codec, and no dual check is attempted", async () => {
    const enc = fakeEncoder(() => false);
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toMatchObject({ available: false, reason: "no-alpha-codec" });
    expect(enc.isConfigSupported).toHaveBeenCalledTimes(2);
  });
});
