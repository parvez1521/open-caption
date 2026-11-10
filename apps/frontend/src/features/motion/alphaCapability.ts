/**
 * Alpha (transparent video) capability probe — the honesty gate for in-browser transparent export.
 *
 * A transparent WebM (RFC 9559 / Matroska AlphaMode) needs THREE things to be true in the
 * visitor's browser at once:
 *  (a) WebCodecs is present at all (`VideoEncoder`);
 *  (b) a VP9 or VP8 encoder configuration with `alpha: "keep"` is supported — the colour
 *      stream must be allowed to carry alpha intent;
 *  (c) DUAL-STREAM eligibility: transparent WebM is two encodings of the same frames (the
 *      colour picture, and the alpha channel re-encoded as a luma picture — Mediabunny's
 *      encoder does exactly this split internally) muxed into one track, the alpha stream
 *      riding as per-frame BlockAdditions under an `AlphaMode=1` track flag. That needs TWO
 *      simultaneous encoder configurations for the same codec. WebCodecs exposes no encoder
 *      quota API, so eligibility is probed as two concurrent `isConfigSupported` calls for
 *      distinct configs of the chosen codec both reporting support — the strongest signal
 *      the platform offers short of actually encoding.
 *
 * The decision logic (`evaluateAlphaCapability`) is pure and total: an UNKNOWN answer
 * (null — the check threw, or was never run) is treated exactly like a NO. A capability
 * that cannot be proven is reported as unavailable, never as available.
 *
 * STATUS IN THIS APP: the probe is real and runs against the live browser, but the
 * transparent export option is NOT shipped. The mux layer is proven (Mediabunny's WebM
 * muxer writes AlphaMode + BlockAdditions and its demuxer reads the alpha bytes back —
 * verified in Node with synthetic VP9 packets), but the ENCODE side cannot be proven in
 * the build/test environment (no VideoEncoder/VideoFrame exists there), so per the
 * honesty gate the UI shows the solid-background line and points at the Companion app.
 * Nothing in this file is wired to an export format until every link is proven.
 */

export type AlphaCodec = "vp9" | "vp8";

export interface AlphaProbeInputs {
  /** (a) `typeof VideoEncoder !== "undefined"` */
  hasVideoEncoder: boolean;
  /** (b) isConfigSupported for VP9 with alpha:"keep" — null = check failed / not run */
  vp9AlphaKeep: boolean | null;
  /** (b) isConfigSupported for VP8 with alpha:"keep" — null = check failed / not run */
  vp8AlphaKeep: boolean | null;
  /** (c) two simultaneous encoder configs for the chosen codec both supported — null = unknown */
  dualStream: boolean | null;
}

export type AlphaCapabilityReason = "supported" | "no-webcodecs" | "no-alpha-codec" | "single-encoder-only";

export interface AlphaCapability {
  available: boolean;
  reason: AlphaCapabilityReason;
  /** the codec that passed, when available (or the alpha-capable codec when only the dual check failed) */
  codec: AlphaCodec | null;
}

/** The codec an alpha probe prefers: VP9 first (better compression), VP8 as the fallback. */
export function preferredAlphaCodec(inputs: Pick<AlphaProbeInputs, "vp9AlphaKeep" | "vp8AlphaKeep">): AlphaCodec | null {
  if (inputs.vp9AlphaKeep === true) return "vp9";
  if (inputs.vp8AlphaKeep === true) return "vp8";
  return null;
}

/**
 * Pure decision: raw probe answers -> the one verdict the UI may act on.
 * Every branch fails closed — anything not positively proven is unavailable.
 */
export function evaluateAlphaCapability(inputs: AlphaProbeInputs): AlphaCapability {
  if (!inputs.hasVideoEncoder) return { available: false, reason: "no-webcodecs", codec: null };
  const codec = preferredAlphaCodec(inputs);
  if (!codec) return { available: false, reason: "no-alpha-codec", codec: null };
  if (inputs.dualStream !== true) return { available: false, reason: "single-encoder-only", codec };
  return { available: true, reason: "supported", codec };
}

/* ---------------- live probe (browser) ---------------- */

/** The minimal surface of VideoEncoder the probe needs — injectable so tests can fake it. */
export interface VideoEncoderLike {
  isConfigSupported: (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>;
}

export interface AlphaProbeEnv {
  VideoEncoder?: VideoEncoderLike;
}

/** WebCodecs codec strings for full-frame VP9 / VP8 (profile 0, 8-bit, 4:2:0). */
export const ALPHA_CODEC_STRINGS: Record<AlphaCodec, string> = {
  vp9: "vp09.00.10.08",
  vp8: "vp08.00.10.08",
};

/** The encoder config the probe asks about for one codec (small, ordinary, 30 fps). */
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
    return null; // an exception is an unknown, and an unknown is a no
  }
}

/**
 * Run the probe against a real browser environment (or an injected fake).
 * Defaults to the page's own `VideoEncoder`; in any environment without WebCodecs
 * (SSR, the test sandbox, older browsers) it truthfully reports "no-webcodecs".
 */
export async function probeAlphaCapability(env?: AlphaProbeEnv): Promise<AlphaCapability> {
  const encoder = env?.VideoEncoder ?? (globalThis as { VideoEncoder?: VideoEncoderLike }).VideoEncoder;
  if (!encoder) return evaluateAlphaCapability({ hasVideoEncoder: false, vp9AlphaKeep: null, vp8AlphaKeep: null, dualStream: null });

  const [vp9AlphaKeep, vp8AlphaKeep] = await Promise.all([
    configSupported(encoder, alphaEncoderConfig("vp9")),
    configSupported(encoder, alphaEncoderConfig("vp8")),
  ]);
  const codec = preferredAlphaCodec({ vp9AlphaKeep, vp8AlphaKeep });

  // (c) dual-stream eligibility for the chosen codec: two DISTINCT simultaneous configs
  // (the colour stream and the alpha-as-luma stream differ at least in size here, mirroring
  // a real pair) must both report support in the same session.
  let dualStream: boolean | null = null;
  if (codec) {
    const pair = await Promise.all([
      configSupported(encoder, alphaEncoderConfig(codec, 640, 360)),
      configSupported(encoder, alphaEncoderConfig(codec, 320, 180)),
    ]);
    dualStream = pair[0] === null || pair[1] === null ? null : pair[0] && pair[1];
  }

  return evaluateAlphaCapability({ hasVideoEncoder: true, vp9AlphaKeep, vp8AlphaKeep, dualStream });
}
