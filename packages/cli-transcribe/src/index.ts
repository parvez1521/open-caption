/**
 * captionseasy-transcribe: the transcription add-on for `captionseasy`. Local Whisper (transformers.js on
 * onnxruntime-node, prebuilt binaries, no compiler needed) with word timestamps. The model downloads once into the
 * per-user cache. Usually used through `captionseasy` (transcribe(), the CLI, the MCP transcribe tool).
 */
import { transcribe as _transcribe, unloadModels as _unload } from "./transcribe";
import type { TranscribeOptions, Transcript } from "../../cli/src/types";

/** Transcribe a local video or audio file into timed words. */
export const transcribe: (videoPath: string, opts?: TranscribeOptions) => Promise<Transcript> = _transcribe;
/** Free the speech models held in memory (long-running hosts). */
export const unloadModels: () => Promise<void> = _unload;
export type { Language, TranscribeOptions, Transcript, TranscriptWord } from "../../cli/src/types";
