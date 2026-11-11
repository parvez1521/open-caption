"use client";

import React, { useRef } from "react";
import type { MotionTemplate } from "@capseasy/motion";
import { ColorField } from "@/features/studio/controls";
import { clampTextLines, lineLabelsFor } from "./lineLabels";

/**
 * The registry-generated template form — ONE component, two homes (P4, 2026-11-11):
 * the /motion customize page and the Studio inspector's "Edit template" block both
 * render THIS, so a placed graphic can be edited with exactly the same fields it
 * was created with. Fields come from the template's registry entry (text / colour
 * / image); duration rides along when the caller wires it. Callers own the state
 * and the asset plumbing (the page stages uploads into the Motion staging bin;
 * the inspector works on the project's own bin) — this component only renders
 * fields and reports changes.
 *
 * Duration bounds mirror MotionConfigSchema (400–30,000 ms) — the same bounds
 * the customize page has always enforced.
 */
export const MOTION_DURATION_MIN = 400;
export const MOTION_DURATION_MAX = 30000;
export const clampMotionDuration = (ms: number): number =>
  Math.min(MOTION_DURATION_MAX, Math.max(MOTION_DURATION_MIN, Math.round(Number.isFinite(ms) ? ms : MOTION_DURATION_MIN)));

export interface MotionTemplateImageAdapter {
  /** the currently chosen asset's display name, or null when none is chosen */
  assetName: string | null;
  /** bin assets to pick from (inspector); omit on the customize page, where the
   *  single staged asset is the whole story */
  options?: { id: string; name: string }[];
  selectedAssetId?: string | null;
  onSelect: (asset: { id: string; name: string } | null) => void;
  /** the caller validates + stores the file, then reflects it via assetName/options */
  onUpload: (file: File) => void;
  busy?: boolean;
  error?: string | null;
  /** small print under the field; defaults to the customize page's storage note */
  note?: string | null;
}

export interface MotionTemplateFieldsProps {
  template: MotionTemplate;
  text: string;
  color: string;
  onTextChange: (value: string) => void;
  onColorChange: (value: string) => void;
  /** required when the template has an image field; ignored otherwise */
  image?: MotionTemplateImageAdapter;
  durationMs?: number;
  onDurationChange?: (ms: number) => void;
  tone?: "page" | "studio";
}

export const MotionTemplateFields: React.FC<MotionTemplateFieldsProps> = ({
  template, text, color, onTextChange, onColorChange, image, durationMs, onDurationChange, tone = "page",
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const lineLabels = lineLabelsFor(template.id);
  const studio = tone === "studio";

  const labelCls = studio ? "block text-[11px] font-medium text-st-muted" : "block text-[13px] font-medium text-sand-800";
  const labelSpanCls = studio ? "mb-1 block" : "mb-1.5 block";
  const textareaCls = studio
    ? "w-full rounded-lg border border-st-line bg-st-raised px-2 py-1.5 text-[13px] text-st-text outline-none"
    : "w-full rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-[14px] text-ink outline-none focus:border-sand-400";
  const hintCls = studio ? "mt-1 block text-[11px] font-normal text-st-faint" : "mt-1 block text-[12px] font-normal text-sand-600";
  const colorWrapCls = studio
    ? "rounded-lg border border-st-line bg-st-raised px-2 py-1.5"
    : "rounded-lg border border-sand-200 bg-sand-50 px-3 py-2";
  const chipCls = studio
    ? "min-w-0 flex-1 truncate rounded-lg border border-st-line bg-st-raised px-2 py-1.5 text-[12px] text-st-text"
    : "min-w-0 flex-1 truncate rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-[13px] text-ink";
  const btnCls = studio
    ? "rounded-md border border-st-line px-2.5 py-1 text-[11px] font-semibold text-st-text transition hover:bg-st-hover disabled:opacity-50"
    : "rounded-full border border-sand-200 bg-sand-50 px-3.5 py-1.5 text-[12px] font-semibold text-ink transition hover:border-sand-300 disabled:opacity-50";
  const btnDangerCls = studio
    ? "rounded-md border border-st-line px-2.5 py-1 text-[11px] font-semibold text-orange-accent transition hover:bg-st-hover"
    : "rounded-full border border-sand-200 bg-sand-50 px-3.5 py-1.5 text-[12px] font-semibold text-orange-accent transition hover:border-sand-300";
  const selectCls = studio
    ? "w-full rounded-lg border border-st-line bg-st-raised px-2 py-1.5 text-[13px] text-st-text outline-none"
    : "w-full rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-[13px] text-ink outline-none";
  const numberCls = studio
    ? "w-24 rounded-lg border border-st-line bg-st-raised px-2 py-1 text-[12px] tabular-nums text-st-text outline-none"
    : "w-24 rounded-lg border border-sand-200 bg-sand-50 px-2.5 py-1.5 text-[13px] tabular-nums text-ink outline-none focus:border-sand-400";

  return (
    <>
      {template.fields.map((field) => {
        if (field.kind === "text") {
          return (
            <label key={field.key} className={labelCls}>
              <span className={labelSpanCls}>{field.label}</span>
              <textarea
                value={text}
                rows={Math.min(field.maxLines ?? 3, 6)}
                onChange={(e) => onTextChange(clampTextLines(e.target.value, field.maxLines))}
                aria-label={field.label}
                className={textareaCls}
              />
              <span className={hintCls}>
                {lineLabels ? `Lines: ${lineLabels.join(" / ")}.` : "One line per part."} Up to {field.maxLines ?? 1} {(field.maxLines ?? 1) === 1 ? "line" : "lines"}.
              </span>
            </label>
          );
        }
        if (field.kind === "color") {
          return (
            <div key={field.key} className={colorWrapCls}>
              <ColorField label={field.label} value={color} onChange={onColorChange} />
            </div>
          );
        }
        // image field — the adapter owns storage; this renders the chooser
        if (!image) return null;
        return (
          <div key={field.key} className={labelCls}>
            <span className={labelSpanCls}>{field.label}</span>
            {image.options ? (
              <>
                <select
                  value={image.selectedAssetId ?? ""}
                  onChange={(e) => {
                    const opt = image.options!.find((o) => o.id === e.target.value);
                    image.onSelect(opt ?? null);
                  }}
                  aria-label={field.label}
                  className={selectCls}
                >
                  <option value="">{field.role === "avatar" ? "Default photo" : "No image"}</option>
                  {image.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={image.busy} className={btnCls}>
                    {image.busy ? "Adding…" : "Upload an image"}
                  </button>
                  {image.assetName ? <span className={`min-w-0 flex-1 truncate text-[11px] ${studio ? "text-st-faint" : "text-sand-600"}`}>{image.assetName}</span> : null}
                </div>
              </>
            ) : image.assetName ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={chipCls}>{image.assetName}</span>
                <button type="button" onClick={() => fileRef.current?.click()} className={btnCls}>Replace</button>
                <button type="button" onClick={() => image.onSelect(null)} className={btnDangerCls}>Remove</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={image.busy} className={studio ? btnCls : "rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-sand-300 disabled:opacity-50"}>
                {image.busy ? "Adding…" : `Upload ${field.label.toLowerCase()}`}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              aria-label={`Upload ${field.label}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) image.onUpload(f);
              }}
            />
            {image.error ? <p role="alert" className="mt-1.5 text-[12px] font-normal text-orange-accent">{image.error}</p> : null}
            <span className={hintCls}>
              {image.note ?? (field.role === "avatar"
                ? "Shows the default photo until you upload your own. When you add the graphic to a project, the image is copied into that project's media bin."
                : "Kept in this browser. When you add the graphic to a project, the image is copied into that project's media bin.")}
            </span>
          </div>
        );
      })}

      {durationMs !== undefined && onDurationChange ? (
        <div className={labelCls}>
          <span className={labelSpanCls}>Duration</span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={MOTION_DURATION_MIN}
              max={MOTION_DURATION_MAX}
              step={100}
              value={Math.min(MOTION_DURATION_MAX, Math.max(MOTION_DURATION_MIN, durationMs))}
              onChange={(e) => onDurationChange(clampMotionDuration(Number(e.target.value)))}
              aria-label="Duration in milliseconds"
              className="flex-1 accent-[#34D399]"
            />
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={MOTION_DURATION_MIN}
                max={MOTION_DURATION_MAX}
                step={100}
                value={durationMs}
                onChange={(e) => onDurationChange(clampMotionDuration(Number(e.target.value)))}
                aria-label="Duration value in milliseconds"
                className={numberCls}
              />
              <span className={`text-[12px] ${studio ? "text-st-faint" : "text-sand-600"}`}>ms</span>
            </span>
          </div>
          <span className={hintCls}>Between {MOTION_DURATION_MIN} ms and {MOTION_DURATION_MAX} ms — the same bounds the graphic itself accepts.</span>
        </div>
      ) : null}
    </>
  );
};
