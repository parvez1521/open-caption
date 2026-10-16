/**
 * captionseasy-render: the rendering add-on for `captionseasy`. Renders the CaptionsEasy caption composition with
 * Remotion + headless Chrome on this machine: burn captions into a video (MP4) or export a transparent overlay
 * (.mov ProRes 4444 / .webm VP9). Usually used through `captionseasy` (render(), the CLI, the MCP caption_video tool).
 */
import { render as _render } from "./render";
import type { RenderOptions, RenderResult } from "../../cli/src/types";

/** Caption a local video. Transcribes first when no words are given (needs captionseasy-transcribe). */
export const render: (opts: RenderOptions) => Promise<RenderResult> = _render;
export type { RenderOptions, RenderResult } from "../../cli/src/types";
