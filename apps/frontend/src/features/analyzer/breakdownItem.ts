/**
 * Saved Reel Analyzer breakdowns (Phase 6, slice 6.1 UI) — the body contract
 * for a content-library item of kind "analysis" (features/create/library.ts).
 *
 * PURE module: no DOM, no fetch, no clock. The body is what the Analyzer page
 * saves, what the saved-analyses list reads back, and what Creator Studio
 * chat attaches as context (via analysisContextText). Defensive reading
 * mirrors features/create/chat.ts's readAssistantPayload: anything malformed
 * reads as null, never as a half-trusted breakdown.
 *
 * Honesty rules carried over from the W1 core (analyze.ts): there is no
 * overall score here either, edited fields are named in `editedFields` so the
 * UI can mark them, and the context text renders only what the breakdown
 * actually measured — nothing is invented or summarised by a model.
 */
import type { ReelBreakdown } from "./analyze";

export type AnalysisSubject = { type: "own" } | { type: "competitor"; name: string };

export interface AnalysisBody {
  version: 1;
  subject: AnalysisSubject;
  /** the caption project the breakdown was measured from; null for a loaded body whose source is unknown */
  sourceProjectId: string | null;
  videoTitle: string;
  durationMs: number;
  breakdown: ReelBreakdown;
  /** dotted field paths the user edited after measuring ("hook.text", "beats.0.label", …) */
  editedFields: string[];
  /** the user's own free notes; edits to notes are not tracked in editedFields */
  notes: string;
}

export interface BuildAnalysisBodyInput {
  subject: AnalysisSubject;
  sourceProjectId: string | null;
  videoTitle: string;
  durationMs: number;
  breakdown: ReelBreakdown;
  editedFields?: string[];
  notes?: string;
}

/** m:ss for a millisecond instant (0:03, 1:05, 12:40). Local copy of the clipper's fmtClipTime format — the pure module does not import the clipper's client module. */
export function fmtMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

export function buildAnalysisBody(input: BuildAnalysisBodyInput): AnalysisBody {
  return {
    version: 1,
    subject:
      input.subject.type === "competitor"
        ? { type: "competitor", name: input.subject.name }
        : { type: "own" },
    sourceProjectId: input.sourceProjectId ?? null,
    videoTitle: input.videoTitle,
    durationMs: input.durationMs,
    breakdown: input.breakdown,
    editedFields: [...new Set(input.editedFields ?? [])],
    notes: input.notes ?? "",
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readSubject = (value: unknown): AnalysisSubject | null => {
  if (!isRecord(value)) return null;
  if (value.type === "own") return { type: "own" };
  if (value.type === "competitor" && typeof value.name === "string" && value.name.trim().length > 0) {
    return { type: "competitor", name: value.name };
  }
  return null;
};

/**
 * Defensive reader for a stored analysis body. Returns null on anything
 * malformed: wrong version, a bad subject, or a breakdown that fails the
 * spot-check (hook.text a string, beats an array, metrics an array, pacing
 * numbers present). Fields that are merely absent (notes, editedFields,
 * sourceProjectId) fall back to their empty defaults.
 */
export function readAnalysisBody(body: unknown): AnalysisBody | null {
  if (!isRecord(body) || body.version !== 1) return null;
  const subject = readSubject(body.subject);
  if (!subject) return null;
  if (typeof body.videoTitle !== "string") return null;
  if (typeof body.durationMs !== "number" || !Number.isFinite(body.durationMs)) return null;
  if (body.sourceProjectId !== null && body.sourceProjectId !== undefined && typeof body.sourceProjectId !== "string") return null;

  const breakdown = body.breakdown;
  if (!isRecord(breakdown)) return null;
  if (!isRecord(breakdown.hook) || typeof breakdown.hook.text !== "string") return null;
  if (!Array.isArray(breakdown.beats)) return null;
  if (!Array.isArray(breakdown.metrics)) return null;
  if (!isRecord(breakdown.pacing)) return null;
  if (typeof breakdown.pacing.wordsPerMin !== "number" || typeof breakdown.pacing.cutsPerMin !== "number") return null;
  if (!isRecord(breakdown.cta) || !Array.isArray(breakdown.cta.found)) return null;

  const editedFields = Array.isArray(body.editedFields)
    ? [...new Set(body.editedFields.filter((f): f is string => typeof f === "string"))]
    : [];
  return {
    version: 1,
    subject,
    sourceProjectId: typeof body.sourceProjectId === "string" ? body.sourceProjectId : null,
    videoTitle: body.videoTitle,
    durationMs: body.durationMs,
    breakdown: breakdown as unknown as ReelBreakdown,
    editedFields,
    notes: typeof body.notes === "string" ? body.notes : "",
  };
}

/** Return a copy of the body with `field` recorded as edited (deduped; the input is never mutated). */
export function recordEdit(body: AnalysisBody, field: string): AnalysisBody {
  if (body.editedFields.includes(field)) return { ...body, editedFields: [...body.editedFields] };
  return { ...body, editedFields: [...body.editedFields, field] };
}

/**
 * The plain-text rendering of a saved analysis, used as Creator Studio chat
 * context. Deterministic, built only from the breakdown's own fields: title +
 * subject, hook text, one line per beat, the CTA phrases (or "none found"),
 * and the pacing line.
 */
export function analysisContextText(body: AnalysisBody): string {
  const { breakdown } = body;
  const lines: string[] = [];
  lines.push(`Video: ${body.videoTitle}`);
  lines.push(
    body.subject.type === "competitor" ? `Subject: Competitor: ${body.subject.name}` : "Subject: My video",
  );
  lines.push(`Hook: ${breakdown.hook.text}`);
  for (const beat of breakdown.beats) {
    lines.push(`${fmtMs(beat.startMs)}–${fmtMs(beat.endMs)} ${beat.label}: ${beat.text}`);
  }
  lines.push(
    breakdown.cta.found.length
      ? `Call to action: ${breakdown.cta.found.map((m) => `${m.phrase} (${fmtMs(m.atMs)})`).join(", ")}`
      : "Call to action: none found",
  );
  lines.push(
    `Pacing: ${breakdown.pacing.wordsPerMin.toFixed(1)} words/min, ${breakdown.pacing.cutsPerMin.toFixed(1)} cuts/min`,
  );
  if (body.notes.trim()) lines.push(`Notes: ${body.notes.trim()}`);
  return lines.join("\n");
}
