/**
 * The semantic highlight engine — transcript in, ranked clips out.
 *
 *   sentences → overlapping windows → per-window model calls (failures
 *   isolated, one retry-with-feedback each) → IN-CODE post-processing
 *   (dedupe → sentence snap + completeness + duration fit → silence-aligned
 *   cuts → measured-signal fusion → dedupe again) → ranked selection.
 *
 * The model only ever proposes editorial judgments with word indices. Every
 * number that reaches the user as a time, a duration or a measured score was
 * computed here from word timestamps, waveform peaks and scene cuts.
 *
 * When no runner is available — or every window failed — the run falls back
 * to the deterministic signals path and SAYS so (source: "signals",
 * fellBack: true, a note naming the reason). An empty model result is NOT a
 * fallback: "nothing in this video is worth clipping" is a real editorial
 * answer and is returned as one.
 */
import type { ModelRunner } from "../../create/service";
import type { ClipAnalysisInput } from "../clipper";
import { refineCandidate } from "./boundaries";
import { dedupeByScore, isDuplicate, type RangeLike } from "./dedupe";
import { parseHighlightReply } from "./parse";
import { buildHighlightPrompt } from "./prompt";
import { buildSentences, sentenceAt } from "./sentences";
import { assembleClip, measureClip } from "./score";
import { runSignalsPath } from "./signalsPath";
import { buildWindows, renderWindowText } from "./windows";
import type {
  HighlightRequest,
  HighlightRunResult,
  HighlightStageEvent,
  HighlightWord,
  RawCandidate,
} from "./types";

export interface HighlightEngineInput {
  words: readonly HighlightWord[];
  analysis: ClipAnalysisInput;
  peaks: Float32Array | null;
  hopMs: number;
  request: HighlightRequest;
  /** the resolved adapter runner; null takes the signals path immediately */
  runner: ModelRunner | null;
  runnerSource: "cloud" | "model" | null;
  concurrency?: number;
  /** ranges already chosen (Regenerate): candidates duplicating these are dropped */
  exclude?: readonly RangeLike[];
  onStage?: (event: HighlightStageEvent) => void;
  /**
   * AI Clipper durable runs: per-window candidates already collected by an
   * earlier, interrupted run. A seeded window is NOT re-read by the model —
   * its saved candidates stand, so a resume only pays for unfinished windows.
   * Seeded entries are `null` for windows with nothing saved yet.
   */
  seedWindows?: readonly (RawCandidate[] | null)[];
  /** AI Clipper durable runs: called with each freshly-read window's candidates (also `[]` when a window failed) so the caller can checkpoint it. */
  onWindowCandidates?: (windowIndex: number, candidates: RawCandidate[]) => void;
  /** AI Clipper Cancel: checked before each window; aborting throws an AbortError and stops the run. */
  signal?: AbortSignal;
}

export async function runHighlightEngine(input: HighlightEngineInput): Promise<HighlightRunResult> {
  const { words, request } = input;
  const notes: string[] = [];
  input.signal?.throwIfAborted();

  if (!input.runner) {
    const clips = runSignalsPath({ words, analysis: input.analysis, peaks: input.peaks, hopMs: input.hopMs, request, exclude: input.exclude });
    return {
      clips,
      source: "signals",
      fellBack: false,
      notes: ["No AI model is switched on for this site. So these clips were ranked by measured signals only."],
      windowsTotal: 0,
      windowsFailed: 0,
      rawCandidates: 0,
    };
  }

  const sentences = buildSentences(words);
  const sentenceStarts = new Set(sentences.map((s) => s.firstWord));
  const windows = buildWindows(words);
  input.onStage?.({ type: "windows", total: windows.length });

  const avoid = (input.exclude ?? []).map((x) => ({ startWord: x.startWord, endWord: x.endWord }));
  let done = 0;
  let failed = 0;
  const perWindow: RawCandidate[][] = windows.map(() => []);

  const runWindow = async (wi: number): Promise<void> => {
    // A seeded window (resume) never reaches the model: its saved candidates stand.
    const seeded = input.seedWindows?.[wi];
    if (seeded) {
      perWindow[wi] = seeded;
      done += 1;
      input.onStage?.({ type: "window-done", done, total: windows.length, failed });
      return;
    }
    input.signal?.throwIfAborted();
    const win = windows[wi]!;
    const prompt = buildHighlightPrompt({
      contentType: request.contentType,
      request,
      windowText: renderWindowText(words, win, sentenceStarts),
      firstWord: win.firstWord,
      lastWord: win.lastWord,
      avoid: avoid.filter((a) => a.endWord >= win.firstWord && a.startWord <= win.lastWord),
    });
    try {
      perWindow[wi] = parseHighlightReply(await input.runner!(prompt), win);
    } catch (firstError) {
      // one retry with the failure appended (retry-with-feedback)
      try {
        const retryPrompt = {
          system: prompt.system,
          user: `${prompt.user}\n\nYour previous reply could not be used (${firstError instanceof Error ? firstError.message : "unparseable"}). Reply with ONLY the JSON object described above.`,
        };
        perWindow[wi] = parseHighlightReply(await input.runner!(retryPrompt), win);
      } catch {
        failed += 1;
        perWindow[wi] = [];
      }
    }
    done += 1;
    input.onWindowCandidates?.(wi, perWindow[wi]);
    input.onStage?.({ type: "window-done", done, total: windows.length, failed });
  };

  const concurrency = Math.max(1, input.concurrency ?? (input.runnerSource === "model" ? 1 : 3));
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, windows.length) }, async () => {
      while (cursor < windows.length) {
        // Cancel stops the run: no new window starts after the abort.
        input.signal?.throwIfAborted();
        const wi = cursor++;
        await runWindow(wi);
      }
    }),
  );

  const raw = perWindow.flat();
  if (windows.length > 0 && failed === windows.length) {
    const clips = runSignalsPath({ words, analysis: input.analysis, peaks: input.peaks, hopMs: input.hopMs, request, exclude: input.exclude });
    return {
      clips,
      source: "signals",
      fellBack: true,
      notes: [
        `The ${input.runnerSource === "model" ? "on-device model" : "free AI service"} couldn't read any section of this transcript, so these clips were ranked by measured signals only.`,
      ],
      windowsTotal: windows.length,
      windowsFailed: failed,
      rawCandidates: 0,
    };
  }
  if (failed > 0) notes.push(`${failed} of ${windows.length} transcript sections couldn't be read and were skipped.`);

  input.onStage?.({ type: "postprocess", rawCandidates: raw.length });
  if (raw.length === 0) {
    return {
      clips: [],
      source: input.runnerSource ?? "cloud",
      fellBack: false,
      notes: [...notes, "The model found no moments in this video. None stand on their own as clips."],
      windowsTotal: windows.length,
      windowsFailed: failed,
      rawCandidates: 0,
    };
  }

  // post-processing: dedupe (raw) → refine → assemble (scores) → dedupe (refined) → select
  const withSentence = raw.map((c) => ({
    ...c,
    firstSentence: sentenceAt(sentences, c.startWord)?.index,
  }));
  const dedupedRaw = dedupeByScore(withSentence, (c) => c.modelScore);
  const sentencesText = (first: number, last: number): string =>
    sentences.filter((s) => s.index >= first && s.index <= last).map((s) => s.text).join(" ");

  let dropped = 0;
  const assembled = [];
  for (const cand of dedupedRaw) {
    const refined = refineCandidate(words, sentences, cand, {
      minMs: request.minSec * 1000,
      maxMs: request.maxSec * 1000,
      silences: input.analysis.silences,
    });
    if (!refined) {
      dropped += 1;
      continue;
    }
    const measured = measureClip(
      words,
      { startMs: refined.speechStartMs, endMs: refined.speechEndMs },
      input.analysis,
      input.peaks,
      input.hopMs,
    );
    assembled.push(
      assembleClip({
        id: `ai-${refined.startMs}-${refined.endMs}`,
        refined,
        words,
        sentencesText,
        candidate: cand,
        measured,
        contentType: request.contentType,
        hasSceneData: Boolean(input.analysis.sceneCuts),
      }),
    );
  }
  if (dropped > 0) {
    notes.push(
      `${dropped} suggested moment${dropped === 1 ? " was" : "s were"} dropped — ${dropped === 1 ? "it" : "they"} couldn't be cut to a complete thought inside the chosen duration.`,
    );
  }

  input.onStage?.({ type: "ranking" });
  const dedupedFinal = dedupeByScore(assembled, (c) => c.score);
  const kept = dedupedFinal.filter((c) => !(input.exclude ?? []).some((x) => isDuplicate(c, x)));
  const clips = kept.slice(0, Math.max(0, request.clipCount)).map((c, i) => ({ ...c, rank: i + 1 }));

  return {
    clips,
    source: input.runnerSource ?? "cloud",
    fellBack: false,
    notes,
    windowsTotal: windows.length,
    windowsFailed: failed,
    rawCandidates: raw.length,
  };
}
