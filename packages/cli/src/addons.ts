/**
 * The optional add-ons. The core package stays tiny (looks, styles, caption props, MCP); heavy, machine-specific
 * pieces install only when wanted and are loaded on first use:
 *   captionseasy-render       headless Chrome rendering (@remotion/renderer + the pre-bundled composition)
 *   captionseasy-transcribe   local Whisper speech-to-text (transformers.js + onnxruntime-node)
 */
import { CaptionsEasyError } from "./errors";
import type { RenderOptions, RenderResult, TranscribeOptions, Transcript } from "./types";

export const ADDONS = {
  render: {
    pkg: "captionseasy-render",
    what: "Rendering videos",
    size: "~75 MB: Remotion's renderer, ffmpeg and the caption composition; it fetches a headless Chrome (~100 MB) on first render",
  },
  transcribe: {
    pkg: "captionseasy-transcribe",
    what: "Transcribing speech",
    size: "~540 MB: Whisper on onnxruntime; it downloads a ~200 MB speech model on first use",
  },
} as const;

export interface RenderAddon {
  render(opts: RenderOptions): Promise<RenderResult>;
}
export interface TranscribeAddon {
  transcribe(videoPath: string, opts?: TranscribeOptions): Promise<Transcript>;
}

export const installHint = (kind: keyof typeof ADDONS) => {
  const a = ADDONS[kind];
  return {
    install: `npm i ${a.pkg}`,
    npx: `npx -p captionseasy -p ${a.pkg} captionseasy ...`,
    message: `${a.what} is an optional add-on. Install it next to captionseasy: \`npm i ${a.pkg}\` (${a.size}). With npx: \`npx -p captionseasy -p ${a.pkg} captionseasy ...\`.`,
  };
};

const isMissing = (e: unknown, pkg: string) => {
  const err = e as { code?: string; message?: string };
  return (err?.code === "ERR_MODULE_NOT_FOUND" || err?.code === "MODULE_NOT_FOUND") && String(err.message).includes(pkg);
};

/** Import an add-on, or throw ADDON_MISSING with the exact install command. */
export async function loadAddon(kind: "render"): Promise<RenderAddon>;
export async function loadAddon(kind: "transcribe"): Promise<TranscribeAddon>;
export async function loadAddon(kind: keyof typeof ADDONS): Promise<unknown> {
  return importAddon(ADDONS[kind].pkg, kind);
}

/** Import `pkg`, turning "not installed" into ADDON_MISSING with the install command for `kind`. */
export async function importAddon(pkg: string, kind: keyof typeof ADDONS): Promise<unknown> {
  try {
    return await import(/* webpackIgnore: true */ pkg);
  } catch (e) {
    if (isMissing(e, pkg)) {
      const hint = installHint(kind);
      throw new CaptionsEasyError("ADDON_MISSING", hint.message, { addon: pkg, install: hint.install, npx: hint.npx });
    }
    throw e;
  }
}
