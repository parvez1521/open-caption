import { getMotionTemplate } from "@capseasy/motion";
import { OverlayItemSchema, type OverlayItem, type OverlayShape, type OverlaySocialVariant } from "@capseasy/shared";
import { getLook } from "@capseasy/templates";
import { makeImageOverlay, makeShapeOverlay, makeSocialOverlay } from "./panels/overlayItems";
import { TITLE_STYLES, makeTitleOverlay } from "./titleStyles";

/**
 * Reel Templates (2026-11-18): preset bundles for a vertical 9:16 reel, built ONLY
 * from things the composition already renders — a caption look plus timed overlays.
 * There is no second template engine: applying a template places ordinary overlays
 * at the playhead (via the same make*Overlay helpers the panels use) and hands the
 * look id to the caller, which applies it through chooseLook.
 */
export type ReelTemplateCategory = "Hook" | "Promo" | "Tutorial" | "Announcement" | "Product & UGC";

export const REEL_TEMPLATE_CATEGORIES: ReelTemplateCategory[] = ["Hook", "Promo", "Tutorial", "Announcement", "Product & UGC"];

export type ReelOverlaySpec =
  | { kind: "title"; titleId: string; atMs: number }
  | { kind: "motion"; variant: OverlaySocialVariant; atMs: number }
  | { kind: "sticker"; shape: OverlayShape; atMs: number };

export interface ReelTemplateParam {
  key: string;
  label: string;
  /** index into the template's items list of the overlay this param edits */
  target: number;
  field: "text" | "color";
}

export interface ReelTemplate {
  id: string;
  name: string;
  category: ReelTemplateCategory;
  description: string;
  lookId: string;
  items: ReelOverlaySpec[];
  params: ReelTemplateParam[];
  /** when present, the panel lets the user pick a bin image to place full-bleed first */
  background?: { label: string };
}

export interface ReelParamMapEntry {
  key: string;
  overlayId: string;
  field: "text" | "color";
}

export interface AppliedReelTemplate {
  overlays: OverlayItem[];
  lookId: string;
  paramMap: ReelParamMapEntry[];
}

export const REEL_TEMPLATES: ReelTemplate[] = [
  // Hook (10) — the first seconds: one big line, then a moving graphic.
  {
    id: "hook-stop-scroll",
    name: "Stop the Scroll",
    category: "Hook",
    description: "One loud word, then a burst that holds the eye.",
    lookId: "hormozi_box",
    items: [
      { kind: "title", titleId: "punch-stop", atMs: 0 },
      { kind: "motion", variant: "particle-burst", atMs: 500 },
      { kind: "sticker", shape: "burst", atMs: 1500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-big-question",
    name: "Big Question",
    category: "Hook",
    description: "A bold claim up top, with the question typed out below it.",
    lookId: "pop_clean",
    items: [
      { kind: "title", titleId: "big-impact", atMs: 0 },
      { kind: "title", titleId: "minimal-small", atMs: 2500 },
      { kind: "motion", variant: "kinetic-title", atMs: 3000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "question", label: "Question", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-countdown",
    name: "Countdown Hook",
    category: "Hook",
    description: "A rolling counter, then the payoff line lands.",
    lookId: "kinetic_mix",
    items: [
      { kind: "motion", variant: "counter", atMs: 0 },
      { kind: "title", titleId: "punch-now", atMs: 4000 },
      { kind: "sticker", shape: "star", atMs: 4500 },
    ],
    params: [
      { key: "count", label: "Counter text", target: 0, field: "text" },
      { key: "headline", label: "Headline", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 1, field: "color" },
    ],
  },
  // Promo (10) — sell one thing: headline, price or offer, call to action.
  {
    id: "promo-new-drop",
    name: "New Drop",
    category: "Promo",
    description: "Headline over a photo, with a price tag that swings in.",
    lookId: "metal_script",
    background: { label: "Background photo" },
    items: [
      { kind: "title", titleId: "punch-new", atMs: 0 },
      { kind: "motion", variant: "product-tag", atMs: 2500 },
      { kind: "sticker", shape: "tag", atMs: 3000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "offer", label: "Offer text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-free-offer",
    name: "Free Offer",
    category: "Promo",
    description: "A free offer in big type, then the subscribe pill.",
    lookId: "beast_bounce",
    items: [
      { kind: "title", titleId: "punch-free", atMs: 0 },
      { kind: "motion", variant: "subscribe-pill", atMs: 2500 },
      { kind: "sticker", shape: "burst", atMs: 3500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "cta", label: "Button text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-sale",
    name: "Sale Countdown",
    category: "Promo",
    description: "Bright headline, a rolling number, and the deal line.",
    lookId: "comic_burst",
    items: [
      { kind: "title", titleId: "fun-bright", atMs: 0 },
      { kind: "motion", variant: "counter", atMs: 2000 },
      { kind: "title", titleId: "lower-accent", atMs: 4500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "deal", label: "Deal line", target: 2, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  // Tutorial (10) — teach one step at a time, in order.
  {
    id: "tutorial-step-one",
    name: "Step One",
    category: "Tutorial",
    description: "The topic line, a search that types itself, and a pointer.",
    lookId: "explainer",
    items: [
      { kind: "title", titleId: "lower-topic", atMs: 0 },
      { kind: "motion", variant: "search-bar", atMs: 2500 },
      { kind: "sticker", shape: "arrow", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "search", label: "Search text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-how-to",
    name: "How To",
    category: "Tutorial",
    description: "A quiet headline, then the key point types out as a post.",
    lookId: "minimal_pro",
    items: [
      { kind: "title", titleId: "minimal-quiet", atMs: 0 },
      { kind: "motion", variant: "typing-post", atMs: 3000 },
      { kind: "sticker", shape: "check", atMs: 5000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "point", label: "Key point", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-three-steps",
    name: "Three Steps",
    category: "Tutorial",
    description: "The promise, the first step, and the chat that walks through it.",
    lookId: "desi_clean",
    items: [
      { kind: "title", titleId: "kinetic-rise", atMs: 0 },
      { kind: "title", titleId: "lower-topic", atMs: 3000 },
      { kind: "motion", variant: "chat-stack", atMs: 5000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "step", label: "Step line", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  // Announcement (10) — news: live, new video, or a collab.
  {
    id: "announce-live",
    name: "Going Live",
    category: "Announcement",
    description: "The live badge first, then the headline for the stream.",
    lookId: "soft_glow",
    items: [
      { kind: "motion", variant: "live-badge", atMs: 0 },
      { kind: "title", titleId: "punch-top", atMs: 2000 },
      { kind: "sticker", shape: "bolt", atMs: 3500 },
    ],
    params: [
      { key: "live", label: "Live label", target: 0, field: "text" },
      { key: "headline", label: "Headline", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 1, field: "color" },
    ],
  },
  {
    id: "announce-new-video",
    name: "New Video",
    category: "Announcement",
    description: "The title over a photo, with a notification that pops in.",
    lookId: "lower_third",
    background: { label: "Background photo" },
    items: [
      { kind: "title", titleId: "kinetic-top", atMs: 0 },
      { kind: "motion", variant: "notification-pop", atMs: 2500 },
      { kind: "sticker", shape: "star", atMs: 3000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "note", label: "Notification text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "announce-collab",
    name: "Collab Intro",
    category: "Announcement",
    description: "Your name, the follow card, and a heart to close it.",
    lookId: "chat_bubble",
    items: [
      { kind: "title", titleId: "lower-guest", atMs: 0 },
      { kind: "motion", variant: "follow-banner", atMs: 2500 },
      { kind: "sticker", shape: "heart", atMs: 4500 },
    ],
    params: [
      { key: "name", label: "Name", target: 0, field: "text" },
      { key: "follow", label: "Follow text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  // Hook (7 more) — different openers: bust a myth, ask, tease, warn, promise.
  {
    id: "hook-myth-bust",
    name: "Myth Bust",
    category: "Hook",
    description: "A flat no to the myth, then the glitching truth.",
    lookId: "neon_duo",
    items: [
      { kind: "title", titleId: "punch-one", atMs: 0 },
      { kind: "motion", variant: "glitch-title", atMs: 2000 },
      { kind: "sticker", shape: "cross", atMs: 3500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "truth", label: "Truth line", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-did-you-know",
    name: "Did You Know",
    category: "Hook",
    description: "A surprising fact that waves in, then the proof types out.",
    lookId: "serif_behind",
    items: [
      { kind: "title", titleId: "kinetic-wave", atMs: 0 },
      { kind: "motion", variant: "typing-post", atMs: 2500 },
      { kind: "sticker", shape: "pin", atMs: 4500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "fact", label: "Fact text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-unpopular-opinion",
    name: "Unpopular Opinion",
    category: "Hook",
    description: "A quiet take, then the comment that argues back.",
    lookId: "film_noir",
    items: [
      { kind: "title", titleId: "minimal-serif", atMs: 0 },
      { kind: "motion", variant: "comment-popup", atMs: 2500 },
      { kind: "sticker", shape: "speech-bubble", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "comment", label: "Comment text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-before-after",
    name: "Before and After",
    category: "Hook",
    description: "The change promised up front, counted down, then shown.",
    lookId: "gradient_pop",
    items: [
      { kind: "title", titleId: "kinetic-slide", atMs: 0 },
      { kind: "motion", variant: "countdown-pop", atMs: 3000 },
      { kind: "sticker", shape: "double-arrow", atMs: 4500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "countdown", label: "Countdown text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-secret-tip",
    name: "Secret Tip",
    category: "Hook",
    description: "A playful promise, then the search that finds the tip.",
    lookId: "scribble",
    items: [
      { kind: "title", titleId: "fun-wiggle", atMs: 0 },
      { kind: "motion", variant: "search-bar", atMs: 2500 },
      { kind: "sticker", shape: "star", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "search", label: "Search text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-watch-till-end",
    name: "Watch Till the End",
    category: "Hook",
    description: "One big wow, with a progress bar that pulls viewers along.",
    lookId: "outline_fill",
    items: [
      { kind: "title", titleId: "punch-wow", atMs: 0 },
      { kind: "motion", variant: "progress-fill", atMs: 2000 },
      { kind: "sticker", shape: "bolt", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "hook-hot-take",
    name: "Hot Take",
    category: "Hook",
    description: "A flipped-in take, then the chat that reacts to it.",
    lookId: "retro_vhs",
    items: [
      { kind: "title", titleId: "kinetic-flip", atMs: 0 },
      { kind: "motion", variant: "chat-stack", atMs: 2500 },
      { kind: "sticker", shape: "flame", atMs: 4500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "chat", label: "Chat text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  // Promo (7 more) — launch, deadline, code, bundle, proof, early bird, flash sale.
  {
    id: "promo-launch-day",
    name: "Launch Day",
    category: "Promo",
    description: "The name zooms in, then the brand mark reveals itself.",
    lookId: "apex_kinetic",
    items: [
      { kind: "title", titleId: "kinetic-zoom", atMs: 0 },
      { kind: "motion", variant: "logo-reveal", atMs: 2500 },
      { kind: "sticker", shape: "burst", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "brand", label: "Brand text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-limited-time",
    name: "Limited Time",
    category: "Promo",
    description: "The deadline is the headline, with the countdown under it.",
    lookId: "bold_pill",
    items: [
      { kind: "title", titleId: "punch-now", atMs: 0 },
      { kind: "motion", variant: "countdown-pop", atMs: 2000 },
      { kind: "sticker", shape: "badge", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "countdown", label: "Countdown text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-discount-code",
    name: "Discount Code",
    category: "Promo",
    description: "Bright headline, then a scannable frame with the code.",
    lookId: "highlighter_card",
    items: [
      { kind: "title", titleId: "fun-bright", atMs: 0 },
      { kind: "motion", variant: "qr-frame", atMs: 2500 },
      { kind: "sticker", shape: "tag", atMs: 4500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "code", label: "Code label", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-bundle-deal",
    name: "Bundle Deal",
    category: "Promo",
    description: "One calm line for the bundle, then the price tag.",
    lookId: "storytime",
    items: [
      { kind: "title", titleId: "minimal-line", atMs: 0 },
      { kind: "motion", variant: "product-tag", atMs: 2500 },
      { kind: "sticker", shape: "plus", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "offer", label: "Offer text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-testimonial",
    name: "Testimonial",
    category: "Promo",
    description: "A customer quote low on frame, then their comment pops in.",
    lookId: "read_along",
    items: [
      { kind: "title", titleId: "lower-quote", atMs: 0 },
      { kind: "motion", variant: "comment-popup", atMs: 3000 },
      { kind: "sticker", shape: "heart", atMs: 4500 },
    ],
    params: [
      { key: "quote", label: "Quote", target: 0, field: "text" },
      { key: "comment", label: "Comment text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-early-bird",
    name: "Early Bird",
    category: "Promo",
    description: "A quiet invite for early buyers, then the notification.",
    lookId: "amber_sweep_box",
    items: [
      { kind: "title", titleId: "elegant-top", atMs: 0 },
      { kind: "motion", variant: "notification-pop", atMs: 2500 },
      { kind: "sticker", shape: "pin", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "note", label: "Notification text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "promo-flash-sale",
    name: "Flash Sale",
    category: "Promo",
    description: "Go, then the number rolls while the sale is on.",
    lookId: "glitch_reveal",
    items: [
      { kind: "title", titleId: "punch-go", atMs: 0 },
      { kind: "motion", variant: "counter", atMs: 2000 },
      { kind: "sticker", shape: "explosion", atMs: 3500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "count", label: "Counter text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  // Tutorial (7 more) — fix a mistake, quick tip, setup, guide, workflow, pitfalls, cheat sheet.
  {
    id: "tutorial-mistake-fix",
    name: "Mistake Fix",
    category: "Tutorial",
    description: "The error in mono type, then the callout that fixes it.",
    lookId: "terminal",
    items: [
      { kind: "title", titleId: "minimal-mono", atMs: 0 },
      { kind: "motion", variant: "callout", atMs: 2500 },
      { kind: "sticker", shape: "cross", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "fix", label: "Fix text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-quick-tip",
    name: "Quick Tip",
    category: "Tutorial",
    description: "One mono tip, then the typing dots that deliver the detail.",
    lookId: "karaoke_pill",
    items: [
      { kind: "title", titleId: "fun-mono", atMs: 0 },
      { kind: "motion", variant: "chat-ticks", atMs: 2500 },
      { kind: "sticker", shape: "check", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "tip", label: "Tip text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-tool-setup",
    name: "Tool Setup",
    category: "Tutorial",
    description: "The setup title up top, then the cursor shows where to click.",
    lookId: "gaming_hud",
    items: [
      { kind: "title", titleId: "minimal-top", atMs: 0 },
      { kind: "motion", variant: "cursor-click", atMs: 2500 },
      { kind: "sticker", shape: "arrow", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-beginner-guide",
    name: "Beginner Guide",
    category: "Tutorial",
    description: "A serif welcome, then the first lesson as a post card.",
    lookId: "luxe_serif",
    items: [
      { kind: "title", titleId: "elegant-serif", atMs: 0 },
      { kind: "motion", variant: "post-card", atMs: 3000 },
      { kind: "sticker", shape: "ribbon", atMs: 4500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "lesson", label: "Lesson text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-pro-workflow",
    name: "Pro Workflow",
    category: "Tutorial",
    description: "The workflow name up top, then the cursor traces the steps.",
    lookId: "motivational",
    items: [
      { kind: "title", titleId: "kinetic-top", atMs: 0 },
      { kind: "motion", variant: "cursor-follow", atMs: 2500 },
      { kind: "sticker", shape: "chevron", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-common-mistakes",
    name: "Common Mistakes",
    category: "Tutorial",
    description: "Look up top, then the poll that asks which mistake you make.",
    lookId: "neon_sign",
    items: [
      { kind: "title", titleId: "punch-top", atMs: 0 },
      { kind: "motion", variant: "form-card", atMs: 2500 },
      { kind: "sticker", shape: "cross", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "question", label: "Poll question", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "tutorial-cheat-sheet",
    name: "Cheat Sheet",
    category: "Tutorial",
    description: "A small title, then the shortcut typed out as a message.",
    lookId: "typed_caret",
    items: [
      { kind: "title", titleId: "minimal-small", atMs: 0 },
      { kind: "motion", variant: "dm-typing", atMs: 2500 },
      { kind: "sticker", shape: "underline-bar", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "shortcut", label: "Shortcut text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  // Announcement (7 more) — milestone, event, giveaway, series, schedule, merch, thanks.
  {
    id: "announce-milestone",
    name: "Milestone",
    category: "Announcement",
    description: "A golden thank-you line, then the number that got you here.",
    lookId: "vintage_cinematic",
    items: [
      { kind: "title", titleId: "elegant-cream", atMs: 0 },
      { kind: "motion", variant: "counter", atMs: 2000 },
      { kind: "sticker", shape: "crown", atMs: 3500 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "count", label: "Counter text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "announce-event",
    name: "Event Date",
    category: "Announcement",
    description: "The event name in serif, then the countdown to the day.",
    lookId: "ice_duo",
    items: [
      { kind: "title", titleId: "elegant-title", atMs: 0 },
      { kind: "motion", variant: "countdown-pop", atMs: 2500 },
      { kind: "sticker", shape: "pin", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "countdown", label: "Countdown text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "announce-giveaway",
    name: "Giveaway",
    category: "Announcement",
    description: "A fun promise, then the gift that pops open.",
    lookId: "slice_signal",
    items: [
      { kind: "title", titleId: "fun-pop", atMs: 0 },
      { kind: "motion", variant: "gift-pop", atMs: 2500 },
      { kind: "sticker", shape: "star", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "prize", label: "Prize text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "announce-new-series",
    name: "New Series",
    category: "Announcement",
    description: "A centred promise, then the next episode to watch.",
    lookId: "serif_accent_glow",
    items: [
      { kind: "title", titleId: "minimal-centre", atMs: 0 },
      { kind: "motion", variant: "watch-next", atMs: 2500 },
      { kind: "sticker", shape: "triangle", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "next", label: "Next episode", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "announce-schedule-change",
    name: "Schedule Change",
    category: "Announcement",
    description: "The update low on frame, then the message that explains it.",
    lookId: "netflix_sub",
    items: [
      { kind: "title", titleId: "lower-credit", atMs: 0 },
      { kind: "motion", variant: "dm-popup", atMs: 2500 },
      { kind: "sticker", shape: "corner-brackets", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "message", label: "Message text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "announce-merch-drop",
    name: "Merch Drop",
    category: "Announcement",
    description: "A bright splash of a name, then the share card.",
    lookId: "retro_3d",
    items: [
      { kind: "title", titleId: "fun-splash", atMs: 0 },
      { kind: "motion", variant: "share-pop", atMs: 2500 },
      { kind: "sticker", shape: "tag", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "announce-thank-you",
    name: "Thank You",
    category: "Announcement",
    description: "A quiet thank-you, then the heart that bursts for them.",
    lookId: "scribble_ring",
    items: [
      { kind: "title", titleId: "elegant-quote", atMs: 0 },
      { kind: "motion", variant: "heart-pop", atMs: 2500 },
      { kind: "sticker", shape: "heart", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  // Product & UGC (10) — unboxings, reviews, hauls, try-ons, reactions, Q&A.
  {
    id: "ugc-unboxing",
    name: "Unboxing",
    category: "Product & UGC",
    description: "The box opens with a bounce, then the brand mark lands.",
    lookId: "emerald_karaoke_pro",
    items: [
      { kind: "title", titleId: "fun-bounce", atMs: 0 },
      { kind: "motion", variant: "logo-mark", atMs: 2500 },
      { kind: "sticker", shape: "rectangle", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "brand", label: "Brand text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-first-impressions",
    name: "First Impressions",
    category: "Product & UGC",
    description: "A soft first line, then the upvote card with the verdict.",
    lookId: "wave_bounce",
    items: [
      { kind: "title", titleId: "minimal-soft", atMs: 0 },
      { kind: "motion", variant: "upvote-card", atMs: 2500 },
      { kind: "sticker", shape: "thumbs-up", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "verdict", label: "Verdict text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-before-after",
    name: "Before and After",
    category: "Product & UGC",
    description: "The result drops in, then the bar fills to show the change.",
    lookId: "staggered_splash",
    items: [
      { kind: "title", titleId: "kinetic-drop", atMs: 0 },
      { kind: "motion", variant: "progress-fill", atMs: 2500 },
      { kind: "sticker", shape: "double-arrow", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-honest-review",
    name: "Honest Review",
    category: "Product & UGC",
    description: "Your name low on frame, then the like count that says it all.",
    lookId: "glow_stack_classic",
    items: [
      { kind: "title", titleId: "lower-role", atMs: 0 },
      { kind: "motion", variant: "like-pop", atMs: 2500 },
      { kind: "sticker", shape: "star", atMs: 4000 },
    ],
    params: [
      { key: "name", label: "Name", target: 0, field: "text" },
      { key: "rating", label: "Rating text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-day-in-life",
    name: "Day in the Life",
    category: "Product & UGC",
    description: "A scripted hello, then your story ring spins in.",
    lookId: "serif_pop_classic",
    items: [
      { kind: "title", titleId: "elegant-script", atMs: 0 },
      { kind: "motion", variant: "story-ring", atMs: 2500 },
      { kind: "sticker", shape: "sun", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "name", label: "Name", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-haul",
    name: "Haul",
    category: "Product & UGC",
    description: "Party time up top, then the save card for the list.",
    lookId: "cartoon_stack_classic",
    items: [
      { kind: "title", titleId: "fun-top", atMs: 0 },
      { kind: "motion", variant: "save-pop", atMs: 2500 },
      { kind: "sticker", shape: "ribbon", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-try-on",
    name: "Try On",
    category: "Product & UGC",
    description: "A cheerful hello, then your profile card with the fit.",
    lookId: "karaoke_fill",
    items: [
      { kind: "title", titleId: "fun-cheer", atMs: 0 },
      { kind: "motion", variant: "profile-card", atMs: 2500 },
      { kind: "sticker", shape: "heart", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "profile", label: "Profile text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-duet-reaction",
    name: "Duet Reaction",
    category: "Product & UGC",
    description: "The moment zooms in, then the repost card with your take.",
    lookId: "typo_punch_slide",
    items: [
      { kind: "title", titleId: "kinetic-zoom", atMs: 0 },
      { kind: "motion", variant: "repost-card", atMs: 2500 },
      { kind: "sticker", shape: "burst", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "take", label: "Reaction text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-favourite-finds",
    name: "Favourite Finds",
    category: "Product & UGC",
    description: "Your name in serif, then the save card for the picks.",
    lookId: "gold_word_lift",
    items: [
      { kind: "title", titleId: "elegant-name", atMs: 0 },
      { kind: "motion", variant: "save-pop", atMs: 2500 },
      { kind: "sticker", shape: "heart", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
  {
    id: "ugc-q-and-a",
    name: "Q and A",
    category: "Product & UGC",
    description: "The topic up top, then the question typed out live.",
    lookId: "mint_caps_pop",
    items: [
      { kind: "title", titleId: "minimal-top", atMs: 0 },
      { kind: "motion", variant: "dm-typing", atMs: 2500 },
      { kind: "sticker", shape: "speech-bubble", atMs: 4000 },
    ],
    params: [
      { key: "headline", label: "Headline", target: 0, field: "text" },
      { key: "question", label: "Question text", target: 1, field: "text" },
      { key: "accent", label: "Accent colour", target: 0, field: "color" },
    ],
  },
];

/** Clamp an item's window to the video length, exactly like the panels do. */
function clampEnd(startMs: number, endMs: number, durationMs: number): number {
  let end = endMs;
  if (durationMs > startMs + 400) end = Math.min(end, durationMs);
  if (end <= startMs) end = startMs + 400;
  return end;
}

/**
 * Clamp a finished window to the video length. The underlying makers only clamp
 * when the video extends past startMs + 400, so an item placed at or past the end
 * of a short video would otherwise run past durationMs — and a bare startMs + 400
 * fallback would overshoot it too. Instead the window slides back so its last
 * 400 ms still shows.
 */
function clampWindow(startMs: number, endMs: number, durationMs: number): { startMs: number; endMs: number } {
  let end = Math.min(endMs, durationMs);
  let start = startMs;
  if (end <= start) {
    start = Math.max(0, durationMs - 400);
    end = durationMs;
  }
  return { startMs: start, endMs: end };
}

/**
 * Build a template's overlays at the playhead: each item starts at playheadMs +
 * its atMs offset, runs for its preset's own duration, and is clamped to the video
 * length. Every overlay is validated against OverlayItemSchema before it is returned.
 */
export function applyReelTemplate(template: ReelTemplate, playheadMs: number, durationMs: number): AppliedReelTemplate {
  const overlays: OverlayItem[] = template.items.map((spec) => {
    const start = Math.max(0, Math.round(playheadMs) + spec.atMs);
    let item: OverlayItem;
    if (spec.kind === "title") {
      const style = TITLE_STYLES.find((s) => s.id === spec.titleId);
      if (!style) throw new Error(`[reelTemplates] unknown title style "${spec.titleId}" in template "${template.id}"`);
      item = makeTitleOverlay(style, start, durationMs);
    } else if (spec.kind === "motion") {
      const meta = getMotionTemplate(spec.variant);
      if (!meta) throw new Error(`[reelTemplates] unknown motion template "${spec.variant}" in template "${template.id}"`);
      const base = makeSocialOverlay(spec.variant, start, durationMs);
      item = { ...base, endMs: clampEnd(base.startMs, base.startMs + meta.defaultDurationMs, durationMs) };
    } else {
      item = makeShapeOverlay(spec.shape, start, durationMs);
    }
    // Clamp the finished window to the video length (see clampWindow).
    const window = clampWindow(item.startMs, item.endMs, durationMs);
    item = { ...item, ...window };
    return OverlayItemSchema.parse(item);
  });
  for (const param of template.params) {
    if (param.target < 0 || param.target >= overlays.length) {
      throw new Error(`[reelTemplates] param "${param.key}" targets item ${param.target} in template "${template.id}" (${overlays.length} items)`);
    }
  }
  if (!getLook(template.lookId)) {
    throw new Error(`[reelTemplates] unknown look "${template.lookId}" in template "${template.id}"`);
  }
  return {
    overlays,
    lookId: template.lookId,
    paramMap: template.params.map((p) => ({ key: p.key, overlayId: overlays[p.target].id, field: p.field })),
  };
}

/** The span a template covers, in ms from its start — used for the background image. */
export function reelTemplateSpanMs(template: ReelTemplate, playheadMs: number, durationMs: number): number {
  const applied = applyReelTemplate(template, playheadMs, durationMs);
  if (!applied.overlays.length) return 0;
  return Math.max(...applied.overlays.map((o) => o.endMs)) - Math.max(0, Math.round(playheadMs));
}

/**
 * Build the full-bleed background image overlay for a template: first in paint
 * order, at the template start, for the template's span, scaled to cover the canvas.
 */
export function makeReelBackgroundOverlay(
  asset: { id: string; name: string },
  template: ReelTemplate,
  playheadMs: number,
  durationMs: number,
): OverlayItem {
  const span = reelTemplateSpanMs(template, playheadMs, durationMs);
  const base = makeImageOverlay(asset, playheadMs, durationMs);
  const window = clampWindow(base.startMs, base.startMs + span, durationMs);
  const item: OverlayItem = { ...base, scale: 4, ...window };
  return OverlayItemSchema.parse(item);
}

/**
 * Patch one editable param on the overlays it was applied to. Pure: returns a new
 * array, leaves every other overlay (and every other field) untouched. Unknown keys
 * leave the overlays unchanged.
 */
export function updateReelParam(
  overlays: OverlayItem[],
  paramMap: ReelParamMapEntry[],
  key: string,
  value: string,
): OverlayItem[] {
  const entry = paramMap.find((p) => p.key === key);
  if (!entry) return overlays;
  return overlays.map((o) => {
    if (o.id !== entry.overlayId) return o;
    return entry.field === "text" ? { ...o, text: value } : { ...o, color: value };
  });
}
