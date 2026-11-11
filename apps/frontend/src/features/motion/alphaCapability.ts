/**
 * Alpha (transparent video) capability probe v2 — the pre-gate for in-browser transparent
 * export, plus the diagnostics that explain its answer.
 *
 * WHY V2 (2026-11-11): v1 gated the "WebM — transparent background" option behind FOUR
 * checks at once — VideoEncoder present, a VP9/VP8 `alpha: "keep"` config at a fixed
 * 640x360, a speculative DUAL-STREAM heuristic (two concurrent `isConfigSupported` calls
 * both reporting support), and the web renderer's own transparent check at the chosen
 * size — and hid the option SILENTLY when any of them failed. On the production site
 * (real Chrome, 2026-11-11) opaque VP9 export worked while the transparent option never
 * appeared, and no one could tell which check had withheld it: isConfigSupported answers
 * are claims about single configs, not about what an actual encode will do, so v1's extra
 * heuristics could (and did) produce false negatives that no encode attempt ever got to
 * overrule. The honesty mechanism was never the pre-gate — it is the POST-ENCODE guard
 * (alphaVerify.ts): a finished file is demuxed and must prove real alpha at 35%/65% of
 * its duration or nothing is downloaded. That guard is unchanged and absolute, so the
 * pre-gate only needs to avoid hopeless attempts.
 *
 * THE V2 GATE — availability is decided by exactly two checks, in order:
 *  (1) "no-videoencoder": the `VideoEncoder` global exists at all;
 *  (2) "config-unsupported" / "size-check": `VideoEncoder.isConfigSupported` for VP9
 *      with `alpha: "keep"` AT THE CHOSEN EXPORT SIZE returns supported. The failure is
 *      named "size-check" when the same config IS supported at the small baseline size
 *      (the browser can do it, just not this big — trying 720p may work) and
 *      "config-unsupported" when it is not supported at the baseline size either.
 * VP9 only: the renderer's alpha path is VP9 (the v1 probe could report "available" on
 * VP8 while the UI silently required VP9 — that inconsistency is gone).
 *
 * DIAGNOSTICS — measured and reported, NEVER gating: the renderer's transparent check
 * ("render-check"), the old dual-stream pair ("dual-stream"), and VP8 alpha support.
 * They ride along in the result so a withheld or misbehaving encode can be attributed,
 * and the encode attempt itself remains the arbiter: if the browser truly cannot encode
 * alpha, the render fails before anything is saved (and the post-encode guard would
 * reject an opaque result anyway).
 *
 * The decision logic (`evaluateAlphaCapability`) is pure and total: a gating answer that
 * is not positively proven (false, or null — the check threw / never ran) withholds the
 * option. Diagnostics never rescue or veto a gate answer.
 */

export type AlphaCodec = "vp9" | "vp8";

/** Every stage the probe measures, in the order failures are reported. */
export type AlphaProbeStage = "ok" | "no-videoencoder" | "config-unsupported" | "size-check" | "render-check" | "dual-stream";

/** The stages that can withhold availability — always a subset of the measured stages. */
export type AlphaBlockingStage = "no-videoencoder" | "config-unsupported" | "size-check";

export interface AlphaProbeInputs {
  /** (1) `typeof VideoEncoder !== "undefined"` */
  hasVideoEncoder: boolean;
  /** VP9 isConfigSupported with alpha:"keep" at the baseline probe size — null = unknown */
  vp9AlphaKeep: boolean | null;
  /**
   * VP9 isConfigSupported with alpha:"keep" at the chosen export size — null = unknown.
   * When no distinct size was probed, the live probe mirrors the baseline answer here.
   */
  vp9AlphaKeepAtSize: boolean | null;
  /** diagnostic only: VP8 isConfigSupported with alpha:"keep" */
  vp8AlphaKeep: boolean | null;
  /** diagnostic only: the web renderer's transparent check at the chosen size */
  renderCheck: boolean | null;
  /** diagnostic only: two distinct encoder configs for VP9 both report support */
  dualStream: boolean | null;
}

export interface AlphaCapability {
  /** decided ONLY by the gate stages (no-videoencoder, then the at-size VP9 config check) */
  available: boolean;
  /** the first measured stage that did not positively pass, in reporting order; "ok" if none failed */
  stage: AlphaProbeStage;
  /** the gate stage that withheld availability, or null when available */
  blockedBy: AlphaBlockingStage | null;
  /** "vp9" whenever VP9 alpha is proven at either probed size, else null */
  codec: AlphaCodec | null;
  /** the demoted checks, exactly as measured (null = unknown / not run) */
  diagnostics: {
    vp8AlphaKeep: boolean | null;
    renderCheck: boolean | null;
    dualStream: boolean | null;
  };
}

/**
 * Pure decision: raw probe answers -> the verdict the UI may act on.
 * Gate: encoder present AND the at-size VP9 alpha config supported. A config failure is
 * "size-check" when VP9 alpha works at the baseline size, else "config-unsupported".
 * Diagnostics only ever change which stage is REPORTED, never availability.
 */
export function evaluateAlphaCapability(inputs: AlphaProbeInputs): AlphaCapability {
  const diagnostics = { vp8AlphaKeep: inputs.vp8AlphaKeep, renderCheck: inputs.renderCheck, dualStream: inputs.dualStream };
  const codec: AlphaCodec | null = inputs.vp9AlphaKeep === true || inputs.vp9AlphaKeepAtSize === true ? "vp9" : null;
  if (!inputs.hasVideoEncoder) {
    return { available: false, stage: "no-videoencoder", blockedBy: "no-videoencoder", codec: null, diagnostics };
  }
  if (inputs.vp9AlphaKeepAtSize !== true) {
    const blockedBy: AlphaBlockingStage = inputs.vp9AlphaKeep === true ? "size-check" : "config-unsupported";
    return { available: false, stage: blockedBy, blockedBy, codec, diagnostics };
  }
  const stage: AlphaProbeStage = inputs.renderCheck !== true ? "render-check" : inputs.dualStream !== true ? "dual-stream" : "ok";
  return { available: true, stage, blockedBy: null, codec: "vp9", diagnostics };
}

/* ---------------- plain-language stage names (the UI line) ---------------- */

/** Each stage in plain words, for the one-line note under the format choice. */
export const ALPHA_STAGE_PLAIN: Record<Exclude<AlphaProbeStage, "ok">, string> = {
  "no-videoencoder": "no video encoder (WebCodecs) was found",
  "config-unsupported": "VP9 video with transparency isn't supported",
  "size-check": "transparent video isn't supported at this size — try 720p",
  "render-check": "the renderer can't make a transparent file here",
  "dual-stream": "the two encoders a transparent file uses aren't both available",
};

/** The exact line shown when the transparent option is withheld, naming the gate stage that withheld it. */
export function alphaUnavailableLine(blockedBy: AlphaBlockingStage): string {
  return `Transparent export isn't available in this browser: ${ALPHA_STAGE_PLAIN[blockedBy]}. It is available via the desktop Companion app (MOV/WebM with alpha).`;
}

/* ---------------- live probe (browser) ---------------- */

/** The minimal surface of VideoEncoder the probe needs — injectable so tests can fake it. */
export interface VideoEncoderLike {
  isConfigSupported: (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>;
}

export interface AlphaProbeEnv {
  VideoEncoder?: VideoEncoderLike;
  /**
   * The web renderer's own transparent check at a size (canRenderMediaOnWeb in the app).
   * Diagnostic only — its answer is reported, never gated on.
   */
  renderCheck?: (width: number, height: number) => Promise<boolean | null>;
}

export interface AlphaProbeSize {
  width: number;
  height: number;
}

/** The small size the baseline config check uses — distinguishes "can't at all" from "can't at this size". */
export const ALPHA_PROBE_BASELINE_SIZE: AlphaProbeSize = { width: 640, height: 360 };

/** WebCodecs codec strings for full-frame VP9 / VP8 (profile 0, 8-bit, 4:2:0). */
export const ALPHA_CODEC_STRINGS: Record<AlphaCodec, string> = {
  vp9: "vp09.00.10.08",
  vp8: "vp08.00.10.08",
};

/** The encoder config the probe asks about for one codec (30 fps). */
export function alphaEncoderConfig(codec: AlphaCodec, width = 640, height = 360): VideoEncoderConfig {
  return {
    codec: ALPHA_CODEC_STRINGS[codec],
    width,
    height,
    bitrate: 1_000_000,
    framerate: 30,
    alpha: "keep",
  };
}

async function configSupported(encoder: VideoEncoderLike, config: VideoEncoderConfig): Promise<boolean | null> {
  try {
    const result = await encoder.isConfigSupported(config);
    return result.supported === true;
  } catch {
    return null; // an exception is an unknown, and an unknown never proves a gate check
  }
}

/**
 * Run the probe against a real browser environment (or an injected fake).
 * `size` is the chosen export size: the gate's config check asks about VP9 alpha AT that
 * size. In any environment without WebCodecs (SSR, the test sandbox, older browsers) it
 * truthfully reports "no-videoencoder".
 */
export async function probeAlphaCapability(env?: AlphaProbeEnv, size?: AlphaProbeSize): Promise<AlphaCapability> {
  const encoder = env?.VideoEncoder ?? (globalThis as { VideoEncoder?: VideoEncoderLike }).VideoEncoder;
  if (!encoder) {
    return evaluateAlphaCapability({ hasVideoEncoder: false, vp9AlphaKeep: null, vp9AlphaKeepAtSize: null, vp8AlphaKeep: null, renderCheck: null, dualStream: null });
  }

  const target = size ?? ALPHA_PROBE_BASELINE_SIZE;
  const atBaseline = target.width === ALPHA_PROBE_BASELINE_SIZE.width && target.height === ALPHA_PROBE_BASELINE_SIZE.height;

  const [vp9AlphaKeep, vp9AtTarget, vp8AlphaKeep] = await Promise.all([
    configSupported(encoder, alphaEncoderConfig("vp9")),
    atBaseline ? Promise.resolve<boolean | null>(null) : configSupported(encoder, alphaEncoderConfig("vp9", target.width, target.height)),
    configSupported(encoder, alphaEncoderConfig("vp8")),
  ]);
  const vp9AlphaKeepAtSize = atBaseline ? vp9AlphaKeep : vp9AtTarget;

  // Diagnostic: dual-stream eligibility — two DISTINCT simultaneous VP9 configs (the
  // colour stream and the alpha-as-luma stream, which is how Mediabunny encodes alpha)
  // both reporting support. V1 gated on this; the platform offers no encoder-quota API,
  // so the pair of claims cannot prove simultaneous instantiation — it is reported, and
  // the encode attempt + post-encode guard decide the truth instead.
  let dualStream: boolean | null = null;
  if (vp9AlphaKeep === true || vp9AlphaKeepAtSize === true) {
    const pair = await Promise.all([
      configSupported(encoder, alphaEncoderConfig("vp9", 640, 360)),
      configSupported(encoder, alphaEncoderConfig("vp9", 320, 180)),
    ]);
    dualStream = pair[0] === null || pair[1] === null ? null : pair[0] && pair[1];
  }

  // Diagnostic: the web renderer's own transparent check at the chosen size.
  let renderCheck: boolean | null = null;
  if (env?.renderCheck) {
    try {
      renderCheck = await env.renderCheck(target.width, target.height);
    } catch {
      renderCheck = null;
    }
  }

  return evaluateAlphaCapability({ hasVideoEncoder: true, vp9AlphaKeep, vp9AlphaKeepAtSize, vp8AlphaKeep, renderCheck, dualStream });
}
