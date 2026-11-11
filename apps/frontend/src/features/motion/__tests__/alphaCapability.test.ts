/**
 * Alpha capability probe v2: the GATE is two checks (VideoEncoder present; VP9
 * alpha:"keep" supported at the chosen size) and everything else is a reported
 * diagnostic. The logic is pinned with injected fakes — the sandbox has no real encoder,
 * so what is tested is the DECISION: each failure maps to its stage, diagnostics never
 * gate, and unknowns never prove a gate check.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ALPHA_STAGE_PLAIN,
  alphaEncoderConfig,
  alphaUnavailableLine,
  evaluateAlphaCapability,
  probeAlphaCapability,
  type AlphaProbeInputs,
  type VideoEncoderLike,
} from "../alphaCapability";

const inputs = (patch: Partial<AlphaProbeInputs> = {}): AlphaProbeInputs => ({
  hasVideoEncoder: true,
  vp9AlphaKeep: null,
  vp9AlphaKeepAtSize: null,
  vp8AlphaKeep: null,
  renderCheck: null,
  dualStream: null,
  ...patch,
});

describe("evaluateAlphaCapability — the gate (v2)", () => {
  it("no WebCodecs -> withheld at no-videoencoder, whatever else claims true", () => {
    expect(evaluateAlphaCapability(inputs({ hasVideoEncoder: false, vp9AlphaKeep: true, vp9AlphaKeepAtSize: true, dualStream: true }))).toMatchObject({
      available: false,
      stage: "no-videoencoder",
      blockedBy: "no-videoencoder",
      codec: null,
    });
  });

  it("encoder present but VP9 alpha not proven at the chosen size (nulls count as no) -> config-unsupported", () => {
    expect(evaluateAlphaCapability(inputs())).toMatchObject({ available: false, stage: "config-unsupported", blockedBy: "config-unsupported", codec: null });
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: false, vp9AlphaKeepAtSize: false })).blockedBy).toBe("config-unsupported");
  });

  it("VP9 alpha works at the baseline size but not at the chosen size -> size-check, codec still reported", () => {
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: true, vp9AlphaKeepAtSize: false }))).toMatchObject({
      available: false,
      stage: "size-check",
      blockedBy: "size-check",
      codec: "vp9",
    });
  });

  it("VP9 alpha supported at the chosen size -> available, even if the baseline answer is unknown", () => {
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: null, vp9AlphaKeepAtSize: true, renderCheck: true, dualStream: true }))).toMatchObject({
      available: true,
      stage: "ok",
      blockedBy: null,
      codec: "vp9",
    });
  });

  it("VP8-only alpha support does NOT open the gate (the alpha path is VP9), but is reported as a diagnostic", () => {
    const cap = evaluateAlphaCapability(inputs({ vp9AlphaKeep: false, vp9AlphaKeepAtSize: false, vp8AlphaKeep: true }));
    expect(cap.available).toBe(false);
    expect(cap.blockedBy).toBe("config-unsupported");
    expect(cap.diagnostics.vp8AlphaKeep).toBe(true);
  });
});

describe("evaluateAlphaCapability — diagnostics never gate (the relaxed v2 gate)", () => {
  it("config-supported at size => available even when dual-stream AND render-check both fail", () => {
    const cap = evaluateAlphaCapability(inputs({ vp9AlphaKeep: true, vp9AlphaKeepAtSize: true, dualStream: false, renderCheck: false }));
    expect(cap.available).toBe(true);
    expect(cap.blockedBy).toBeNull();
    expect(cap.codec).toBe("vp9");
    // the first failing diagnostic is still reported as the stage
    expect(cap.stage).toBe("render-check");
    expect(cap.diagnostics).toEqual({ vp8AlphaKeep: null, renderCheck: false, dualStream: false });
  });

  it("render-check passing but dual-stream failing -> available, stage reports dual-stream", () => {
    const cap = evaluateAlphaCapability(inputs({ vp9AlphaKeep: true, vp9AlphaKeepAtSize: true, renderCheck: true, dualStream: false }));
    expect(cap.available).toBe(true);
    expect(cap.stage).toBe("dual-stream");
  });

  it("every measured stage passing -> stage ok", () => {
    expect(evaluateAlphaCapability(inputs({ vp9AlphaKeep: true, vp9AlphaKeepAtSize: true, renderCheck: true, dualStream: true })).stage).toBe("ok");
  });
});

describe("plain-language stage lines", () => {
  it("every non-ok stage has a plain-language name", () => {
    for (const stage of ["no-videoencoder", "config-unsupported", "size-check", "render-check", "dual-stream"] as const) {
      expect(ALPHA_STAGE_PLAIN[stage].length).toBeGreaterThan(0);
    }
  });

  it("the withheld line names the blocking stage and keeps the Companion pointer", () => {
    expect(alphaUnavailableLine("no-videoencoder")).toBe(
      "Transparent export isn't available in this browser: no video encoder (WebCodecs) was found. It is available via the desktop Companion app (MOV/WebM with alpha).",
    );
    expect(alphaUnavailableLine("config-unsupported")).toContain(ALPHA_STAGE_PLAIN["config-unsupported"]);
    expect(alphaUnavailableLine("size-check")).toContain(ALPHA_STAGE_PLAIN["size-check"]);
    expect(alphaUnavailableLine("size-check")).toContain("Companion app (MOV/WebM with alpha)");
  });
});

describe("alphaEncoderConfig", () => {
  it("asks for alpha:'keep' with the full-frame codec strings, at the baseline size by default", () => {
    expect(alphaEncoderConfig("vp9")).toMatchObject({ codec: "vp09.00.10.08", alpha: "keep", width: 640, height: 360 });
    expect(alphaEncoderConfig("vp9", 1080, 1920)).toMatchObject({ codec: "vp09.00.10.08", alpha: "keep", width: 1080, height: 1920 });
    expect(alphaEncoderConfig("vp8")).toMatchObject({ codec: "vp08.00.10.08", alpha: "keep" });
  });
});

describe("probeAlphaCapability (live probe against injected fakes)", () => {
  const fakeEncoder = (supported: (config: VideoEncoderConfig) => boolean): VideoEncoderLike => ({
    isConfigSupported: vi.fn(async (config: VideoEncoderConfig) => ({ supported: supported(config) })),
  });

  it("no VideoEncoder in the environment -> no-videoencoder (this sandbox's truthful answer)", async () => {
    await expect(probeAlphaCapability({})).resolves.toMatchObject({ available: false, stage: "no-videoencoder", blockedBy: "no-videoencoder" });
    await expect(probeAlphaCapability()).resolves.toMatchObject({ available: false, blockedBy: "no-videoencoder" });
  });

  it("VP9 alpha supported -> available on vp9, and the probe really asked with alpha keep", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp09"));
    const cap = await probeAlphaCapability({ VideoEncoder: enc, renderCheck: async () => true });
    expect(cap).toMatchObject({ available: true, stage: "ok", blockedBy: null, codec: "vp9" });
    const calls = (enc.isConfigSupported as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as VideoEncoderConfig);
    expect(calls.length).toBeGreaterThanOrEqual(4); // vp9 baseline + vp8, then the dual-stream pair
    expect(calls.every((c) => c.alpha === "keep")).toBe(true);
  });

  it("VP9 alpha only up to the baseline size -> available at the default size, size-check at 1080x1920", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp09") && (c.width ?? 0) <= 640 && (c.height ?? 0) <= 360);
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toMatchObject({ available: true, codec: "vp9" });
    await expect(probeAlphaCapability({ VideoEncoder: enc }, { width: 1080, height: 1920 })).resolves.toMatchObject({
      available: false,
      stage: "size-check",
      blockedBy: "size-check",
      codec: "vp9",
    });
  });

  it("the second simultaneous config refused (v1's single-encoder-only) -> STILL available; dual-stream is a diagnostic now", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp09") && (c.width ?? 0) >= 640);
    const cap = await probeAlphaCapability({ VideoEncoder: enc, renderCheck: async () => true });
    expect(cap.available).toBe(true);
    expect(cap.blockedBy).toBeNull();
    expect(cap.stage).toBe("dual-stream");
    expect(cap.diagnostics.dualStream).toBe(false);
  });

  it("the renderer's transparent check failing -> still available; render-check is a diagnostic, and the probe asked at the chosen size", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp09"));
    const renderCheck = vi.fn(async (_w: number, _h: number) => false);
    const cap = await probeAlphaCapability({ VideoEncoder: enc, renderCheck }, { width: 720, height: 1280 });
    expect(cap.available).toBe(true);
    expect(cap.stage).toBe("render-check");
    expect(cap.diagnostics.renderCheck).toBe(false);
    expect(renderCheck).toHaveBeenCalledWith(720, 1280);
  });

  it("a throwing isConfigSupported is an unknown, and an unknown never proves the gate", async () => {
    const enc: VideoEncoderLike = {
      isConfigSupported: vi.fn(async () => {
        throw new Error("not a video encoder config");
      }),
    };
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toMatchObject({ available: false, blockedBy: "config-unsupported" });
  });

  it("no codec supports alpha keep -> config-unsupported", async () => {
    const enc = fakeEncoder(() => false);
    await expect(probeAlphaCapability({ VideoEncoder: enc })).resolves.toMatchObject({ available: false, stage: "config-unsupported", blockedBy: "config-unsupported" });
  });

  it("VP8-only encoder -> config-unsupported (VP9 gate), vp8 answer kept as a diagnostic", async () => {
    const enc = fakeEncoder((c) => c.codec.startsWith("vp08"));
    const cap = await probeAlphaCapability({ VideoEncoder: enc });
    expect(cap.available).toBe(false);
    expect(cap.blockedBy).toBe("config-unsupported");
    expect(cap.diagnostics.vp8AlphaKeep).toBe(true);
  });
});
