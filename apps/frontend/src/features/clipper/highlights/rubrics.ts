/**
 * Content-type rubrics: how the editorial criteria bend per kind of video, and
 * how the four model-judged sub-scores are weighted into the Editorial Score.
 *
 * The signal classes (hook moments, emotional peaks, strong opinions,
 * revelations, conflict, quotable lines, story peaks, practical value) are
 * adapted from the AI-Youtube-Shorts-Generator's published criteria — as
 * editorial guidance, not as any promise about performance. Weights are ours.
 */
import type { ContentTypeId, ModelSubScores } from "./types";

export interface ContentTypeRubric {
  id: ContentTypeId;
  label: string;
  /** one line of guidance woven into the model prompt for this content type */
  guidance: string;
  /** weights over the model's four sub-scores; must sum to 1 */
  weights: ModelSubScores;
}

const w = (hook: number, value: number, storyCompleteness: number, engagement: number): ModelSubScores => ({
  hook,
  value,
  storyCompleteness,
  engagement,
});

export const CONTENT_TYPE_RUBRICS: readonly ContentTypeRubric[] = [
  {
    id: "podcast",
    label: "Podcast",
    guidance:
      "Podcast: favour self-contained exchanges and stories with a clear payoff. A clip may span a question and its answer — keep the pair whole. Banter without a landing line is not a clip.",
    weights: w(0.3, 0.3, 0.25, 0.15),
  },
  {
    id: "interview",
    label: "Interview",
    guidance:
      "Interview: the answer is the clip, but it must include the question that prompted it when the answer makes no sense without it. Favour revelations, strong opinions and concrete stories over small talk.",
    weights: w(0.3, 0.25, 0.3, 0.15),
  },
  {
    id: "educational",
    label: "Educational",
    guidance:
      "Educational: favour complete explanations — a definition, a worked example, a myth corrected. A clip that starts an explanation it does not finish is worthless; completeness outranks cleverness here.",
    weights: w(0.25, 0.35, 0.3, 0.1),
  },
  {
    id: "tutorial",
    label: "Tutorial",
    guidance:
      "Tutorial: favour complete steps and problem→solution arcs — the moment a mistake is diagnosed and fixed, a shortcut revealed, a result shown. Never clip half a procedure.",
    weights: w(0.25, 0.35, 0.3, 0.1),
  },
  {
    id: "talking-head",
    label: "Talking head",
    guidance:
      "Talking head: favour the strongest single argument or story, opened on its boldest line. Cut throat-clearing openings; the first sentence must already be the point.",
    weights: w(0.35, 0.3, 0.2, 0.15),
  },
  {
    id: "vlog",
    label: "Vlog",
    guidance:
      "Vlog: favour moments with energy and change — arrivals, reveals, mishaps, reactions, decisions. Quiet connective tissue between events is not a clip.",
    weights: w(0.3, 0.2, 0.2, 0.3),
  },
  {
    id: "gaming",
    label: "Gaming",
    guidance:
      "Gaming: favour peaks the commentary itself marks — a clutch play, a failure, a discovery, a reaction. The transcript carries the excitement; clip around the verbal build-up and the payoff together.",
    weights: w(0.3, 0.2, 0.2, 0.3),
  },
  {
    id: "webinar",
    label: "Webinar / talk",
    guidance:
      "Webinar: favour the talk's load-bearing ideas — the key claim, the decisive example, the answer to an audience question (kept whole). Skip housekeeping, introductions of speakers, and agenda recaps.",
    weights: w(0.25, 0.35, 0.3, 0.1),
  },
  {
    id: "general",
    label: "General",
    guidance:
      "General long-form: favour whatever moment a stranger with zero context would watch to the end and repeat to someone else.",
    weights: w(0.3, 0.3, 0.25, 0.15),
  },
];

export const rubricFor = (id: ContentTypeId): ContentTypeRubric =>
  CONTENT_TYPE_RUBRICS.find((r) => r.id === id) ?? CONTENT_TYPE_RUBRICS[CONTENT_TYPE_RUBRICS.length - 1]!;

/** Rubric-weighted mean of the model's sub-scores (0–100 in, 0–100 out). */
export function weightedModelScore(scores: ModelSubScores, weights: ModelSubScores): number {
  const total = weights.hook + weights.value + weights.storyCompleteness + weights.engagement;
  if (total <= 0) return 0;
  return (
    (scores.hook * weights.hook +
      scores.value * weights.value +
      scores.storyCompleteness * weights.storyCompleteness +
      scores.engagement * weights.engagement) /
    total
  );
}
