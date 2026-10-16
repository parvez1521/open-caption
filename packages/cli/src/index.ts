/**
 * captionseasy: designed, animated captions for developers and AI agents. Bring your words, get styled captions.
 *
 *   listLooks()      the 99 designed caption looks (refer to one by its permanent number or id)
 *   describeLook()   one look's defaults and the controls it honours
 *   buildCaptions()  words + look (+ overrides) -> validated props for the CaptionedVideo composition
 *                    (render them in your own Remotion project with `captionseasy/remotion`)
 *   render()         [add-on captionseasy-render] burn captions into a video or export a transparent overlay
 *   transcribe()     [add-on captionseasy-transcribe] local Whisper: a video -> timed words
 *
 * No runtime dependencies. The signatures are spelled out here (types from ./types only) so the published typings
 * stay self-contained.
 */
import { loadAddon } from "./addons";
import { buildCaptions as _buildCaptions } from "./captions";
import { describeLook as _describeLook, listLooks as _listLooks } from "./looks";
import type { BuildCaptionsInput, CaptionsProps, ListLooksOptions, LookDetails, LookRef, LookSummary, RenderOptions, RenderResult, TranscribeOptions, Transcript } from "./types";

/** The gallery looks (retired ones excluded), optionally filtered by free text, tags or section. */
export const listLooks: (opts?: ListLooksOptions) => LookSummary[] = _listLooks;
/** One look's defaults and ONLY the controls its design honours. Throws UNKNOWN_LOOK. */
export const describeLook: (look: LookRef) => LookDetails = _describeLook;
/** words + look (+ overrides/settings) -> validated composition props. Throws BAD_OVERRIDE / BAD_SETTINGS / BAD_WORDS. */
export const buildCaptions: (input: BuildCaptionsInput) => CaptionsProps = _buildCaptions;

/**
 * Caption a local video: burn in (MP4) or a transparent overlay (.mov ProRes 4444 / .webm VP9).
 * Needs the optional add-on `captionseasy-render` (throws ADDON_MISSING with the install command otherwise).
 */
export async function render(opts: RenderOptions): Promise<RenderResult> {
  return (await loadAddon("render")).render(opts);
}

/**
 * Local speech-to-text with word timestamps. Needs the optional add-on `captionseasy-transcribe`
 * (throws ADDON_MISSING with the install command otherwise).
 */
export async function transcribe(videoPath: string, opts?: TranscribeOptions): Promise<Transcript> {
  return (await loadAddon("transcribe")).transcribe(videoPath, opts);
}

export { CaptionsEasyError, isCaptionsEasyError, type CaptionsEasyErrorCode } from "./errors";
export { VERSION } from "./version";
export type * from "./types";
