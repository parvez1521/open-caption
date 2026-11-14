import type { CSSProperties } from "react";
import type { CreatableExportKind } from "@capseasy/shared";
import { Play } from "@/components/ui/icons";

/**
 * Square format cards in the Export modal (owner 2026-11-15): each card shows a
 * small visual preview of what that export looks like, plus the short format
 * name only — no description sentences. Plain CSS/SVG, house icons only.
 */

export type ExportPreviewKind = CreatableExportKind | "png";

/** Short format name under each preview — the name only, no detail text. */
export const FORMAT_SHORT_LABEL: Record<ExportPreviewKind, string> = {
  mp4: "MP4",
  srt: ".srt",
  vtt: ".vtt",
  ass: ".ass",
  txt: ".txt",
  json: ".json",
  mov_alpha: ".mov",
  webm_alpha: ".webm",
  png: ".png",
};

/** Checkerboard = transparency, for the two overlay previews. */
const CHECKER: CSSProperties = {
  backgroundImage: "conic-gradient(#2E2E2A 25%, #1C1C1A 0 50%, #2E2E2A 0 75%, #1C1C1A 0)",
  backgroundSize: "12px 12px",
};

interface FormatPreviewProps {
  kind: ExportPreviewKind;
  /** first caption words when the project has them, else a short sample */
  sampleWords: string;
}

/** Caption line as it lands on a video frame. */
function CaptionLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1.5 pb-1.5 text-center text-[11px] font-bold leading-tight text-white">{children}</p>
  );
}

export function FormatPreview({ kind, sampleWords }: FormatPreviewProps) {
  const words = sampleWords.trim() || "Hello world";
  const [firstWord, ...restWords] = words.split(/\s+/);
  const captionWords = words.split(/\s+/).slice(0, 4).join(" ");
  const rest = restWords.join(" ");

  switch (kind) {
    case "mp4":
      return (
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#141412]" aria-hidden="true">
          <div className="relative min-h-0 flex-1">
            <Play className="absolute left-1.5 top-1.5 h-3.5 w-3.5 text-white/70" aria-hidden="true" />
          </div>
          <CaptionLine>{captionWords}</CaptionLine>
          <div className="h-0.5 w-full bg-st-line">
            <div className="h-full w-1/4 bg-st-em" />
          </div>
        </div>
      );
    case "srt":
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-0.5 bg-st-raised px-2 font-mono text-[10px] leading-snug" aria-hidden="true">
          <span className="text-st-muted">1</span>
          <span className="truncate text-st-text/80">{"00:00:01,000 --> 00:00:03,000"}</span>
          <span className="truncate font-semibold text-st-text">{captionWords}</span>
        </div>
      );
    case "vtt":
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-0.5 bg-st-raised px-2 font-mono text-[10px] leading-snug" aria-hidden="true">
          <span className="text-st-muted">WEBVTT</span>
          <span className="truncate text-st-text/80">{"00:00:01.000 --> 00:00:03.000"}</span>
          <span className="truncate font-semibold text-st-text">{captionWords}</span>
        </div>
      );
    case "ass":
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-end bg-st-raised px-2 pb-2" aria-hidden="true">
          <p className="text-center text-[12px] font-extrabold italic leading-tight">
            <span className="text-st-or">{firstWord}</span>
            {rest ? (
              <>
                {" "}
                <span className="text-st-em">{rest}</span>
              </>
            ) : null}
          </p>
        </div>
      );
    case "txt":
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center bg-st-raised px-2 text-[10px] leading-snug text-st-muted" aria-hidden="true">
          <p>{words}</p>
        </div>
      );
    case "json":
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center bg-st-raised px-2 font-mono text-[10px] leading-snug text-st-text/80" aria-hidden="true">
          <span>{"{"}</span>
          <span className="truncate pl-2">{`"words": [{"text": "${firstWord}",`}</span>
          <span className="pl-4">{`"start": 1000}]`}</span>
          <span>{"}"}</span>
        </div>
      );
    case "mov_alpha":
    case "webm_alpha":
      return (
        <div className="relative flex min-h-0 flex-1 flex-col justify-end" style={CHECKER} data-testid="format-preview-checkerboard" aria-hidden="true">
          <p className="px-1.5 pb-1.5 text-center text-[11px] font-bold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            {captionWords}
          </p>
        </div>
      );
    case "png":
      return (
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#141412]" aria-hidden="true">
          <div className="pointer-events-none absolute inset-2 rounded-sm border border-white/20" />
          <div className="min-h-0 flex-1" />
          <CaptionLine>{captionWords}</CaptionLine>
        </div>
      );
    default:
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center bg-st-raised px-2 text-[10px] leading-snug text-st-muted" aria-hidden="true">
          <p>{words}</p>
        </div>
      );
  }
}
