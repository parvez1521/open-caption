import { z } from "zod";
import { OverlaySocialVariantSchema, type OverlaySocialVariant } from "@capseasy/shared";

/**
 * Motion Studio template registry: one typed entry for EVERY social overlay variant.
 * defaultText / defaultColor are drawn from SOCIAL_META in @capseasy/compositions
 * (social.tsx) — the registry.test mirror-check imports SOCIAL_META directly and
 * fails if these copies drift. This package deliberately depends only on
 * @capseasy/shared at runtime so it stays light for picker / search UI.
 */

export const MOTION_CATEGORIES = [
  "instagram", "tiktok", "youtube", "facebook", "threads", "x", "messages",
  "discord", "reddit", "streaming", "logo", "lower-thirds", "search",
  "qr-cta", "text", "effects", "product", "forms", "audio",
] as const;
export type MotionCategory = (typeof MOTION_CATEGORIES)[number];
export const MotionCategorySchema = z.enum(MOTION_CATEGORIES);

export type MotionFieldKind = "text" | "color" | "image";
export interface MotionField {
  key: "text" | "color" | "image";
  kind: MotionFieldKind;
  label: string;
  /** text fields only: how many "\n"-separated lines the variant consumes */
  maxLines?: number;
  defaultValue: string;
}

export interface MotionTemplate {
  id: OverlaySocialVariant;
  /** alias kept explicit: the registry id IS the overlay variant id */
  variant: OverlaySocialVariant;
  title: string;
  category: MotionCategory;
  description: string;
  fields: MotionField[];
  defaultText: string;
  defaultColor: string;
  defaultDurationMs: number;
  tags: string[];
  featured: boolean;
}

type EntrySpec = {
  variant: OverlaySocialVariant; title: string; category: MotionCategory; description: string;
  defaultText: string; defaultColor: string; maxLines: number; image?: boolean;
  duration?: number; tags: string[]; featured?: boolean;
};

function entry(s: EntrySpec): MotionTemplate {
  const fields: MotionField[] = [
    { key: "text", kind: "text", label: "Text lines", maxLines: s.maxLines, defaultValue: s.defaultText },
    { key: "color", kind: "color", label: "Accent colour", defaultValue: s.defaultColor },
  ];
  if (s.image) fields.push({ key: "image", kind: "image", label: s.variant === "qr-frame" ? "QR image" : "Avatar image", defaultValue: "" });
  return {
    id: s.variant, variant: s.variant, title: s.title, category: s.category, description: s.description,
    fields, defaultText: s.defaultText, defaultColor: s.defaultColor,
    defaultDurationMs: s.duration ?? 4000, tags: s.tags, featured: s.featured ?? false,
  };
}

export const MOTION_TEMPLATES: MotionTemplate[] = [
  entry({ variant: "subscribe-pill", title: "Subscribe Pill", category: "youtube", description: "Pill that flips to its second label when the pointer taps it.", defaultText: "Subscribe\nSubscribed", defaultColor: "#FF4D2E", maxLines: 2, tags: ["subscribe", "button", "tap"], featured: true }),
  entry({ variant: "subscribe-banner", title: "Subscribe + Bell", category: "youtube", description: "Channel card with avatar, pill tap and a ringing bell.", defaultText: "Your Channel\nNew videos every week\nSubscribe\nSubscribed", defaultColor: "#FF4D2E", maxLines: 4, image: true, tags: ["subscribe", "bell", "channel"] }),
  entry({ variant: "follow-banner", title: "Follow Banner", category: "instagram", description: "Slide-in follow card that flips to Following on the tap.", defaultText: "Creator Name\n@handle\nFollow\nFollowing", defaultColor: "#34D399", maxLines: 4, image: true, tags: ["follow", "banner"] }),
  entry({ variant: "comment-popup", title: "Comment Popup", category: "instagram", description: "Viewer comment card that pops in and fills its heart.", defaultText: "@viewer\nThis is exactly what I needed, thank you!", defaultColor: "#FF4D6D", maxLines: 2, tags: ["comment", "heart"] }),
  entry({ variant: "like-pop", title: "Like / Heart Pop", category: "instagram", description: "Thumb pops in, gets tapped, fills and ticks the count up by one.", defaultText: "128", defaultColor: "#FFA946", maxLines: 1, tags: ["like", "count"] }),
  entry({ variant: "heart-pop", title: "Heart Burst", category: "tiktok", description: "Double-tap heart burst with seeded floating hearts.", defaultText: "", defaultColor: "#FF4D6D", maxLines: 1, tags: ["heart", "burst"] }),
  entry({ variant: "counter", title: "Counter / Odometer", category: "instagram", description: "Digits roll up in per-digit odometer columns.", defaultText: "0\n50000\nfollowers", defaultColor: "#FFA946", maxLines: 3, tags: ["counter", "followers", "numbers"], featured: true }),
  entry({ variant: "chat-stack", title: "Chat Stack", category: "messages", description: "Chat bubbles stack in one by one with typing dots.", defaultText: "Hey, how are you?\nGreat — just posted a new video!\nWatching it now", defaultColor: "#34D399", maxLines: 4, tags: ["chat", "messages", "bubbles"] }),
  entry({ variant: "orbit-badge", title: "Orbit Badge", category: "effects", description: "Spinning circular text badge.", defaultText: "NEW EPISODE • PART 2 • ", defaultColor: "#FFA946", maxLines: 1, tags: ["badge", "circular", "spin"] }),
  entry({ variant: "search-bar", title: "Search Bar", category: "search", description: "Search field that types its query, then drops in a result row.", defaultText: "how to edit videos\nHow to Edit Videos — full guide", defaultColor: "#FFA946", maxLines: 2, tags: ["search", "typing"], featured: true }),
  entry({ variant: "profile-card", title: "Profile Card", category: "instagram", description: "Avatar card with animated ring, follower row and a flipping Follow button.", defaultText: "Creator Name\n@handle\n12.4K followers\nFollow\nFollowing", defaultColor: "#34D399", maxLines: 5, image: true, tags: ["profile", "follow", "avatar"], featured: true }),
  entry({ variant: "notification-pop", title: "Notification Pop", category: "youtube", description: "Bell notification card that pops in with a title and name line.", defaultText: "New follower\nAlex just followed you", defaultColor: "#FFA946", maxLines: 2, tags: ["notification", "bell", "follower"] }),
  entry({ variant: "dm-popup", title: "DM Request", category: "messages", description: "Message-request card with Accept and Decline pills.", defaultText: "Alex\nHey! Love your latest video — collab?", defaultColor: "#38BDF8", maxLines: 2, image: true, tags: ["dm", "message", "request"], featured: true }),
  entry({ variant: "story-ring", title: "Story Ring", category: "instagram", description: "Large avatar with a rotating dashed story ring and name.", defaultText: "Creator Name", defaultColor: "#FF4D6D", maxLines: 1, image: true, tags: ["story", "avatar", "ring"] }),
  entry({ variant: "lower-third", title: "Lower Third", category: "lower-thirds", description: "Name and role lower third that slides in behind a left bar.", defaultText: "Creator Name\nVideo Editor", defaultColor: "#FF4D2E", maxLines: 2, tags: ["lower-third", "name", "title"], featured: true }),
  entry({ variant: "logo-reveal", title: "Logo Reveal", category: "logo", description: "Circle sweep revealing a short brand text, text only.", defaultText: "YOUR BRAND", defaultColor: "#FFA946", maxLines: 1, tags: ["logo", "reveal", "brand"], featured: true }),
  entry({ variant: "qr-frame", title: "QR Frame", category: "qr-cta", description: "Animated corner brackets around your own QR image with a label.", defaultText: "Scan to follow", defaultColor: "#34D399", maxLines: 1, image: true, tags: ["qr", "cta", "scan"], featured: true }),
  entry({ variant: "kinetic-title", title: "Kinetic Title", category: "text", description: "Big words appear word by word with a pop.", defaultText: "MAKE\nSOMETHING\nGREAT", defaultColor: "#FFFFEB", maxLines: 4, tags: ["title", "kinetic", "words"], featured: true, duration: 3500 }),
  entry({ variant: "glitch-title", title: "Glitch Title", category: "effects", description: "Title with colour-split glitch slices on a beat.", defaultText: "LEVEL UP", defaultColor: "#FFFFEB", maxLines: 1, tags: ["glitch", "title", "rgb"], duration: 3500 }),
  entry({ variant: "neon-sign", title: "Neon Sign", category: "effects", description: "Glowing sign letters with a seeded flicker.", defaultText: "OPEN", defaultColor: "#38BDF8", maxLines: 1, tags: ["neon", "glow", "sign"], duration: 5000 }),
  entry({ variant: "particle-burst", title: "Particle Burst", category: "effects", description: "Seeded dots burst from the centre behind a short text line.", defaultText: "NEW!", defaultColor: "#FFA946", maxLines: 1, tags: ["particles", "burst"], duration: 3000 }),
  entry({ variant: "typing-post", title: "Typing Post", category: "threads", description: "Post card whose body text types in character by character.", defaultText: "Creator Name\n@handle\nJust shipped a new tutorial — link in bio!", defaultColor: "#38BDF8", maxLines: 3, image: true, tags: ["post", "typing", "social"] }),
  entry({ variant: "upvote-card", title: "Upvote Card", category: "reddit", description: "Post card whose upvote arrow fills and count ticks up.", defaultText: "This workflow saved me hours\n248", defaultColor: "#FF4D2E", maxLines: 2, tags: ["upvote", "post", "count"] }),
  entry({ variant: "live-badge", title: "Live Badge", category: "streaming", description: "Pulsing LIVE pill with a viewer count that climbs.", defaultText: "LIVE\n128", defaultColor: "#FF3355", maxLines: 2, tags: ["live", "stream", "viewers"], featured: true, duration: 5000 }),
  entry({ variant: "product-tag", title: "Product Tag", category: "product", description: "Price-tag card swinging in on a string pivot.", defaultText: "Creator Preset Pack\n$29", defaultColor: "#34D399", maxLines: 2, tags: ["product", "price", "tag"] }),
  entry({ variant: "form-card", title: "Poll / Form Card", category: "forms", description: "Question with option bars filling to seeded percentages.", defaultText: "What should I post next?\nTutorial\nBehind the scenes\nLive Q&A", defaultColor: "#38BDF8", maxLines: 4, tags: ["poll", "form", "question"] }),
  entry({ variant: "audio-bars", title: "Audio Bars", category: "audio", description: "Seeded equalizer bars dancing as a pure function of time.", defaultText: "", defaultColor: "#34D399", maxLines: 1, tags: ["audio", "equalizer", "music"], duration: 5000 }),
  entry({ variant: "post-card", title: "Post Card", category: "facebook", description: "Post card with avatar and body text whose Like fills on the beat.", defaultText: "Creator Name\n2 hrs ago\nJust shared a new tutorial — hope it helps!", defaultColor: "#5B8DEF", maxLines: 3, image: true, tags: ["post", "like", "share"] }),
  entry({ variant: "repost-card", title: "Repost Card", category: "x", description: "Compact post card whose repost count ticks up by one with a colour flip.", defaultText: "Creator Name\n@handle\nJust shipped a new tutorial — link in bio!\n248", defaultColor: "#34D399", maxLines: 4, image: true, tags: ["post", "repost", "count"] }),
  entry({ variant: "voice-card", title: "Voice Card", category: "discord", description: "Voice-channel card whose members' speaking rings pulse in a seeded rotation.", defaultText: "voice-lounge\nAlex\nPriya\nSam", defaultColor: "#6C7CFF", maxLines: 4, tags: ["voice", "channel", "speaking"] }),
  entry({ variant: "cursor-click", title: "Cursor Click Button", category: "effects", description: "The pointer travels across the frame, clicks the button with a ripple, and the label flips.", defaultText: "Get started\nDone — welcome in", defaultColor: "#FFA946", maxLines: 2, tags: ["cursor", "click", "button", "pointer"], featured: true, duration: 4500 }),
  entry({ variant: "cursor-follow", title: "Cursor Follow", category: "instagram", description: "Profile row where the pointer travels in and clicks Follow for you.", defaultText: "Creator Name\n@handle\nFollow\nFollowing", defaultColor: "#34D399", maxLines: 4, image: true, tags: ["cursor", "follow", "click"], featured: true, duration: 4500 }),
  entry({ variant: "cursor-subscribe", title: "Cursor Subscribe", category: "youtube", description: "Subscribe pill clicked by a pointer that travels across the frame.", defaultText: "Subscribe\nSubscribed", defaultColor: "#FF4D2E", maxLines: 2, tags: ["cursor", "subscribe", "click"], featured: true, duration: 4500 }),
  entry({ variant: "cursor-like", title: "Cursor Like", category: "instagram", description: "The pointer travels in, clicks the heart, and the count ticks up.", defaultText: "128", defaultColor: "#FF4D6D", maxLines: 1, tags: ["cursor", "like", "heart", "click"], duration: 4500 }),
  entry({ variant: "share-pop", title: "Share Pop", category: "instagram", description: "Share row whose paper plane flies out while the share count ticks up.", defaultText: "Creator Name\n248", defaultColor: "#38BDF8", maxLines: 2, tags: ["share", "plane", "count"] }),
  entry({ variant: "save-pop", title: "Save Pop", category: "instagram", description: "Bookmark that pops, fills, and shows its Saved caption.", defaultText: "Saved", defaultColor: "#FFA946", maxLines: 1, tags: ["save", "bookmark"] }),
  entry({ variant: "follow-plus", title: "Follow Plus", category: "tiktok", description: "Avatar whose plus badge flips to a tick with a pulsing ring.", defaultText: "Creator Name\n@handle", defaultColor: "#FF4D6D", maxLines: 2, image: true, tags: ["follow", "plus", "avatar"] }),
  entry({ variant: "gift-pop", title: "Gift Pop", category: "tiktok", description: "Gift box whose lid pops off in a sparkle burst, with a caption.", defaultText: "Thanks for the gift!", defaultColor: "#FFA946", maxLines: 1, tags: ["gift", "box", "sparkle"] }),
  entry({ variant: "bell-reminder", title: "Bell Reminder", category: "youtube", description: "Reminder card with a big ringing bell, title and sub-line.", defaultText: "Turn on notifications\nNever miss a new video", defaultColor: "#FFA946", maxLines: 2, tags: ["bell", "reminder", "notifications"] }),
  entry({ variant: "watch-next", title: "Watch Next", category: "youtube", description: "Up-next card sliding in with a drawn thumbnail and a filling progress bar.", defaultText: "How to Edit Videos — full guide\nYour Channel", defaultColor: "#FF4D2E", maxLines: 2, tags: ["up-next", "end-screen", "thumbnail"], duration: 4500 }),
  entry({ variant: "chat-ticks", title: "Chat Read Ticks", category: "messages", description: "Outgoing bubbles whose ticks go sent, delivered, then read.", defaultText: "New video is live!\nLink is in the comments", defaultColor: "#34D399", maxLines: 2, tags: ["chat", "ticks", "read", "whatsapp"] }),
  entry({ variant: "dm-typing", title: "DM Typing", category: "messages", description: "Message card that types first, then the message pops in.", defaultText: "Alex\nThat edit is exactly what I needed!", defaultColor: "#38BDF8", maxLines: 2, image: true, tags: ["dm", "typing", "message"], duration: 4500 }),
  entry({ variant: "lower-third-bar", title: "Lower Third Bar", category: "lower-thirds", description: "Full-width bottom bar sweeping in: name left, role right.", defaultText: "Creator Name\nVideo Editor", defaultColor: "#34D399", maxLines: 2, tags: ["lower-third", "bar", "name"] }),
  entry({ variant: "logo-mark", title: "Logo Mark", category: "logo", description: "Monogram reveal: a ring draws around the brand's first letter.", defaultText: "YOUR BRAND", defaultColor: "#34D399", maxLines: 1, tags: ["logo", "monogram", "reveal"] }),
  entry({ variant: "type-title", title: "Type Title", category: "text", description: "Big title typed out, then an accent underline sweeps in.", defaultText: "WATCH THIS FIRST", defaultColor: "#FFFFEB", maxLines: 1, tags: ["title", "typing", "typewriter"] }),
  entry({ variant: "countdown-pop", title: "Countdown Pop", category: "effects", description: "3 · 2 · 1 springing in inside a shrinking ring, then your final word.", defaultText: "GO!", defaultColor: "#FF4D2E", maxLines: 1, tags: ["countdown", "numbers", "go"], featured: true }),
];

export const MOTION_TEMPLATE_IDS: OverlaySocialVariant[] = MOTION_TEMPLATES.map((t) => t.id);
const byId = new Map<string, MotionTemplate>(MOTION_TEMPLATES.map((t) => [t.id, t]));
export const getMotionTemplate = (id: string): MotionTemplate | undefined => byId.get(id);
export const listMotionTemplates = (): MotionTemplate[] => [...MOTION_TEMPLATES];

/** Category list with counts derived from the registry — never hardcoded. */
export function listMotionCategories(): { category: MotionCategory; count: number }[] {
  return MOTION_CATEGORIES
    .map((category) => ({ category, count: MOTION_TEMPLATES.filter((t) => t.category === category).length }))
    .filter((c) => c.count > 0);
}

/* ---------------- config validation ---------------- */

export const MotionConfigSchema = z.object({
  variant: OverlaySocialVariantSchema,
  text: z.string().max(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be a #rrggbb hex value"),
  durationMs: z.number().int().min(400).max(30000),
});
export type MotionConfig = z.infer<typeof MotionConfigSchema>;

export function defaultMotionConfig(variant: OverlaySocialVariant): MotionConfig {
  const t = byId.get(variant);
  if (!t) throw new Error(`Unknown motion variant: ${variant}`);
  return { variant, text: t.defaultText, color: t.defaultColor, durationMs: t.defaultDurationMs };
}
export const parseMotionConfig = (input: unknown) => MotionConfigSchema.safeParse(input);

/* ---------------- search / filter / sort (deterministic) ---------------- */

export type MotionSort = "title" | "category" | "featured" | "recent";
export interface MotionFilter { query?: string; category?: MotionCategory; featuredOnly?: boolean }

export function filterMotionTemplates(filter: MotionFilter = {}): MotionTemplate[] {
  const q = (filter.query ?? "").trim().toLowerCase();
  return MOTION_TEMPLATES.filter((t) => {
    if (filter.category && t.category !== filter.category) return false;
    if (filter.featuredOnly && !t.featured) return false;
    if (!q) return true;
    return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      || t.category.includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q))
      || t.id.includes(q);
  });
}

export function sortMotionTemplates(list: readonly MotionTemplate[], sort: MotionSort = "title"): MotionTemplate[] {
  const idx = new Map(MOTION_TEMPLATES.map((t, i) => [t.id, i]));
  const out = [...list];
  if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title) || (idx.get(a.id)! - idx.get(b.id)!));
  else if (sort === "category") out.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  else if (sort === "featured") out.sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title));
  else out.sort((a, b) => idx.get(b.id)! - idx.get(a.id)!); // recent: newest registry entries first
  return out;
}

export function searchMotionTemplates(filter: MotionFilter = {}, sort: MotionSort = "title"): MotionTemplate[] {
  return sortMotionTemplates(filterMotionTemplates(filter), sort);
}
