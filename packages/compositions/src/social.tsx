import React from "react";
import type { OverlayItem, OverlaySocialVariant } from "@capseasy/shared";

/**
 * Animated "Social Media" overlays (2026-11-10): original drawn graphics — our own pill/card/bell/
 * heart/thumb/chat/counter/badge drawings and generic wording, NO platform logos, UI chrome or assets.
 * Every animation is a pure function of the item's own [startMs, endMs) window via overlayPhase(), so
 * the studio preview, the in-browser MP4 export and the server render draw the same frame (all of it
 * is plain divs/SVG — no assets, no blend modes — so it carries in EVERY render path, unlike image
 * overlays whose device-local bytes a server render cannot see).
 */

export const SOCIAL_META: { id: OverlaySocialVariant; label: string; hint: string; defaultText: string; defaultColor: string }[] = [
  { id: "subscribe-pill", label: "Subscribe Pill", hint: "Pill flips to its second label when the pointer taps it. Lines: label / after-tap label.", defaultText: "Subscribe\nSubscribed", defaultColor: "#FF4D2E" },
  { id: "subscribe-banner", label: "Subscribe + Bell", hint: "Card with avatar, name lines and a pill; the pointer taps the pill, then the bell rings. Lines: name / sub-line / pill label / after-tap label.", defaultText: "Your Channel\nNew videos every week\nSubscribe\nSubscribed", defaultColor: "#FF4D2E" },
  { id: "follow-banner", label: "Follow Banner", hint: "Slide-in card; the pointer taps Follow and it flips. Lines: name / handle / Follow label / Following label.", defaultText: "Creator Name\n@handle\nFollow\nFollowing", defaultColor: "#34D399" },
  { id: "comment-popup", label: "Comment Popup", hint: "A viewer comment card pops in; its heart fills on the beat. Lines: handle / comment text.", defaultText: "@viewer\nThis is exactly what I needed, thank you!", defaultColor: "#FF4D6D" },
  { id: "like-pop", label: "Like / Heart Pop", hint: "Thumb pops in, the pointer taps it, it fills and the count ticks +1. Line: starting count.", defaultText: "128", defaultColor: "#FFA946" },
  { id: "heart-pop", label: "Heart Burst", hint: "Double-tap heart burst with seeded floating hearts. Optional line: a caption under the heart.", defaultText: "", defaultColor: "#FF4D6D" },
  { id: "counter", label: "Counter / Odometer", hint: "Digits roll up in per-digit columns. Lines: from / to / label under the number.", defaultText: "0\n50000\nfollowers", defaultColor: "#FFA946" },
  { id: "chat-stack", label: "Chat Stack", hint: "Bubbles stack in one by one (one per line, max 4), with typing dots before the last.", defaultText: "Hey, how are you?\nGreat — just posted a new video!\nWatching it now", defaultColor: "#34D399" },
  { id: "orbit-badge", label: "Orbit Badge", hint: "Spinning circular text badge. Keep the line short — text longer than the circle truncates.", defaultText: "NEW EPISODE • PART 2 • ", defaultColor: "#FFA946" },
  { id: "search-bar", label: "Search Bar", hint: "A search field that types its query, then a result row drops in. Lines: query / result line (optional).", defaultText: "how to edit videos\nHow to Edit Videos — full guide", defaultColor: "#FFA946" },
  { id: "profile-card", label: "Profile Card", hint: "Avatar with animated ring, name, handle and follower row; Follow flips on the beat. Lines: name / handle / follower line / Follow label / Following label. Avatar uses the item image asset when set.", defaultText: "Creator Name\n@handle\n12.4K followers\nFollow\nFollowing", defaultColor: "#34D399" },
  { id: "notification-pop", label: "Notification Pop", hint: "Bell card that pops in. Lines: title line / name line.", defaultText: "New follower\nAlex just followed you", defaultColor: "#FFA946" },
  { id: "dm-popup", label: "DM Request", hint: "Message-request card with Accept / Decline pills; Accept lights up on the beat. Lines: name / message line. Avatar uses the item image asset when set.", defaultText: "Alex\nHey! Love your latest video — collab?", defaultColor: "#38BDF8" },
  { id: "story-ring", label: "Story Ring", hint: "Large avatar with a rotating dashed ring and name under it. Line: name. Avatar uses the item image asset when set.", defaultText: "Creator Name", defaultColor: "#FF4D6D" },
  { id: "lower-third", label: "Lower Third", hint: "Left bar plus name and role lines, slides in. Lines: name / role line.", defaultText: "Creator Name\nVideo Editor", defaultColor: "#FF4D2E" },
  { id: "logo-reveal", label: "Logo Reveal", hint: "Centred circle sweep revealing a short brand text (text only, no image). Line: brand text.", defaultText: "YOUR BRAND", defaultColor: "#FFA946" },
  { id: "qr-frame", label: "QR Frame", hint: "Animated corner brackets around your QR image (set the item image asset) plus a label line. Without an asset a neutral grid placeholder shows — it is not a scannable code. Line: label.", defaultText: "Scan to follow", defaultColor: "#34D399" },
  { id: "kinetic-title", label: "Kinetic Title", hint: "Big words appear word by word with a pop. One word per line (max 4).", defaultText: "MAKE\nSOMETHING\nGREAT", defaultColor: "#FFFFEB" },
  { id: "glitch-title", label: "Glitch Title", hint: "Title with colour-split glitch slices on a beat. Line: title text.", defaultText: "LEVEL UP", defaultColor: "#FFFFEB" },
  { id: "neon-sign", label: "Neon Sign", hint: "Glowing letters with a seeded flicker. Line: sign text.", defaultText: "OPEN", defaultColor: "#38BDF8" },
  { id: "particle-burst", label: "Particle Burst", hint: "Seeded dots burst from the centre behind a short text line. Line: text.", defaultText: "NEW!", defaultColor: "#FFA946" },
  { id: "typing-post", label: "Typing Post", hint: "Post card whose body types in. Lines: name / handle / body text. Avatar uses the item image asset when set.", defaultText: "Creator Name\n@handle\nJust shipped a new tutorial — link in bio!", defaultColor: "#38BDF8" },
  { id: "upvote-card", label: "Upvote Card", hint: "Post card; the upvote arrow fills and the count ticks up on the beat. Lines: title line / starting count.", defaultText: "This workflow saved me hours\n248", defaultColor: "#FF4D2E" },
  { id: "live-badge", label: "Live Badge", hint: "Pulsing LIVE pill with a viewer count that climbs. Lines: label / starting viewers.", defaultText: "LIVE\n128", defaultColor: "#FF3355" },
  { id: "product-tag", label: "Product Tag", hint: "Price-tag card swinging in on a string pivot. Lines: product line / price line.", defaultText: "Creator Preset Pack\n$29", defaultColor: "#34D399" },
  { id: "form-card", label: "Poll / Form Card", hint: "Question plus option rows whose bars fill to seeded percentages. Lines: question / option 1 / option 2 / option 3 (optional).", defaultText: "What should I post next?\nTutorial\nBehind the scenes\nLive Q&A", defaultColor: "#38BDF8" },
  { id: "audio-bars", label: "Audio Bars", hint: "Seeded equalizer bars dancing to the beat. Optional line: a label under the bars.", defaultText: "", defaultColor: "#34D399" },
  { id: "post-card", label: "Post Card", hint: "Post card with avatar, name and time lines and body text; the Like in its Like / Comment / Share row fills on the beat. Lines: name / time line / body text. Avatar uses the item image asset when set.", defaultText: "Creator Name\n2 hrs ago\nJust shared a new tutorial — hope it helps!", defaultColor: "#5B8DEF" },
  { id: "repost-card", label: "Repost Card", hint: "Compact post card; the repost icon flips colour and its count ticks +1 on the beat. Lines: name / handle / body text / starting repost count. Avatar uses the item image asset when set.", defaultText: "Creator Name\n@handle\nJust shipped a new tutorial — link in bio!\n248", defaultColor: "#34D399" },
  { id: "voice-card", label: "Voice Card", hint: "Voice-channel card with three member rows; speaking rings pulse around members in a seeded rotation. Lines: channel name / member 1 / member 2 / member 3.", defaultText: "voice-lounge\nAlex\nPriya\nSam", defaultColor: "#6C7CFF" },
  { id: "cursor-click", label: "Cursor Click Button", hint: "A big button; the pointer travels across the frame to it, clicks with a ripple, and the button flips to its second label. Lines: button label / after-click label.", defaultText: "Get started\nDone — welcome in", defaultColor: "#FFA946" },
  { id: "cursor-follow", label: "Cursor Follow", hint: "Profile row; the pointer travels in and clicks Follow, which flips to Following. Lines: name / handle / Follow label / Following label. Avatar uses the item image asset when set.", defaultText: "Creator Name\n@handle\nFollow\nFollowing", defaultColor: "#34D399" },
  { id: "cursor-subscribe", label: "Cursor Subscribe", hint: "Subscribe pill; the pointer travels across and clicks it, flipping it to Subscribed. Lines: label / after-click label.", defaultText: "Subscribe\nSubscribed", defaultColor: "#FF4D2E" },
  { id: "cursor-like", label: "Cursor Like", hint: "Heart with a count; the pointer travels in, clicks, the heart fills and the count ticks +1. Line: starting count.", defaultText: "128", defaultColor: "#FF4D6D" },
  { id: "share-pop", label: "Share Pop", hint: "Share row whose paper plane flies out on the beat while the share count ticks up. Lines: name / starting share count.", defaultText: "Creator Name\n248", defaultColor: "#38BDF8" },
  { id: "save-pop", label: "Save Pop", hint: "Bookmark that pops and fills on the beat, with a Saved caption sliding up under it. Line: caption under the bookmark.", defaultText: "Saved", defaultColor: "#FFA946" },
  { id: "follow-plus", label: "Follow Plus", hint: "Avatar with a plus badge; on the beat the badge flips to a tick and a ring pulses out. Lines: name / handle. Avatar uses the item image asset when set.", defaultText: "Creator Name\n@handle", defaultColor: "#FF4D6D" },
  { id: "gift-pop", label: "Gift Pop", hint: "Gift box whose lid pops off on the beat with a sparkle burst and a caption. Line: caption under the box.", defaultText: "Thanks for the gift!", defaultColor: "#FFA946" },
  { id: "bell-reminder", label: "Bell Reminder", hint: "Reminder card: a big bell that rings on the beat beside a title and sub-line. Lines: title / sub-line.", defaultText: "Turn on notifications\nNever miss a new video", defaultColor: "#FFA946" },
  { id: "watch-next", label: "Watch Next", hint: "Up-next card that slides in: drawn thumbnail with a play mark, title and channel lines, and a progress bar filling underneath. Lines: video title / channel line.", defaultText: "How to Edit Videos — full guide\nYour Channel", defaultColor: "#FF4D2E" },
  { id: "chat-ticks", label: "Chat Read Ticks", hint: "Two outgoing chat bubbles; the ticks under the last one go one → two → read (accent) as time passes. Lines: message 1 / message 2.", defaultText: "New video is live!\nLink is in the comments", defaultColor: "#34D399" },
  { id: "dm-typing", label: "DM Typing", hint: "Message card that shows typing dots first, then the message bubble pops in. Lines: name / message. Avatar uses the item image asset when set.", defaultText: "Alex\nThat edit is exactly what I needed!", defaultColor: "#38BDF8" },
  { id: "lower-third-bar", label: "Lower Third Bar", hint: "Full-width bottom bar that sweeps in: name on the left, role on the right. Lines: name / role line.", defaultText: "Creator Name\nVideo Editor", defaultColor: "#34D399" },
  { id: "logo-mark", label: "Logo Mark", hint: "Monogram reveal: a ring draws itself around the brand's first letter, then the brand line fades in under it. Line: brand text.", defaultText: "YOUR BRAND", defaultColor: "#34D399" },
  { id: "type-title", label: "Type Title", hint: "Big title typed out character by character; an accent underline sweeps in when the typing lands. Line: title text.", defaultText: "WATCH THIS FIRST", defaultColor: "#FFFFEB" },
  { id: "countdown-pop", label: "Countdown Pop", hint: "3 · 2 · 1 countdown — each number springs in inside a shrinking ring — then your final word lands. Line: final word.", defaultText: "GO!", defaultColor: "#FF4D2E" },
];

export interface OverlayPhases {
  /** 0..1 over the first ~18% (clamped 120–400 ms), eased with easeOutQuint */
  enter: number;
  /** the RAW (uneased) enter fraction — spring/pop curves consume this, not the eased value */
  enterT: number;
  /** 0..1 over the last ~15%, eased with easeInOutCubic so the fade lands softly at both ends */
  exit: number;
  /** the "act" beat (tap / flip / ring): 0 before, 0..1 through, 1 after; centred near 42% */
  act: number;
  /** true once the act beat has landed (state flipped) */
  acted: boolean;
  /** looping-free continuous progress 0..1 over the whole item */
  t: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/**
 * Smoothness pass (2026-11-11): the shared curves every social overlay's motion is built from.
 * - easeOutQuint replaces easeOutExpo for entrances: expo's initial velocity (≈6.9×) made cards
 *   snap the first frames then crawl an invisible tail; quint's bounded start (5×) with a clean
 *   settle reads as one smooth glide at both 30 and 60 fps.
 * - easeInOutCubic replaces the old LINEAR exit ramp: a linear fade visibly pops at the ramp's
 *   two corners; in-out cubic is tangent-flat at both ends, so overlays leave as softly as they came.
 * - springOut is a gentle easeOutBack (overshoot constant 1.2, peak ≈ +3.5% past 1) for pop
 *   scales: the element lands a hair past its resting size and settles — the "alive" micro-bounce
 *   the flat easeOutCubic pops lacked. It consumes the RAW phase fraction (enterT).
 */
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const springOut = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

/**
 * The shared phase helper for animated overlays: phases are fractions of the item's OWN duration
 * (no schema change, old projects load unchanged). Pure in (localMs, durationMs).
 */
export function overlayPhase(localMs: number, durationMs: number): OverlayPhases {
  const dur = Math.max(1, durationMs);
  const enterMs = Math.min(400, Math.max(120, dur * 0.18));
  const exitMs = Math.max(1, dur * 0.15);
  const actStart = dur * 0.3;
  const actDur = Math.max(120, dur * 0.24);
  const enterT = clamp01(localMs / enterMs);
  return {
    enter: easeOutQuint(enterT),
    enterT,
    exit: easeInOutCubic(clamp01((localMs - (dur - exitMs)) / exitMs)),
    act: easeOutCubic(clamp01((localMs - actStart) / actDur)),
    acted: localMs >= actStart + actDur * 0.55,
    t: clamp01(localMs / dur),
  };
}

/** Bell ring: decaying oscillation around the top pivot (deg), ~22° first swing, ~90 ms period. */
export function bellRingDeg(localMs: number): number {
  if (localMs < 0) return 0;
  return 22 * Math.sin(localMs * ((2 * Math.PI) / 90)) * Math.exp(-localMs / 260);
}

/** Deterministic hash -> [0,1) (same construction as the templates' seededUnit; never Math.random). */
export function socialSeededUnit(seed: number): number {
  let h = Math.floor(Math.abs(seed)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const seedOf = (id: string) => [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);

/** Odometer value + per-digit column offsets at a moment: columns settle right-to-left on an expo ease. */
export function counterAt(localMs: number, durationMs: number, from: number, to: number) {
  const dur = Math.max(1, durationMs);
  const p = easeOutExpo(clamp01(localMs / (dur * 0.82)));
  const value = from + (to - from) * p;
  const intPart = Math.max(0, Math.floor(Math.abs(value)));
  const digits = String(intPart).split("").map(Number);
  const frac = Math.abs(value) - intPart;
  // column i (from the right, 0-based) carries the fractional roll of its place value
  const columns = digits.map((d, i) => {
    const place = digits.length - 1 - i;
    const colValue = (Math.abs(value) / Math.pow(10, place)) % 10;
    return { digit: d, offset: colValue, settle: clamp01(p * 1.15 - place * 0.06) };
  });
  return { value, formatted: intPart.toLocaleString("en-US"), digits, columns, frac, done: p >= 1 };
}

/** Chat stack state: per-bubble entrance + the stack-push offset, and whether typing dots show. */
export function chatStackAt(localMs: number, durationMs: number, count: number) {
  const n = Math.max(0, Math.min(4, Math.floor(count)));
  const bubbles = Array.from({ length: n }, (_, i) => {
    const start = (i * (durationMs * 0.62)) / Math.max(1, n);
    const p = easeOutQuint(clamp01((localMs - start) / 320));
    return { index: i, p, opacity: p, scale: 0.7 + 0.3 * p, yPx: (1 - p) * 18 };
  });
  const typing = n >= 2 && localMs > ((n - 1) * (durationMs * 0.62)) / Math.max(1, n) - 600 && bubbles[n - 1]!.p < 1;
  return { bubbles, typing, typingDot: (i: number) => 0.35 + 0.65 * Math.abs(Math.sin(localMs / 300 - i * 0.9)) };
}

/** Orbit badge rotation: one revolution per 12 s, linear, seamless. */
export const orbitAngle = (localMs: number): number => ((localMs % 12000) / 12000) * 360;

/**
 * Search Bar typing state: the query types in stepped characters over the middle of the item's life
 * (12% → 62%), the caret blinks on a fixed ~1.06 s cycle, and the result row enters right after the
 * last character lands. Pure in (localMs, durationMs, queryLength) — no timers, no randomness.
 */
export function searchBarAt(localMs: number, durationMs: number, queryLength: number) {
  const dur = Math.max(1, durationMs);
  const len = Math.max(0, Math.floor(queryLength));
  const typeStart = dur * 0.12;
  const typeDur = dur * 0.5;
  const p = clamp01((localMs - typeStart) / typeDur);
  const chars = Math.min(len, Math.floor(p * len));
  const resultP = easeOutCubic(clamp01((localMs - (typeStart + typeDur)) / (dur * 0.16)));
  return {
    chars,
    typed: p >= 1,
    caretOn: localMs % 1060 < 620,
    resultP,
    resultY: (1 - resultP) * 14,
  };
}

/** Generic stepped typing (typing-post body): same timing shape as searchBarAt. */
export function typingAt(localMs: number, durationMs: number, textLength: number) {
  const dur = Math.max(1, durationMs);
  const len = Math.max(0, Math.floor(textLength));
  const p = clamp01((localMs - dur * 0.12) / (dur * 0.55));
  return { chars: Math.min(len, Math.floor(p * len)), typed: p >= 1, caretOn: localMs % 1060 < 620, p };
}

/** Kinetic title: per-word entrance progress, staggered over the first ~65%.
 *  Words POP on a spring curve (springOut): each lands a hair past full size and settles,
 *  instead of the old cubic + hand-added sin bump that double-counted the overshoot. */
export function kineticTitleAt(localMs: number, durationMs: number, wordCount: number) {
  const n = Math.max(0, Math.min(4, Math.floor(wordCount)));
  const words = Array.from({ length: n }, (_, i) => {
    const start = (i * durationMs * 0.65) / Math.max(1, n);
    const p = springOut(clamp01((localMs - start) / 340));
    return { index: i, p, scale: 0.55 + 0.45 * p, opacity: clamp01(p) };
  });
  return { words };
}

/** Glitch: stepped offsets changing every 120 ms, seeded by step (deterministic). */
export function glitchAt(localMs: number) {
  const step = Math.floor(Math.max(0, localMs) / 120);
  const active = socialSeededUnit(step * 7 + 3) > 0.45;
  const x = active ? (socialSeededUnit(step * 13 + 1) - 0.5) * 18 : 0;
  const y = active ? (socialSeededUnit(step * 17 + 5) - 0.5) * 8 : 0;
  const slice = active ? socialSeededUnit(step * 19 + 9) : 0;
  return { step, active, x, y, slice };
}

/** Neon flicker: mostly on, with seeded short dropouts. */
export function neonFlickerAt(localMs: number) {
  const step = Math.floor(Math.max(0, localMs) / 90);
  const u = socialSeededUnit(step * 11 + 2);
  const opacity = u < 0.08 ? 0.35 : u < 0.14 ? 0.65 : 1;
  return { opacity, glow: opacity };
}

/** Particle burst: seeded dots radiating out, progress = t over the window. */
export function particleBurstAt(localMs: number, durationMs: number, seed: number, count = 14) {
  const t = clamp01(localMs / Math.max(1, durationMs));
  const dots = Array.from({ length: count }, (_, i) => {
    const a = socialSeededUnit(seed + i * 31) * Math.PI * 2;
    const dist = (30 + socialSeededUnit(seed + i * 47) * 150) * easeOutCubic(clamp01(t * 1.4));
    return { i, x: Math.cos(a) * dist, y: Math.sin(a) * dist, r: 4 + socialSeededUnit(seed + i * 53) * 7, opacity: Math.max(0, 1 - t * 1.1) };
  });
  return { t, dots };
}

/** Live viewers: base + a climb that accelerates after the act beat, seeded steps. */
export function liveViewersAt(localMs: number, durationMs: number, base: number) {
  const t = clamp01(localMs / Math.max(1, durationMs));
  const added = Math.floor(Math.pow(t, 1.4) * 90 + (t > 0.5 ? Math.floor((t - 0.5) * 20) : 0));
  const pulse = 1 + 0.08 * Math.sin(localMs / 220);
  return { viewers: Math.max(0, Math.floor(base)) + added, pulse };
}

/** Upvote count: +1 at the act flip, then a seeded tick-up to +24 by the end. */
export function upvoteAt(localMs: number, durationMs: number, base: number) {
  const ph = overlayPhase(localMs, durationMs);
  const extra = ph.acted ? 1 + Math.floor(ph.t * 23) : 0;
  return { count: Math.max(0, Math.floor(base)) + extra, acted: ph.acted };
}

/** Form card: seeded percentages (sum-normalised) + fill progress after enter. */
export function formCardAt(localMs: number, durationMs: number, seed: number, optionCount: number) {
  const n = Math.max(0, Math.min(3, Math.floor(optionCount)));
  const raw = Array.from({ length: n }, (_, i) => 0.25 + socialSeededUnit(seed + i * 37));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const fill = easeOutCubic(clamp01((localMs - durationMs * 0.25) / (durationMs * 0.5)));
  return { options: raw.map((r, i) => ({ index: i, pct: Math.round((r / sum) * 100), fill })), fill };
}

/** Post card: the Like in the action row fills on the act beat, with a press pulse through the beat. */
export function postCardAt(localMs: number, durationMs: number) {
  const ph = overlayPhase(localMs, durationMs);
  return {
    liked: ph.acted,
    acted: ph.acted,
    act: ph.act,
    likeScale: ph.acted ? 1 + 0.22 * Math.sin(Math.min(1, ph.act) * Math.PI) : 1,
  };
}

/** Repost card: the count ticks exactly +1 at the act flip, and the icon flips colour with it. */
export function repostAt(localMs: number, durationMs: number, base: number) {
  const ph = overlayPhase(localMs, durationMs);
  return { count: Math.max(0, Math.floor(base)) + (ph.acted ? 1 : 0), acted: ph.acted, act: ph.act };
}

/**
 * Voice card: exactly one member speaks at a time, rotating every 650 ms to a member chosen by
 * the seeded hash of (seed, step) — the same (localMs, seed) always picks the same speaker, and
 * the speaking member's ring pulses within its step. Pure in (localMs, seed, memberCount).
 */
export function voiceCardAt(localMs: number, seed: number, memberCount = 3) {
  const n = Math.max(0, Math.min(3, Math.floor(memberCount)));
  const at = Math.max(0, localMs);
  const stepMs = 650;
  const step = Math.floor(at / stepMs);
  const stepP = (at % stepMs) / stepMs;
  const activeIndex = n > 0 ? Math.min(n - 1, Math.floor(socialSeededUnit(seed + step * 101 + 17) * n)) : -1;
  const members = Array.from({ length: n }, (_, i) => {
    const speaking = i === activeIndex;
    return {
      index: i,
      speaking,
      ringScale: speaking ? 1 + 0.16 * Math.sin(stepP * Math.PI) : 1,
      ringOpacity: speaking ? 0.55 + 0.45 * Math.sin(stepP * Math.PI) : 0,
      level: speaking ? 0.35 + 0.65 * Math.abs(Math.sin(at / 170 + i * 1.3)) : 0,
    };
  });
  return { step, activeIndex, members };
}

/**
 * Cursor move → click → react choreography (follow-up batch): the pointer TRAVELS from `from`
 * to `to` along a shallow quadratic arc (easeInOutCubic, 6% → 38% of the item), presses at the
 * act flip (~44%, a sin pulse centred there), and a ripple ring expands out of the click point
 * (44% → 78%, easeOutCubic, fading). Coordinates are the drawing's own reference px; the point
 * is the pointer's TIP. Pure in (localMs, durationMs, from, to) — preview ≡ export.
 */
export function cursorChoreoAt(
  localMs: number,
  durationMs: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const dur = Math.max(1, durationMs);
  const travelStart = dur * 0.06;
  const travelEnd = dur * 0.38;
  const tp = easeInOutCubic(clamp01((localMs - travelStart) / (travelEnd - travelStart)));
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const cx = mx;
  const cy = my - dist * 0.18;
  const x = (1 - tp) * (1 - tp) * from.x + 2 * (1 - tp) * tp * cx + tp * tp * to.x;
  const y = (1 - tp) * (1 - tp) * from.y + 2 * (1 - tp) * tp * cy + tp * tp * to.y;
  const clickAt = dur * 0.44;
  const pressSpan = dur * 0.16;
  const press = Math.sin(clamp01((localMs - (clickAt - pressSpan / 2)) / pressSpan) * Math.PI);
  const rippleP = easeOutCubic(clamp01((localMs - clickAt) / (dur * 0.34)));
  return {
    x, y, press,
    arrived: localMs >= travelEnd,
    clicked: localMs >= clickAt,
    rippleP,
    rippleOpacity: Math.max(0, 1 - rippleP),
    travelP: tp,
  };
}

/**
 * Share Pop flight: after the act beat, a paper plane leaves the share button along a rising
 * arc (quadratic, easeOutCubic over ~45% of the item) and fades as it goes; the share count
 * ticks up behind it (seeded, to +12 by the end). Pure in (localMs, durationMs, base).
 */
export function shareFlightAt(localMs: number, durationMs: number, base: number) {
  const ph = overlayPhase(localMs, durationMs);
  const p = easeOutCubic(clamp01((localMs - durationMs * 0.42) / (durationMs * 0.45)));
  const count = Math.max(0, Math.floor(base)) + (ph.acted ? Math.floor(p * 12) : 0);
  return { p, x: p * 150, y: -p * 110 + p * p * 30, rot: -18 + p * 14, opacity: Math.max(0, 1 - p * 1.15), count, acted: ph.acted };
}

/**
 * Chat read ticks: the stage under an outgoing message as time passes —
 * 0 = one tick (sent), 1 = two ticks (delivered, ~30%), 2 = two ticks in the accent (read, ~62%).
 */
export function chatTicksAt(localMs: number, durationMs: number): { stage: 0 | 1 | 2 } {
  const t = clamp01(localMs / Math.max(1, durationMs));
  return { stage: t >= 0.62 ? 2 : t >= 0.3 ? 1 : 0 };
}

/**
 * Countdown: steps 0..2 show 3 · 2 · 1 (each ~24% of the item, springing in with a shrinking
 * ring), step 3 is the final word. `p` is the spring progress inside the current step.
 */
export function countdownAt(localMs: number, durationMs: number) {
  const dur = Math.max(1, durationMs);
  const stepMs = dur * 0.24;
  const step = Math.min(3, Math.max(0, Math.floor(localMs / stepMs)));
  const inStep = clamp01((localMs - step * stepMs) / Math.min(340, stepMs));
  return { step, label: step < 3 ? String(3 - step) : null, p: springOut(inStep), ringP: clamp01((localMs - step * stepMs) / stepMs) };
}

/** Audio bars: 16 seeded bars, height 0..1 as a pure function of localMs. */
export function audioBarsAt(localMs: number, seed: number, count = 16) {
  return Array.from({ length: count }, (_, i) => {
    const phase = socialSeededUnit(seed + i * 41) * Math.PI * 2;
    const speed = 0.006 + socialSeededUnit(seed + i * 59) * 0.006;
    return { index: i, h: 0.18 + 0.82 * Math.abs(Math.sin(localMs * speed + phase)) };
  });
}

/* ---------------------------------- drawing ---------------------------------- */

const FONT = "'Plus Jakarta Sans', 'Segoe UI', sans-serif";
const CARD_BG = "#1C1C1A";
const CARD_FG = "#FFFFEB";

/** mix a #rrggbb colour toward black (f<1 darker) — the derived shade for flipped states */
export function shade(hex: string, f: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

const Pointer: React.FC<{ x: number; y: number; press: number; sc: number }> = ({ x, y, press, sc }) => (
  <svg width={44 * sc} height={52 * sc} viewBox="0 0 44 52" aria-hidden style={{ position: "absolute", left: x * sc, top: y * sc, transform: `scale(${1 - press * 0.18})`, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45))" }}>
    <path d="M8 3 L38 30 L23 32 L29 46 L20 49 L14 35 L6 42 Z" fill="#FFFFEB" stroke="#141412" strokeWidth={2.5} strokeLinejoin="round" />
  </svg>
);

const Bell: React.FC<{ color: string; size: number; deg: number; arcs: number }> = ({ color, size, deg, arcs }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block", transform: `rotate(${deg.toFixed(2)}deg)`, transformOrigin: "50% 12%" }}>
    <path d="M50 16 C38 16 31 26 31 40 C31 52 27 58 22 63 L78 63 C73 58 69 52 69 40 C69 26 62 16 50 16 Z" fill={color} />
    <circle cx={50} cy={72} r={7} fill={color} />
    {arcs > 0.05 ? (
      <>
        <path d="M14 30 C10 38 10 46 14 54" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" opacity={arcs.toFixed(2)} />
        <path d="M86 30 C90 38 90 46 86 54" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" opacity={arcs.toFixed(2)} />
      </>
    ) : null}
  </svg>
);

const HeartPath: React.FC<{ color: string; filled: boolean; size: number }> = ({ color, filled, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <path d="M50 84 C26 66 14 52 14 37 C14 24 23 15 35 15 C43 15 48 19 50 25 C52 19 57 15 65 15 C77 15 86 24 86 37 C86 52 74 66 50 84 Z" fill={filled ? color : "none"} stroke={color} strokeWidth={6} />
  </svg>
);

/** Our own thumb glyph (rounded palm + thumb curve), drawn for this app — not any platform's asset. */
const ThumbPath: React.FC<{ color: string; filled: boolean; size: number }> = ({ color, filled, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <path d="M28 42 L28 84 L16 84 L16 42 Z" fill={filled ? color : "none"} stroke={color} strokeWidth={5} strokeLinejoin="round" />
    <path d="M30 82 L30 44 C44 36 52 24 54 10 C63 11 68 18 66 28 L63 40 L84 40 C90 40 93 46 91 52 L84 74 C83 79 79 82 74 82 Z" fill={filled ? color : "none"} stroke={color} strokeWidth={5} strokeLinejoin="round" />
  </svg>
);

const Check: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "inline-block", verticalAlign: "-0.12em" }}>
    <path d="M21 53 L41 73 L79 28" fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const linesOf = (item: OverlayItem): string[] => (item.text ?? "").split("\n").map((s) => s.trim());
const line = (ls: string[], i: number, dflt: string) => (ls[i] && ls[i].length ? ls[i]! : dflt);

/** One animated social overlay's inner graphic (positioning/scale come from OverlayView's wrapper). */
export const SocialOverlayView: React.FC<{ item: OverlayItem; sc: number; localMs: number; assetSrc?: string }> = ({ item, sc, localMs, assetSrc }) => {
  const dur = Math.max(1, item.endMs - item.startMs);
  const ph = overlayPhase(localMs, dur);
  const accent = item.color;
  const ls = linesOf(item);
  const enterY = (1 - ph.enter) * 26 * sc;
  const root: React.CSSProperties = {
    fontFamily: FONT, color: CARD_FG, opacity: ph.enter * (1 - ph.exit),
    transform: `translateY(${enterY.toFixed(1)}px)`, pointerEvents: "none",
  };
  const card: React.CSSProperties = { backgroundColor: CARD_BG, borderRadius: 26 * sc, boxShadow: "0 10px 34px rgba(0,0,0,0.42)", padding: `${18 * sc}px ${22 * sc}px` };
  const initialOf = (ls[0] && ls[0].trim() ? ls[0].trim().replace(/^@/, "").charAt(0).toUpperCase() : "C");
  const avatar = (size: number) => assetSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={assetSrc} alt="" style={{ display: "block", width: size * sc, height: size * sc, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size * sc, height: size * sc, borderRadius: "50%", backgroundColor: shade(accent, 0.85), color: CARD_FG, fontWeight: 800, fontSize: size * 0.42 * sc, flexShrink: 0 }}>{initialOf}</span>
  );
  // pointer press pulse around the act beat
  const press = Math.sin(Math.min(1, Math.max(0, ph.act)) * Math.PI);
  const pill = (flipped: boolean, labelNow: string, w?: number) => (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8 * sc, justifyContent: "center",
      width: w ? w * sc : undefined, padding: `${12 * sc}px ${26 * sc}px`, borderRadius: 999,
      backgroundColor: flipped ? shade(accent, 0.45) : accent, color: flipped ? CARD_FG : "#141412",
      fontWeight: 800, fontSize: 30 * sc, transform: `scale(${(1 - press * 0.08).toFixed(3)})`, whiteSpace: "nowrap",
    }}>
      {flipped ? <Check color={CARD_FG} size={26 * sc} /> : null}{labelNow}
    </span>
  );

  switch (item.variant) {
    case "subscribe-pill": {
      const labelNow = ph.acted ? line(ls, 1, "Subscribed") : line(ls, 0, "Subscribe");
      return (
        <div style={{ ...root, position: "relative", width: 360 * sc, height: 110 * sc, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {pill(ph.acted, labelNow, 300)}
          <Pointer x={215} y={52} press={press} sc={sc} />
        </div>
      );
    }
    case "subscribe-banner": {
      const labelNow = ph.acted ? line(ls, 3, "Subscribed") : line(ls, 2, "Subscribe");
      const actStart = dur * 0.3 + Math.max(120, dur * 0.24);
      const ringMs = localMs - (actStart + 350);
      const deg = ringMs > 0 ? bellRingDeg(ringMs) : 0;
      const arcs = ringMs > 0 ? Math.max(0, Math.exp(-ringMs / 320)) : 0;
      return (
        <div style={{ ...root, ...card, position: "relative", display: "flex", alignItems: "center", gap: 18 * sc, width: 640 * sc }}>
          {avatar(84)}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 32 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Your Channel")}</span>
            <span style={{ display: "block", fontSize: 25 * sc, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 1, "New videos every week")}</span>
          </span>
          {pill(ph.acted, labelNow)}
          <span style={{ width: 62 * sc, height: 62 * sc, display: "grid", placeItems: "center" }}>
            <Bell color={ph.acted ? accent : CARD_FG} size={58 * sc} deg={deg} arcs={arcs} />
          </span>
          <Pointer x={430} y={64} press={press} sc={sc} />
        </div>
      );
    }
    case "follow-banner": {
      const labelNow = ph.acted ? line(ls, 3, "Following") : line(ls, 2, "Follow");
      return (
        <div style={{ ...root, ...card, position: "relative", display: "flex", alignItems: "center", gap: 18 * sc, width: 600 * sc }}>
          {avatar(84)}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 32 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Creator Name")}</span>
            <span style={{ display: "block", fontSize: 25 * sc, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 1, "@handle")}</span>
          </span>
          {pill(ph.acted, labelNow)}
          <Pointer x={400} y={64} press={press} sc={sc} />
        </div>
      );
    }
    case "comment-popup": {
      const comment = ls.slice(1).filter(Boolean).join("\n") || "This is exactly what I needed, thank you!";
      const popScale = 0.72 + 0.28 * springOut(ph.enterT);
      const heartBeat = ph.acted ? 1 + 0.25 * Math.sin(Math.min(1, ph.act) * Math.PI) : 1;
      return (
        <div style={{ ...root, ...card, position: "relative", display: "flex", gap: 16 * sc, width: 560 * sc, transform: `translateY(${enterY.toFixed(1)}px) scale(${popScale.toFixed(3)})` }}>
          {avatar(72)}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 28 * sc }}>{line(ls, 0, "@viewer")}</span>
            <span style={{ display: "block", fontSize: 27 * sc, lineHeight: 1.3, whiteSpace: "pre-wrap" }}>{comment}</span>
          </span>
          <span style={{ transform: `scale(${heartBeat.toFixed(3)})`, alignSelf: "flex-start" }}>
            <HeartPath color={accent} filled={ph.acted} size={40 * sc} />
          </span>
        </div>
      );
    }
    case "like-pop": {
      const start = parseInt((ls[0] ?? "128").replace(/[^0-9]/g, ""), 10);
      const count = Number.isFinite(start) ? start + (ph.acted ? 1 : 0) : 0;
      return (
        <div style={{ ...root, position: "relative", display: "flex", alignItems: "center", gap: 16 * sc, width: 300 * sc, justifyContent: "center" }}>
          <span style={{ transform: `scale(${((0.5 + 0.5 * springOut(ph.enterT)) * (ph.acted ? 1.18 : 1) * (1 - press * 0.1)).toFixed(3)})`, display: "block" }}>
            <ThumbPath color={accent} filled={ph.acted} size={92 * sc} />
          </span>
          <span style={{ fontWeight: 800, fontSize: 40 * sc, transform: ph.acted ? "translateY(-2px)" : undefined }}>{count.toLocaleString("en-US")}</span>
          {ph.acted ? [0, 1, 2, 3].map((i) => {
            const a = (i * Math.PI) / 2 + 0.4;
            const r = 74 * sc * Math.min(1, ph.act + 0.25);
            return <span key={i} style={{ position: "absolute", left: 60 * sc + Math.cos(a) * r, top: 30 * sc + Math.sin(a) * r, width: 16 * sc, height: 4 * sc, borderRadius: 2, backgroundColor: accent, opacity: Math.max(0, 1 - ph.act), transform: `rotate(${a}rad)` }} />;
          }) : null}
          <Pointer x={52} y={58} press={press} sc={sc} />
        </div>
      );
    }
    case "heart-pop": {
      const seed = seedOf(item.id);
      const burst = springOut(ph.enterT);
      const floaters = [0, 1, 2, 3, 4].map((i) => {
        const dx = (socialSeededUnit(seed + i * 13) - 0.5) * 260 * sc;
        const rise = Math.max(0, ph.t - 0.25) / 0.75;
        return { i, dx, y: -rise * 190 * sc, o: Math.max(0, 1 - rise), s: 26 + socialSeededUnit(seed + i * 29) * 22 };
      });
      return (
        <div style={{ ...root, position: "relative", width: 320 * sc, height: 300 * sc, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 * sc }}>
          <span style={{ transform: `scale(${(0.2 + burst * 0.95).toFixed(3)})`, display: "block" }}>
            <HeartPath color={accent} filled size={150 * sc} />
          </span>
          {ls[0] ? <span style={{ fontWeight: 700, fontSize: 28 * sc }}>{ls[0]}</span> : null}
          {floaters.map((f) => (
            <span key={f.i} style={{ position: "absolute", left: 150 * sc + f.dx, top: 120 * sc + f.y, opacity: f.o }}>
              <HeartPath color={accent} filled size={f.s * sc} />
            </span>
          ))}
        </div>
      );
    }
    case "counter": {
      const from = Number((ls[0] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
      const to = Number((ls[1] ?? "50000").replace(/[^0-9.-]/g, "")) || 0;
      const c = counterAt(localMs, dur, from, to);
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 * sc }}>
          <span style={{ display: "flex", fontWeight: 900, fontSize: 92 * sc, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {c.columns.map((col, i) => (
              <span key={i} style={{ display: "inline-block", height: "1em", overflow: "hidden" }}>
                <span style={{ display: "flex", flexDirection: "column", transform: `translateY(${(-col.offset).toFixed(3)}em)` }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <span key={d} style={{ height: "1em", color: i === c.columns.length - 1 || col.settle >= 1 ? accent : CARD_FG }}>{d}</span>
                  ))}
                </span>
              </span>
            ))}
          </span>
          {ls[2] ? <span style={{ fontSize: 30 * sc, fontWeight: 700, opacity: 0.85 }}>{ls[2]}</span> : null}
        </div>
      );
    }
    case "chat-stack": {
      const texts = ls.filter(Boolean).slice(0, 4);
      const cs = chatStackAt(localMs, dur, texts.length);
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", gap: 12 * sc, width: 520 * sc }}>
          {texts.map((t, i) => {
            const b = cs.bubbles[i]!;
            const mine = i % 2 === 1;
            return (
              <span key={i} style={{
                alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%",
                backgroundColor: mine ? accent : CARD_BG, color: mine ? "#141412" : CARD_FG,
                borderRadius: 22 * sc, padding: `${13 * sc}px ${18 * sc}px`, fontSize: 27 * sc, fontWeight: 600, lineHeight: 1.3,
                opacity: b.opacity, transform: `translateY(${b.yPx.toFixed(1)}px) scale(${b.scale.toFixed(3)})`,
                boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
              }}>{t}</span>
            );
          })}
          {cs.typing ? (
            <span style={{ alignSelf: texts.length % 2 === 1 ? "flex-end" : "flex-start", backgroundColor: CARD_BG, borderRadius: 22 * sc, padding: `${14 * sc}px ${18 * sc}px`, display: "flex", gap: 7 * sc }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 11 * sc, height: 11 * sc, borderRadius: "50%", backgroundColor: CARD_FG, opacity: cs.typingDot(i).toFixed(2) }} />
              ))}
            </span>
          ) : null}
        </div>
      );
    }
    case "orbit-badge": {
      const text = (ls[0] && ls[0].length ? ls[0] : "NEW EPISODE • PART 2 • ").toUpperCase();
      const R = 120;
      return (
        <div style={{ ...root, position: "relative", width: 300 * sc, height: 300 * sc }}>
          <svg width={300 * sc} height={300 * sc} viewBox="0 0 300 300" aria-hidden style={{ display: "block", transform: `rotate(${orbitAngle(localMs).toFixed(2)}deg)` }}>
            <defs><path id={`orbit-${item.id}`} d={`M 150,150 m -${R},0 a ${R},${R} 0 1,1 ${R * 2},0 a ${R},${R} 0 1,1 -${R * 2},0`} /></defs>
            <text fill={accent} fontSize={27} fontWeight={800} letterSpacing={3} style={{ fontFamily: FONT }}>
              <textPath href={`#orbit-${item.id}`}>{text.repeat(2)}</textPath>
            </text>
          </svg>
          <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
            <svg width={74 * sc} height={74 * sc} viewBox="0 0 100 100" aria-hidden>
              <polygon fill={accent} points="50,8 62,38 92,39 68,58 77,87 50,70 23,87 32,58 8,39 38,38" />
            </svg>
          </span>
        </div>
      );
    }
    case "search-bar": {
      const query = line(ls, 0, "how to edit videos");
      const sb = searchBarAt(localMs, dur, query.length);
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", gap: 12 * sc, width: 580 * sc }}>
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 14 * sc, borderRadius: 999, padding: `${15 * sc}px ${24 * sc}px` }}>
            <svg width={34 * sc} height={34 * sc} viewBox="0 0 100 100" aria-hidden style={{ display: "block", flexShrink: 0 }}>
              <circle cx={40} cy={40} r={24} fill="none" stroke={accent} strokeWidth={9} />
              <path d="M58 58 L82 82" stroke={accent} strokeWidth={10} strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 30 * sc, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}>
              {query.slice(0, sb.chars)}
              <span style={{ display: "inline-block", width: 3 * sc, height: "1em", marginLeft: 2 * sc, verticalAlign: "-0.12em", backgroundColor: accent, opacity: sb.caretOn ? 1 : 0 }} />
            </span>
          </div>
          {ls[1] ? (
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 14 * sc, borderRadius: 20 * sc, padding: `${14 * sc}px ${22 * sc}px`, opacity: sb.resultP, transform: `translateY(${sb.resultY.toFixed(1)}px)` }}>
              <span style={{ display: "block", width: 40 * sc, height: 40 * sc, borderRadius: "50%", backgroundColor: shade(accent, 0.85), flexShrink: 0 }} />
              <span style={{ fontSize: 27 * sc, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ls[1]}</span>
            </div>
          ) : null}
        </div>
      );
    }
    case "profile-card": {
      const labelNow = ph.acted ? line(ls, 4, "Following") : line(ls, 3, "Follow");
      const ringRot = orbitAngle(localMs) * 2;
      return (
        <div style={{ ...root, ...card, position: "relative", display: "flex", alignItems: "center", gap: 18 * sc, width: 620 * sc }}>
          <span style={{ position: "relative", width: 96 * sc, height: 96 * sc, flexShrink: 0 }}>
            <svg width={96 * sc} height={96 * sc} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: `rotate(${ringRot.toFixed(1)}deg)` }} aria-hidden><circle cx={50} cy={50} r={46} fill="none" stroke={accent} strokeWidth={5} strokeDasharray="70 220" strokeLinecap="round" /></svg>
            <span style={{ position: "absolute", left: 6 * sc, top: 6 * sc }}>{avatar(84)}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 32 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Creator Name")}</span>
            <span style={{ display: "block", fontSize: 25 * sc, opacity: 0.75 }}>{line(ls, 1, "@handle")}</span>
            <span style={{ display: "block", fontSize: 24 * sc, opacity: 0.9, color: accent }}>{line(ls, 2, "12.4K followers")}</span>
          </span>
          {pill(ph.acted, labelNow)}
          <Pointer x={420} y={64} press={press} sc={sc} />
        </div>
      );
    }
    case "notification-pop": {
      const actStart = dur * 0.3 + Math.max(120, dur * 0.24);
      const ringMs = localMs - actStart;
      const deg = ringMs > 0 ? bellRingDeg(ringMs) : 0;
      const slideX = (1 - ph.enter) * -60 * sc;
      return (
        <div style={{ ...root, ...card, display: "flex", alignItems: "center", gap: 16 * sc, width: 560 * sc, transform: `translateX(${slideX.toFixed(1)}px) translateY(${enterY.toFixed(1)}px)` }}>
          <Bell color={accent} size={56 * sc} deg={deg} arcs={ringMs > 0 ? Math.max(0, Math.exp(-ringMs / 320)) : 0} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 29 * sc }}>{line(ls, 0, "New follower")}</span>
            <span style={{ display: "block", fontSize: 26 * sc, opacity: 0.8 }}>{line(ls, 1, "Alex just followed you")}</span>
          </span>
          <span style={{ width: 14 * sc, height: 14 * sc, borderRadius: "50%", backgroundColor: accent, opacity: ph.acted ? 1 : 0.3 }} />
        </div>
      );
    }
    case "dm-popup": {
      return (
        <div style={{ ...root, ...card, width: 560 * sc }}>
          <span style={{ display: "block", fontSize: 22 * sc, fontWeight: 700, opacity: 0.7, marginBottom: 10 * sc }}>Message request</span>
          <span style={{ display: "flex", gap: 14 * sc, alignItems: "flex-start" }}>
            {avatar(64)}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 29 * sc }}>{line(ls, 0, "Alex")}</span>
              <span style={{ display: "block", fontSize: 26 * sc, lineHeight: 1.3 }}>{line(ls, 1, "Hey! Love your latest video")}</span>
            </span>
          </span>
          <span style={{ display: "flex", gap: 12 * sc, marginTop: 16 * sc }}>
            <span style={{ flex: 1, textAlign: "center", padding: `${10 * sc}px`, borderRadius: 999, backgroundColor: ph.acted ? accent : shade(accent, 0.5), color: ph.acted ? "#141412" : CARD_FG, fontWeight: 800, fontSize: 26 * sc, transform: `scale(${(ph.acted ? 1.04 : 1).toFixed(3)})` }}>Accept</span>
            <span style={{ flex: 1, textAlign: "center", padding: `${10 * sc}px`, borderRadius: 999, border: `2px solid ${CARD_FG}55`, fontWeight: 700, fontSize: 26 * sc, opacity: ph.acted ? 0.45 : 1 }}>Decline</span>
          </span>
        </div>
      );
    }
    case "story-ring": {
      const rot = orbitAngle(localMs) * 3;
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * sc, width: 300 * sc }}>
          <span style={{ position: "relative", width: 200 * sc, height: 200 * sc }}>
            <svg width={200 * sc} height={200 * sc} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: `rotate(${rot.toFixed(1)}deg)` }} aria-hidden><circle cx={50} cy={50} r={47} fill="none" stroke={accent} strokeWidth={4} strokeDasharray="18 10" strokeLinecap="round" /></svg>
            <span style={{ position: "absolute", left: 14 * sc, top: 14 * sc }}>{avatar(172)}</span>
          </span>
          <span style={{ fontWeight: 800, fontSize: 30 * sc }}>{line(ls, 0, "Creator Name")}</span>
        </div>
      );
    }
    case "lower-third": {
      const slideX = (1 - ph.enter) * -80 * sc;
      return (
        <div style={{ ...root, display: "flex", gap: 16 * sc, alignItems: "stretch", width: 600 * sc, transform: `translateX(${slideX.toFixed(1)}px)`, opacity: ph.enter * (1 - ph.exit) }}>
          <span style={{ width: 10 * sc, backgroundColor: accent, borderRadius: 4, transform: `scaleY(${ph.enter.toFixed(3)})` }} />
          <span style={{ backgroundColor: CARD_BG, borderRadius: 14 * sc, padding: `${14 * sc}px ${20 * sc}px`, flex: 1, boxShadow: "0 8px 28px rgba(0,0,0,0.4)" }}>
            <span style={{ display: "block", fontWeight: 900, fontSize: 38 * sc }}>{line(ls, 0, "Creator Name")}</span>
            <span style={{ display: "block", fontSize: 27 * sc, opacity: 0.8, color: accent }}>{line(ls, 1, "Video Editor")}</span>
          </span>
        </div>
      );
    }
    case "logo-reveal": {
      const sweep = easeInOutCubic(clamp01(ph.t * 1.6));
      const C = 2 * Math.PI * 88;
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * sc, width: 420 * sc }}>
          <svg width={200 * sc} height={200 * sc} viewBox="0 0 200 200" aria-hidden>
            <circle cx={100} cy={100} r={88} fill="none" stroke={`${accent}44`} strokeWidth={8} />
            <circle cx={100} cy={100} r={88} fill="none" stroke={accent} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(C * sweep).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 100 100)" />
            <circle cx={100} cy={100} r={62} fill={CARD_BG} opacity={sweep} />
          </svg>
          <span style={{ fontWeight: 900, fontSize: 44 * sc, letterSpacing: 3, opacity: sweep, transform: `scale(${(0.8 + 0.2 * sweep).toFixed(3)})`, color: accent }}>{line(ls, 0, "YOUR BRAND")}</span>
        </div>
      );
    }
    case "qr-frame": {
      const pulse = 1 + 0.03 * Math.sin(localMs / 240);
      const bracket = (pos: React.CSSProperties) => <span style={{ position: "absolute", width: 52 * sc, height: 52 * sc, borderColor: accent, borderStyle: "solid", borderWidth: 0, ...pos }} />;
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * sc }}>
          <span style={{ position: "relative", display: "block", width: 280 * sc, height: 280 * sc, transform: `scale(${pulse.toFixed(3)})`, backgroundColor: CARD_BG, borderRadius: 18 * sc }}>
            {bracket({ left: 0, top: 0, borderTopWidth: 7 * sc, borderLeftWidth: 7 * sc, borderTopLeftRadius: 14 * sc })}
            {bracket({ right: 0, top: 0, borderTopWidth: 7 * sc, borderRightWidth: 7 * sc, borderTopRightRadius: 14 * sc })}
            {bracket({ left: 0, bottom: 0, borderBottomWidth: 7 * sc, borderLeftWidth: 7 * sc, borderBottomLeftRadius: 14 * sc })}
            {bracket({ right: 0, bottom: 0, borderBottomWidth: 7 * sc, borderRightWidth: 7 * sc, borderBottomRightRadius: 14 * sc })}
            {assetSrc ? <img src={assetSrc} alt="" style={{ position: "absolute", left: 28 * sc, top: 28 * sc, width: 224 * sc, height: 224 * sc, objectFit: "contain" }} /> : (
              <span style={{ position: "absolute", left: 34 * sc, top: 34 * sc, width: 212 * sc, height: 212 * sc, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 * sc, padding: 6 * sc }}>
                {Array.from({ length: 49 }, (_, i) => <span key={i} style={{ backgroundColor: socialSeededUnit(i * 17 + 5) > 0.5 ? CARD_FG : "transparent", borderRadius: 2, opacity: 0.85 }} />)}
                <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", backgroundColor: CARD_BG, padding: `${4 * sc}px ${8 * sc}px`, fontSize: 18 * sc, fontWeight: 700 }}>your QR image</span>
              </span>
            )}
          </span>
          <span style={{ fontWeight: 800, fontSize: 30 * sc }}>{line(ls, 0, "Scan to follow")}</span>
        </div>
      );
    }
    case "kinetic-title": {
      const words = ls.filter(Boolean).slice(0, 4);
      const kt = kineticTitleAt(localMs, dur, words.length || 1);
      const list = words.length ? words : ["TITLE"];
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 * sc, width: 640 * sc }}>
          {list.map((w, i) => { const s = kt.words[i] ?? { p: 1, scale: 1, opacity: 1 }; return <span key={i} style={{ fontWeight: 900, fontSize: 84 * sc, lineHeight: 1.05, color: i === list.length - 1 ? accent : CARD_FG, opacity: s.opacity, transform: `scale(${s.scale.toFixed(3)})` }}>{w}</span>; })}
        </div>
      );
    }
    case "glitch-title": {
      const g = glitchAt(localMs);
      const txt = line(ls, 0, "LEVEL UP");
      const base: React.CSSProperties = { fontWeight: 900, fontSize: 84 * sc, lineHeight: 1, whiteSpace: "nowrap" };
      return (
        <div style={{ ...root, position: "relative", width: 640 * sc, height: 120 * sc, display: "flex", justifyContent: "center" }}>
          <span style={{ ...base, position: "absolute", color: "#FF3355", transform: `translate(${(g.x - 4).toFixed(1)}px, ${g.y.toFixed(1)}px)`, opacity: g.active ? 0.85 : 0.35 }}>{txt}</span>
          <span style={{ ...base, position: "absolute", color: "#33CCFF", transform: `translate(${(-g.x + 4).toFixed(1)}px, ${(-g.y).toFixed(1)}px)`, opacity: g.active ? 0.85 : 0.35 }}>{txt}</span>
          <span style={{ ...base, position: "relative", color: CARD_FG, transform: `translate(${g.active ? (g.x * 0.3).toFixed(1) : 0}px, 0px)` }}>{txt}</span>
        </div>
      );
    }
    case "neon-sign": {
      const f = neonFlickerAt(localMs);
      return (
        <div style={{ ...root, width: 560 * sc, textAlign: "center" }}>
          <span style={{ fontWeight: 900, fontSize: 88 * sc, letterSpacing: 6, color: accent, opacity: f.opacity, textShadow: `0 0 ${18 * sc}px ${accent}, 0 0 ${42 * sc}px ${accent}` }}>{line(ls, 0, "OPEN")}</span>
        </div>
      );
    }
    case "particle-burst": {
      const pb = particleBurstAt(localMs, dur, seedOf(item.id));
      return (
        <div style={{ ...root, position: "relative", width: 420 * sc, height: 260 * sc, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {pb.dots.map((d) => <span key={d.i} style={{ position: "absolute", left: 210 * sc + d.x * sc, top: 130 * sc + d.y * sc, width: d.r * sc, height: d.r * sc, borderRadius: "50%", backgroundColor: accent, opacity: d.opacity.toFixed(2) }} />)}
          <span style={{ fontWeight: 900, fontSize: 64 * sc, color: CARD_FG, transform: `scale(${(0.7 + 0.3 * ph.enter).toFixed(3)})` }}>{line(ls, 0, "NEW!")}</span>
        </div>
      );
    }
    case "typing-post": {
      const body = line(ls, 2, "Just shipped a new tutorial!");
      const tp = typingAt(localMs, dur, body.length);
      return (
        <div style={{ ...root, ...card, width: 580 * sc }}>
          <span style={{ display: "flex", gap: 14 * sc, alignItems: "center", marginBottom: 12 * sc }}>
            {avatar(60)}
            <span>
              <span style={{ display: "block", fontWeight: 800, fontSize: 29 * sc }}>{line(ls, 0, "Creator Name")}</span>
              <span style={{ display: "block", fontSize: 24 * sc, opacity: 0.7 }}>{line(ls, 1, "@handle")}</span>
            </span>
          </span>
          <span style={{ display: "block", fontSize: 28 * sc, lineHeight: 1.35, minHeight: 76 * sc }}>{body.slice(0, tp.chars)}<span style={{ display: "inline-block", width: 3 * sc, height: "1em", backgroundColor: accent, opacity: tp.caretOn ? 1 : 0, verticalAlign: "-0.12em" }} /></span>
        </div>
      );
    }
    case "upvote-card": {
      const baseCount = parseInt((ls[1] ?? "248").replace(/[^0-9]/g, ""), 10) || 0;
      const up = upvoteAt(localMs, dur, baseCount);
      return (
        <div style={{ ...root, ...card, display: "flex", gap: 16 * sc, width: 580 * sc, alignItems: "flex-start" }}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 * sc }}>
            <svg width={44 * sc} height={44 * sc} viewBox="0 0 100 100" aria-hidden><path d="M50 12 L88 62 L64 62 L64 88 L36 88 L36 62 L12 62 Z" fill={up.acted ? accent : "none"} stroke={accent} strokeWidth={6} strokeLinejoin="round" /></svg>
            <span style={{ fontWeight: 800, fontSize: 27 * sc }}>{up.count.toLocaleString("en-US")}</span>
          </span>
          <span style={{ flex: 1, fontSize: 29 * sc, fontWeight: 700, lineHeight: 1.3 }}>{line(ls, 0, "This workflow saved me hours")}</span>
        </div>
      );
    }
    case "live-badge": {
      const baseV = parseInt((ls[1] ?? "128").replace(/[^0-9]/g, ""), 10) || 0;
      const lv = liveViewersAt(localMs, dur, baseV);
      return (
        <div style={{ ...root, display: "flex", alignItems: "center", gap: 14 * sc }}>
          <span style={{ backgroundColor: accent, color: "#fff", fontWeight: 900, fontSize: 30 * sc, padding: `${10 * sc}px ${20 * sc}px`, borderRadius: 10 * sc, transform: `scale(${lv.pulse.toFixed(3)})`, letterSpacing: 2 }}>{line(ls, 0, "LIVE")}</span>
          <span style={{ ...card, padding: `${10 * sc}px ${18 * sc}px`, borderRadius: 999, fontSize: 27 * sc, fontWeight: 700 }}>{lv.viewers.toLocaleString("en-US")} watching</span>
        </div>
      );
    }
    case "product-tag": {
      const swing = Math.sin(ph.t * Math.PI * 3) * 10 * (1 - ph.t) + (1 - ph.enter) * -18;
      return (
        <div style={{ ...root, width: 420 * sc, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ width: 2 * sc, height: 44 * sc, backgroundColor: CARD_FG, opacity: 0.7 }} />
          <div style={{ backgroundColor: accent, color: "#141412", borderRadius: 18 * sc, padding: `${18 * sc}px ${24 * sc}px`, width: 380 * sc, textAlign: "center", transform: `rotate(${swing.toFixed(2)}deg)`, transformOrigin: "50% -44px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
            <span style={{ display: "block", width: 16 * sc, height: 16 * sc, borderRadius: "50%", backgroundColor: CARD_BG, margin: "0 auto 8px" }} />
            <span style={{ display: "block", fontWeight: 800, fontSize: 30 * sc }}>{line(ls, 0, "Creator Preset Pack")}</span>
            <span style={{ display: "block", fontWeight: 900, fontSize: 42 * sc }}>{line(ls, 1, "$29")}</span>
          </div>
        </div>
      );
    }
    case "form-card": {
      const opts = ls.slice(1).filter(Boolean).slice(0, 3);
      const fc = formCardAt(localMs, dur, seedOf(item.id), opts.length);
      return (
        <div style={{ ...root, ...card, width: 580 * sc }}>
          <span style={{ display: "block", fontWeight: 800, fontSize: 30 * sc, marginBottom: 14 * sc }}>{line(ls, 0, "What should I post next?")}</span>
          {opts.map((o, i) => { const f = fc.options[i] ?? { pct: 0, fill: 0 }; return (
            <span key={i} style={{ display: "block", position: "relative", borderRadius: 12 * sc, overflow: "hidden", backgroundColor: "#2A2A27", marginBottom: 10 * sc, padding: `${11 * sc}px ${16 * sc}px` }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(f.pct * f.fill).toFixed(1)}%`, backgroundColor: shade(accent, 0.55) }} />
              <span style={{ position: "relative", display: "flex", justifyContent: "space-between", fontSize: 26 * sc, fontWeight: 700 }}><span>{o}</span><span>{f.fill > 0.05 ? `${f.pct}%` : ""}</span></span>
            </span>); })}
        </div>
      );
    }
    case "audio-bars": {
      const bars = audioBarsAt(localMs, seedOf(item.id));
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * sc }}>
          <span style={{ display: "flex", alignItems: "flex-end", gap: 8 * sc, height: 140 * sc }}>
            {bars.map((b) => <span key={b.index} style={{ width: 18 * sc, height: b.h * 140 * sc, backgroundColor: accent, borderRadius: 6 * sc }} />)}
          </span>
          {ls[0] ? <span style={{ fontSize: 27 * sc, fontWeight: 700 }}>{ls[0]}</span> : null}
        </div>
      );
    }
    case "post-card": {
      const pc = postCardAt(localMs, dur);
      const action = (labelNow: string, icon: React.ReactNode, active: boolean) => (
        <span style={{ display: "flex", alignItems: "center", gap: 9 * sc, fontSize: 26 * sc, fontWeight: 700, color: active ? accent : CARD_FG, opacity: active ? 1 : 0.75 }}>
          {icon}{labelNow}
        </span>
      );
      return (
        <div style={{ ...root, ...card, width: 580 * sc }}>
          <span style={{ display: "flex", gap: 14 * sc, alignItems: "center", marginBottom: 12 * sc }}>
            {avatar(64)}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 30 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Creator Name")}</span>
              <span style={{ display: "block", fontSize: 24 * sc, opacity: 0.7 }}>{line(ls, 1, "2 hrs ago")}</span>
            </span>
          </span>
          <span style={{ display: "block", fontSize: 28 * sc, lineHeight: 1.35, marginBottom: 16 * sc }}>{line(ls, 2, "Just shared a new tutorial!")}</span>
          <span style={{ display: "block", height: 1, backgroundColor: "#FFFFEB22", marginBottom: 14 * sc }} />
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {action("Like", <span style={{ display: "block", transform: `scale(${pc.likeScale.toFixed(3)})` }}><ThumbPath color={accent} filled={pc.liked} size={38 * sc} /></span>, pc.liked)}
            {action("Comment", (
              <svg width={38 * sc} height={38 * sc} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
                <path d="M16 22 C16 16 20 12 26 12 L74 12 C80 12 84 16 84 22 L84 58 C84 64 80 68 74 68 L44 68 L26 84 L26 68 L26 68 C20 68 16 64 16 58 Z" fill="none" stroke={CARD_FG} strokeWidth={6} strokeLinejoin="round" />
              </svg>
            ), false)}
            {action("Share", (
              <svg width={38 * sc} height={38 * sc} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
                <path d="M22 62 C22 40 38 28 62 26 L62 14 L86 34 L62 54 L62 42 C44 44 34 50 28 66 Z" fill="none" stroke={CARD_FG} strokeWidth={6} strokeLinejoin="round" />
              </svg>
            ), false)}
          </span>
        </div>
      );
    }
    case "repost-card": {
      const baseCount = parseInt((ls[3] ?? "248").replace(/[^0-9]/g, ""), 10) || 0;
      const rp = repostAt(localMs, dur, baseCount);
      const repostColor = rp.acted ? accent : "#9A9A94";
      return (
        <div style={{ ...root, ...card, width: 560 * sc }}>
          <span style={{ display: "flex", gap: 13 * sc, alignItems: "center", marginBottom: 10 * sc }}>
            {avatar(56)}
            <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10 * sc }}>
              <span style={{ fontWeight: 800, fontSize: 29 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Creator Name")}</span>
              <span style={{ fontSize: 24 * sc, opacity: 0.7, whiteSpace: "nowrap" }}>{line(ls, 1, "@handle")}</span>
            </span>
          </span>
          <span style={{ display: "block", fontSize: 28 * sc, lineHeight: 1.35, marginBottom: 14 * sc }}>{line(ls, 2, "Just shipped a new tutorial!")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 26 * sc }}>
            <span style={{ display: "flex", alignItems: "center", gap: 9 * sc, transform: `scale(${rp.acted ? (1 + 0.14 * Math.sin(Math.min(1, rp.act) * Math.PI)).toFixed(3) : "1.000"})` }}>
              <svg width={42 * sc} height={42 * sc} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
                <path d="M16 36 L68 36 M56 22 L70 36 L56 50" fill="none" stroke={repostColor} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M84 64 L32 64 M44 50 L30 64 L44 78" fill="none" stroke={repostColor} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontWeight: 800, fontSize: 26 * sc, color: repostColor }}>{rp.count.toLocaleString("en-US")}</span>
            </span>
            <svg width={36 * sc} height={36 * sc} viewBox="0 0 100 100" aria-hidden style={{ display: "block", opacity: 0.55 }}>
              <path d="M16 22 C16 16 20 12 26 12 L74 12 C80 12 84 16 84 22 L84 58 C84 64 80 68 74 68 L44 68 L26 84 L26 68 C20 68 16 64 16 58 Z" fill="none" stroke={CARD_FG} strokeWidth={6} strokeLinejoin="round" />
            </svg>
            <span style={{ opacity: 0.55 }}><HeartPath color={CARD_FG} filled={false} size={36 * sc} /></span>
          </span>
        </div>
      );
    }
    case "voice-card": {
      const memberDefaults = ["Alex", "Priya", "Sam"];
      const memberNames = memberDefaults.map((d, i) => line(ls, i + 1, d));
      const vc = voiceCardAt(localMs, seedOf(item.id), memberNames.length);
      return (
        <div style={{ ...root, ...card, width: 520 * sc }}>
          <span style={{ display: "flex", alignItems: "center", gap: 12 * sc, marginBottom: 16 * sc }}>
            <svg width={36 * sc} height={36 * sc} viewBox="0 0 100 100" aria-hidden style={{ display: "block", flexShrink: 0 }}>
              <path d="M14 40 L30 40 L50 22 L50 78 L30 60 L14 60 Z" fill={accent} />
              <path d="M62 34 C68 42 68 58 62 66 M74 26 C84 40 84 60 74 74" fill="none" stroke={accent} strokeWidth={6} strokeLinecap="round" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: 30 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "voice-lounge")}</span>
            <span style={{ marginLeft: "auto", fontSize: 23 * sc, opacity: 0.7, whiteSpace: "nowrap" }}>{memberNames.length} in voice</span>
          </span>
          {memberNames.map((name, i) => {
            const m = vc.members[i] ?? { speaking: false, ringScale: 1, ringOpacity: 0, level: 0 };
            return (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 14 * sc, marginBottom: i < memberNames.length - 1 ? 13 * sc : 0 }}>
                <span style={{ position: "relative", width: 56 * sc, height: 56 * sc, flexShrink: 0, display: "block" }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${3 * sc}px solid ${accent}`, opacity: m.ringOpacity.toFixed(2), transform: `scale(${m.ringScale.toFixed(3)})` }} />
                  <span style={{ position: "absolute", left: 5 * sc, top: 5 * sc, display: "flex", alignItems: "center", justifyContent: "center", width: 46 * sc, height: 46 * sc, borderRadius: "50%", backgroundColor: shade(accent, [0.85, 0.62, 0.42][i] ?? 0.7), color: CARD_FG, fontWeight: 800, fontSize: 20 * sc }}>{name.trim().replace(/^@/, "").charAt(0).toUpperCase() || "?"}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: m.speaking ? 800 : 600, fontSize: 27 * sc, color: m.speaking ? CARD_FG : "#FFFFEBBB", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                <span style={{ display: "flex", alignItems: "flex-end", gap: 3 * sc, height: 22 * sc }}>
                  {[0, 1, 2].map((b) => (
                    <span key={b} style={{ width: 5 * sc, height: (6 + m.level * (8 + b * 4)) * sc, borderRadius: 2, backgroundColor: accent, opacity: m.speaking ? 1 : 0.22 }} />
                  ))}
                </span>
              </span>
            );
          })}
        </div>
      );
    }
    case "cursor-click": {
      const choreo = cursorChoreoAt(localMs, dur, { x: 585, y: 298 }, { x: 424, y: 148 });
      const labelNow = ph.acted ? line(ls, 1, "Done — welcome in") : line(ls, 0, "Get started");
      return (
        <div style={{ ...root, position: "relative", width: 640 * sc, height: 320 * sc }}>
          <span style={{
            position: "absolute", left: "50%", top: 96 * sc, transform: `translateX(-50%) scale(${(1 - choreo.press * 0.05).toFixed(3)})`,
            display: "inline-flex", alignItems: "center", gap: 10 * sc, justifyContent: "center", width: 360 * sc, height: 104 * sc,
            borderRadius: 26 * sc, backgroundColor: ph.acted ? shade(accent, 0.45) : accent, color: ph.acted ? CARD_FG : "#141412",
            fontWeight: 800, fontSize: 38 * sc, boxShadow: "0 12px 34px rgba(0,0,0,0.42)", whiteSpace: "nowrap",
          }}>
            {ph.acted ? <Check color={CARD_FG} size={34 * sc} /> : null}{labelNow}
          </span>
          {choreo.rippleP > 0 ? (
            <span style={{ position: "absolute", left: 424 * sc, top: 148 * sc, width: (26 + choreo.rippleP * 120) * sc, height: (26 + choreo.rippleP * 120) * sc, borderRadius: "50%", border: `${4 * sc}px solid ${accent}`, opacity: choreo.rippleOpacity.toFixed(2), transform: "translate(-50%, -50%)" }} />
          ) : null}
          <Pointer x={choreo.x - 8} y={choreo.y - 3} press={choreo.press} sc={sc} />
        </div>
      );
    }
    case "cursor-follow": {
      const choreo = cursorChoreoAt(localMs, dur, { x: 66, y: 288 }, { x: 472, y: 96 });
      const labelNow = ph.acted ? line(ls, 3, "Following") : line(ls, 2, "Follow");
      return (
        <div style={{ ...root, position: "relative", width: 640 * sc, height: 300 * sc }}>
          <div style={{ ...card, position: "absolute", left: 20 * sc, top: 24 * sc, display: "flex", alignItems: "center", gap: 18 * sc, width: 600 * sc }}>
            {avatar(84)}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 32 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Creator Name")}</span>
              <span style={{ display: "block", fontSize: 25 * sc, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 1, "@handle")}</span>
            </span>
            {pill(ph.acted, labelNow)}
          </div>
          {choreo.rippleP > 0 ? (
            <span style={{ position: "absolute", left: 472 * sc, top: 96 * sc, width: (24 + choreo.rippleP * 110) * sc, height: (24 + choreo.rippleP * 110) * sc, borderRadius: "50%", border: `${4 * sc}px solid ${accent}`, opacity: choreo.rippleOpacity.toFixed(2), transform: "translate(-50%, -50%)" }} />
          ) : null}
          <Pointer x={choreo.x - 8} y={choreo.y - 3} press={choreo.press} sc={sc} />
        </div>
      );
    }
    case "cursor-subscribe": {
      const choreo = cursorChoreoAt(localMs, dur, { x: 36, y: 282 }, { x: 336, y: 112 });
      const labelNow = ph.acted ? line(ls, 1, "Subscribed") : line(ls, 0, "Subscribe");
      return (
        <div style={{ ...root, position: "relative", width: 560 * sc, height: 300 * sc }}>
          <span style={{ position: "absolute", left: "50%", top: 58 * sc, transform: "translateX(-50%)" }}>
            {pill(ph.acted, labelNow, 320)}
          </span>
          {choreo.rippleP > 0 ? (
            <span style={{ position: "absolute", left: 336 * sc, top: 112 * sc, width: (24 + choreo.rippleP * 110) * sc, height: (24 + choreo.rippleP * 110) * sc, borderRadius: "50%", border: `${4 * sc}px solid ${accent}`, opacity: choreo.rippleOpacity.toFixed(2), transform: "translate(-50%, -50%)" }} />
          ) : null}
          <Pointer x={choreo.x - 8} y={choreo.y - 3} press={choreo.press} sc={sc} />
        </div>
      );
    }
    case "cursor-like": {
      const choreo = cursorChoreoAt(localMs, dur, { x: 486, y: 284 }, { x: 178, y: 148 });
      const start = parseInt((ls[0] ?? "128").replace(/[^0-9]/g, ""), 10);
      const count = Number.isFinite(start) ? start + (ph.acted ? 1 : 0) : 0;
      return (
        <div style={{ ...root, position: "relative", width: 520 * sc, height: 300 * sc }}>
          <span style={{ position: "absolute", left: 108 * sc, top: 78 * sc, display: "block", transform: `scale(${((0.6 + 0.4 * springOut(ph.enterT)) * (1 + choreo.press * 0.1)).toFixed(3)})` }}>
            <HeartPath color={accent} filled={ph.acted} size={140 * sc} />
          </span>
          <span style={{ position: "absolute", left: 286 * sc, top: 118 * sc, fontWeight: 800, fontSize: 52 * sc }}>{count.toLocaleString("en-US")}</span>
          {choreo.rippleP > 0 ? (
            <span style={{ position: "absolute", left: 178 * sc, top: 148 * sc, width: (30 + choreo.rippleP * 150) * sc, height: (30 + choreo.rippleP * 150) * sc, borderRadius: "50%", border: `${4 * sc}px solid ${accent}`, opacity: choreo.rippleOpacity.toFixed(2), transform: "translate(-50%, -50%)" }} />
          ) : null}
          <Pointer x={choreo.x - 8} y={choreo.y - 3} press={choreo.press} sc={sc} />
        </div>
      );
    }
    case "share-pop": {
      const sf = shareFlightAt(localMs, dur, parseInt((ls[1] ?? "248").replace(/[^0-9]/g, ""), 10) || 0);
      const plane = (size: number, opacity: number) => (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block", opacity }}>
          <path d="M8 52 L92 12 L58 88 L44 56 Z" fill={accent} />
          <path d="M44 56 L92 12" stroke={CARD_BG} strokeWidth={4} />
        </svg>
      );
      return (
        <div style={{ ...root, ...card, position: "relative", display: "flex", alignItems: "center", gap: 16 * sc, width: 560 * sc, overflow: "visible" }}>
          {avatar(72)}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 30 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Creator Name")}</span>
            <span style={{ display: "block", fontSize: 25 * sc, opacity: 0.8 }}>{sf.count.toLocaleString("en-US")} shares</span>
          </span>
          <span style={{ position: "relative", width: 76 * sc, height: 76 * sc, borderRadius: "50%", backgroundColor: shade(accent, 0.4), display: "grid", placeItems: "center", transform: `scale(${(1 + Math.sin(Math.min(1, Math.max(0, ph.act)) * Math.PI) * 0.12).toFixed(3)})` }}>
            {plane(42 * sc, sf.p > 0 ? 0.35 : 1)}
          </span>
          {sf.p > 0 ? (
            <span style={{ position: "absolute", right: 30 * sc, top: 6 * sc, transform: `translate(${(sf.x * sc).toFixed(1)}px, ${(sf.y * sc).toFixed(1)}px) rotate(${sf.rot.toFixed(1)}deg)` }}>
              {plane(46 * sc, sf.opacity)}
            </span>
          ) : null}
        </div>
      );
    }
    case "save-pop": {
      const popScale = (0.55 + 0.45 * springOut(ph.enterT)) * (1 + 0.16 * Math.sin(Math.min(1, Math.max(0, ph.act)) * Math.PI));
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * sc, width: 360 * sc }}>
          <span style={{ display: "block", transform: `scale(${popScale.toFixed(3)})` }}>
            <svg width={120 * sc} height={150 * sc} viewBox="0 0 100 124" aria-hidden style={{ display: "block" }}>
              <path d="M22 8 L78 8 L78 116 L50 92 L22 116 Z" fill={ph.acted ? accent : "none"} stroke={accent} strokeWidth={7} strokeLinejoin="round" />
            </svg>
          </span>
          <span style={{ fontWeight: 800, fontSize: 32 * sc, opacity: ph.act, transform: `translateY(${((1 - ph.act) * 14 * sc).toFixed(1)}px)` }}>{line(ls, 0, "Saved")}</span>
        </div>
      );
    }
    case "follow-plus": {
      const actStart = dur * 0.3 + Math.max(120, dur * 0.24);
      const ringP = ph.acted ? ((localMs - actStart) % 1500) / 1500 : 0;
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * sc, width: 340 * sc }}>
          <span style={{ position: "relative", width: 168 * sc, height: 168 * sc, display: "block" }}>
            {ph.acted ? <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${4 * sc}px solid ${accent}`, opacity: (1 - ringP).toFixed(2), transform: `scale(${(1 + ringP * 0.3).toFixed(3)})` }} /> : null}
            <span style={{ position: "absolute", left: 9 * sc, top: 9 * sc }}>{avatar(150)}</span>
            <span style={{ position: "absolute", right: 2 * sc, bottom: 2 * sc, width: 56 * sc, height: 56 * sc, borderRadius: "50%", backgroundColor: accent, display: "grid", placeItems: "center", border: `${4 * sc}px solid ${CARD_BG}`, transform: `scale(${(ph.acted ? 1 + 0.18 * Math.sin(Math.min(1, ph.act) * Math.PI) : 1).toFixed(3)})` }}>
              {ph.acted ? <Check color="#141412" size={30 * sc} /> : (
                <svg width={28 * sc} height={28 * sc} viewBox="0 0 100 100" aria-hidden><path d="M50 18 V82 M18 50 H82" stroke="#141412" strokeWidth={13} strokeLinecap="round" /></svg>
              )}
            </span>
          </span>
          <span style={{ fontWeight: 800, fontSize: 31 * sc }}>{line(ls, 0, "Creator Name")}</span>
          <span style={{ fontSize: 25 * sc, opacity: 0.75, marginTop: -8 * sc }}>{line(ls, 1, "@handle")}</span>
        </div>
      );
    }
    case "gift-pop": {
      const lidP = ph.act;
      const pb = particleBurstAt(Math.max(0, localMs - dur * 0.4), dur * 0.6, seedOf(item.id) + 5, 10);
      return (
        <div style={{ ...root, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * sc, width: 400 * sc }}>
          <span style={{ position: "relative", display: "block", width: 190 * sc, height: 190 * sc }}>
            {ph.acted ? pb.dots.map((d) => <span key={d.i} style={{ position: "absolute", left: 95 * sc + d.x * sc * 0.8, top: 80 * sc + d.y * sc * 0.8, width: d.r * sc, height: d.r * sc, borderRadius: "50%", backgroundColor: accent, opacity: (d.opacity * 0.9).toFixed(2) }} />) : null}
            <span style={{ position: "absolute", left: 10 * sc, top: 6 * sc, width: 170 * sc, height: 38 * sc, borderRadius: 10 * sc, backgroundColor: accent, transform: `translateY(${(-lidP * 40 * sc).toFixed(1)}px) rotate(${(-lidP * 13).toFixed(2)}deg)`, transformOrigin: "left bottom", opacity: (1 - lidP * 0.25).toFixed(2), boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }} />
            <span style={{ position: "absolute", left: 20 * sc, top: 44 * sc, width: 150 * sc, height: 118 * sc, borderRadius: 12 * sc, backgroundColor: shade(accent, 0.62) }}>
              <span style={{ position: "absolute", left: "50%", top: 0, width: 26 * sc, height: "100%", transform: "translateX(-50%)", backgroundColor: accent }} />
            </span>
            <span style={{ position: "absolute", left: 10 * sc, top: 38 * sc, width: 170 * sc, height: 12 * sc, backgroundColor: accent, opacity: 0.9 }} />
          </span>
          <span style={{ fontWeight: 800, fontSize: 31 * sc }}>{line(ls, 0, "Thanks for the gift!")}</span>
        </div>
      );
    }
    case "bell-reminder": {
      const actStart = dur * 0.3 + Math.max(120, dur * 0.24);
      const ringMs = localMs - actStart;
      const deg = ringMs > 0 ? bellRingDeg(ringMs) : 0;
      const arcs = ringMs > 0 ? Math.max(0, Math.exp(-ringMs / 320)) : 0;
      return (
        <div style={{ ...root, ...card, display: "flex", alignItems: "center", gap: 18 * sc, width: 600 * sc }}>
          <span style={{ width: 92 * sc, height: 92 * sc, borderRadius: "50%", backgroundColor: shade(accent, 0.4), display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Bell color={accent} size={58 * sc} deg={deg} arcs={arcs} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 31 * sc }}>{line(ls, 0, "Turn on notifications")}</span>
            <span style={{ display: "block", fontSize: 25 * sc, opacity: 0.78 }}>{line(ls, 1, "Never miss a new video")}</span>
          </span>
        </div>
      );
    }
    case "watch-next": {
      const slideX = (1 - ph.enter) * 80 * sc;
      return (
        <div style={{ ...root, ...card, position: "relative", width: 620 * sc, overflow: "hidden", transform: `translateX(${slideX.toFixed(1)}px) translateY(${enterY.toFixed(1)}px)`, padding: 0 }}>
          <span style={{ display: "flex", gap: 16 * sc, padding: `${16 * sc}px ${18 * sc}px ${22 * sc}px` }}>
            <span style={{ position: "relative", width: 196 * sc, height: 122 * sc, borderRadius: 12 * sc, backgroundColor: shade(accent, 0.45), flexShrink: 0, display: "grid", placeItems: "center" }}>
              <svg width={52 * sc} height={52 * sc} viewBox="0 0 100 100" aria-hidden><circle cx={50} cy={50} r={46} fill="rgba(20,20,18,0.55)" /><polygon points="40,32 72,50 40,68" fill={CARD_FG} /></svg>
              <span style={{ position: "absolute", right: 8 * sc, bottom: 8 * sc, backgroundColor: "rgba(20,20,18,0.8)", color: CARD_FG, fontSize: 19 * sc, fontWeight: 700, padding: `${2 * sc}px ${7 * sc}px`, borderRadius: 6 * sc }}>12:48</span>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 20 * sc, fontWeight: 800, letterSpacing: 2, color: accent }}>UP NEXT</span>
              <span style={{ display: "block", fontWeight: 800, fontSize: 29 * sc, lineHeight: 1.25, marginTop: 4 * sc }}>{line(ls, 0, "How to Edit Videos — full guide")}</span>
              <span style={{ display: "block", fontSize: 24 * sc, opacity: 0.75, marginTop: 4 * sc }}>{line(ls, 1, "Your Channel")}</span>
            </span>
          </span>
          <span style={{ position: "absolute", left: 0, bottom: 0, height: 7 * sc, width: `${(ph.t * 100).toFixed(1)}%`, backgroundColor: accent }} />
        </div>
      );
    }
    case "chat-ticks": {
      const ticks = chatTicksAt(localMs, dur);
      const tickColor = ticks.stage === 2 ? accent : "#9A9A94";
      const tickSvg = (
        <svg width={40 * sc} height={24 * sc} viewBox="0 0 100 60" aria-hidden style={{ display: "block" }}>
          <path d="M8 34 L26 50 L52 16" fill="none" stroke={tickColor} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          {ticks.stage >= 1 ? <path d="M40 34 L58 50 L84 16" fill="none" stroke={tickColor} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" /> : null}
        </svg>
      );
      const bubble = (text: string, withTicks: boolean, i: number) => {
        const p = easeOutQuint(clamp01((localMs - i * 260) / 320));
        return (
          <span key={i} style={{ alignSelf: "flex-end", maxWidth: "80%", opacity: p, transform: `translateY(${((1 - p) * 14 * sc).toFixed(1)}px)` }}>
            <span style={{ display: "block", backgroundColor: accent, color: "#141412", borderRadius: 22 * sc, padding: `${13 * sc}px ${18 * sc}px`, fontSize: 27 * sc, fontWeight: 600, lineHeight: 1.3, boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>{text}</span>
            {withTicks ? <span style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 * sc, paddingRight: 6 * sc }}>{tickSvg}</span> : null}
          </span>
        );
      };
      const texts = ls.filter(Boolean).slice(0, 2);
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", gap: 10 * sc, width: 520 * sc }}>
          {texts.map((t, i) => bubble(t, i === texts.length - 1, i))}
        </div>
      );
    }
    case "dm-typing": {
      const switchMs = dur * 0.52;
      const typing = localMs < switchMs;
      const msgP = springOut(clamp01((localMs - switchMs) / 320));
      return (
        <div style={{ ...root, ...card, width: 560 * sc }}>
          <span style={{ display: "flex", gap: 14 * sc, alignItems: "center", marginBottom: 14 * sc }}>
            {avatar(58)}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 29 * sc }}>{line(ls, 0, "Alex")}</span>
              <span style={{ display: "block", fontSize: 22 * sc, color: accent }}>{typing ? "typing…" : "active now"}</span>
            </span>
          </span>
          <span style={{ display: "flex", minHeight: 74 * sc, alignItems: "flex-start" }}>
            {typing ? (
              <span style={{ backgroundColor: "#2A2A27", borderRadius: 22 * sc, padding: `${16 * sc}px ${20 * sc}px`, display: "flex", gap: 8 * sc }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 12 * sc, height: 12 * sc, borderRadius: "50%", backgroundColor: CARD_FG, opacity: (0.35 + 0.65 * Math.abs(Math.sin(localMs / 300 - i * 0.9))).toFixed(2) }} />
                ))}
              </span>
            ) : (
              <span style={{ backgroundColor: "#2A2A27", borderRadius: 22 * sc, padding: `${14 * sc}px ${18 * sc}px`, fontSize: 27 * sc, lineHeight: 1.3, maxWidth: "88%", opacity: clamp01(msgP), transform: `scale(${(0.7 + 0.3 * msgP).toFixed(3)})`, transformOrigin: "left top" }}>{line(ls, 1, "That edit is exactly what I needed!")}</span>
            )}
          </span>
        </div>
      );
    }
    case "lower-third-bar": {
      const slideX = (1 - ph.enter) * -90 * sc;
      return (
        <div style={{ ...root, position: "relative", width: 700 * sc, height: 104 * sc, transform: `translateX(${slideX.toFixed(1)}px)`, opacity: ph.enter * (1 - ph.exit) }}>
          <span style={{ position: "absolute", left: 0, top: 0, height: 6 * sc, width: `${(ph.enter * 100).toFixed(1)}%`, backgroundColor: accent, borderRadius: 3 }} />
          <span style={{ position: "absolute", left: 0, top: 12 * sc, right: 0, height: 92 * sc, backgroundColor: CARD_BG, borderRadius: 14 * sc, boxShadow: "0 10px 30px rgba(0,0,0,0.42)", display: "flex", alignItems: "center", gap: 18 * sc, padding: `0 ${24 * sc}px` }}>
            <span style={{ width: 10 * sc, height: 56 * sc, backgroundColor: accent, borderRadius: 4, transform: `scaleY(${ph.enter.toFixed(3)})`, flexShrink: 0 }} />
            <span style={{ fontWeight: 900, fontSize: 36 * sc, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line(ls, 0, "Creator Name")}</span>
            <span style={{ marginLeft: "auto", fontSize: 27 * sc, fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>{line(ls, 1, "Video Editor")}</span>
          </span>
        </div>
      );
    }
    case "logo-mark": {
      const sweep = easeInOutCubic(clamp01(ph.t * 1.5));
      const C = 2 * Math.PI * 84;
      const letterP = springOut(clamp01((localMs - dur * 0.16) / (dur * 0.3)));
      const brand = line(ls, 0, "YOUR BRAND");
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * sc, width: 440 * sc }}>
          <span style={{ position: "relative", width: 196 * sc, height: 196 * sc, display: "block" }}>
            <svg width={196 * sc} height={196 * sc} viewBox="0 0 196 196" aria-hidden style={{ position: "absolute", inset: 0 }}>
              <circle cx={98} cy={98} r={84} fill="none" stroke={`${accent}33`} strokeWidth={7} />
              <circle cx={98} cy={98} r={84} fill="none" stroke={accent} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${(C * sweep).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 98 98)" />
            </svg>
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 88 * sc, color: accent, transform: `scale(${letterP.toFixed(3)})`, opacity: clamp01(letterP) }}>{brand.trim().charAt(0).toUpperCase() || "B"}</span>
          </span>
          <span style={{ fontWeight: 800, fontSize: 33 * sc, letterSpacing: 4, opacity: clamp01((ph.t - 0.42) / 0.25) }}>{brand}</span>
        </div>
      );
    }
    case "type-title": {
      const title = line(ls, 0, "WATCH THIS FIRST");
      const tp = typingAt(localMs, dur, title.length);
      const underlineP = easeOutQuint(clamp01((localMs - dur * 0.72) / (dur * 0.2)));
      return (
        <div style={{ ...root, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * sc, width: 680 * sc }}>
          <span style={{ fontWeight: 900, fontSize: 74 * sc, lineHeight: 1.08, textAlign: "center", minHeight: 84 * sc }}>
            {title.slice(0, tp.chars)}
            <span style={{ display: "inline-block", width: 4 * sc, height: "0.92em", marginLeft: 3 * sc, verticalAlign: "-0.08em", backgroundColor: accent, opacity: tp.caretOn ? 1 : 0 }} />
          </span>
          <span style={{ height: 8 * sc, width: 380 * sc, borderRadius: 4, backgroundColor: accent, transform: `scaleX(${underlineP.toFixed(3)})` }} />
        </div>
      );
    }
    case "countdown-pop": {
      const cd = countdownAt(localMs, dur);
      const C = 2 * Math.PI * 128;
      const isWord = cd.step >= 3;
      return (
        <div style={{ ...root, position: "relative", width: 330 * sc, height: 330 * sc, display: "grid", placeItems: "center" }}>
          <svg width={300 * sc} height={300 * sc} viewBox="0 0 300 300" aria-hidden style={{ position: "absolute" }}>
            <circle cx={150} cy={150} r={128} fill="none" stroke={`${accent}2E`} strokeWidth={10} />
            <circle cx={150} cy={150} r={128} fill="none" stroke={accent} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${(C * (1 - cd.ringP)).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 150 150)" opacity={isWord ? 0 : 1} />
          </svg>
          <span style={{ fontWeight: 900, fontSize: (isWord ? 96 : 158) * sc, lineHeight: 1, color: isWord ? accent : CARD_FG, transform: `scale(${cd.p.toFixed(3)})`, opacity: clamp01(cd.p * 1.6) }}>{isWord ? line(ls, 0, "GO!") : cd.label}</span>
        </div>
      );
    }
    default:
      return null;
  }
};
