/** Every error this package (and its add-ons) throws on purpose: a stable `code` for agents, a human sentence for people. */
export type CaptionsEasyErrorCode =
  | "UNKNOWN_LOOK"
  | "BAD_OVERRIDE"
  | "BAD_SETTINGS"
  | "BAD_WORDS"
  | "BAD_ARGS"
  | "FILE_NOT_FOUND"
  | "ADDON_MISSING"
  | "NO_AUDIO"
  | "NO_VIDEO"
  | "TRANSCRIBE_FAILED"
  | "RENDER_FAILED";

export class CaptionsEasyError extends Error {
  readonly code: CaptionsEasyErrorCode;
  /** extra machine-readable context (valid keys, allowed range, install command ...) */
  readonly details?: unknown;
  constructor(code: CaptionsEasyErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CaptionsEasyError";
    this.code = code;
    this.details = details;
  }
}

/** Duck-typed: the add-on packages bundle their own copy of this class, so `instanceof` is not enough. */
export const isCaptionsEasyError = (e: unknown): e is CaptionsEasyError =>
  e instanceof CaptionsEasyError || (e instanceof Error && e.name === "CaptionsEasyError" && typeof (e as { code?: unknown }).code === "string");

export const errorJson = (e: unknown) =>
  isCaptionsEasyError(e)
    ? { error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } }
    : { error: { code: "INTERNAL", message: e instanceof Error ? e.message : String(e) } };
