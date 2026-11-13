/**
 * Content Planner — planner-card model (Phase 7), pure.
 *
 * A planner card is a content-library item of kind "planner-card" (see
 * features/create/library.ts and lib/api/content.ts — the DB column is
 * free text, so no migration was needed). Its body is the
 * PlannerCardBody below. Everything here is deterministic and pure:
 * the page performs the actual storage calls (createContentItem /
 * updateContentItem) with the values these functions return.
 *
 * Captionit never posts anything on the user's behalf: previews and
 * the copy pack exist so the user can paste the text into the platform
 * themselves.
 */
import type { WeeklyPlanBody } from "@/features/growth/plan";
import { parseLocalDate } from "./dates";

export type PlannerStatus = "draft" | "planned" | "published";
export type PlannerPlatform = "instagram" | "youtube" | "linkedin" | "x" | "facebook";

export const PLANNER_PLATFORMS: { id: PlannerPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "facebook", label: "Facebook" },
];

export const PLANNER_STATUSES: { id: PlannerStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "planned", label: "Planned" },
  { id: "published", label: "Published" },
];

/** Category suggestions only — a card may hold any category string. */
export const PLANNER_CATEGORIES: string[] = [
  "Reel",
  "Short",
  "Long-form video",
  "Carousel",
  "Story",
  "Live",
  "Post",
];

export interface PlannerCardBody {
  version: 1;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Optional local time, "HH:MM". */
  time?: string;
  status: PlannerStatus;
  category: string;
  platform: PlannerPlatform;
  caption: string;
  hashtags: string[];
  scriptItemId?: string;
  captionItemId?: string;
  projectId?: string;
  sourcePlanId?: string;
  timeBasis?: string;
}

// ---------------------------------------------------------------------------
// Defensive reader for stored card bodies
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const STATUSES: readonly PlannerStatus[] = ["draft", "planned", "published"];
const PLATFORMS: readonly PlannerPlatform[] = ["instagram", "youtube", "linkedin", "x", "facebook"];

export function readPlannerCard(body: unknown): PlannerCardBody | null {
  if (!isRecord(body)) return null;
  if (body.version !== 1) return null;
  if (typeof body.date !== "string" || !parseLocalDate(body.date)) return null;
  if (!STATUSES.includes(body.status as PlannerStatus)) return null;
  if (!PLATFORMS.includes(body.platform as PlannerPlatform)) return null;
  if (typeof body.category !== "string") return null;
  if (typeof body.caption !== "string") return null;
  if (!Array.isArray(body.hashtags)) return null;
  const hashtags = body.hashtags
    .filter((h): h is string => typeof h === "string")
    .map((h) => normalizeHashtag(h))
    .filter((h) => h.length > 1);
  return {
    version: 1,
    date: body.date,
    ...(typeof body.time === "string" ? { time: body.time } : {}),
    status: body.status as PlannerStatus,
    category: body.category,
    platform: body.platform as PlannerPlatform,
    caption: body.caption,
    hashtags,
    ...(typeof body.scriptItemId === "string" ? { scriptItemId: body.scriptItemId } : {}),
    ...(typeof body.captionItemId === "string" ? { captionItemId: body.captionItemId } : {}),
    ...(typeof body.projectId === "string" ? { projectId: body.projectId } : {}),
    ...(typeof body.sourcePlanId === "string" ? { sourcePlanId: body.sourcePlanId } : {}),
    ...(typeof body.timeBasis === "string" ? { timeBasis: body.timeBasis } : {}),
  };
}

export function emptyCardBody(date: string): PlannerCardBody {
  return {
    version: 1,
    date,
    status: "draft",
    category: "",
    platform: "instagram",
    caption: "",
    hashtags: [],
  };
}

// ---------------------------------------------------------------------------
// Moving cards (drag-and-drop planning)
// ---------------------------------------------------------------------------

/** A new body with ONLY the date changed. Pure — the input is not mutated. */
export function moveCardToDate(body: PlannerCardBody, newDate: string): PlannerCardBody {
  return { ...body, date: newDate };
}

/**
 * Plan a drag-and-drop: the page executes the result with exactly one
 * updateContentItem call. Null when the dragged card is unknown or is
 * already on the target date (no write needed).
 */
export function planDrop(
  cards: { id: string; body: PlannerCardBody }[],
  draggedId: string,
  targetDate: string,
): { itemId: string; body: PlannerCardBody } | null {
  const card = cards.find((c) => c.id === draggedId);
  if (!card) return null;
  if (card.body.date === targetDate) return null;
  return { itemId: draggedId, body: moveCardToDate(card.body, targetDate) };
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface PlannerReminder {
  itemId: string;
  title: string;
  date: string;
  status: PlannerStatus;
  kind: "overdue" | "today";
}

export function computeReminders(
  cards: { id: string; title: string; body: PlannerCardBody }[],
  today: string,
): PlannerReminder[] {
  const reminders: PlannerReminder[] = [];
  for (const card of cards) {
    if (card.body.status !== "draft" && card.body.status !== "planned") continue;
    // YYYY-MM-DD strings compare lexicographically (see dates.ts).
    if (card.body.date < today) {
      reminders.push({
        itemId: card.id,
        title: card.title,
        date: card.body.date,
        status: card.body.status,
        kind: "overdue",
      });
    } else if (card.body.date === today) {
      reminders.push({
        itemId: card.id,
        title: card.title,
        date: card.body.date,
        status: card.body.status,
        kind: "today",
      });
    }
  }
  reminders.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "overdue" ? -1 : 1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  return reminders;
}

// ---------------------------------------------------------------------------
// Weekly-plan import (Phase 6 → Planner)
// ---------------------------------------------------------------------------

/**
 * One draft per (day, item) of a stored weekly plan. Days with no items
 * produce NO drafts — a card is never invented for an empty day.
 */
export function importWeeklyPlan(
  planItemId: string,
  plan: WeeklyPlanBody,
): { title: string; body: PlannerCardBody }[] {
  const drafts: { title: string; body: PlannerCardBody }[] = [];
  for (const day of plan.days) {
    for (const item of day.items) {
      drafts.push({
        title: item.title,
        body: {
          version: 1,
          date: day.date,
          ...(item.suggestedTime ? { time: item.suggestedTime } : {}),
          ...(item.timeBasis ? { timeBasis: item.timeBasis } : {}),
          status: "planned",
          category: "",
          platform: "instagram",
          caption: item.detail ?? "",
          hashtags: [],
          sourcePlanId: planItemId,
        },
      });
    }
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Post preview + copy pack
// ---------------------------------------------------------------------------

export interface PostPreviewOptions {
  attachedCaptionText?: string;
  projectTitle?: string;
}

export interface PostPreview {
  platform: PlannerPlatform;
  platformLabel: string;
  heading: string;
  text: string;
  hashtagsLine: string;
  charCount: number;
  charLimit: number | null;
  overLimit: boolean;
  mediaNote: string;
}

const resolveText = (body: PlannerCardBody, opts?: PostPreviewOptions): string =>
  body.caption ? body.caption : (opts?.attachedCaptionText ?? "");

/**
 * The ONE canonical hashtag form: stored WITH a single leading '#'. The editor used to
 * strip it while the weekly-plan import kept it, so the same card showed '#tech' on the
 * card, bare 'tech' in the preview/copy pack, or '##tech' — depending on which door it
 * came through. Every boundary (load, edit, preview, copy) normalises through here.
 */
export const normalizeHashtag = (tag: string): string => `#${tag.trim().replace(/^#+/, "")}`;

export const hashtagsLineOf = (tags: string[]): string => tags.map(normalizeHashtag).join(" ");

export function buildPostPreview(
  card: { title: string; body: PlannerCardBody },
  opts?: PostPreviewOptions,
): PostPreview {
  const { body } = card;
  const platformLabel = PLANNER_PLATFORMS.find((p) => p.id === body.platform)?.label ?? body.platform;
  const text = resolveText(body, opts);
  const hashtagsLine = hashtagsLineOf(body.hashtags);
  // Count exactly what the copy pack produces (caption + blank line + hashtags), so the
  // X limit judges the text that will actually be posted — not a shorter fiction.
  const charCount = (text + (hashtagsLine ? `\n\n${hashtagsLine}` : "")).length;
  const charLimit = body.platform === "x" ? 280 : null;
  return {
    platform: body.platform,
    platformLabel,
    heading: card.title,
    text,
    hashtagsLine,
    charCount,
    charLimit,
    overLimit: charLimit !== null ? charCount > charLimit : false,
    mediaNote: opts?.projectTitle ? `Video: ${opts.projectTitle}` : "No video project attached",
  };
}

export function buildCopyPack(
  card: { title: string; body: PlannerCardBody },
  opts?: PostPreviewOptions,
): { copyText: string; videoNote: string } {
  const text = resolveText(card.body, opts);
  const hashtagsLine = hashtagsLineOf(card.body.hashtags);
  return {
    copyText: text + (hashtagsLine ? `\n\n${hashtagsLine}` : ""),
    videoNote: opts?.projectTitle
      ? `Attach the exported video from the project "${opts.projectTitle}" when you post.`
      : "No video project is attached to this card.",
  };
}
