/**
 * Public types of the `captionseasy` package. Self-contained on purpose (no imports), so the published typings never
 * point at the private workspace packages they are bundled from.
 */

/** Which speech model transcribes: English, Hinglish (Hindi/English written in Roman letters) or auto-detect. */
export type Language = "en" | "hinglish" | "auto";

/** One spoken word with its timing on the video's clock (milliseconds). */
export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Transcript {
  /** "en", "hi-Latn" (Hinglish) or "auto" */
  language: string;
  /** speech model id@revision that wrote the words */
  model: string;
  durationMs: number;
  /** wall-clock time the transcription took */
  elapsedMs: number;
  words: TranscriptWord[];
}

export interface TranscribeOptions {
  /** default "en" */
  language?: Language;
  /** 0..1 while the speech windows are transcribed */
  onProgress?: (fraction: number) => void;
  /** no model-download progress on stderr */
  quiet?: boolean;
}

/** A look: a complete, designed caption style. Refer to it by `number` (permanent) or `id`. */
export interface LookSummary {
  number: number;
  id: string;
  name: string;
  /** gallery section ("viral", "popular", "premium" ...) */
  section: string;
  tags: string[];
  description: string;
  /** "word" (one word at a time), "sentence", "karaoke" ... */
  layout: string;
  /** words shown per caption card by default */
  wordsPerCard: number;
}

export type ControlType = "number" | "color" | "boolean" | "enum" | "font";

/** One thing you may change about a look, addressed by `key` (a dot path into the style). */
export interface LookControl {
  key: string;
  label: string;
  type: ControlType;
  min?: number;
  max?: number;
  step?: number;
  /** allowed values for "enum" (and the bundled fonts for "font") */
  options?: (string | number)[];
  /** the look's own value */
  default: unknown;
  /** this control only takes effect once another key has this value ("stroke.enabled=true"); setting it turns that on */
  dependsOn?: string;
  description?: string;
}

/** Caption pacing/timing keys (shared by every look). */
export interface SettingControl {
  key: string;
  label: string;
  type: ControlType;
  min?: number;
  max?: number;
  step?: number;
  options?: (string | number)[];
  default: unknown;
  description?: string;
}

export interface LookDetails extends LookSummary {
  retired: boolean;
  /** the look's style values that its controls read (a flat dot-path map) */
  defaults: Record<string, unknown>;
  /** ONLY the style controls this look's template really responds to */
  controls: LookControl[];
  /** caption pacing (words per card, timing) */
  settings: SettingControl[];
}

export interface ListLooksOptions {
  /** free text matched against number, id, name, description, tags, section and layout (every word must match) */
  query?: string;
  /** every tag must match (case-insensitive substring) */
  tags?: string[];
  /** a gallery section id ("viral", "popular", "premium", "simple" ...) */
  section?: string;
}

/** A look number (118, "118", "#118") or id ("chrome_sweep"). */
export type LookRef = number | string;

/** Style overrides: flat dot paths (`{"active.color": "#FF0000"}`) or nested objects; validated against the look. */
export type StyleOverrides = Record<string, unknown>;

/** Caption pacing overrides, e.g. `{ maxWordsPerCard: 2, gapBehavior: "clear" }`. */
export type SettingsOverrides = Record<string, unknown>;

export interface BuildCaptionsInput {
  words: TranscriptWord[];
  look: LookRef;
  overrides?: StyleOverrides;
  settings?: SettingsOverrides;
  /** language tag stored in the caption doc (default "en") */
  language?: string;
}

/** Validated input for the CaptionedVideo composition (plus what was chosen). */
export interface CaptionsProps {
  /** CaptionDoc v2: words with ids */
  doc: Record<string, unknown> & { version: 2; words: (TranscriptWord & { id: string })[] };
  /** full CaptionStyle (every field filled in) */
  style: Record<string, unknown> & { templateId: string };
  /** full ProjectSettings */
  settings: Record<string, unknown> & { maxWordsPerCard: number };
  look: { number: number; id: string; name: string };
  /** non-fatal notes (e.g. "turned on stroke.enabled because stroke.width was set") */
  warnings: string[];
}

export type OverlayFormat = "mov" | "webm";

export interface RenderOptions {
  /** local video file */
  video: string;
  /** timed words; omit (with no transcript) to transcribe the video first */
  words?: TranscriptWord[];
  /** a Transcript from transcribe() (or its JSON); alternative to `words` */
  transcript?: { words: TranscriptWord[]; language?: string };
  /** language for transcription when no words are given (default "en") */
  language?: Language;
  look: LookRef;
  overrides?: StyleOverrides;
  settings?: SettingsOverrides;
  /** output path; default "<video>.captioned.mp4" (burn) or "<video>.captions.mov|webm" (overlay) */
  out?: string;
  /** "burn" (default): captions over the video, MP4 with the original audio. "overlay": transparent captions only. */
  mode?: "burn" | "overlay";
  /** overlay container: "mov" = ProRes 4444 with alpha (default, edits in every NLE), "webm" = VP9 with alpha (small, web) */
  overlayFormat?: OverlayFormat;
  /** 0..1 */
  onProgress?: (fraction: number, stage: "transcribe" | "render") => void;
  /** frames rendered in parallel (default: half the CPU cores) */
  concurrency?: number;
  quiet?: boolean;
}

export interface RenderResult {
  out: string;
  mode: "burn" | "overlay";
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  look: { number: number; id: string; name: string };
  /** words that were captioned */
  words: number;
  renderMs: number;
  /** set when the video was transcribed as part of this call */
  transcribeMs?: number;
  warnings: string[];
}
