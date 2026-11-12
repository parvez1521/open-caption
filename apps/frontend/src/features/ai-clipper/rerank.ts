/**
 * AI Clipper cross-window rerank calibration (Slice 1).
 *
 * The highlight engine scores each transcript window on its own, so a clip
 * that scored 88 in a quiet section can outrank a clip that scored 82 in a
 * packed one. This step re-scores every finished clip side by side in ONE
 * extra call through the existing free Groq route (the same
 * /api/v1/clipper/highlights route and buckets as the per-window calls — no
 * cap raised, no new provider), using OUR OWN prompt and rubric wording
 * (features/clipper/highlights/rubrics.ts + prompt.ts criteria). No SupoClip
 * prompt or rubric is used here.
 *
 * The calibrated score replaces only the MODEL part of the Editorial Score:
 * final = 0.85 x rubric-weighted calibrated model judgment + 0.15 x measured
 * rows — the same 0.85/0.15 composition as score.ts. The "Editorial score —
 * estimate" label stays wherever the number appears.
 */
import { rubricFor, weightedModelScore } from "@/features/clipper/highlights/rubrics";
import type { ContentTypeId, HighlightClip, ModelSubScores } from "@/features/clipper/highlights/types";
import type { ModelRunner } from "@/features/create/service";

export interface CalibratedEntry {
  id: string;
  score: number;
  breakdown: ModelSubScores;
}

const clamp100 = (v: number): number => Math.min(100, Math.max(0, Math.round(v)));

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** The comparison prompt: clips side by side, judged on the same four criteria as the per-window prompt. */
export function buildRerankPrompt(input: { contentType: ContentTypeId; clips: readonly HighlightClip[] }): {
  system: string;
  user: string;
} {
  const rubric = rubricFor(input.contentType);
  const system = [
    "You are a short-form video editor. You compare finished clip candidates from one long video and rank them against each other.",
    "Reply with ONLY the JSON object described — no prose, no markdown fences.",
  ].join("\n");
  const lines = input.clips.map((c, i) => {
    const secs = Math.max(1, Math.round(c.durationMs / 1000));
    return `${i + 1}. [${c.id}] "${c.title}" (${secs}s, first score ${c.score})\n   Opens: "${c.hook}"\n   About: ${c.summary || c.text.slice(0, 200)}`;
  });
  const user = [
    "## What makes a clip work",
    "Judge every candidate against the same four things, in this order:",
    "1. Hook strength. The first three seconds decide everything — a line that creates a question, states something contrarian, names a specific number, or drops the listener into tension.",
    "2. Self-containment. A viewer with zero context fully understands it.",
    "3. Payoff. Something lands — a conclusion, a reversal, concrete advice, a genuine emotional beat, a number that reframes the topic.",
    "4. Quotability. One sentence a person would repeat or screenshot.",
    "",
    `## This video: ${rubric.label}`,
    rubric.guidance,
    "",
    "## Scoring",
    "Score 0–100 per candidate, and per aspect in score_breakdown (hook, value, story_completeness, engagement). Compare the candidates against EACH OTHER, not against an ideal — the strongest clip here should score clearly above the weakest. Be harsh and use the whole range. A flat set of scores in the 80s is useless for ranking.",
    "",
    "## Candidates",
    ...lines,
    "",
    "## Output",
    `{"calibrated": [{"id": "${input.clips[0]?.id ?? ""}", "score": 87, "score_breakdown": {"hook": 90, "value": 92, "story_completeness": 95, "engagement": 87}}]}`,
    "Return one entry per candidate, with the candidate's id copied exactly.",
  ].join("\n");
  return { system, user };
}

/**
 * Parse the rerank reply. Strict where it matters: the reply must contain a
 * JSON object with a `calibrated` array; an entry counts only with a known id
 * and a numeric score. Unknown ids and unusable entries are dropped, never
 * repaired. A missing score_breakdown falls back to the entry's overall score.
 */
export function parseRerankReply(raw: string, knownIds: ReadonlySet<string>): CalibratedEntry[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the reply contained no JSON object");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("the reply was not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("the reply was not a JSON object");
  const list = (parsed as { calibrated?: unknown }).calibrated;
  if (!Array.isArray(list)) throw new Error("the reply had no calibrated array");
  const out: CalibratedEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const id = typeof it.id === "string" ? it.id : "";
    const score = num(it.score);
    if (!knownIds.has(id) || score === null) continue;
    const bd = (it.score_breakdown ?? {}) as Record<string, unknown>;
    const sub = (key: string): number => {
      const v = num(bd[key]);
      return v === null ? clamp100(score) : clamp100(v);
    };
    out.push({
      id,
      score: clamp100(score),
      breakdown: { hook: sub("hook"), value: sub("value"), storyCompleteness: sub("story_completeness"), engagement: sub("engagement") },
    });
  }
  return out;
}

/** Mean of the measured breakdown rows (audio / pace / boundaries / scenes) — the same rows score.ts averages. */
export function measuredMeanOf(clip: HighlightClip): number | null {
  const rows = clip.breakdown.filter((r) => r.kind === "measured" && ["audio", "pace", "boundaries", "scenes"].includes(r.key));
  const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Apply calibrated scores: each calibrated clip's final score becomes
 * 0.85 x rubric-weighted calibrated judgment + 0.15 x measured mean (model
 * judgment alone when nothing was measured), then the list is re-ordered by
 * the calibrated scores and re-ranked. Clips the rerank did not cover keep
 * their original score and order among themselves.
 */
export function applyRerankCalibration(
  clips: readonly HighlightClip[],
  calibrated: readonly CalibratedEntry[],
  contentType: ContentTypeId,
): HighlightClip[] {
  const byId = new Map(calibrated.map((c) => [c.id, c]));
  const rubric = rubricFor(contentType);
  const rescored = clips.map((clip) => {
    const entry = byId.get(clip.id);
    if (!entry) return { ...clip, calibrated: false };
    const modelScore = weightedModelScore(entry.breakdown, rubric.weights);
    const mm = measuredMeanOf(clip);
    const score = clamp100(mm === null ? modelScore : 0.85 * modelScore + 0.15 * mm);
    return { ...clip, score, calibrated: true };
  });
  // Stable re-order by final score; ties keep the engine's order.
  return rescored
    .map((clip, i) => ({ clip, i }))
    .sort((a, b) => b.clip.score - a.clip.score || a.i - b.i)
    .map(({ clip }, rank) => ({ ...clip, rank: rank + 1 }));
}

export interface RerankResult {
  clips: HighlightClip[];
  /** true when at least one clip was re-scored comparatively */
  calibrated: boolean;
  /** plain-language note for the run panel */
  note: string;
}

/**
 * One extra model call that re-scores all candidates comparatively. Never
 * throws for a bad model reply — a rerank that cannot be used leaves the
 * engine's order standing and says so. Only an abort throws.
 */
export async function runRerankCalibration(input: {
  clips: readonly HighlightClip[];
  contentType: ContentTypeId;
  runner: ModelRunner;
  signal?: AbortSignal;
}): Promise<RerankResult> {
  const { clips, contentType } = input;
  if (clips.length < 2) {
    return { clips: [...clips], calibrated: false, note: "One clip — nothing to compare." };
  }
  input.signal?.throwIfAborted();
  let raw: string;
  try {
    raw = await input.runner(buildRerankPrompt({ contentType, clips }));
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") throw e;
    return { clips: [...clips], calibrated: false, note: "Re-rank skipped — the comparison call failed." };
  }
  input.signal?.throwIfAborted();
  let entries: CalibratedEntry[];
  try {
    entries = parseRerankReply(raw, new Set(clips.map((c) => c.id)));
  } catch {
    return { clips: [...clips], calibrated: false, note: "Re-rank skipped — the comparison reply could not be used." };
  }
  if (entries.length === 0) {
    return { clips: [...clips], calibrated: false, note: "Re-rank skipped — the comparison reply covered no clips." };
  }
  const rescored = applyRerankCalibration(clips, entries, contentType);
  return {
    clips: rescored,
    calibrated: true,
    note: `Re-ranked ${entries.length} of ${clips.length} clips against each other.`,
  };
}
