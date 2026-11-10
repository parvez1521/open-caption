import { CREATABLE_EXPORT_KINDS, exportDimensionsForAspect, type CreatableExportKind, type ExportResolution } from "@capseasy/shared";
import { effectiveAspect, type CanvasSettings } from "./canvas";

/**
 * The Export modal's options, derived from the shared CREATABLE_EXPORT_KINDS — the same list the
 * create-export API validates against (CreateExportBody in @capseasy/shared). There is no second
 * hand-maintained kind list here: the options are built by mapping that constant, and META is an
 * exhaustive Record keyed by it, so a kind the API learns to create cannot be forgotten by the UI
 * (and a kind the API cannot create, like png, can never be offered).
 *
 * `usesRange` is what the API actually honours for that kind, not a UI preference:
 * - mp4: the trim range is applied — in the browser render path the modal uses, and in the
 *   companion render job the API enqueues (its payload carries range, width, height and fps).
 * - mov_alpha / webm_alpha: the API stores the range and passes it into the companion render job,
 *   whose executor turns it into a frame range.
 * - the text kinds (srt / vtt / ass / txt / json): the API generates them from the whole caption
 *   document right away and ignores range, width, height and fps entirely, so they are false.
 */
export interface ExportOption {
  kind: CreatableExportKind;
  title: string;
  desc: string;
  usesRange: boolean;
  popular?: boolean;
  /**
   * Translated-track variant (slice 5.1): when set, the create-export call carries this target
   * language and the API generates the file from the TRANSLATED caption doc instead of the
   * primary one. Only subtitle text kinds get translated variants (see translatedTextOptions).
   */
  language?: string;
}

/** Stable identity of an option row: the kind, plus the language for translated variants. */
export const optionKey = (o: ExportOption): string => (o.language ? `${o.kind}:${o.language}` : o.kind);

/**
 * Translated subtitle options for the languages this project actually has a saved track for —
 * one SRT and one VTT per language, built AFTER the primary options. A language with no saved
 * translation gets no row (translate first, from the Translate panel).
 */
export function translatedTextOptions(tracks: { lang: string; label: string }[]): ExportOption[] {
  return tracks.flatMap(({ lang, label }) => [
    {
      kind: "srt" as const,
      language: lang,
      title: `${label} subtitles (.srt)`,
      desc: `The ${label} translation of your captions as an SRT file, with the same timings.`,
      usesRange: false,
    },
    {
      kind: "vtt" as const,
      language: lang,
      title: `${label} subtitles (.vtt)`,
      desc: `The ${label} translation of your captions as a WebVTT file, with the same timings.`,
      usesRange: false,
    },
  ]);
}

const META: Record<CreatableExportKind, Omit<ExportOption, "kind">> = {
  mp4: {
    title: "Video with captions (MP4)",
    desc: "Ready to post on Reels, Shorts and TikTok. Made right here in your browser.",
    usesRange: true,
    popular: true,
  },
  srt: {
    title: "Subtitles file (.srt)",
    desc: "For YouTube, LinkedIn, Premiere, CapCut and every editor.",
    usesRange: false,
  },
  vtt: {
    title: "Subtitles file (.vtt)",
    desc: "WebVTT subtitles for web video players, browsers and many editors.",
    usesRange: false,
  },
  ass: {
    title: "Styled subtitles file (.ass)",
    desc: "Subtitles with your caption style in them — font, colours and position — for editors and players that support ASS.",
    usesRange: false,
  },
  txt: {
    title: "Transcript (.txt)",
    desc: "Just the words as plain text, with no timings. Handy for notes, show notes and blog posts.",
    usesRange: false,
  },
  json: {
    title: "Caption data (.json)",
    desc: "The full caption document as JSON — every word and its timing — for other tools and developers.",
    usesRange: false,
  },
  mov_alpha: {
    title: "Caption overlay — ProRes (.mov)",
    desc: "Captions only on a transparent background, to lay over your footage in Premiere, Final Cut or DaVinci Resolve. The paired desktop app renders it — if no computer is paired and online, it stays queued.",
    usesRange: true,
  },
  webm_alpha: {
    title: "Caption overlay — WebM (.webm)",
    desc: "Captions only on a transparent background, to lay over your footage in editors that take WebM. The paired desktop app renders it — if no computer is paired and online, it stays queued.",
    usesRange: true,
  },
};

export const EXPORT_OPTIONS: ExportOption[] = CREATABLE_EXPORT_KINDS.map((kind) => ({ kind, ...META[kind] }));

/**
 * Output dims for an export, with the Run-2 canvas taken into account: the resolution's
 * short-edge rule (shared `exportDimensionsForAspect`) applied to the EFFECTIVE aspect —
 * the project's canvas aspect when one is chosen, else the source's own aspect. This is
 * the one dims computation both render paths use: the Export modal resolves `outDims`
 * through it (feeding the in-browser render AND the dims it sends in the companion-export
 * payload), and the create-export API route falls back to it when a client sends no dims.
 */
export function exportDimsWithCanvas(
  video: { width: number; height: number },
  canvas: Pick<CanvasSettings, "aspect"> | null | undefined,
  resolution: ExportResolution,
): { width: number; height: number } {
  const aspect = canvas ? effectiveAspect(canvas, video.width, video.height) : `${Math.max(1, video.width)}:${Math.max(1, video.height)}`;
  return exportDimensionsForAspect(aspect, resolution);
}
