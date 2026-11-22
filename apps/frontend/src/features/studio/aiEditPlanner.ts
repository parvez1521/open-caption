/**
 * AI Edit planner (Studio revision, Task 9): transcript -> visual plan.
 *
 * PLANNER-PATH CHOICE (owner's three options, evaluated):
 *   (i)  "find the best model" — a video-understanding model would need a
 *        paid multimodal API or key. Forbidden: no paid anything, no keys.
 *        Puter (the free generation path) has no video understanding.
 *   (ii) "use the existing model" — the existing free server-side AI (the
 *        Growth Coach path, `runCloudChat`) is TEXT-only: it cannot watch a
 *        video. It can only plan from text — which is exactly the transcript.
 *   (iii) TRANSCRIPT ROUTE (chosen) — transcribe the uploaded video with
 *        the EXISTING in-browser Whisper pipeline (free, no key, already
 *        shipped; see `aiEditTranscribe.ts` — planning-only, it never writes
 *        a caption document), feed the timestamped transcript to the existing
 *        free server-side text AI, and it returns a per-segment visual plan.
 *        Zero new cost, zero new provider, zero new key. The panel shows
 *        the plan as it runs — nothing waits on a review.
 *
 * No model or provider name ever appears in the UI or in these prompts:
 * the server route picks the configured free text service.
 */

import { apiClient } from "@/services/api-client";
import { aiEditStyleById } from "./aiEditStyles";

/** One timestamped word, as Whisper returns it (via `aiEditTranscribe.ts`). */
export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** One stretch of speech the planner reasons over. */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

/** A new word starts a segment after this much silence. */
export const TRANSCRIPT_SEGMENT_GAP_MS = 1500;
/** A segment never spans longer than this (keeps the planner's units editable). */
export const TRANSCRIPT_SEGMENT_MAX_MS = 20_000;

/**
 * Group timestamped words into speech segments: a new segment starts after
 * a silence gap, or when the running segment hits the length cap. Words out
 * of order are sorted first; empty/whitespace words are dropped.
 */
export function segmentsOfTranscript(words: readonly TranscriptWord[]): TranscriptSegment[] {
  const clean = words
    .filter((w) => w.text.trim().length > 0 && Number.isFinite(w.startMs) && Number.isFinite(w.endMs) && w.endMs >= w.startMs)
    .map((w) => ({ text: w.text.trim(), startMs: Math.max(0, Math.round(w.startMs)), endMs: Math.max(0, Math.round(w.endMs)) }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const out: TranscriptSegment[] = [];
  for (const w of clean) {
    const cur = out[out.length - 1];
    if (!cur || w.startMs - cur.endMs > TRANSCRIPT_SEGMENT_GAP_MS || w.endMs - cur.startMs > TRANSCRIPT_SEGMENT_MAX_MS) {
      out.push({ startMs: w.startMs, endMs: w.endMs, text: w.text });
    } else {
      cur.endMs = Math.max(cur.endMs, w.endMs);
      cur.text = `${cur.text} ${w.text}`;
    }
  }
  return out;
}

/** One planned visual: what to generate, and where it sits on the timeline. */
export interface AiEditPlanItem {
  startMs: number;
  endMs: number;
  /** "image" lands as a timed overlay; "video" as a B-roll segment. */
  kind: "image" | "video";
  /** The generation prompt for this visual (style suffix already applied by the caller where needed). */
  prompt: string;
  /** The transcript line this visual illustrates, for the review list. */
  sourceText: string;
}

/** How many visuals a plan may hold (keeps review — and the visitor's free allowance — sane). */
export const AI_EDIT_PLAN_MAX_ITEMS = 12;
/** A planned visual is at least this long on the timeline. */
export const AI_EDIT_PLAN_MIN_MS = 1000;
/** Generation prompts are short descriptions, not documents. */
export const AI_EDIT_PLAN_PROMPT_MAX = 500;

export interface AiEditPlannerPrompt {
  system: string;
  user: string;
}

/**
 * The planner prompt: transcript segments + chosen style, asking for a JSON
 * plan only. The route sends this to the existing free server-side text AI.
 */
export function buildPlannerPrompt(segments: readonly TranscriptSegment[], styleId: string, durationMs: number): AiEditPlannerPrompt {
  const style = aiEditStyleById(styleId);
  const lines = segments.map(
    (s, i) => `${i + 1}. [${(s.startMs / 1000).toFixed(1)}s - ${(s.endMs / 1000).toFixed(1)}s] ${s.text}`,
  );
  return {
    system: [
      "You plan visuals for a short video edit. You are given a timestamped transcript of the video.",
      "Return ONLY one JSON object of the form {\"plan\": [...]}. Each item: {\"startMs\": number, \"endMs\": number, \"kind\": \"image\" | \"video\", \"prompt\": string, \"sourceText\": string}.",
      "Your entire reply must be that JSON object, starting with { and ending with }. No introduction, no explanation, no bullet points, no markdown.",
      "Rules:",
      "- One visual per spoken idea, at most 8 items. Prefer images; use video only where motion clearly helps.",
      "- startMs/endMs must sit inside the video and cover the words the visual illustrates; endMs after startMs, at least 1000ms long.",
      "- prompt is a short visual description (under 500 characters), no text in the image unless the words ask for it.",
      "- sourceText is the transcript line the visual illustrates, copied as spoken.",
      "- Never invent words the speaker did not say. If the transcript is empty, return [].",
    ].join("\n"),
    user: [
      "Reply with ONLY one JSON object of the form {\"plan\": [...]}. Start your reply with { and end with }. No introduction, no explanation, no bullet points, no markdown.",
      `Video length: ${(durationMs / 1000).toFixed(1)}s. Visual style: ${style.label} (${style.promptSuffix}).`,
      "Transcript:",
      ...(lines.length > 0 ? lines : ["(no speech detected)"]),
      "Return the JSON object now. Start your reply with {.",
    ].join("\n"),
  };
}

/**
 * Pull a JSON value out of a chat completion: a bare array, a fenced code
 * block, or an object wrapping the array under `plan` / `items` / `visuals`.
 */
export function extractPlanJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("[");
    const end = candidate.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export interface ParsePlanOptions {
  durationMs: number;
}

/**
 * Validate a planner reply into timeline placements: clamps to the video,
 * drops invalid/overlapping items, sorts by start, caps the count. Returns
 * the clean plan plus how many raw items were dropped, so the panel can say
 * so honestly instead of silently showing less.
 */
export function parsePlannerResponse(raw: unknown, opts: ParsePlanOptions): { plan: AiEditPlanItem[]; dropped: number } {
  const value = typeof raw === "string" ? extractPlanJson(raw) : raw;
  const list = Array.isArray(value)
    ? value
    : value != null && typeof value === "object"
      ? ((value as Record<string, unknown>).plan ?? (value as Record<string, unknown>).items ?? (value as Record<string, unknown>).visuals)
      : null;
  if (!Array.isArray(list)) return { plan: [], dropped: 0 };
  const durationMs = Math.max(0, Math.round(opts.durationMs));
  const kept: AiEditPlanItem[] = [];
  let dropped = 0;
  for (const rawItem of list) {
    if (kept.length >= AI_EDIT_PLAN_MAX_ITEMS) {
      dropped += 1;
      continue;
    }
    if (rawItem == null || typeof rawItem !== "object") {
      dropped += 1;
      continue;
    }
    const item = rawItem as Record<string, unknown>;
    const startMs = Math.round(Number(item.startMs));
    const endMs = Math.round(Number(item.endMs));
    const kind = item.kind === "video" ? "video" : item.kind === "image" ? "image" : null;
    const prompt = typeof item.prompt === "string" ? item.prompt.trim().slice(0, AI_EDIT_PLAN_PROMPT_MAX) : "";
    const sourceText = typeof item.sourceText === "string" ? item.sourceText.trim() : "";
    if (!kind || !prompt || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      dropped += 1;
      continue;
    }
    const start = Math.max(0, Math.min(startMs, durationMs));
    const end = Math.max(0, Math.min(endMs, durationMs));
    if (end - start < AI_EDIT_PLAN_MIN_MS) {
      dropped += 1;
      continue;
    }
    if (kept.some((k) => start < k.endMs && end > k.startMs)) {
      dropped += 1;
      continue;
    }
    kept.push({ startMs: start, endMs: end, kind, prompt, sourceText });
  }
  kept.sort((a, b) => a.startMs - b.startMs);
  return { plan: kept, dropped };
}

export interface AiEditPlanRequest {
  segments: TranscriptSegment[];
  styleId: string;
  durationMs: number;
}

export interface AiEditPlanClient {
  post<T>(path: string, init?: { json?: unknown; signal?: AbortSignal }): Promise<T>;
}

/**
 * Ask the server for a visual plan. The app's own API goes through the
 * authed apiClient (never raw fetch); the server route
 * (`/api/v1/ai-edit/plan`) runs the existing free text AI. Throws a plain
 * message when the free AI service is not switched on, so the panel can say
 * so instead of spinning.
 */
export async function requestAiEditPlan(
  req: AiEditPlanRequest,
  client: AiEditPlanClient = apiClient,
): Promise<{ plan: AiEditPlanItem[]; dropped: number }> {
  const res = await client.post<{ configured: boolean; plan?: unknown }>(`/ai-edit/plan`, {
    json: { segments: req.segments, styleId: req.styleId, durationMs: req.durationMs },
  });
  if (!res.configured) throw new Error("The free AI service is not switched on yet, so no plan can be made.");
  return parsePlannerResponse(res.plan ?? [], { durationMs: req.durationMs });
}

/** The overlay length for a planned image: its planned span, capped at 10s so one image never hogs the timeline. */
export function planImageDurationMs(item: AiEditPlanItem): number {
  return Math.min(Math.max(item.endMs - item.startMs, AI_EDIT_PLAN_MIN_MS), 10_000);
}
