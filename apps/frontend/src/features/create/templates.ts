/**
 * The template engine: an original pattern library for the Creator Studio generators.
 *
 * This is NOT a model and is never labelled as one. It is deterministic combinatorial generation:
 * the caller's inputs (niche, topic, platform, audience, style, tone) are substituted into frames
 * written for this product, and a seeded shuffle (seeded from the inputs themselves) picks which
 * frames and angles combine, so the same inputs always produce the same batch and different inputs
 * produce different batches. Pure module: no DOM, no storage, no network. Works fully offline.
 */
import type {
  CaptionFormat,
  CaptionTone,
  GeneratedItem,
  HookStyle,
  IdeaCategory,
  IdeaDifficulty,
  IdeaDuration,
  IdeaObjective,
  Platform,
  SponsoredInput,
} from "./model";
import { platformLabel } from "./model";
import type { BrandProfile } from "./brandProfile";
import { containsAvoidedWord } from "./brandProfile";

/* ---------------------------------- seeded selection ---------------------------------- */

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

/** Sentence-case the first letter (inputs arrive typed in lower case as often as not). */
const lead = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const trimInput = (s: string, fallback: string): string => {
  const t = s.trim().replace(/\s+/g, " ");
  return t || fallback;
};
export const clampCount = (n: number): number => Math.min(10, Math.max(1, Math.floor(Number.isFinite(n) ? n : 5)));

/* ---------------------------------- ideas ---------------------------------- */

/** A format pairs a working title frame with the shape of the piece. 8 per platform, 32 total. */
const IDEA_FORMATS: Record<Platform, { title: string }[]> = {
  reels: [
    { title: "{Niche} in 30 seconds: the one thing beginners miss" },
    { title: "POV: you finally understand {niche}" },
    { title: "3 {niche} mistakes I see every single week" },
    { title: "Watch me fix a {niche} fail in real time" },
    { title: "The {niche} checklist I wish someone gave me on day one" },
    { title: "Rating popular {niche} advice from 1 to 10" },
    { title: "One {niche} habit that changed everything for me" },
    { title: "{Niche} myths, busted in under a minute" },
  ],
  shorts: [
    { title: "{Niche} explained so a 10-year-old gets it" },
    { title: "I tried the most shared {niche} tip for a week" },
    { title: "The fastest {niche} win nobody talks about" },
    { title: "Stop doing this in {niche} (do this instead)" },
    { title: "{Niche}: expect this in your first 7 days" },
    { title: "One minute, one {niche} lesson, zero fluff" },
    { title: "The {niche} question everyone asks, answered honestly" },
    { title: "Before and after: 30 days of {niche}" },
  ],
  youtube: [
    { title: "The complete beginner's guide to {niche} (2026 edition)" },
    { title: "I studied 50 experts in {niche}: here is what they agree on" },
    { title: "{Niche} mistakes that cost you months, and how to avoid them" },
    { title: "From zero to confident in {niche}: a realistic roadmap" },
    { title: "Everything about {niche} I wish I knew before starting" },
    { title: "The honest truth about {niche} nobody puts in a thumbnail" },
    { title: "{Niche} tools and setups compared, with real results" },
    { title: "Answering your hardest {niche} questions" },
  ],
  tiktok: [
    { title: "Tell me you are into {niche} without telling me" },
    { title: "The {niche} hack the algorithm keeps showing you, tested" },
    { title: "Day one of taking {niche} seriously" },
    { title: "Things in {niche} that just make sense" },
    { title: "Replying to the top comment: the {niche} edition" },
    { title: "If {niche} was explained by your brutally honest friend" },
    { title: "The {niche} red flags nobody warns you about" },
    { title: "Stitch this: my hottest {niche} take" },
  ],
};

/** Angle lines: why this piece lands with this audience. 10 total, combined with the formats. */
const IDEA_ANGLES: string[] = [
  "Angle: open on the mistake {audience} make most, then show the fix step by step.",
  "Angle: speak straight to {audience} and name the exact moment things usually go wrong.",
  "Angle: build it as a countdown so {audience} stay to the last point.",
  "Angle: compare the popular way with the way that actually works for {audience}.",
  "Angle: use your own before-and-after so {audience} see proof, not promises.",
  "Angle: answer the question {audience} keep asking in comments, on camera.",
  "Angle: keep it to one takeaway {audience} can use the same day.",
  "Angle: start with the result, then rewind and show {audience} how you got there.",
  "Angle: invite {audience} to pick the next part in the comments.",
  "Angle: bust the myth first, then give {audience} the replacement habit.",
];

/** Per-category title frames, 4 per category, 28 total. Mixed with the platform formats so the category really changes the titles. */
export const CATEGORY_FORMATS: Record<IdeaCategory, { title: string }[]> = {
  educational: [
    { title: "{Niche}, explained clearly: the lesson most explainers skip" },
    { title: "What {niche} actually means, in plain words" },
    { title: "The {niche} concept that unlocks everything else" },
    { title: "Teach {niche} like a teacher: one idea, fully understood" },
  ],
  entertainment: [
    { title: "The funniest thing about {niche}, acted out honestly" },
    { title: "{Niche} bingo: how many of these have you lived?" },
    { title: "If {niche} had a blooper reel, this would open it" },
    { title: "Rating {niche} moments purely for entertainment value" },
  ],
  tutorial: [
    { title: "How to do {niche}: a step-by-step walkthrough you can follow along" },
    { title: "{Niche} tutorial: follow these exact steps in order" },
    { title: "Do {niche} with me, step by step, no steps skipped" },
    { title: "The hands-on {niche} tutorial: pause, copy, continue" },
  ],
  storytelling: [
    { title: "The {niche} story I have never told in full before" },
    { title: "How {niche} changed one ordinary week into a turning point" },
    { title: "A {niche} story in three acts: hope, failure, second attempt" },
    { title: "The day {niche} stopped being a plan and became a story" },
  ],
  "problem-solution": [
    { title: "The {niche} problem nobody admits to, and a working fix" },
    { title: "Diagnosing your {niche} problem: cause first, solution second" },
    { title: "One stubborn {niche} problem, solved on camera" },
    { title: "Why your {niche} keeps breaking, and the fix that holds" },
  ],
  industry: [
    { title: "Inside {niche}: what people in the industry actually do all day" },
    { title: "The {niche} industry shift insiders are quietly preparing for" },
    { title: "{Niche} from the inside: terms and habits outsiders never hear" },
    { title: "What professionals in {niche} wish the public understood" },
  ],
  series: [
    { title: "{Niche} series, part one: start the journey with me" },
    { title: "Episode one: my {niche} series begins with the hardest part" },
    { title: "A seven-part {niche} series: this is the roadmap episode" },
    { title: "{Niche}, the series: one chapter at a time, starting today" },
  ],
};

const DURATION_LABELS: Record<IdeaDuration, string> = {
  "under-30s": "Under 30 seconds",
  "30-60s": "30–60 seconds",
  "1-3min": "1–3 minutes",
  "long-form": "Long-form (3+ minutes)",
};

const DIFFICULTY_NOTES: Record<IdeaDifficulty, string> = {
  easy: "Easy to film (one take, no props)",
  medium: "Medium to film (a few takes, simple setup)",
  advanced: "Advanced to film (multiple setups and edits)",
};

const OBJECTIVE_PHRASES: Record<IdeaObjective, string> = {
  reach: "reach new viewers",
  engagement: "engagement",
  followers: "grow your followers",
  sales: "sales",
  authority: "build authority",
};

export interface IdeasInput {
  niche: string;
  platform: Platform;
  audience: string;
  count: number;
  category?: IdeaCategory;
  difficulty?: IdeaDifficulty;
  duration?: IdeaDuration;
  objective?: IdeaObjective;
  profile?: BrandProfile | null;
}

export function generateIdeas(input: IdeasInput): GeneratedItem[] {
  const profile = input.profile ?? null;
  const voice = profile?.voice;
  // Profile fallbacks come BEFORE the trimInput defaults: an empty field takes the profile's value.
  const niche = trimInput(input.niche?.trim() ? input.niche : (voice?.niche ?? ""), "your niche");
  const audience = trimInput(input.audience?.trim() ? input.audience : (voice?.audience ?? ""), "beginners");
  const category: IdeaCategory = input.category ?? "educational";
  const difficulty: IdeaDifficulty = input.difficulty ?? "medium";
  const duration: IdeaDuration = input.duration ?? "30-60s";
  const objective: IdeaObjective = input.objective ?? "engagement";
  const count = clampCount(input.count);
  const rnd = mulberry32(
    hashSeed(JSON.stringify(["ideas", niche, input.platform, audience, category, difficulty, duration, objective])),
  );
  const platformFormats = shuffled(IDEA_FORMATS[input.platform], rnd);
  const categoryFormats = shuffled(CATEGORY_FORMATS[category], rnd);
  // Interleave platform and category formats so category frames are guaranteed to appear in the
  // batch (pooling + shuffling alone could leave a batch with no category title at all).
  const formats: { title: string }[] = [];
  const maxLen = Math.max(platformFormats.length, categoryFormats.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < categoryFormats.length) formats.push(categoryFormats[i]!);
    if (i < platformFormats.length) formats.push(platformFormats[i]!);
  }
  const angles = shuffled(IDEA_ANGLES, rnd);
  const plan = `Plan: ${DURATION_LABELS[duration]} · ${DIFFICULTY_NOTES[difficulty]} · Goal: ${OBJECTIVE_PHRASES[objective]}.`;
  const out: GeneratedItem[] = [];
  // Refill rule (profile avoid list): keep cycling the format pool for up to 3 cycles, dropping
  // any item whose title or detail uses an avoided word; return what survives if still short.
  const maxAttempts = formats.length * 3;
  for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
    const format = formats[attempt % formats.length]!;
    const angle = angles[(attempt + Math.floor(attempt / formats.length)) % angles.length]!;
    const item: GeneratedItem = {
      title: fill(format.title, { Niche: lead(niche), niche }),
      detail: `${fill(angle, { audience })} ${plan}`,
    };
    if (voice && (containsAvoidedWord(item.title, voice) || containsAvoidedWord(item.detail ?? "", voice))) continue;
    out.push(item);
  }
  return out;
}

/* ---------------------------------- hooks ---------------------------------- */

/** Opening-line frames per style, 8 each, 72 total. {topic} and {Topic} are the caller's topic. */
export const HOOK_FRAMES: Record<HookStyle, string[]> = {
  curiosity: [
    "Nobody tells you this about {topic}, and it changes everything.",
    "There is a part of {topic} you are not supposed to notice. Watch closely.",
    "I was today years old when I learned this about {topic}.",
    "The {topic} detail hiding in plain sight? It is not what you think.",
    "What if everything you assume about {topic} is backwards?",
    "Stay for the last ten seconds. That is where {topic} gets interesting.",
    "I found the one thing about {topic} that experts quietly agree on.",
    "This {topic} trick feels illegal to know. It is not.",
  ],
  "problem-solution": [
    "If {topic} keeps going wrong for you, this is probably why.",
    "Struggling with {topic}? Do this first, before anything else.",
    "Your {topic} problem is not effort. It is this one fixable thing.",
    "Here is the fastest way I know to get {topic} working.",
    "Stop guessing at {topic}. Here is the order that actually works.",
    "Three signs your {topic} needs a reset, and the reset itself.",
    "The {topic} fix takes two minutes and most people skip it.",
    "If I had to restart {topic} from zero today, I would start here.",
  ],
  story: [
    "I got {topic} completely wrong for a year. Here is the day it clicked.",
    "This started as a {topic} disaster. Wait for how it ends.",
    "Last week, {topic} taught me a lesson I did not ask for.",
    "A stranger's comment about {topic} changed how I do everything.",
    "I almost quit {topic}. Then one small thing happened.",
    "True story: my worst {topic} day became my best lesson.",
    "It began with a broken {topic} attempt at 2 a.m.",
    "Someone bet me I could not fix {topic} in a day. Here is what happened.",
  ],
  controversial: [
    "Unpopular opinion: most {topic} advice is a waste of your time.",
    "I will say it plainly. The popular way to do {topic} is wrong.",
    "{Topic} does not need more effort. It needs less of the usual advice.",
    "Hot take: beginners should ignore half of what they hear about {topic}.",
    "The {topic} rule everyone repeats? Break it. Here is why.",
    "If your {topic} guru hates this video, that proves my point.",
    "Sorry, but your favourite {topic} shortcut is holding you back.",
    "Everyone is lying to you about {topic}, politely. I will not.",
  ],
  "pattern-interrupt": [
    "Stop scrolling. Your {topic} needs thirty seconds of honesty.",
    "Delete your last {topic} attempt. Now watch this instead.",
    "This is not another {topic} tutorial. Look at the screen.",
    "Put the {topic} playbook down. We are doing this differently.",
    "POV: {topic} finally explained without the boring parts.",
    "That sound? That is your {topic} strategy expiring.",
    "Three words for your {topic}: not like that.",
    "Wait. Before you try {topic} again, watch what happens here.",
  ],
  contrarian: [
    "Everyone does {topic} this way. I stopped, and here is what happened instead.",
    "The best {topic} advice I ever got was to ignore the most popular {topic} advice.",
    "I do the opposite of what most {topic} guides say. Let me show you why.",
    "If everyone agrees on {topic}, someone is not thinking. Here is the other side.",
    "I quit the standard {topic} routine and my results got simpler, not worse.",
    "The {topic} advice you hear everywhere? I tested the reverse for a month.",
    "Popular {topic} wisdom says go bigger. I went smaller, on purpose.",
    "You do not need a better {topic} method. You need to drop the fashionable one.",
  ],
  numbers: [
    "3 numbers tell you more about {topic} than a month of guessing.",
    "I tracked {topic} for 30 days. These 5 numbers changed my approach.",
    "90% of {topic} comes down to these 4 measurable things.",
    "Two minutes, seven {topic} facts, zero opinions. Starting now.",
    "The one {topic} number nobody checks, and it explains almost everything.",
    "I measured {topic} 100 times. Here is the pattern in the data.",
    "By the numbers: what 6 weeks of {topic} actually produced.",
    "If you only remember 3 {topic} statistics, make it these three.",
  ],
  "open-loop": [
    "I will show you the {topic} result at the end. First, watch what caused it.",
    "There is one {topic} moment in this video I cannot explain yet. Keep watching.",
    "This {topic} story has a missing piece, and it arrives in the last ten seconds.",
    "I opened a {topic} question yesterday and I still owe you the answer. Here it is, at the end.",
    "Do not skip: the {topic} detail I plant now pays off right before the finish.",
    "Something about {topic} goes wrong halfway through this video. See if you spot it first.",
    "I am leaving this {topic} thread open on purpose. It closes at the end.",
    "Remember this first {topic} clip. You will need it to understand the ending.",
  ],
  unexpected: [
    "My {topic} started working the day I made it worse on purpose.",
    "The most useful {topic} tool I own is not a tool at all.",
    "I learned more about {topic} from failing publicly than from any course.",
    "This {topic} video begins with the ending, because the beginning makes no sense yet.",
    "A completely unrelated hobby fixed my {topic}. Stay with me on this one.",
    "The {topic} breakthrough came from the attempt I almost deleted.",
    "I asked a child to explain {topic}. Their answer was better than the experts'.",
    "Nothing about this {topic} setup should work. Watch it work anyway.",
  ],
};

/**
 * Psychology explanations for each hook style — written content, attached to every hook.
 * Each explains why the style can hold attention; none promises reach or any outcome.
 */
export const HOOK_MECHANISMS: Record<HookStyle, string> = {
  curiosity:
    "Curiosity works through the information gap. The line names something the viewer does not yet know. The mind wants to close that gap. The payoff has to arrive in the video. Or the gap feels like a trick.",
  "problem-solution":
    "This style starts from pain-point recognition. The viewer sees their own frustration named in the first seconds. Naming the problem clearly also opens a resolution. That gives them a reason to stay for the fix.",
  story:
    "Story hooks use narrative transportation. Once a viewer follows a person through events, attention follows the outcome. An unfinished personal story is harder to abandon. Harder than a list of facts.",
  controversial:
    "A strong opinion creates opinion arousal. Viewers who agree feel recognised. Viewers who disagree feel a pull to respond. That tension holds attention. As long as the position is one you can defend.",
  "pattern-interrupt":
    "A pattern interrupt violates a prediction. The opening does not match what the viewer expected. The mismatch forces a brief re-evaluation. That pause is the moment attention resets.",
  contrarian:
    "Contrarian hooks challenge a belief the viewer already holds. That touches identity as well as information. Defending or revising a belief takes mental work. That work keeps the viewer engaged.",
  numbers:
    "Specific numbers make a claim feel concrete and checkable. Not vague. A stated count sets an expectation the viewer can track. That gives the rest of the video a simple structure.",
  "open-loop":
    "An open loop leaves a question deliberately unanswered. The Zeigarnik effect keeps unfinished tasks active in memory. The viewer keeps watching to close the loop. Provided the video actually closes it.",
  unexpected:
    "An unexpected statement creates novelty and surprise: it does not fit the viewer's existing picture of the topic. Surprise signals that there may be something new to learn, which earns a few more seconds of attention.",
};

export interface HooksInput {
  topic: string;
  style: HookStyle;
  platform: Platform;
  count: number;
  profile?: BrandProfile | null;
}

export function generateHooks(input: HooksInput): GeneratedItem[] {
  const topic = trimInput(input.topic, "your topic");
  const voice = input.profile?.voice;
  const count = clampCount(input.count);
  const rnd = mulberry32(hashSeed(JSON.stringify(["hooks", topic, input.style, input.platform])));
  const frames = shuffled(HOOK_FRAMES[input.style], rnd);
  const mechanism = HOOK_MECHANISMS[input.style];
  const out: GeneratedItem[] = [];
  // Refill rule (profile avoid list): keep cycling the shuffled frames for up to 3 cycles,
  // dropping any item whose title or detail uses an avoided word; return what survives if short.
  const maxAttempts = frames.length * 3;
  for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
    const frame = frames[attempt % frames.length]!;
    const again = attempt >= frames.length;
    const item: GeneratedItem = {
      title: fill(frame, { Topic: lead(topic), topic }),
      detail: again
        ? `Variation for ${platformLabel(input.platform)}: same line, new delivery, slower first three words.`
        : `Made for ${platformLabel(input.platform)}: say it in the first three seconds.`,
      mechanism,
    };
    if (voice && (containsAvoidedWord(item.title, voice) || containsAvoidedWord(item.detail ?? "", voice))) continue;
    out.push(item);
  }
  return out;
}

/* ---------------------------------- captions ---------------------------------- */

/** Caption frames per tone, 6 each, 30 total. */
const CAPTION_FRAMES: Record<CaptionTone, string[]> = {
  friendly: [
    "We finally tried {topic} and honestly? We get the hype now. Come along for the whole thing.",
    "A little {topic} moment for your feed today. Save this for when you need it.",
    "If you have been curious about {topic}, this is your friendly nudge to start.",
    "Sharing our {topic} journey one small win at a time. Thanks for being here.",
    "Today is a good day for {topic}. Here is the part we loved most.",
    "Your sign to give {topic} a go this week. Tell us how yours turns out.",
  ],
  professional: [
    "{Topic}, done properly. Here is the process, the reasoning and the result.",
    "A closer look at {topic}: what works, what we changed and what we would repeat.",
    "Documenting our approach to {topic} so you can apply the same method.",
    "{Topic} is not guesswork. This is the framework behind today's result.",
    "Results from this week's work on {topic}, with the numbers that matter.",
    "Breaking down {topic} into the steps any team can follow.",
  ],
  bold: [
    "{Topic}. No shortcuts, no excuses, just results.",
    "We said we would master {topic}. This is us keeping that promise.",
    "Everyone talks about {topic}. We actually did it. Watch.",
    "{Topic} separates the talkers from the doers. Pick your side.",
    "This is what committing to {topic} really looks like.",
    "No filters. No retakes. Just {topic}, done at full effort.",
  ],
  funny: [
    "Nobody warned us {topic} would become our whole personality. Too late now.",
    "Day one of {topic}: confidence high, skills pending.",
    "We came for the {topic}. We stayed because we cannot work the exit.",
    "{Topic} looked easy in the tutorial. The tutorial lied.",
    "Our {topic} era has officially begun. Send snacks and patience.",
    "Plot twist: {topic} is harder than it looks and twice as fun.",
  ],
  minimal: [
    "{Topic}, documented.",
    "Today: {topic}.",
    "{Topic}. That is the post.",
    "Notes on {topic}.",
    "{Topic}, step by step.",
    "One takeaway from {topic}.",
  ],
};

/**
 * YouTube description frames (3.6), 4 total. Each assembles a multi-line
 * description as one item title: a hook line, what the viewer gets, a chapters
 * block with 00:00-style timestamps the creator replaces with real ones, and a
 * subscribe line. {topic}/{Topic} are the caller's topic.
 */
export const YOUTUBE_DESCRIPTION_FRAMES: string[] = [
  "{Topic} — the full breakdown, in one video.\n\nIn this video you get a clear walkthrough of {topic}: what it is, how it works, and the part most people get wrong first.\n\nChapters:\n00:00 Intro\n00:45 What {topic} actually is\n02:30 The step-by-step\n05:00 Common mistakes\n07:15 Recap and next step\n\nSubscribe for a new video like this every week, and tell us in the comments what to cover next.",
  "Everything you need to know about {topic}, without the fluff.\n\nWatch this if you want {topic} explained in plain words, with examples you can copy the same day.\n\nChapters:\n00:00 The short answer\n01:10 Why {topic} matters\n03:20 Worked example\n06:00 What to do next\n\nNew here? Subscribe and turn on notifications so the next one finds you.",
  "{Topic}, done properly — here is the process.\n\nThis video breaks {topic} into simple steps, shows the reasoning behind each one, and ends with a recap you can save.\n\nChapters:\n00:00 Start here\n01:00 The setup\n03:45 The method\n06:30 Results and lessons\n\nSubscribe for more practical videos on {topic} and the topics around it.",
  "Your complete starter guide to {topic}.\n\nBy the end of this video you will understand the basics of {topic}, the mistakes to avoid, and the first action to take today.\n\nChapters:\n00:00 Overview\n00:50 The basics\n02:50 Mistakes to avoid\n05:10 Your first step\n\nIf this helped, subscribe — the next video goes one level deeper.",
];

/**
 * LinkedIn post frames (3.6), 4 total. Each has a strong first line, a
 * short-paragraph body with line breaks, and a closing question or takeaway.
 */
export const LINKEDIN_FRAMES: string[] = [
  "{Topic} taught our team something we should have learned earlier.\n\nWe approached {topic} the usual way at first. It worked, but slowly — and the friction was hiding in one step nobody questioned.\n\nOnce we named that step, the rest got simpler: clearer decisions, less rework, better results.\n\nThe takeaway: progress on {topic} rarely needs more effort. It needs one honest look at the process.\n\nWhat has {topic} taught you?",
  "A short note on {topic}.\n\nMost conversations about {topic} start with tools or tactics. Ours started with a simpler question: what outcome are we actually trying to produce?\n\nThat one question changed the plan, the order of work, and how we measured success.\n\nIf you work with {topic}, start there.\n\nAgree or disagree?",
  "Three things I now believe about {topic}:\n\n1. The basics beat the shortcuts, every time.\n2. Consistency matters more than intensity.\n3. The results compound quietly, then suddenly.\n\nNone of this is complicated. All of it takes patience.\n\nWhat would you add to the list?",
  "We documented our latest work on {topic} so other teams can use it.\n\nThe method is in the video: the setup, the decisions, and what we would repeat next time.\n\nSharing it because {topic} gets easier when teams compare notes in the open.\n\nIf you try it, I would like to hear how it goes.",
];

/**
 * X post frames (3.6), 6 total. Deliberately short: generateCaptions also caps
 * the topic it fills in for X, and chooses at most 2 hashtags, so a finished
 * post (title + hashtags, via itemCopyText) stays within 280 characters even
 * for a very long topic.
 */
export const X_FRAMES: string[] = [
  "{Topic}. That is the whole post. Watch:",
  "We tried {topic} so you do not have to guess. Here is what happened:",
  "{Topic}, explained in one post. Thread below:",
  "Day one of {topic}. Documenting everything here:",
  "The {topic} lesson nobody posts about:",
  "Quick take on {topic}: start small, stay consistent, share the results.",
];

/** Hashtag banks: 5 per platform plus 6 per topic cluster, written for this product. */
const PLATFORM_TAGS: Record<Platform, string[]> = {
  reels: ["#reels", "#reelsinstagram", "#explorepage", "#viralreels", "#reelkarofeelkaro"],
  shorts: ["#shorts", "#youtubeshorts", "#shortsfeed", "#shortsvideo", "#ytshorts"],
  youtube: ["#youtube", "#youtuber", "#newvideo", "#watchnow", "#videooftheday"],
  tiktok: ["#tiktok", "#fyp", "#foryou", "#foryoupage", "#tiktokmademebuyit"],
};

const CLUSTERS: { keys: string[]; tags: string[] }[] = [
  { keys: ["fit", "gym", "workout", "run", "yoga", "health"], tags: ["#fitness", "#gymlife", "#workoutmotivation", "#fitfam", "#trainhard", "#healthylifestyle"] },
  { keys: ["food", "cook", "recipe", "bake", "chef", "kitchen"], tags: ["#foodie", "#homecooking", "#recipeoftheday", "#foodlover", "#easyrecipes", "#instafood"] },
  { keys: ["travel", "trip", "hotel", "flight", "beach", "city"], tags: ["#travelgram", "#wanderlust", "#travelphotography", "#vacationmode", "#exploremore", "#travelblogger"] },
  { keys: ["tech", "app", "software", "ai", "gadget", "code", "website", "tool"], tags: ["#technology", "#techtips", "#aitools", "#software", "#gadgets", "#technews"] },
  { keys: ["business", "startup", "marketing", "brand", "sales", "entrepreneur"], tags: ["#smallbusiness", "#entrepreneur", "#marketingtips", "#startuplife", "#businesstips", "#branding"] },
  { keys: ["beauty", "makeup", "skincare", "hair", "fashion", "style"], tags: ["#beautytips", "#skincare", "#makeuplover", "#fashionstyle", "#glowup", "#beautyblogger"] },
  { keys: ["study", "learn", "exam", "school", "course", "tutorial", "how to"], tags: ["#studytips", "#learnontiktok", "#education", "#studymotivation", "#howto", "#learning"] },
  { keys: ["money", "finance", "invest", "budget", "saving"], tags: ["#personalfinance", "#moneytips", "#investing", "#financialfreedom", "#budgeting", "#wealthbuilding"] },
];

const GENERIC_TAGS = ["#creator", "#contentcreator", "#daily", "#community", "#newpost", "#trending"];

const topicTags = (topic: string): string[] =>
  topic
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .map((w) => `#${w.charAt(0).toUpperCase()}${w.slice(1)}`);

function tagsFor(topic: string, platform: Platform, rnd: () => number): string[] {
  const lower = topic.toLowerCase();
  const cluster = CLUSTERS.find((c) => c.keys.some((k) => lower.includes(k)));
  const pool = [...(cluster?.tags ?? []), ...PLATFORM_TAGS[platform], ...GENERIC_TAGS, ...topicTags(topic)];
  const unique = [...new Set(pool)];
  return shuffled(unique, rnd).slice(0, 10);
}

/**
 * Format-aware tag path for Caption & Hashtag Studio (3.6). tagsFor is keyed by
 * the video Platform union, which has no LinkedIn/X entry, so non-Instagram
 * caption formats pass an override pool instead:
 *   - linkedin: the business cluster + generic tags + topic tags (professional
 *     clusters first), 4 tags — LinkedIn posts read better with few, relevant tags.
 *   - youtube: the normal platform path for "youtube", trimmed to 4 tags.
 *   - x: at most 2 short tags, so a post stays inside the length budget.
 */
function tagsForCaptionFormat(topic: string, format: CaptionFormat, platform: Platform, rnd: () => number): string[] {
  if (format === "youtube") return tagsFor(topic, "youtube", rnd).slice(0, 4);
  if (format === "x") {
    return tagsFor(topic, platform, rnd)
      .filter((tag) => tag.length <= 24)
      .slice(0, 2);
  }
  if (format === "linkedin") {
    // Two tags always come from the business cluster (that is what makes the
    // set professional); the other two come from generic + topic tags.
    const business = CLUSTERS.find((c) => c.keys.includes("business"));
    const fromBusiness = shuffled([...(business?.tags ?? [])], rnd).slice(0, 2);
    const rest = shuffled([...new Set([...GENERIC_TAGS, ...topicTags(topic)])], rnd).slice(0, 2);
    return [...new Set([...fromBusiness, ...rest])];
  }
  return tagsFor(topic, platform, rnd);
}

export interface CaptionInput {
  topic: string;
  platform: Platform;
  tone: CaptionTone;
  profile?: BrandProfile | null;
  /** Caption & Hashtag Studio format (3.6). Default "instagram" — the original behaviour. */
  format?: CaptionFormat;
  /**
   * Sponsored requirements (3.6). The template engine does not apply these
   * itself: the service enforces them on the final batch from whichever source
   * won (see captionStudio.applySponsored), so disclosure is always last.
   */
  sponsored?: SponsoredInput;
}

/** Three caption options per run, each with its own hashtag set. */
export function generateCaptions(input: CaptionInput): GeneratedItem[] {
  const format: CaptionFormat = input.format ?? "instagram";
  if (format !== "instagram") return generateFormattedCaptions(input, format);
  const topic = trimInput(input.topic, "your topic");
  const voice = input.profile?.voice;
  const rnd = mulberry32(hashSeed(JSON.stringify(["captions", topic, input.platform, input.tone])));
  const frames = shuffled(CAPTION_FRAMES[input.tone], rnd);
  const titles = frames.map((frame) => fill(frame, { Topic: lead(topic), topic }));
  // Profile avoid list: captions have a fixed pool of 6 frames and always return 3, so there is
  // no refill cycle — pick the first 3 surviving frames in shuffled order. If fewer than 3
  // survive, return the survivors (in practice at least 1, unless the topic itself is avoided).
  const surviving = voice ? titles.filter((title) => !containsAvoidedWord(title, voice)) : titles;
  const ctas = (voice?.preferredCtas ?? []).filter((cta) => cta.trim().length > 0);
  return surviving.slice(0, 3).map((title, index) => ({
    title: ctas.length ? `${title}\n${ctas[index % ctas.length]}` : title,
    hashtags: tagsFor(topic, input.platform, rnd),
  }));
}

/**
 * Non-Instagram caption formats (3.6): YouTube descriptions, LinkedIn posts and
 * X posts. The Instagram path above is untouched so its batches stay identical.
 * The profile avoid list filters frames the same way (first surviving frames,
 * no refill cycle), and profile CTAs rotate onto YouTube/LinkedIn items. X
 * items never get a CTA line appended: a post has a hard length budget, and a
 * CTA the user wants there belongs in the post text itself.
 */
function generateFormattedCaptions(input: CaptionInput, format: Exclude<CaptionFormat, "instagram">): GeneratedItem[] {
  const rawTopic = trimInput(input.topic, "your topic");
  // X budget: cap the filled-in topic so frame + topic + 2 hashtags can never
  // pass 280 characters (itemCopyText joins title and hashtags with a newline).
  const topic = format === "x" && rawTopic.length > 110 ? `${rawTopic.slice(0, 107).trimEnd()}…` : rawTopic;
  const voice = input.profile?.voice;
  const rnd = mulberry32(
    hashSeed(JSON.stringify(["captions", format, rawTopic, input.platform, input.tone])),
  );
  const bank = format === "youtube" ? YOUTUBE_DESCRIPTION_FRAMES : format === "linkedin" ? LINKEDIN_FRAMES : X_FRAMES;
  const frames = shuffled(bank, rnd);
  const titles = frames.map((frame) => fill(frame, { Topic: lead(topic), topic }));
  const surviving = voice ? titles.filter((title) => !containsAvoidedWord(title, voice)) : titles;
  const ctas = (voice?.preferredCtas ?? []).filter((cta) => cta.trim().length > 0);
  const wanted = format === "youtube" ? Math.min(3, surviving.length) : 3;
  return surviving.slice(0, wanted).map((title, index) => {
    const hashtags = tagsForCaptionFormat(rawTopic, format, input.platform, rnd);
    let text = format !== "x" && ctas.length ? `${title}\n${ctas[index % ctas.length]}` : title;
    if (format === "x") {
      // Last-resort length guard (a very long hashtag set should never push a
      // post over): drop hashtags, never the user's post text, until it fits.
      const kept = [...hashtags];
      while (kept.length && `${text}\n${kept.join(" ")}`.length > 280) kept.pop();
      if (`${text}\n${kept.join(" ")}`.length > 280 && kept.length === 0) text = text.slice(0, 280);
      return { title: text, hashtags: kept };
    }
    return { title: text, hashtags };
  });
}

/** Pattern-library sizes, exported for tests and the report. */
export const LIBRARY_COUNTS = {
  ideaFormatsPerPlatform: Object.fromEntries(Object.entries(IDEA_FORMATS).map(([k, v]) => [k, v.length])),
  ideaAngles: IDEA_ANGLES.length,
  categoryFormatsPerCategory: Object.fromEntries(
    Object.entries(CATEGORY_FORMATS).map(([k, v]) => [k, v.length]),
  ),
  categoryFormats: Object.values(CATEGORY_FORMATS).reduce((total, frames) => total + frames.length, 0),
  hookFramesPerStyle: Object.fromEntries(Object.entries(HOOK_FRAMES).map(([k, v]) => [k, v.length])),
  hookMechanisms: Object.keys(HOOK_MECHANISMS).length,
  captionFramesPerTone: Object.fromEntries(Object.entries(CAPTION_FRAMES).map(([k, v]) => [k, v.length])),
  youtubeDescriptionFrames: YOUTUBE_DESCRIPTION_FRAMES.length,
  linkedinFrames: LINKEDIN_FRAMES.length,
  xFrames: X_FRAMES.length,
  platformTagBanks: Object.fromEntries(Object.entries(PLATFORM_TAGS).map(([k, v]) => [k, v.length])),
  topicClusters: CLUSTERS.length,
  clusterTags: CLUSTERS[0]!.tags.length,
} as const;
