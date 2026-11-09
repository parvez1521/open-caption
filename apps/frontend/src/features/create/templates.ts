/**
 * The template engine: an original pattern library for the Creator Studio generators.
 *
 * This is NOT a model and is never labelled as one. It is deterministic combinatorial generation:
 * the caller's inputs (niche, topic, platform, audience, style, tone) are substituted into frames
 * written for this product, and a seeded shuffle (seeded from the inputs themselves) picks which
 * frames and angles combine, so the same inputs always produce the same batch and different inputs
 * produce different batches. Pure module: no DOM, no storage, no network. Works fully offline.
 */
import type { CaptionTone, GeneratedItem, HookStyle, Platform } from "./model";
import { platformLabel } from "./model";

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

export interface IdeasInput { niche: string; platform: Platform; audience: string; count: number }

export function generateIdeas(input: IdeasInput): GeneratedItem[] {
  const niche = trimInput(input.niche, "your niche");
  const audience = trimInput(input.audience, "beginners");
  const count = clampCount(input.count);
  const rnd = mulberry32(hashSeed(JSON.stringify(["ideas", niche, input.platform, audience])));
  const formats = shuffled(IDEA_FORMATS[input.platform], rnd);
  const angles = shuffled(IDEA_ANGLES, rnd);
  const out: GeneratedItem[] = [];
  for (let i = 0; i < count; i++) {
    const format = formats[i % formats.length]!;
    const angle = angles[(i + Math.floor(i / formats.length)) % angles.length]!;
    out.push({
      title: fill(format.title, { Niche: lead(niche), niche }),
      detail: fill(angle, { audience }),
    });
  }
  return out;
}

/* ---------------------------------- hooks ---------------------------------- */

/** Opening-line frames per style, 8 each, 40 total. {topic} and {Topic} are the caller's topic. */
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
};

export interface HooksInput { topic: string; style: HookStyle; platform: Platform; count: number }

export function generateHooks(input: HooksInput): GeneratedItem[] {
  const topic = trimInput(input.topic, "your topic");
  const count = clampCount(input.count);
  const rnd = mulberry32(hashSeed(JSON.stringify(["hooks", topic, input.style, input.platform])));
  const frames = shuffled(HOOK_FRAMES[input.style], rnd);
  const out: GeneratedItem[] = [];
  for (let i = 0; i < count; i++) {
    const frame = frames[i % frames.length]!;
    const again = i >= frames.length;
    out.push({
      title: fill(frame, { Topic: lead(topic), topic }),
      detail: again ? `Variation for ${platformLabel(input.platform)}: same line, new delivery, slower first three words.` : `Made for ${platformLabel(input.platform)}: say it in the first three seconds.`,
    });
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

function tagsFor(topic: string, platform: Platform, rnd: () => number): string[] {
  const lower = topic.toLowerCase();
  const cluster = CLUSTERS.find((c) => c.keys.some((k) => lower.includes(k)));
  const fromTopic = topic
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .map((w) => `#${w.charAt(0).toUpperCase()}${w.slice(1)}`);
  const pool = [...(cluster?.tags ?? []), ...PLATFORM_TAGS[platform], ...GENERIC_TAGS, ...fromTopic];
  const unique = [...new Set(pool)];
  return shuffled(unique, rnd).slice(0, 10);
}

export interface CaptionInput { topic: string; platform: Platform; tone: CaptionTone }

/** Three caption options per run, each with its own hashtag set. */
export function generateCaptions(input: CaptionInput): GeneratedItem[] {
  const topic = trimInput(input.topic, "your topic");
  const rnd = mulberry32(hashSeed(JSON.stringify(["captions", topic, input.platform, input.tone])));
  const frames = shuffled(CAPTION_FRAMES[input.tone], rnd);
  return frames.slice(0, 3).map((frame) => ({
    title: fill(frame, { Topic: lead(topic), topic }),
    hashtags: tagsFor(topic, input.platform, rnd),
  }));
}

/** Pattern-library sizes, exported for tests and the report. */
export const LIBRARY_COUNTS = {
  ideaFormatsPerPlatform: Object.fromEntries(Object.entries(IDEA_FORMATS).map(([k, v]) => [k, v.length])),
  ideaAngles: IDEA_ANGLES.length,
  hookFramesPerStyle: Object.fromEntries(Object.entries(HOOK_FRAMES).map(([k, v]) => [k, v.length])),
  captionFramesPerTone: Object.fromEntries(Object.entries(CAPTION_FRAMES).map(([k, v]) => [k, v.length])),
  platformTagBanks: Object.fromEntries(Object.entries(PLATFORM_TAGS).map(([k, v]) => [k, v.length])),
  topicClusters: CLUSTERS.length,
  clusterTags: CLUSTERS[0]!.tags.length,
} as const;
