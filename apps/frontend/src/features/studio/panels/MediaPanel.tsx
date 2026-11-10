"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, Section, fmtBytes, fmtTime } from "../controls";
import type { Composition } from "../composition";
import { trackOf } from "../composition";
import { describeAssetLicence, describeAssetMeta } from "../mediaAssets";
import type { MediaAssetRecord } from "../mediaStore";
import type { ImportError } from "../useMediaAssets";
import { StockAudioSection } from "./StockAudioSection";

export interface MediaInfo {
  filename: string | null;
  size: number | null;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
}

export interface MediaPanelProps {
  video: MediaInfo;
  /** the Stage-A composition view: the source rows below read the main video clip from it */
  composition?: Composition | null;
  onRelink: (file: File) => Promise<void>;
  /** media bin (device-local, per project) */
  assets: MediaAssetRecord[];
  importing: boolean;
  onImport: (files: File[]) => Promise<ImportError[]>;
  onDeleteAsset: (id: string) => Promise<void>;
  onPlaceImage?: (asset: MediaAssetRecord) => void;
  /** stock audio (A10): the project id stock imports land in, and a bin refresh for when one lands */
  stockProjectId?: string | null;
  onStockAdded?: () => void;
}

/**
 * Media: the project's source video (facts + re-link, read off the composition's video track) and
 * the media bin — video/audio/image files imported into THIS project, stored in this browser's
 * IndexedDB and nowhere else. An imported video can take over as the project source through the
 * same attach path as re-link; an imported image can be placed as a timed overlay; an imported
 * audio file can be dragged onto the timeline or placed from the Audio panel.
 */
export const MediaPanel: React.FC<MediaPanelProps> = ({ video, composition, onRelink, assets, importing, onImport, onDeleteAsset, onPlaceImage, stockProjectId, onStockAdded }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const binRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ImportError[]>([]);

  // source facts from the composition's main video clip when the view is available
  const mainClip = composition ? trackOf(composition, "video").clips[0] : undefined;
  const src = mainClip && mainClip.kind === "video" ? mainClip.source : null;
  const rows: { label: string; value: string }[] = [
    { label: "File name", value: src?.filename ?? video.filename ?? "Video on this device" },
    { label: "Dimensions", value: `${src?.width ?? video.width} × ${src?.height ?? video.height}` },
    { label: "Duration", value: fmtTime(mainClip?.durationMs ?? video.durationMs) },
    { label: "Frame rate", value: `${Math.round((src?.fps ?? video.fps) * 100) / 100} fps` },
    ...((src?.size ?? video.size) != null ? [{ label: "File size", value: fmtBytes((src?.size ?? video.size)!) }] : []),
  ];

  const useAsSource = (a: MediaAssetRecord) => {
    setBusy(true);
    setNote(null);
    onRelink(new File([a.blob], a.name, { type: a.mime || a.blob.type }))
      .then(() => setNote(`Linked ${a.name} as the project video on this device.`))
      .catch((err) => setNote(err instanceof Error ? err.message : "Couldn't link that file."))
      .finally(() => setBusy(false));
  };

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
      <Section title="Media bin" hint="This project's files, kept in this browser only — not uploaded. Another browser shows an empty bin. Audio can be dragged onto the timeline or placed from the Audio panel.">
        <Button disabled={importing} onClick={() => binRef.current?.click()} className="w-full">{importing ? "Importing…" : "Import media"}</Button>
        <input
          ref={binRef}
          type="file"
          accept="video/*,audio/*,image/*,.mkv,.m4a,.flac,.opus,.avif"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (!files.length) return;
            setErrors([]);
            void onImport(files).then(setErrors);
          }}
        />
        {errors.length ? (
          <ul className="space-y-1" role="alert">
            {errors.map((er, i) => (
              <li key={`${er.name}-${i}`} className="text-xs text-orange-accent"><span className="font-medium">{er.name}:</span> {er.error}</li>
            ))}
          </ul>
        ) : null}
        {assets.length ? (
          <div className="space-y-1.5">
            {assets.map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                busy={busy}
                onUseAsSource={a.kind === "video" ? () => useAsSource(a) : undefined}
                onPlace={a.kind === "image" && onPlaceImage ? () => onPlaceImage(a) : undefined}
                onDelete={() => void onDeleteAsset(a.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-st-faint">Nothing imported yet. Add B-roll, music or a logo image and it stays here for this project.</p>
        )}
      </Section>
      <Section title="Stock audio" hint="A bundled CC0 pack of sound effects, plus Pixabay music and sounds imported with your own free Pixabay key. Imports land in the media bin with their licence record attached.">
        <StockAudioSection projectId={stockProjectId ?? null} onAdded={onStockAdded} tone="studio" />
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

const AssetRow: React.FC<{
  asset: MediaAssetRecord;
  busy: boolean;
  onUseAsSource?: () => void;
  onPlace?: () => void;
  onDelete: () => void;
}> = ({ asset, busy, onUseAsSource, onPlace, onDelete }) => (
  <div
    className="flex items-center gap-2.5 rounded-lg bg-st-raised/60 px-2.5 py-2"
    draggable={asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"}
    onDragStart={
      asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"
        ? (e) => {
            e.dataTransfer.setData("application/x-opencaption-asset", JSON.stringify({ id: asset.id, kind: asset.kind }));
            e.dataTransfer.effectAllowed = "copy";
          }
        : undefined
    }
  >
    <AssetThumb asset={asset} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-st-text" title={asset.name}>{asset.name}</p>
      <p className="text-xs tabular-nums text-st-muted">
        <span className="font-semibold uppercase tracking-wide">{asset.kind}</span> · {describeAssetMeta(asset)}
      </p>
      {asset.licence ? (
        <p className="text-xs text-st-faint">
          {describeAssetLicence(asset.licence)} ·{" "}
          <a href={asset.licence.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a>
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {onUseAsSource ? (
          <button type="button" disabled={busy} onClick={onUseAsSource} className="rounded-md border border-st-line px-2 py-0.5 text-[11px] font-medium text-st-text transition hover:bg-st-hover disabled:opacity-40">Use as project video</button>
        ) : null}
        {onPlace ? (
          <button type="button" onClick={onPlace} className="rounded-md border border-st-line px-2 py-0.5 text-[11px] font-medium text-st-text transition hover:bg-st-hover">Place as overlay</button>
        ) : null}
        <button type="button" onClick={onDelete} className="rounded-md border border-st-line px-2 py-0.5 text-[11px] font-medium text-orange-accent transition hover:bg-st-hover">Delete</button>
      </div>
    </div>
  </div>
);

/** Row thumbnail: the image itself, a captured video frame, or a mini waveform for audio. */
const AssetThumb: React.FC<{ asset: MediaAssetRecord }> = ({ asset }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = asset.kind === "image" ? asset.blob : asset.thumb;
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [asset]);
  if (asset.kind === "audio") return <AudioThumb peaks={asset.peaks} />;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-11 w-16 shrink-0 rounded-md bg-[#0B0B0A] object-cover" draggable={false} />;
  }
  return (
    <div className="grid h-11 w-16 shrink-0 place-items-center rounded-md bg-[#0B0B0A] text-[10px] font-semibold uppercase tracking-wide text-st-faint">
      {asset.kind}
    </div>
  );
};

const AudioThumb: React.FC<{ peaks: number[] | null }> = ({ peaks }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.length) return;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "#34D399";
    const per = c.width / peaks.length;
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * (c.height - 4));
      g.fillRect(i * per, (c.height - h) / 2, Math.max(1, per - 0.5), h);
    });
  }, [peaks]);
  if (!peaks?.length) {
    return <div className="grid h-11 w-16 shrink-0 place-items-center rounded-md bg-[#0B0B0A] text-[10px] font-semibold uppercase tracking-wide text-st-faint">Audio</div>;
  }
  return <canvas ref={ref} width={64} height={44} className="h-11 w-16 shrink-0 rounded-md bg-[#0B0B0A]" aria-hidden />;
};
