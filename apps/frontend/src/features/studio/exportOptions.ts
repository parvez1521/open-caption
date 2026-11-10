import { CREATABLE_EXPORT_KINDS, type CreatableExportKind } from "@capseasy/shared";

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
    desc: "Captions only on a transparent background, with no video picture, to lay over your footage in Premiere, Final Cut or DaVinci Resolve. It renders in the paired desktop app, not in this browser: if no computer is paired and online, it stays queued until one is.",
    usesRange: true,
  },
  webm_alpha: {
    title: "Caption overlay — WebM (.webm)",
    desc: "Captions only on a transparent background, with no video picture, to lay over your footage in editors and tools that take WebM. It renders in the paired desktop app, not in this browser: if no computer is paired and online, it stays queued until one is.",
    usesRange: true,
  },
};

export const EXPORT_OPTIONS: ExportOption[] = CREATABLE_EXPORT_KINDS.map((kind) => ({ kind, ...META[kind] }));
