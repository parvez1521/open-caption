/**
 * Script Studio (3.5): full timed scripts — beats with dialogue, on-screen
 * text and B-roll suggestions, plus a CTA, a caption and hashtags.
 *
 * Two paths, like the rest of Creator Studio, and never blurred:
 *   - the template path (generateScript): deterministic seeded pattern
 *     generation from frames written for this product. NOT a model.
 *   - the model path (buildScriptPrompt / parseScriptOutput): a strict line
 *     format a model is asked to follow, parsed defensively here and routed
 *     by scriptService.ts.
 * Pure module: no DOM, no storage, no network.
 */
import type { CaptionTone, HookStyle, ScriptFormat } from "./model";
import { SCRIPT_FORMATS } from "./model";
import { HOOK_FRAMES, generateCaptions } from "./templates";
import type { BrandProfile } from "./brandProfile";
import { containsAvoidedWord, profilePromptBlock } from "./brandProfile";

export interface ScriptInput {
  topic: string;
  format: ScriptFormat;
  durationSec: number;
  tone: CaptionTone;
  profile?: BrandProfile | null;
}

export interface ScriptBeat {
  index: number;
  startSec: number;
  endSec: number;
  label: string;
  dialogue: string;
  onScreenText: string;
  broll: string;
}

export interface ScriptDoc {
  title: string;
  format: ScriptFormat;
  durationSec: number;
  tone: CaptionTone;
  beats: ScriptBeat[];
  cta: string;
  caption: string;
  hashtags: string[];
}

/* ------------------------------ seeded helpers ------------------------------ */
/* Duplicated from templates.ts on purpose (its helpers are module-private):
 * the tiny hash / PRNG pair is cheaper to copy than to destabilise the
 * template engine's exports and its regression surface. */

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const fill = (frame: string, vars: Record<string, string>): string => {
  let out = frame;
  for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(value);
  return out;
};

const lead = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const trimInput = (s: string, fallback: string): string => {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  return t || fallback;
};

/* ---------------------------------- frames ---------------------------------- */

const TITLE_FRAMES: string[] = [
  "{Topic}: the script",
  "{Topic}, start to finish",
  "The {topic} video, scripted",
  "{Topic} — a working script",
];

/** A sensible hook style per format family; the hook line itself comes from templates.ts HOOK_FRAMES. */
const HOOK_STYLE_BY_FORMAT: Record<ScriptFormat, HookStyle> = {
  reel: "curiosity",
  short: "pattern-interrupt",
  "long-form": "curiosity",
  tutorial: "problem-solution",
  demo: "pattern-interrupt",
  story: "story",
  educational: "curiosity",
  "brand-collab": "curiosity",
};

const SETUP_FRAMES: string[] = [
  "Let me set this up properly. When people talk about {topic}, they usually start in the wrong place, so we are starting with what it actually is, in plain words.",
  "First, the context. {Topic} sounds simple from the outside, but there are two or three moving parts, and once you see them the rest makes sense.",
  "Before the steps, one honest note about {topic}: the beginning feels slow for everyone. That is normal, and it is not a sign you are doing it wrong.",
  "Here is the setup. You do not need special equipment or a big budget for {topic}. You need a clear order of steps, and that is what this is.",
];

const POINT_FRAMES: string[] = [
  "Here is the main point about {topic}: it works when you keep it simple. One clear action, done well, beats five complicated ones done halfway.",
  "The thing that matters most in {topic} is this: consistency. Small, repeated effort on {topic} outperforms one big burst every single time.",
  "Now the key idea. With {topic}, the order matters as much as the effort. Do this part first and the next part gets noticeably easier.",
  "This is the part people skip in {topic}, and it is the part that makes the difference: check your result before you move on, every time.",
];

const EXAMPLE_FRAMES: string[] = [
  "Let me show you with a real example. Watch what happens with {topic} when we apply that step exactly as described — no shortcuts, no editing tricks.",
  "Example time. Here is {topic} in a normal, everyday situation, because that is where it has to work — not in perfect conditions.",
  "To make this concrete: this is me doing {topic} the way I am describing, including the slightly messy middle part most tutorials cut out.",
  "Look at this example of {topic}. Notice the moment it starts working — that is the step from a minute ago, doing its job.",
];

const PROOF_FRAMES: string[] = [
  "And here is the proof it works: this is the result of doing {topic} this way, shown exactly as it came out. No cherry-picking, this is the real outcome.",
  "Do not take my word for it. This is what {topic} produced over the last few attempts, including the one that went wrong and what we changed.",
  "Results check. This is where {topic} started, and this is where it is now, using only the steps in this video. The gap between those two is the method.",
  "If you are wondering whether this holds up in real life: here is {topic} tested outside the studio, in ordinary conditions, with the result on screen.",
];

const CHAPTER_FRAMES: string[] = [
  "This chapter is about the part of {topic} that everything else depends on. Take it slowly here, because the later chapters assume you have this piece in place.",
  "Next, we go one level deeper into {topic}. This is where it gets specific: the choices you make here shape the result more than any later step.",
  "In this chapter, {topic} in practice. We work through a complete example from start to finish, narrating each decision as it happens.",
  "Now the part of {topic} nobody warns beginners about. It is not difficult, but it is easy to miss, and missing it explains most early frustration.",
  "This chapter pulls {topic} together: how the pieces connect, how to tell whether it is working, and what to adjust when it is not.",
];

const CONTEXT_FRAMES: string[] = [
  "Some context before we start. {Topic} has a reputation for being complicated, and honestly that reputation comes from explainers who skip the foundations. We are not skipping them.",
  "Why does {topic} matter? Because it sits underneath a lot of everyday decisions, and understanding it once saves you re-learning it in pieces later.",
  "Let us get oriented. This video covers {topic} from the ground up: what it is, how it works, the mistakes to avoid, and a clear first step at the end.",
];

const RECAP_FRAMES: string[] = [
  "Quick recap of {topic}: we covered what it is, the step that matters most, a full example, and how to check your result. If you remember one thing, remember the order.",
  "Let us land this. {Topic} comes down to a few clear ideas, and you have now seen each one working, not just described. The next move is yours.",
];

const PAYOFF_FRAMES: string[] = [
  "So here is the payoff with {topic}: do the simple version, in the right order, and check the result. That is the whole method, and it is enough to start today.",
  "That is {topic}, without the mystery. One clear method, shown working, that you can copy on your first attempt.",
  "And that is the moment {topic} clicks. Everything before this was setup for this one result — now you have seen it happen.",
];

const CTA_DIALOGUE_FRAMES: string[] = [
  "If this helped, you know what to do — the next step is in the description, and the next video goes one level deeper on {topic}.",
  "Your turn. Try this version of {topic} once, today, and notice what changes. Then come back and tell me how it went.",
  "That is the full method for {topic}. Start with step one, keep it simple, and I will see you in the next one.",
];

/** Default CTA bank, used when no profile CTA is saved. Seeded pick, no outcome promises. */
export const DEFAULT_SCRIPT_CTAS: string[] = [
  "Follow for the next part of this series.",
  "Save this script and film it this week.",
  "Comment with your version — I read every one.",
  "Share this with someone starting out.",
  "Try step one today and report back.",
];

/** Concrete B-roll suggestion per beat label. Template-y by design, but specific to the beat's job. */
const BROLL_BY_LABEL: Record<string, string> = {
  Hook: "Close-up of you speaking straight to camera, topic keyword appearing as a title card",
  Setup: "Wide shot of the workspace or setting, then a screen recording of the starting point",
  "Main point": "Close-up demonstration of the key step, with the keyword step labelled on screen",
  Example: "Screen recording or over-the-shoulder shot of the example being done in real time",
  Proof: "Before-and-after shots side by side, with the result held on screen for two seconds",
  Context: "Slow pan across the setting, archive photos or a simple diagram of the topic",
  Chapter: "Demonstration footage for this chapter, cut with a close-up of the detail being explained",
  Recap: "Quick montage replaying one short clip from each earlier beat",
  Payoff: "Close-up of the finished result, held steady, with the takeaway as a title card",
  CTA: "You speaking to camera, with the next video's thumbnail or title shown beside you",
};

const brollFor = (label: string): string =>
  BROLL_BY_LABEL[label] ?? BROLL_BY_LABEL.Chapter!;

/* ---------------------------------- timing ---------------------------------- */

/**
 * Assign contiguous beat timings from proportional weights: beat i starts
 * where beat i-1 ended, the first beat starts at 0, the last ends exactly at
 * durationSec, and the durations sum exactly to durationSec. Intermediate
 * boundaries are rounded to 2 decimals for readability.
 */
export function assignTimings(weights: number[], durationSec: number): { startSec: number; endSec: number }[] {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0) || weights.length;
  const out: { startSec: number; endSec: number }[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    const startSec = i === 0 ? 0 : Math.round(acc * 100) / 100;
    acc += (Math.max(0, weights[i]!) / total) * durationSec;
    const endSec = i === weights.length - 1 ? durationSec : Math.round(acc * 100) / 100;
    out.push({ startSec, endSec });
  }
  return out;
}

/* ---------------------------------- CTA + caption ---------------------------------- */

/**
 * The script's CTA: the profile's first preferred CTA when a profile with CTAs
 * is present; otherwise a seeded pick from the default bank. The seeded pick
 * skips bank entries that use a word the profile avoids (a substitute exists
 * in the bank, so dropping is honest there).
 */
export function scriptCta(input: ScriptInput, rnd: () => number): string {
  const voice = input.profile?.voice;
  const preferred = (voice?.preferredCtas ?? []).map((c) => c.trim()).filter((c) => c.length > 0);
  if (preferred.length) return preferred[0]!;
  const bank = shuffled(DEFAULT_SCRIPT_CTAS, rnd).filter(
    (cta) => !(voice && containsAvoidedWord(cta, voice)),
  );
  return bank[0] ?? DEFAULT_SCRIPT_CTAS[0]!;
}

/** Caption + hashtags for a script, via the caption generator (which itself applies the profile rules). */
function scriptCaption(input: ScriptInput, topic: string): { caption: string; hashtags: string[] } {
  const items = generateCaptions({
    topic,
    platform: input.format === "long-form" ? "youtube" : "reels",
    tone: input.tone,
    profile: input.profile ?? null,
  });
  const first = items[0];
  if (!first) return { caption: lead(topic), hashtags: [] };
  return { caption: first.title, hashtags: first.hashtags ?? [] };
}

/* ---------------------------------- template path ---------------------------------- */

interface BeatSpec {
  label: string;
  frames: string[];
  weight: number;
}

/**
 * Beat scaffolding per format family:
 *   short forms — Hook → 2–4 middle beats (Setup / Main point / Example /
 *   Proof) → Payoff → CTA;
 *   long-form — Hook → Context → 3–5 chapters → Recap → CTA.
 * Middle/chapter counts scale with the requested duration.
 */
function beatSpecs(input: ScriptInput): BeatSpec[] {
  const hook: BeatSpec = { label: "Hook", frames: [], weight: 1 };
  const cta: BeatSpec = { label: "CTA", frames: CTA_DIALOGUE_FRAMES, weight: 1 };
  if (input.format === "long-form") {
    const chapters = input.durationSec <= 180 ? 3 : input.durationSec <= 600 ? 4 : 5;
    return [
      { ...hook, weight: 1.2 },
      { label: "Context", frames: CONTEXT_FRAMES, weight: 1.5 },
      ...Array.from({ length: chapters }, (_, i) => ({
        label: `Chapter ${i + 1}`,
        frames: CHAPTER_FRAMES,
        weight: 3,
      })),
      { label: "Recap", frames: RECAP_FRAMES, weight: 1.5 },
      { ...cta, weight: 1 },
    ];
  }
  const middles = input.durationSec <= 30 ? 2 : input.durationSec <= 90 ? 3 : 4;
  const middleSpecs: BeatSpec[] = [
    { label: "Setup", frames: SETUP_FRAMES, weight: 2 },
    { label: "Main point", frames: POINT_FRAMES, weight: 2.5 },
    { label: "Example", frames: EXAMPLE_FRAMES, weight: 2.5 },
    { label: "Proof", frames: PROOF_FRAMES, weight: 2 },
  ];
  return [
    hook,
    ...middleSpecs.slice(0, middles),
    { label: "Payoff", frames: PAYOFF_FRAMES, weight: 1.5 },
    cta,
  ];
}

/** Short keyword version of a beat for the on-screen text line. */
const onScreenFor = (label: string, topic: string): string => {
  const words = topic.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  return `${label}: ${lead(words)}`.slice(0, 48);
};

/**
 * Pick a dialogue frame: the first frame (in seeded shuffled order) whose
 * filled text avoids the profile's avoided words, so a substitute frame is
 * used where one exists. Falls back to the first frame when none survives —
 * usually because the topic itself is the avoided word, which no frame can fix.
 */
function pickDialogue(
  frames: string[],
  rnd: () => number,
  vars: Record<string, string>,
  voice: BrandProfile["voice"] | undefined,
): string {
  const filled = shuffled(frames, rnd).map((frame) => fill(frame, vars));
  if (voice) {
    const clean = filled.find((text) => !containsAvoidedWord(text, voice));
    if (clean) return clean;
  }
  return filled[0] ?? "";
}

export function generateScript(input: ScriptInput): ScriptDoc {
  const topic = trimInput(input.topic, "your topic");
  const durationSec = Number.isFinite(input.durationSec) && input.durationSec > 0 ? input.durationSec : 30;
  const voice = input.profile?.voice;
  const rnd = mulberry32(
    hashSeed(JSON.stringify(["script", topic, input.format, durationSec, input.tone])),
  );
  const vars = { Topic: lead(topic), topic };
  const specs = beatSpecs({ ...input, durationSec });
  const timings = assignTimings(
    specs.map((s) => s.weight),
    durationSec,
  );
  const hookFrames = HOOK_FRAMES[HOOK_STYLE_BY_FORMAT[input.format]];
  const beats: ScriptBeat[] = specs.map((spec, index) => {
    const frames = spec.label === "Hook" ? hookFrames : spec.frames;
    const label = spec.label.startsWith("Chapter") ? "Chapter" : spec.label;
    return {
      index,
      startSec: timings[index]!.startSec,
      endSec: timings[index]!.endSec,
      label: spec.label,
      dialogue: pickDialogue(frames, rnd, vars, voice),
      onScreenText: onScreenFor(label, topic),
      broll: brollFor(label),
    };
  });
  const cta = scriptCta(input, rnd);
  const { caption, hashtags } = scriptCaption(input, topic);
  const titleFrames = shuffled(TITLE_FRAMES, rnd).map((frame) => fill(frame, vars));
  const title =
    (voice ? titleFrames.find((t) => !containsAvoidedWord(t, voice)) : titleFrames[0]) ?? titleFrames[0]!;
  return { title, format: input.format, durationSec, tone: input.tone, beats, cta, caption, hashtags };
}

/* ---------------------------------- plain text ---------------------------------- */

const clock = (sec: number): string => {
  const total = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Plain-text rendering for copy-out and the future Teleprompter:
 * title line, one `[mm:ss–mm:ss] Label` block per beat, the CTA, then the
 * caption and its hashtags.
 */
export function scriptToText(doc: ScriptDoc): string {
  const lines: string[] = [doc.title, ""];
  for (const beat of doc.beats) {
    lines.push(`[${clock(beat.startSec)}–${clock(beat.endSec)}] ${beat.label}`);
    lines.push(beat.dialogue);
    lines.push("");
  }
  lines.push(`CTA: ${doc.cta}`);
  lines.push("");
  lines.push(doc.caption);
  if (doc.hashtags.length) lines.push(doc.hashtags.join(" "));
  return lines.join("\n");
}

/* ---------------------------------- model path ---------------------------------- */

export interface ScriptPrompt {
  system: string;
  user: string;
}

const SCRIPT_SYSTEM =
  "You write video scripts. Follow the requested format exactly, line by line, with no extra text before or after. Never add numbering or bullet points.";

/**
 * The model prompt for one script. The output contract is exactly:
 *   TITLE: <title>
 *   BEAT | <startSec>-<endSec> | <label> | <dialogue> | <on-screen text> | <b-roll>
 *   CTA: <cta>
 *   CAPTION: <caption text> :: <hashtags space-separated>
 * The Brand Voice block rides along when a profile is present, exactly as the
 * other generators' prompts carry it (prompts.ts).
 */
export function buildScriptPrompt(input: ScriptInput): ScriptPrompt {
  const topic = trimInput(input.topic, "your topic");
  const durationSec = Number.isFinite(input.durationSec) && input.durationSec > 0 ? input.durationSec : 30;
  const formatLabel = SCRIPT_FORMATS.find((f) => f.id === input.format)?.label ?? input.format;
  let user =
    `Write a ${formatLabel} script about "${topic}" lasting exactly ${durationSec} seconds, in a ${input.tone} tone. ` +
    `Output exactly these lines, in this order:\n` +
    `TITLE: <title>\n` +
    `One line per beat, formatted exactly as: BEAT | <startSec>-<endSec> | <label> | <dialogue> | <on-screen text> | <b-roll>\n` +
    `Beat timings must be contiguous, start at 0, and end at exactly ${durationSec}.\n` +
    `CTA: <cta>\n` +
    `CAPTION: <caption text> :: <hashtags space-separated>`;
  if (input.profile) {
    const block = profilePromptBlock(input.profile);
    if (block) user = `${user}\n\n${block}`;
  }
  return { system: SCRIPT_SYSTEM, user };
}

const parseRange = (text: string): { start: number; end: number } | null => {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Timing repair choice: a parsed script's beats are only trusted as-is when
 * they are usable AND already cover 0..durationSec (first beat starts at 0,
 * last ends at durationSec, every beat has positive length, boundaries are
 * contiguous). Otherwise the beat DURATIONS (falling back to equal weights
 * when a duration is not positive) are treated as proportional weights and
 * rescaled onto 0..durationSec with assignTimings — the beat count, order and
 * text survive; only the clock changes. Documented here because it rewrites
 * numbers a model produced.
 */
function repairTimings(beats: ScriptBeat[], durationSec: number): ScriptBeat[] {
  const usable =
    beats.length > 0 &&
    beats.every((b) => Number.isFinite(b.startSec) && Number.isFinite(b.endSec) && b.endSec > b.startSec) &&
    Math.abs(beats[0]!.startSec) < 0.51 &&
    Math.abs(beats[beats.length - 1]!.endSec - durationSec) < 0.51 &&
    beats.every((b, i) => i === 0 || Math.abs(b.startSec - beats[i - 1]!.endSec) < 0.51);
  if (usable) {
    // Normalise the outer boundaries to the exact requested duration.
    return beats.map((b, i) => ({
      ...b,
      index: i,
      startSec: i === 0 ? 0 : b.startSec,
      endSec: i === beats.length - 1 ? durationSec : b.endSec,
    }));
  }
  const weights = beats.map((b) => (b.endSec > b.startSec ? b.endSec - b.startSec : 1));
  const timings = assignTimings(weights, durationSec);
  return beats.map((b, i) => ({ ...b, index: i, startSec: timings[i]!.startSec, endSec: timings[i]!.endSec }));
}

/**
 * Parse raw model output (the buildScriptPrompt contract) into a ScriptDoc.
 * Returns null when fewer than 2 beats parse — the caller falls back to the
 * template script rather than showing a fragment. When beats parse but the
 * CTA or CAPTION lines are missing, those pieces are filled from the same
 * rules as the template path (profile CTA / default bank; caption generator)
 * instead of failing the whole script.
 */
export function parseScriptOutput(raw: string, input: ScriptInput): ScriptDoc | null {
  const topic = trimInput(input.topic, "your topic");
  const durationSec = Number.isFinite(input.durationSec) && input.durationSec > 0 ? input.durationSec : 30;
  let title = "";
  let cta = "";
  let caption = "";
  let hashtags: string[] = [];
  let captionSeen = false;
  const beats: ScriptBeat[] = [];
  for (const rawLine of (raw ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^TITLE:/i.test(line)) {
      title = line.replace(/^TITLE:\s*/i, "").trim();
    } else if (/^BEAT\s*\|/i.test(line)) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 6) continue;
      const range = parseRange(parts[1]!);
      const label = parts[2]!;
      const dialogue = parts[3]!;
      if (!range || !label || dialogue.length < 3) continue;
      beats.push({
        index: beats.length,
        startSec: range.start,
        endSec: range.end,
        label,
        dialogue,
        onScreenText: parts[4] ?? "",
        broll: parts.slice(5).join(" | "),
      });
    } else if (/^CTA:/i.test(line)) {
      cta = line.replace(/^CTA:\s*/i, "").trim();
    } else if (/^CAPTION:/i.test(line)) {
      captionSeen = true;
      const body = line.replace(/^CAPTION:\s*/i, "");
      const [text, tagText] = body.split("::").map((s) => s.trim());
      caption = (text ?? "").trim();
      hashtags = (tagText ?? "").split(/\s+/).filter((t) => t.startsWith("#"));
    }
  }
  if (beats.length < 2) return null;
  const rnd = mulberry32(hashSeed(JSON.stringify(["script-parse", topic, input.format, durationSec])));
  if (!title) title = fill(shuffled(TITLE_FRAMES, rnd)[0]!, { Topic: lead(topic), topic });
  if (!cta) cta = scriptCta(input, rnd);
  if (!captionSeen || !caption) {
    const filled = scriptCaption(input, topic);
    caption = filled.caption;
    if (!hashtags.length) hashtags = filled.hashtags;
  }
  return {
    title,
    format: input.format,
    durationSec: round2(durationSec),
    tone: input.tone,
    beats: repairTimings(beats, durationSec),
    cta,
    caption,
    hashtags,
  };
}
