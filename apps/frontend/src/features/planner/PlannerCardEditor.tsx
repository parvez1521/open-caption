"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { ContentItem } from "@/features/create/library";
import type { Project } from "@/services/types";
import {
  PLANNER_CATEGORIES,
  PLANNER_PLATFORMS,
  PLANNER_STATUSES,
  type PlannerCardBody,
  type PlannerPlatform,
  type PlannerStatus,
} from "./model";
import { formatHashtagsInput, parseHashtagsInput, type PlannerCard } from "./view";

export interface PlannerCardEditorProps {
  /** The card being edited, or null for a new card (initialBody supplies the defaults). */
  card: PlannerCard | null;
  initialBody: PlannerCardBody;
  scripts: ContentItem[];
  captions: ContentItem[];
  projects: Project[];
  /** Saving is disabled while the content library is not set up on the server. */
  saveDisabled: boolean;
  busy: boolean;
  error: string | null;
  onSave: (title: string, body: PlannerCardBody) => void;
  onDelete: () => void;
  onClose: () => void;
}

const inputCls =
  "w-full rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-sand-600";
const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";
const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";

/**
 * The planner card editor (panel). Purely a form: the page owns storage and
 * passes save/delete handlers in. sourcePlanId / timeBasis from an imported
 * card are carried through untouched — they are provenance, not fields.
 */
export default function PlannerCardEditor({
  card,
  initialBody,
  scripts,
  captions,
  projects,
  saveDisabled,
  busy,
  error,
  onSave,
  onDelete,
  onClose,
}: PlannerCardEditorProps) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [date, setDate] = useState(initialBody.date);
  const [time, setTime] = useState(initialBody.time ?? "");
  const [status, setStatus] = useState<PlannerStatus>(initialBody.status);
  const [platform, setPlatform] = useState<PlannerPlatform>(initialBody.platform);
  const [category, setCategory] = useState(initialBody.category);
  const [caption, setCaption] = useState(initialBody.caption);
  const [hashtagsInput, setHashtagsInput] = useState(formatHashtagsInput(initialBody.hashtags));
  const [scriptItemId, setScriptItemId] = useState(initialBody.scriptItemId ?? "");
  const [captionItemId, setCaptionItemId] = useState(initialBody.captionItemId ?? "");
  const [projectId, setProjectId] = useState(initialBody.projectId ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  // An attached id may no longer resolve (the item was deleted from the
  // library); say so instead of silently dropping it on save.
  const scriptMissing = !!initialBody.scriptItemId && !scripts.some((s) => s.id === initialBody.scriptItemId);
  const captionMissing = !!initialBody.captionItemId && !captions.some((c) => c.id === initialBody.captionItemId);
  const projectMissing = !!initialBody.projectId && !projects.some((p) => p.id === initialBody.projectId);

  const submit = () => {
    if (!title.trim()) {
      setTitleError("Give the card a title first.");
      return;
    }
    setTitleError(null);
    const body: PlannerCardBody = {
      ...initialBody,
      date,
      ...(time ? { time } : { time: undefined }),
      status,
      platform,
      category: category.trim(),
      caption,
      hashtags: parseHashtagsInput(hashtagsInput),
      ...(scriptItemId ? { scriptItemId } : { scriptItemId: undefined }),
      ...(captionItemId ? { captionItemId } : { captionItemId: undefined }),
      ...(projectId ? { projectId } : { projectId: undefined }),
    };
    // Remove the keys entirely rather than storing explicit undefined.
    if (!time) delete body.time;
    if (!scriptItemId) delete body.scriptItemId;
    if (!captionItemId) delete body.captionItemId;
    if (!projectId) delete body.projectId;
    onSave(title.trim(), body);
  };

  const linkCls =
    "font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink";

  return (
    <section aria-label={card ? "Edit card" : "New card"} className="rounded-xl border border-sand-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-sora text-[14px] font-bold text-ink">{card ? "Edit card" : "New card"}</p>
        <button type="button" className={`${ghostBtn} ml-auto`} onClick={onClose}>Close</button>
      </div>

      <div className="mt-4 space-y-4">
        <label className={labelCls}>
          Title
          <input className={`${inputCls} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} disabled={saveDisabled} />
        </label>
        {titleError ? <p role="alert" className="text-[13px] font-medium text-obsidian">{titleError}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>
            Date
            <input className={`${inputCls} mt-1`} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saveDisabled} />
          </label>
          <label className={labelCls}>
            Time (optional)
            <input className={`${inputCls} mt-1`} type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={saveDisabled} />
          </label>
          <label className={labelCls}>
            Status
            <select className={`${inputCls} mt-1`} value={status} onChange={(e) => setStatus(e.target.value as PlannerStatus)} disabled={saveDisabled}>
              {PLANNER_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Platform
            <select className={`${inputCls} mt-1`} value={platform} onChange={(e) => setPlatform(e.target.value as PlannerPlatform)} disabled={saveDisabled}>
              {PLANNER_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Category
            <input
              className={`${inputCls} mt-1`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="planner-categories"
              disabled={saveDisabled}
              placeholder="Reel"
            />
            <datalist id="planner-categories">
              {PLANNER_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>

        <label className={labelCls}>
          Caption
          <textarea className={`${inputCls} mt-1`} rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={saveDisabled} />
        </label>
        <label className={labelCls}>
          Hashtags
          <input
            className={`${inputCls} mt-1`}
            value={hashtagsInput}
            onChange={(e) => setHashtagsInput(e.target.value)}
            disabled={saveDisabled}
            placeholder="tech, tools, free"
          />
          <span className="mt-1 block text-[12px] font-normal text-sand-600">
            Separate with commas or spaces; a leading # is fine — tags are stored without it.
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>
              Attach a saved script
              <select className={`${inputCls} mt-1`} value={scriptItemId} onChange={(e) => setScriptItemId(e.target.value)} disabled={saveDisabled}>
                <option value="">None</option>
                {scriptMissing ? <option value={initialBody.scriptItemId}>Script (no longer in your library)</option> : null}
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>
            {/* Creator Studio hidden for now (owner order 2026-11-13): no link out to /create.
                The attached script stays selectable above; restore the Link to re-expose it. */}
          </div>
          <div>
            <label className={labelCls}>
              Attach a saved caption
              <select className={`${inputCls} mt-1`} value={captionItemId} onChange={(e) => setCaptionItemId(e.target.value)} disabled={saveDisabled}>
                <option value="">None</option>
                {captionMissing ? <option value={initialBody.captionItemId}>Caption (no longer in your library)</option> : null}
                {captions.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
            {/* Creator Studio hidden for now (owner order 2026-11-13): no link out to /create.
                The attached caption stays selectable above; restore the Link to re-expose it. */}
          </div>
          <div>
            <label className={labelCls}>
              Attach a video project
              <select className={`${inputCls} mt-1`} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={saveDisabled}>
                <option value="">None</option>
                {projectMissing ? <option value={initialBody.projectId}>Video project (no longer in your library)</option> : null}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            {projectId && !projectMissing ? (
              <p className="mt-1 text-[12px]"><Link href={`/projects/${projectId}`} className={linkCls}>Open the project</Link></p>
            ) : null}
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-sand-600">
          Attachment lists show only what is actually saved — a picker with nothing saved shows
          just &ldquo;None&rdquo;.
        </p>

        {error ? <p role="alert" className="text-[13px] font-medium text-obsidian">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primaryBtn} disabled={saveDisabled || busy} onClick={submit}>
            {busy ? "Saving…" : card ? "Save changes" : "Add card"}
          </button>
          {card ? (
            confirmingDelete ? (
              <>
                <span className="text-[13px] font-medium text-obsidian">Delete this card?</span>
                <button type="button" className={ghostBtn} disabled={busy} onClick={onDelete}>Confirm delete</button>
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => setConfirmingDelete(false)}>Keep card</button>
              </>
            ) : (
              <button type="button" className={ghostBtn} disabled={saveDisabled || busy} onClick={() => setConfirmingDelete(true)}>
                Delete card
              </button>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
