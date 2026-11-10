"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { ContentItem } from "@/features/create/library";
import { extractItemText } from "@/features/create/libraryMigration";
import type { Project } from "@/services/types";
import {
  PLANNER_PLATFORMS,
  PLANNER_STATUSES,
  buildCopyPack,
  buildPostPreview,
  type PlannerPlatform,
} from "./model";
import type { PlannerCard } from "./view";

export interface PlannerCardFullProps {
  card: PlannerCard;
  scriptsById: Map<string, ContentItem>;
  captionsById: Map<string, ContentItem>;
  projectsById: Map<string, Project>;
  onEdit: (card: PlannerCard) => void;
  /** When set, the card is HTML5-draggable (Month/Week views). */
  draggable?: boolean;
  onDragStart?: (cardId: string) => void;
}

const statusChipCls: Record<string, string> = {
  draft: "border-sand-300 bg-sand-100 text-sand-800",
  planned: "border-sand-300 bg-white text-sand-800",
  published: "border-ink bg-ink text-dune-white",
};

const smallBtn =
  "rounded-full border border-sand-300 px-3 py-1.5 font-sora text-[11px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer";

/**
 * A planner card in full (Week/Day views): summary line, attachment
 * click-through, an honest per-platform text preview, and the copy-out
 * pack. Open Caption never posts — the pack is text for the user to paste
 * into the platform themselves.
 */
export default function PlannerCardFull({
  card,
  scriptsById,
  captionsById,
  projectsById,
  onEdit,
  draggable = false,
  onDragStart,
}: PlannerCardFullProps) {
  const { body } = card;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<PlannerPlatform>(body.platform);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [videoNote, setVideoNote] = useState<string | null>(null);

  const platformLabel = PLANNER_PLATFORMS.find((p) => p.id === body.platform)?.label ?? body.platform;
  const statusLabel = PLANNER_STATUSES.find((s) => s.id === body.status)?.label ?? body.status;

  const scriptItem = body.scriptItemId ? scriptsById.get(body.scriptItemId) : undefined;
  const captionItem = body.captionItemId ? captionsById.get(body.captionItemId) : undefined;
  const project = body.projectId ? projectsById.get(body.projectId) : undefined;

  const previewOpts = useMemo(
    () => ({
      attachedCaptionText: captionItem ? extractItemText(captionItem) : undefined,
      projectTitle: project?.title,
    }),
    [captionItem, project],
  );

  const preview = useMemo(
    () =>
      buildPostPreview(
        { title: card.title, body: { ...body, platform: previewPlatform } },
        previewOpts,
      ),
    [card.title, body, previewPlatform, previewOpts],
  );

  const copyPack = async () => {
    const pack = buildCopyPack({ title: card.title, body }, previewOpts);
    setVideoNote(pack.videoNote);
    setCopied(false);
    setCopyFallback(null);
    try {
      await navigator.clipboard.writeText(pack.copyText);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (permissions / insecure context): fall back
      // to a temporary textarea + execCommand, and if even that fails, show
      // the text so the user can copy it by hand — never a silent no-op.
      let ok = false;
      try {
        const ta = document.createElement("textarea");
        ta.value = pack.copyText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
      if (ok) setCopied(true);
      else setCopyFallback(pack.copyText);
    }
  };

  const linkCls =
    "font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink";

  return (
    <article
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData("text/plain", card.id);
              e.dataTransfer.effectAllowed = "move";
              onDragStart?.(card.id);
            }
          : undefined
      }
      className={`rounded-xl border border-sand-200 bg-white p-4 ${draggable ? "cursor-grab" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={() => onEdit(card)}
          className="min-w-0 flex-1 text-left cursor-pointer"
          title="Open in the editor"
        >
          <span className="block truncate font-sora text-[14px] font-bold text-ink">
            {card.title || "(untitled card)"}
          </span>
          <span className="mt-0.5 block text-[12px] text-sand-600">
            {platformLabel}
            {body.category ? ` · ${body.category}` : ""}
            {body.time ? ` · ${body.time}` : ""}
          </span>
        </button>
        <span
          className={`rounded-full border px-2.5 py-1 font-sora text-[11px] font-semibold ${statusChipCls[body.status] ?? statusChipCls.draft}`}
        >
          {statusLabel}
        </span>
      </div>

      {body.caption ? (
        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-sand-800">{body.caption}</p>
      ) : null}
      {body.hashtags.length ? (
        <p className="mt-1 text-[12px] text-sand-600">{body.hashtags.map((t) => `#${t}`).join(" ")}</p>
      ) : null}

      {body.scriptItemId || body.captionItemId || body.projectId ? (
        <ul className="mt-3 space-y-1 border-t border-sand-200 pt-3 text-[12px]">
          {body.scriptItemId ? (
            <li>
              {scriptItem ? (
                <Link href="/create" className={linkCls}>Script: {scriptItem.title}</Link>
              ) : (
                <span className="text-sand-600">Script (no longer in your library)</span>
              )}
            </li>
          ) : null}
          {body.captionItemId ? (
            <li>
              {captionItem ? (
                <Link href="/create" className={linkCls}>Caption: {captionItem.title}</Link>
              ) : (
                <span className="text-sand-600">Caption (no longer in your library)</span>
              )}
            </li>
          ) : null}
          {body.projectId ? (
            <li>
              {project ? (
                <Link href={`/projects/${project.id}`} className={linkCls}>Video project: {project.title}</Link>
              ) : (
                <span className="text-sand-600">Video project (no longer in your library)</span>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={smallBtn} onClick={() => onEdit(card)}>Edit</button>
        <button
          type="button"
          className={smallBtn}
          aria-expanded={previewOpen}
          onClick={() => {
            setPreviewPlatform(body.platform);
            setPreviewOpen((open) => !open);
          }}
        >
          Preview post
        </button>
        <button type="button" className={smallBtn} onClick={() => void copyPack()}>
          Copy post pack
        </button>
        {copied ? <span role="status" className="self-center text-[12px] font-medium text-sand-800">Copied.</span> : null}
      </div>

      {videoNote ? <p className="mt-2 text-[12px] leading-relaxed text-sand-600">{videoNote}</p> : null}
      {copyFallback !== null ? (
        <div className="mt-2">
          <p className="text-[12px] text-sand-600">Automatic copy was blocked — copy the pack by hand:</p>
          <textarea readOnly rows={4} value={copyFallback} aria-label="Post pack text" className="mt-1 w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-[13px] text-ink" />
        </div>
      ) : null}

      {previewOpen ? (
        <div className="mt-3 rounded-lg border border-sand-200 bg-sand-50 p-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Preview platform">
            {PLANNER_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={previewPlatform === p.id}
                onClick={() => setPreviewPlatform(p.id)}
                className={`rounded-full px-3 py-1.5 font-sora text-[11px] font-semibold transition-colors cursor-pointer ${previewPlatform === p.id ? "bg-ink text-dune-white" : "border border-sand-300 text-sand-700 hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-sand-600">
            How your copy pack reads on {preview.platformLabel} — a text preview, not the
            platform&apos;s own composer.
          </p>
          <p className="mt-2 font-sora text-[14px] font-bold text-ink">{preview.heading}</p>
          {preview.text ? (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-sand-800">{preview.text}</p>
          ) : (
            <p className="mt-1 text-[13px] text-sand-600">No caption text yet — add one in the editor, or attach a saved caption.</p>
          )}
          {preview.hashtagsLine ? (
            <p className="mt-2 text-[13px] text-sand-800">{preview.hashtagsLine}</p>
          ) : null}
          <p className="mt-2 text-[12px] tabular-nums text-sand-600">
            {preview.charCount} characters
            {preview.charLimit !== null ? ` of ${preview.charLimit}` : ""}
          </p>
          {preview.overLimit ? (
            <p role="alert" className="mt-1 text-[12px] font-medium text-obsidian">
              Over the {preview.charLimit}-character limit for {preview.platformLabel} — shorten the text before posting.
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-sand-600">{preview.mediaNote}</p>
        </div>
      ) : null}
    </article>
  );
}
