"use client";

import type { VideoSyncStatus } from "@/features/upload/videoSync";

/**
 * The video's cloud-sync state, shown next to "Saved" in the studio header.
 * One short line, same dot style as the save indicator. Unsynced and failed
 * render a small button (the explicit per-project sync action); the rest are
 * plain status text.
 */
const COPY: Record<VideoSyncStatus, { text: string; dot: string }> = {
  unsynced: { text: "Sync video", dot: "" },
  syncing: { text: "Syncing video…", dot: "bg-st-or animate-pulse" },
  synced: { text: "Video synced", dot: "bg-st-em" },
  "too-large": { text: "Too large to sync", dot: "" },
  failed: { text: "Retry sync", dot: "" },
};

export function VideoSyncStatus({ status, onSync }: { status: VideoSyncStatus; onSync: () => void }) {
  const copy = COPY[status];
  if (status === "unsynced" || status === "failed") {
    return (
      <button
        type="button"
        onClick={onSync}
        aria-live="polite"
        className="hidden items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold text-st-muted transition hover:bg-st-raised hover:text-st-text md:inline-flex"
      >
        {copy.text}
      </button>
    );
  }
  return (
    <span className="hidden items-center gap-1.5 text-xs text-st-muted md:inline-flex" aria-live="polite">
      {copy.dot ? <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} /> : null}
      {copy.text}
    </span>
  );
}
