"use client";

import React, { useRef, useState } from "react";
import { Button, Section, fmtBytes, fmtTime } from "../controls";

export interface MediaInfo {
  filename: string | null;
  size: number | null;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
}

/**
 * Media: the real facts about this project's video, and nothing else — the file itself never leaves
 * the device, so there is no server media library to browse. Re-link points the project at a copy of
 * the video stored on this device (the existing device-video attach path); it is for picking the same
 * file again, not for swapping in a different video — captions and timing stay as they are. Swapping
 * the video itself happens from the upload screen, where fresh captions are written for it.
 */
export const MediaPanel: React.FC<{
  video: MediaInfo;
  onRelink: (file: File) => Promise<void>;
}> = ({ video, onRelink }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows: { label: string; value: string }[] = [
    { label: "File name", value: video.filename ?? "Video on this device" },
    { label: "Dimensions", value: `${video.width} × ${video.height}` },
    { label: "Duration", value: fmtTime(video.durationMs) },
    { label: "Frame rate", value: `${Math.round(video.fps * 100) / 100} fps` },
    ...(video.size != null ? [{ label: "File size", value: fmtBytes(video.size) }] : []),
  ];
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Project media">
        <dl className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="shrink-0 text-st-muted">{r.label}</dt>
              <dd className="min-w-0 truncate text-right font-medium text-st-text" title={r.value}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Where the video lives" hint="Your video stays on this device. Only the captions and settings are saved to your account, so opening this project on another device asks you to pick the video file again.">
        <Button disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Linking…" : "Re-link video file"}</Button>
        <p className="text-xs text-st-faint">Pick the same video file on this device. The copy stored here is replaced; your captions and timing do not change.</p>
        {note ? <p role="status" className="text-xs text-st-muted">{note}</p> : null}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setNote(null);
            onRelink(f)
              .then(() => setNote(`Linked ${f.name} on this device.`))
              .catch((err) => setNote(err instanceof Error ? err.message : "Couldn't link that file."))
              .finally(() => setBusy(false));
          }}
        />
      </Section>
    </div>
  );
};
