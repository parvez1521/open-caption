import React from "react";
import type { OverlayItem, OverlaySocialVariant } from "@capseasy/shared";

/**
 * The 300 NEW motion graphics (2026-11-18, Studio panels revision): the owner's
 * correction — "graphics tune motion studio waale hi kyu daal diye, mujhe naye
 * chahiye the, 300 naye bana or daal" — so NONE of these reuse a MOTION_TEMPLATES
 * entry. Every id is `ng-<family>-<variant>`, new to the shared variant enum.
 *
 * Architecture (the transitions precedent: 10 bases x 10 parameterizations = 100):
 * 15 families x 20 parameterizations = 300 entries. Each entry is DATA — one of 15
 * parameterized bases plus a params object — and ONE generic renderer below
 * (NewGraphicsView) draws it. Distinct parameterization = distinct entry: within a
 * family every entry differs from every other by at least one STATIC structural
 * param (layout / shape / direction / count / label position), never by timing
 * alone, so each renders visibly differently in preview AND export.
 *
 * Render path (the exact Motion Pack path, nothing new invented): the panel adds a
 * kind:"social" item with the entry id via makeSocialOverlay (SOCIAL_META carries
 * these 300 through NEW_GRAPHICS_META, spread into it in social.tsx); OverlayView
 * hands it to SocialOverlayView, which delegates `ng-*` ids to NewGraphicsView
 * here. Preview, in-browser MP4 export and server renders all draw the same frame:
 * every animation is a pure function of (localMs, durationMs, text, color) — no
 * timers, no Math.random, only the seeded hash below. Plain divs/SVG, no assets,
 * no blend modes, so the drawing carries in every render path.
 *
 * Customization: the item's `text` carries the editable lines (split on "\n", per
 * entry maxLines) and `color` is the one accent colour; position, scale, rotation,
 * opacity, duration and entrance/exit come from the shared OverlayEditor, exactly
 * as for Motion Studio graphics (getMotionTemplate returns undefined for these
 * ids, so the editor shows its plain text + colour fields — see OverlayEditor).
 *
 * This file is SELF-CONTAINED on purpose: it must not import from ./social
 * (social.tsx imports this file for the dispatch, so an import back would be a
 * cycle). The phase math below mirrors social.tsx's overlayPhase/eases formula
 * for formula — same curves, same windows — so new graphics move like the rest.
 */

/* ---------------------------------- phases ---------------------------------- */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ngEaseOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
const ngEaseOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const ngEaseInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const ngSpringOut = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

/** Mirror of social.tsx's overlayPhase: enter ~18% (120–400 ms), exit last ~15%, act ~42%. */
export interface NgPhases { enter: number; enterT: number; exit: number; act: number; acted: boolean; t: number }
export function ngPhase(localMs: number, durationMs: number): NgPhases {
  const dur = Math.max(1, durationMs);
  const enterMs = Math.min(400, Math.max(120, dur * 0.18));
  const exitMs = Math.max(1, dur * 0.15);
  const actStart = dur * 0.3;
  const actDur = Math.max(120, dur * 0.24);
  const enterT = clamp01(localMs / enterMs);
  return {
    enter: ngEaseOutQuint(enterT),
    enterT,
    exit: ngEaseInOutCubic(clamp01((localMs - (dur - exitMs)) / exitMs)),
    act: ngEaseOutCubic(clamp01((localMs - actStart) / actDur)),
    acted: localMs >= actStart + actDur * 0.55,
    t: clamp01(localMs / dur),
  };
}

/** Deterministic hash -> [0,1), same construction as social.tsx's socialSeededUnit. */
export function ngSeededUnit(seed: number): number {
  let h = Math.floor(Math.abs(seed)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const seedOf = (id: string) => [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);

/**
 * The "still alive" micro-motion: every base breathes its accent element on this
 * slow sine, so no graphic ever reads as a frozen still mid-clip — and so the
 * renderer's frame at 350 ms always differs from its frame at 2650 ms (the
 * compositions picker guard requires an animating graphic, not a still).
 */
const aliveOp = (localMs: number) => 0.9 + 0.1 * Math.sin(localMs / 260);
const aliveScale = (localMs: number) => 1 + 0.03 * Math.sin(localMs / 300);

/* --------------------------------- constants -------------------------------- */

const FONT = "'Plus Jakarta Sans', 'Segoe UI', sans-serif";
const CARD_BG = "#1C1C1A";
const CARD_FG = "#FFFFEB";
const INK = "#141412";
const EMERALD = "#34D399";
const ORANGE = "#FFA946";

/** mix a #rrggbb colour toward black (f<1 darker) — same formula as social.tsx's shade. */
export function ngShade(hex: string, f: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

const linesOf = (item: OverlayItem): string[] => (item.text ?? "").split("\n").map((s) => s.trim());
const ngLine = (ls: string[], i: number, dflt: string) => (ls[i] && ls[i].length ? ls[i]! : dflt);
const parseNum = (s: string | undefined, dflt: number) => {
  const n = parseFloat((s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : dflt;
};

/* ------------------------------ house-drawn glyphs --------------------------- */
/* Our own simple geometric SVGs (no icon library, no copied assets). */

const NgStar: React.FC<{ color: string; filled: boolean; size: number }> = ({ color, filled, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <polygon points="50,8 62,38 92,39 68,58 77,87 50,70 23,87 32,58 8,39 38,38" fill={filled ? color : "none"} stroke={color} strokeWidth={5} strokeLinejoin="round" />
  </svg>
);
const NgHeart: React.FC<{ color: string; filled: boolean; size: number }> = ({ color, filled, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <path d="M50 84 C26 66 14 52 14 37 C14 24 23 15 35 15 C43 15 48 19 50 25 C52 19 57 15 65 15 C77 15 86 24 86 37 C86 52 74 66 50 84 Z" fill={filled ? color : "none"} stroke={color} strokeWidth={6} />
  </svg>
);
const NgBolt: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <polygon fill={color} points="56,6 24,54 44,54 40,94 76,44 54,44" />
  </svg>
);
const NgCheck: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "inline-block", verticalAlign: "-0.12em" }}>
    <path d="M21 53 L41 73 L79 28" fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const NgBell: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <path d="M50 16 C38 16 31 26 31 40 C31 52 27 58 22 63 L78 63 C73 58 69 52 69 40 C69 26 62 16 50 16 Z" fill={color} />
    <circle cx={50} cy={72} r={7} fill={color} />
  </svg>
);
const NgPlay: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <polygon fill={color} points="38,22 82,50 38,78" />
  </svg>
);
const NgTag: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <path fill={color} d="M14 14 H56 L88 46 L46 88 L14 56 Z" />
    <circle cx={32} cy={32} r={7} fill={INK} />
  </svg>
);
const NgPlus: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
    <path d="M50 16 V84 M16 50 H84" fill="none" stroke={color} strokeWidth={11} strokeLinecap="round" />
  </svg>
);

/* ----------------------------------- types ---------------------------------- */

export type NewGraphicBase =
  | "lowerThird" | "callout" | "cta" | "progress" | "counter"
  | "textReveal" | "quote" | "rating" | "badge" | "arrow"
  | "frame" | "wipe" | "countdown" | "poll" | "chatBubble";

/** Flat params: each base reads only its own keys (defaults where absent). */
export interface NewGraphicParams {
  layout?: string; tail?: string; shape?: string; style?: string; icon?: string;
  kind?: string; format?: string; motion?: string; direction?: string; count?: number;
  mode?: string; side?: string; deco?: string; labelPos?: string; accentSide?: string;
  size?: string; withLabel?: boolean; pattern?: string; mark?: string;
}

export interface NewGraphicEntry {
  id: OverlaySocialVariant;
  title: string;
  family: string;
  base: NewGraphicBase;
  params: NewGraphicParams;
  defaultText: string;
  defaultColor: string;
  defaultDurationMs: number;
  maxLines: number;
  hint: string;
}

export interface NewGraphicFamily { id: string; title: string; ids: string[] }

interface NgCtx {
  entry: NewGraphicEntry;
  ls: string[];
  accent: string;
  sc: number;
  localMs: number;
  dur: number;
  ph: NgPhases;
  seed: number;
}

/* ------------------------------ base: lower third ---------------------------- */
/* Name + role lines. `layout` picks the composition, `accentSide` mirrors it. */

function renderLowerThird(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const layout = c.entry.params.layout ?? "bar-left";
  const flip = (c.entry.params.accentSide ?? "left") === "right";
  const name = ngLine(ls, 0, "Creator Name");
  const role = ngLine(ls, 1, "Video Editor");
  const slideX = (1 - ph.enter) * 44 * sc;
  const nameEl = <span style={{ display: "block", fontWeight: 800, fontSize: 36 * sc, lineHeight: 1.1, whiteSpace: "nowrap" }}>{name}</span>;
  const roleEl = <span style={{ display: "block", fontSize: 26 * sc, opacity: 0.75, whiteSpace: "nowrap" }}>{role}</span>;
  const barV = <span style={{ width: 10 * sc, alignSelf: "stretch", backgroundColor: accent, borderRadius: 5 * sc, opacity: aliveOp(c.localMs) }} />;
  const barH = (w: number) => <span style={{ display: "block", width: w * sc, height: 8 * sc, backgroundColor: accent, borderRadius: 4 * sc, opacity: aliveOp(c.localMs) }} />;
  const textCol = (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 * sc, textAlign: flip && layout !== "split" ? "right" : "left", alignItems: flip && layout !== "split" ? "flex-end" : "flex-start" }}>
      {nameEl}{roleEl}
    </span>
  );
  const inner: React.ReactNode = (() => {
    switch (layout) {
      case "bar-top": return <span style={{ display: "flex", flexDirection: "column", gap: 10 * sc, alignItems: flip ? "flex-end" : "flex-start" }}>{barH(150)}{textCol}</span>;
      case "underline": return <span style={{ display: "flex", flexDirection: "column", gap: 6 * sc, alignItems: flip ? "flex-end" : "flex-start" }}>{nameEl}{barH(130)}{roleEl}</span>;
      case "boxed": return (
        <span style={{ display: "flex", gap: 16 * sc, backgroundColor: CARD_BG, borderRadius: 18 * sc, padding: `${16 * sc}px ${22 * sc}px`, boxShadow: "0 10px 34px rgba(0,0,0,0.42)", flexDirection: flip ? "row-reverse" : "row" }}>
          {barV}{textCol}
        </span>
      );
      case "pill": return (
        <span style={{ display: "flex", alignItems: "center", gap: 12 * sc, backgroundColor: CARD_BG, borderRadius: 999, padding: `${14 * sc}px ${26 * sc}px`, boxShadow: "0 10px 34px rgba(0,0,0,0.42)", flexDirection: flip ? "row-reverse" : "row" }}>
          <span style={{ width: 16 * sc, height: 16 * sc, borderRadius: "50%", backgroundColor: accent, opacity: aliveOp(c.localMs), flexShrink: 0 }} />
          <span style={{ fontWeight: 800, fontSize: 32 * sc, whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ fontSize: 26 * sc, opacity: 0.75, whiteSpace: "nowrap" }}>· {role}</span>
        </span>
      );
      case "split": return (
        <span style={{ display: "flex", alignItems: "center", gap: 18 * sc, flexDirection: flip ? "row-reverse" : "row" }}>
          <span style={{ fontWeight: 800, fontSize: 38 * sc, whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ width: 3 * sc, height: 52 * sc, backgroundColor: accent, opacity: aliveOp(c.localMs) }} />
          <span style={{ fontSize: 28 * sc, opacity: 0.85, whiteSpace: "nowrap" }}>{role}</span>
        </span>
      );
      case "corner": return (
        <span style={{ position: "relative", display: "block", padding: `${14 * sc}px ${20 * sc}px` }}>
          <span style={{ position: "absolute", left: 0, top: 0, width: 34 * sc, height: 34 * sc, borderLeft: `${5 * sc}px solid ${accent}`, borderTop: `${5 * sc}px solid ${accent}`, opacity: aliveOp(c.localMs) }} />
          <span style={{ position: "absolute", right: 0, bottom: 0, width: 34 * sc, height: 34 * sc, borderRight: `${5 * sc}px solid ${accent}`, borderBottom: `${5 * sc}px solid ${accent}`, opacity: aliveOp(c.localMs) }} />
          {textCol}
        </span>
      );
      case "full-bar": return (
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 * sc, width: 640 * sc, backgroundColor: CARD_BG, borderTop: `${6 * sc}px solid ${accent}`, padding: `${16 * sc}px ${24 * sc}px`, flexDirection: flip ? "row-reverse" : "row" }}>
          <span style={{ fontWeight: 800, fontSize: 34 * sc, whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ fontSize: 26 * sc, opacity: 0.75, whiteSpace: "nowrap" }}>{role}</span>
        </span>
      );
      case "outline": return (
        <span style={{ display: "flex", gap: 16 * sc, border: `${3 * sc}px solid ${accent}`, borderRadius: 18 * sc, padding: `${14 * sc}px ${22 * sc}px`, flexDirection: flip ? "row-reverse" : "row" }}>
          {barV}{textCol}
        </span>
      );
      case "stacked": return (
        <span style={{ display: "flex", flexDirection: "column", gap: 6 * sc, alignItems: flip ? "flex-end" : "flex-start" }}>
          <span style={{ backgroundColor: accent, color: INK, fontWeight: 800, fontSize: 34 * sc, padding: `${8 * sc}px ${18 * sc}px`, borderRadius: 8 * sc, whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ backgroundColor: CARD_BG, fontSize: 26 * sc, padding: `${8 * sc}px ${18 * sc}px`, borderRadius: 8 * sc, whiteSpace: "nowrap" }}>{role}</span>
        </span>
      );
      default: // bar-left
        return (
          <span style={{ display: "flex", gap: 16 * sc, flexDirection: flip ? "row-reverse" : "row" }}>
            {barV}{textCol}
          </span>
        );
    }
  })();
  return (
    <div style={{ display: "flex", transform: `translateX(${flip ? -slideX : slideX}px)` }}>
      {inner}
    </div>
  );
}

/* -------------------------------- base: callout ------------------------------ */
/* Bubble + pointer tail. `shape` picks the bubble, `tail` picks the side. */

function renderCallout(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const shape = c.entry.params.shape ?? "rounded";
  const tail = c.entry.params.tail ?? "left";
  const text = ngLine(ls, 0, "Watch this part");
  const pop = 0.7 + 0.3 * ngSpringOut(ph.enterT);
  const radius = shape === "pill" ? 999 : shape === "square" ? 6 : shape === "tag" ? 10 : 26;
  const tailSize = 22 * sc;
  const tailEl = (
    <span style={{
      position: "absolute", width: tailSize, height: tailSize, backgroundColor: CARD_BG,
      transform: "rotate(45deg)",
      ...(tail === "left" ? { left: -tailSize / 2, top: "50%", marginTop: -tailSize / 2 } : {}),
      ...(tail === "right" ? { right: -tailSize / 2, top: "50%", marginTop: -tailSize / 2 } : {}),
      ...(tail === "top" ? { top: -tailSize / 2, left: "50%", marginLeft: -tailSize / 2 } : {}),
      ...(tail === "bottom" ? { bottom: -tailSize / 2, left: "50%", marginLeft: -tailSize / 2 } : {}),
      opacity: aliveOp(c.localMs),
    }} />
  );
  const bubble = (
    <span style={{
      position: "relative", display: "inline-block", backgroundColor: CARD_BG, color: CARD_FG,
      borderRadius: radius * sc, padding: `${16 * sc}px ${24 * sc}px`, fontWeight: 700, fontSize: 30 * sc,
      boxShadow: "0 10px 34px rgba(0,0,0,0.42)", whiteSpace: "nowrap",
      ...(shape === "tag" ? { borderLeft: `${8 * sc}px solid ${accent}` } : { border: `${2 * sc}px solid ${accent}` }),
    }}>
      {tailEl}
      {text}
    </span>
  );
  const dots = shape === "thought" ? [0, 1].map((i) => (
    <span key={i} style={{
      position: "absolute", borderRadius: "50%", backgroundColor: CARD_BG,
      width: (18 - i * 6) * sc, height: (18 - i * 6) * sc,
      ...(tail === "left" ? { left: -(30 + i * 22) * sc, top: `${58 + i * 12}%` } : {}),
      ...(tail === "right" ? { right: -(30 + i * 22) * sc, top: `${58 + i * 12}%` } : {}),
      ...(tail === "top" ? { top: -(30 + i * 22) * sc, left: `${58 + i * 12}%` } : {}),
      ...(tail === "bottom" ? { bottom: -(30 + i * 22) * sc, left: `${58 + i * 12}%` } : {}),
    }} />
  )) : null;
  return (
    <div style={{ position: "relative", transform: `scale(${pop.toFixed(3)})` }}>
      {shape === "thought" ? dots : null}
      {bubble}
    </div>
  );
}

/* ---------------------------------- base: cta -------------------------------- */
/* Button pill that flips to its second label on the act beat. `style` solid / */
/* outline, `icon` picks the house-drawn glyph at the pill's left. */

function ctaIcon(icon: string, color: string, size: number): React.ReactNode {
  switch (icon) {
    case "bell": return <NgBell color={color} size={size} />;
    case "plus": return <NgPlus color={color} size={size} />;
    case "check": return <NgCheck color={color} size={size} />;
    case "star": return <NgStar color={color} filled size={size} />;
    case "play": return <NgPlay color={color} size={size} />;
    case "tag": return <NgTag color={color} size={size} />;
    case "heart": return <NgHeart color={color} filled size={size} />;
    case "bolt": return <NgBolt color={color} size={size} />;
    case "download": return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
        <path d="M50 12 V66 M30 48 L50 68 L70 48" fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 82 H82" fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
      </svg>
    );
    case "calendar": return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
        <rect x={14} y={20} width={72} height={66} rx={10} fill="none" stroke={color} strokeWidth={7} />
        <path d="M14 40 H86 M32 12 V28 M68 12 V28" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      </svg>
    );
    default: // arrow-right
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
          <path d="M14 50 H78 M60 30 L80 50 L60 70" fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function renderCta(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const style = c.entry.params.style ?? "solid";
  const icon = c.entry.params.icon ?? "arrow";
  const flipped = ph.acted;
  const labelNow = flipped ? ngLine(ls, 1, "Done") : ngLine(ls, 0, "Get started");
  const press = Math.sin(Math.min(1, Math.max(0, ph.act)) * Math.PI);
  const solid = style === "solid";
  const bg = solid ? (flipped ? ngShade(accent, 0.45) : accent) : flipped ? accent : "transparent";
  const fg = solid ? (flipped ? CARD_FG : INK) : flipped ? INK : accent;
  const border = solid ? "none" : `${3 * sc}px solid ${accent}`;
  return (
    <div style={{ transform: `scale(${(1 - press * 0.08).toFixed(3)})` }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 10 * sc, padding: `${14 * sc}px ${30 * sc}px`,
        borderRadius: 999, backgroundColor: bg, color: fg, border, fontWeight: 800, fontSize: 30 * sc,
        whiteSpace: "nowrap", boxShadow: solid ? "0 10px 34px rgba(0,0,0,0.42)" : "none",
      }}>
        {flipped ? <NgCheck color={fg} size={26 * sc} /> : ctaIcon(icon, fg, 28 * sc)}
        {labelNow}
      </span>
    </div>
  );
}

/* ------------------------------- base: progress ------------------------------ */
/* Fill 0 → 100% across the item's own window. `kind` picks the track geometry, */
/* `labelPos` picks where the caption + percent sit. */

function renderProgress(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const kind = c.entry.params.kind ?? "bar-left";
  const labelPos = c.entry.params.labelPos ?? "above";
  const p = ph.t;
  const pct = `${Math.round(p * 100)}%`;
  const caption = ngLine(ls, 0, "Loading the good part");
  const track: React.CSSProperties = { backgroundColor: CARD_BG, borderRadius: 999, overflow: "hidden", position: "relative" };
  const bar = (h: number, extra?: React.CSSProperties) => (
    <span style={{ display: "block", width: 560 * sc, ...track, height: h * sc, ...extra }}>
      <span style={{ position: "absolute", top: 0, bottom: 0, left: kind === "bar-right" ? undefined : 0, right: kind === "bar-right" ? 0 : undefined, width: `${(p * 100).toFixed(1)}%`, backgroundColor: accent }} />
    </span>
  );
  const captionRow = (
    <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: 560 * sc, fontSize: 26 * sc }}>
      <span style={{ fontWeight: 700 }}>{caption}</span>
      <span style={{ fontWeight: 800, color: accent, opacity: aliveOp(c.localMs) }}>{pct}</span>
    </span>
  );
  const stack = (kids: React.ReactNode) => (
    <span style={{ display: "flex", flexDirection: "column", gap: 10 * sc, alignItems: labelPos === "inside" ? "stretch" : "flex-start" }}>{kids}</span>
  );
  switch (kind) {
    case "bar-right": return stack(<>{labelPos === "below" ? null : captionRow}{bar(20)}{labelPos === "below" ? captionRow : null}</>);
    case "bar-center": return stack(<>{captionRow}
      <span style={{ display: "block", width: 560 * sc, ...track, height: 20 * sc }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, left: `${(50 - p * 50).toFixed(1)}%`, width: `${(p * 100).toFixed(1)}%`, backgroundColor: accent }} />
      </span></>);
    case "bar-knob": return stack(<>{captionRow}
      <span style={{ display: "block", width: 560 * sc, position: "relative", height: 20 * sc }}>
        <span style={{ display: "block", ...track, height: 20 * sc }}><span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${(p * 100).toFixed(1)}%`, backgroundColor: accent }} /></span>
        <span style={{ position: "absolute", left: `calc(${(p * 100).toFixed(1)}% - ${14 * sc}px)`, top: -4 * sc, width: 28 * sc, height: 28 * sc, borderRadius: "50%", backgroundColor: accent, border: `${4 * sc}px solid ${CARD_FG}` }} />
      </span></>);
    case "bar-label-above": return stack(<>{captionRow}{bar(20)}</>);
    case "bar-label-inside": return stack(<>
      <span style={{ display: "block", width: 560 * sc, ...track, height: 34 * sc }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${(p * 100).toFixed(1)}%`, backgroundColor: accent }} />
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 * sc }}>{pct} · {caption}</span>
      </span></>);
    case "bar-thin": return stack(<>{captionRow}{bar(8)}</>);
    case "bar-thick": return stack(<>{captionRow}{bar(48, { borderRadius: 12 * sc })}</>);
    case "ring":
    case "ring-thick": {
      const thick = kind === "ring-thick";
      const r = 78;
      const circ = 2 * Math.PI * r;
      return (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * sc }}>
          <span style={{ position: "relative", width: 200 * sc, height: 200 * sc }}>
            <svg width={200 * sc} height={200 * sc} viewBox="0 0 200 200" aria-hidden style={{ display: "block", transform: "rotate(-90deg)" }}>
              <circle cx={100} cy={100} r={r} fill="none" stroke={CARD_BG} strokeWidth={thick ? 24 : 12} />
              <circle cx={100} cy={100} r={r} fill="none" stroke={accent} strokeWidth={thick ? 24 : 12} strokeLinecap="round" strokeDasharray={circ.toFixed(1)} strokeDashoffset={(circ * (1 - p)).toFixed(1)} />
            </svg>
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 40 * sc, opacity: aliveOp(c.localMs) }}>{pct}</span>
          </span>
          <span style={{ fontWeight: 700, fontSize: 26 * sc }}>{caption}</span>
        </span>
      );
    }
    case "ring-dots": {
      const lit = Math.round(p * 12);
      return (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * sc }}>
          <span style={{ position: "relative", width: 200 * sc, height: 200 * sc }}>
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
              return <span key={i} style={{ position: "absolute", left: 100 * sc + Math.cos(a) * 82 * sc - 9 * sc, top: 100 * sc + Math.sin(a) * 82 * sc - 9 * sc, width: 18 * sc, height: 18 * sc, borderRadius: "50%", backgroundColor: i < lit ? accent : CARD_BG, opacity: i < lit ? aliveOp(c.localMs) : 1 }} />;
            })}
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 36 * sc }}>{lit}/12</span>
          </span>
          <span style={{ fontWeight: 700, fontSize: 26 * sc }}>{caption}</span>
        </span>
      );
    }
    case "seg-5":
    case "seg-10": {
      const n = kind === "seg-5" ? 5 : 10;
      const lit = Math.floor(p * n);
      return stack(<>{captionRow}
        <span style={{ display: "flex", gap: 8 * sc, width: 560 * sc }}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 26 * sc, borderRadius: 6 * sc, backgroundColor: i < lit ? accent : CARD_BG, opacity: i < lit ? aliveOp(c.localMs) : 1 }} />
          ))}
        </span></>);
    }
    case "steps": {
      const n = 4;
      const lit = Math.floor(p * n);
      return stack(<>{captionRow}
        <span style={{ display: "flex", gap: 10 * sc, width: 560 * sc }}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 54 * sc, borderRadius: 10 * sc, backgroundColor: i < lit ? accent : CARD_BG, color: i < lit ? INK : CARD_FG, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26 * sc }}>{i + 1}</span>
          ))}
        </span></>);
    }
    case "dots": {
      const n = 10;
      const lit = Math.round(p * n);
      return stack(<>{captionRow}
        <span style={{ display: "flex", gap: 12 * sc, justifyContent: "center", width: 560 * sc }}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} style={{ width: 20 * sc, height: 20 * sc, borderRadius: "50%", backgroundColor: i < lit ? accent : CARD_BG, opacity: i < lit ? aliveOp(c.localMs) : 1 }} />
          ))}
        </span></>);
    }
    case "vertical-up":
    case "vertical-down": {
      const up = kind === "vertical-up";
      return (
        <span style={{ display: "flex", gap: 16 * sc, alignItems: "center" }}>
          <span style={{ display: "block", width: 30 * sc, height: 220 * sc, ...track, borderRadius: 999 }}>
            <span style={{ position: "absolute", left: 0, right: 0, bottom: up ? 0 : undefined, top: up ? undefined : 0, height: `${(p * 100).toFixed(1)}%`, backgroundColor: accent }} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 * sc }}>
            <span style={{ fontWeight: 800, fontSize: 44 * sc, color: accent, opacity: aliveOp(c.localMs) }}>{pct}</span>
            <span style={{ fontWeight: 700, fontSize: 26 * sc }}>{caption}</span>
          </span>
        </span>
      );
    }
    case "dual": return stack(<>{captionRow}{bar(20)}
      <span style={{ display: "block", width: 560 * sc, ...track, height: 8 * sc }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${(p * 0.6 * 100).toFixed(1)}%`, backgroundColor: ngShade(accent, 0.6) }} />
      </span></>);
    case "bar-check": return stack(<>{captionRow}
      <span style={{ display: "flex", alignItems: "center", gap: 14 * sc, width: 560 * sc }}>
        <span style={{ flex: 1 }}>{bar(20)}</span>
        <span style={{ width: 40 * sc, height: 40 * sc, borderRadius: "50%", border: `${4 * sc}px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {p >= 1 ? <NgCheck color={accent} size={26 * sc} /> : null}
        </span>
      </span></>);
    case "bar-flag": return stack(<>{captionRow}
      <span style={{ display: "block", width: 560 * sc, position: "relative", height: 20 * sc }}>
        <span style={{ display: "block", ...track, height: 20 * sc }}><span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${(p * 100).toFixed(1)}%`, backgroundColor: accent }} /></span>
        <span style={{ position: "absolute", left: "75%", top: -16 * sc, width: 3 * sc, height: 36 * sc, backgroundColor: CARD_FG }} />
        <span style={{ position: "absolute", left: "75%", top: -16 * sc, width: 0, height: 0, borderLeft: `${16 * sc}px solid ${accent}`, borderTop: `${9 * sc}px solid transparent`, borderBottom: `${9 * sc}px solid transparent` }} />
      </span></>);
    default: // bar-left
      return stack(<>{labelPos === "below" ? null : captionRow}{bar(20)}{labelPos === "below" ? captionRow : null}</>);
  }
}

/* ------------------------------- base: counter ------------------------------- */
/* Number runs from line 0 to line 1; `format` picks the display, `labelPos` */
/* picks where line 2 (the label) sits. */

function renderCounter(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const format = c.entry.params.format ?? "plain";
  const labelPos = c.entry.params.labelPos ?? "below";
  const from = parseNum(ls[0], 0);
  const to = parseNum(ls[1], 100);
  const label = ngLine(ls, 2, "");
  const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const p = easeOutExpo(clamp01(c.localMs / (c.dur * 0.82)));
  const value = from + (to - from) * p;
  const shown = (() => {
    switch (format) {
      case "comma": return Math.round(value).toLocaleString("en-US");
      case "k": return `${(value / 1000).toFixed(1)}K`;
      case "m": return `${(value / 1000000).toFixed(2)}M`;
      case "pct": return `${Math.round(value)}%`;
      case "usd": return `$${Math.round(value).toLocaleString("en-US")}`;
      case "decimal1": return value.toFixed(1);
      case "mmss": { const s = Math.max(0, Math.round(value)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
      case "plus": return `+${Math.round(value).toLocaleString("en-US")}`;
      case "usdk": return `$${(value / 1000).toFixed(1)}K`;
      default: return String(Math.round(value));
    }
  })();
  const num = (
    <span style={{ fontWeight: 800, fontSize: 88 * sc, lineHeight: 1, color: accent, transform: `scale(${aliveScale(c.localMs).toFixed(3)})`, display: "block" }}>{shown}</span>
  );
  const lab = label ? <span style={{ fontWeight: 700, fontSize: 28 * sc, opacity: 0.85 }}>{label}</span> : null;
  void ph;
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 * sc, textAlign: "center" }}>
      {labelPos === "above" ? lab : null}
      {num}
      {labelPos === "below" ? lab : null}
    </span>
  );
}

/* ----------------------------- base: text reveal ----------------------------- */
/* Big title, one motion per entry. `motion` picks the entrance, `deco` adds one */
/* static accent so the settled frame stays distinct per entry. */

function renderTextReveal(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const motion = c.entry.params.motion ?? "slide-up";
  const deco = c.entry.params.deco ?? "none";
  const text = ngLine(ls, 0, "WATCH THIS FIRST");
  const e = ph.enter;
  const t = ph.t;
  const spring = ngSpringOut(ph.enterT);
  const baseStyle: React.CSSProperties = { fontWeight: 800, fontSize: 64 * sc, lineHeight: 1.05, textAlign: "center", whiteSpace: "pre-wrap" };
  let style: React.CSSProperties = { ...baseStyle, opacity: e };
  let node: React.ReactNode = text;
  switch (motion) {
    case "slide-left": style = { ...style, transform: `translateX(${((1 - e) * -60).toFixed(1)}px)` }; break;
    case "slide-right": style = { ...style, transform: `translateX(${((1 - e) * 60).toFixed(1)}px)` }; break;
    case "fade": break;
    case "pop": style = { ...style, transform: `scale(${(0.6 + 0.4 * spring).toFixed(3)})` }; break;
    case "blur-in": style = { ...style, filter: `blur(${((1 - e) * 10).toFixed(1)}px)` }; break;
    case "typewriter": {
      const len = text.length;
      const p = clamp01((c.localMs - c.dur * 0.12) / (c.dur * 0.55));
      const chars = Math.min(len, Math.floor(p * len));
      node = <>{text.slice(0, chars)}<span style={{ opacity: c.localMs % 1060 < 620 ? 1 : 0, color: accent }}>|</span></>;
      style = { ...style, opacity: 1 };
      break;
    }
    case "glitch": {
      const step = Math.floor(Math.max(0, c.localMs) / 120);
      const active = ngSeededUnit(step * 7 + 3) > 0.45;
      const x = active ? (ngSeededUnit(step * 13 + 1) - 0.5) * 18 : 0;
      const y = active ? (ngSeededUnit(step * 17 + 5) - 0.5) * 8 : 0;
      node = (
        <span style={{ position: "relative", display: "inline-block" }}>
          <span style={{ position: "absolute", left: 0, top: 0, color: "#FF4D2E", transform: `translate(${(-x).toFixed(1)}px, ${(-y).toFixed(1)}px)`, opacity: active ? 0.7 : 0 }}>{text}</span>
          <span style={{ position: "absolute", left: 0, top: 0, color: "#38BDF8", transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, opacity: active ? 0.7 : 0 }}>{text}</span>
          <span style={{ position: "relative" }}>{text}</span>
        </span>
      );
      style = { ...style, opacity: 1 };
      break;
    }
    case "underline-sweep": node = <>{text}<span style={{ display: "block", height: 8 * sc, width: `${(t * 100).toFixed(1)}%`, backgroundColor: accent, borderRadius: 4 * sc, marginTop: 8 * sc, opacity: aliveOp(c.localMs) }} /></>; break;
    case "word-stagger": {
      const words = text.split(" ");
      node = <>{words.map((w, i) => {
        const start = (i * c.dur * 0.6) / Math.max(1, words.length);
        const wp = ngSpringOut(clamp01((c.localMs - start) / 300));
        return <span key={i} style={{ display: "inline-block", transform: `scale(${(0.6 + 0.4 * wp).toFixed(3)})`, opacity: clamp01(wp), marginRight: i < words.length - 1 ? `${14 * sc}px` : 0 }}>{w}</span>;
      })}</>;
      style = { ...style, opacity: 1 };
      break;
    }
    case "highlight-sweep": style = { ...style, backgroundColor: accent, color: INK, padding: `0 ${16 * sc}px`, boxShadow: `${(1 - t) * 0}px 0 0 ${accent}` };
      node = <span style={{ backgroundColor: accent, color: INK, padding: `${4 * sc}px ${16 * sc}px`, boxDecorationBreak: "clone" as const, WebkitBoxDecorationBreak: "clone" as const }}>{text}</span>;
      style = { ...style, opacity: e };
      break;
    case "outline-fill": node = (
      <span style={{ position: "relative", display: "inline-block" }}>
        <span style={{ color: "transparent", WebkitTextStroke: `${2 * sc}px ${accent}` }}>{text}</span>
        <span style={{ position: "absolute", left: 0, top: 0, overflow: "hidden", width: `${(t * 100).toFixed(1)}%`, whiteSpace: "nowrap", color: accent }}>{text}</span>
      </span>
    );
      style = { ...style, opacity: e };
      break;
    case "scale-up": style = { ...style, transform: `scale(${(0.7 + 0.35 * spring).toFixed(3)})` }; break;
    case "flip": style = { ...style, transform: `perspective(600px) rotateX(${((1 - e) * -70).toFixed(1)}deg)` }; break;
    case "rise-rotate": style = { ...style, transform: `translateY(${((1 - e) * 36).toFixed(1)}px) rotate(${((1 - e) * -4).toFixed(2)}deg)` }; break;
    case "wipe-left": style = { ...style, clipPath: `inset(0 ${((1 - t) * 100).toFixed(1)}% 0 0)`, opacity: 1 }; break;
    case "wipe-up": style = { ...style, clipPath: `inset(${((1 - t) * 100).toFixed(1)}% 0 0 0)`, opacity: 1 }; break;
    case "spacing-expand": style = { ...style, letterSpacing: `${((1 - e) * 0.4 + 0.02).toFixed(3)}em` }; break;
    case "bounce": style = { ...style, transform: `translateY(${((1 - spring) * -46).toFixed(1)}px) scaleY(${(0.75 + 0.25 * spring).toFixed(3)})` }; break;
    case "drop-in": style = { ...style, transform: `translateY(${((1 - e) * -90).toFixed(1)}px)` }; break;
    default: // slide-up
      style = { ...style, transform: `translateY(${((1 - e) * 40).toFixed(1)}px)` };
  }
  const textEl = <span style={style}>{node}</span>;
  const decoEl: React.ReactNode = (() => {
    const rule = (w: number, h: number, border?: string) => <span style={{ display: "block", width: w * sc, height: h * sc, backgroundColor: border ? "transparent" : accent, borderTop: border, opacity: aliveOp(c.localMs) }} />;
    switch (deco) {
      case "underline-solid": return rule(220, 6);
      case "underline-dashed": return rule(220, 0, `${5 * sc}px dashed ${accent}`);
      case "underline-double": return <span style={{ display: "block", width: 220 * sc, borderTop: `${4 * sc}px double ${accent}`, height: 8 * sc, opacity: aliveOp(c.localMs) }} />;
      case "underline-thick": return rule(220, 12);
      case "bar-left": return <span style={{ position: "absolute", left: -26 * sc, top: 0, bottom: 0, width: 8 * sc, backgroundColor: accent, borderRadius: 4 * sc, opacity: aliveOp(c.localMs) }} />;
      case "bar-right": return <span style={{ position: "absolute", right: -26 * sc, top: 0, bottom: 0, width: 8 * sc, backgroundColor: accent, borderRadius: 4 * sc, opacity: aliveOp(c.localMs) }} />;
      case "bar-top": return rule(220, 8);
      case "bar-bottom": return rule(220, 8);
      case "highlight": return null; // motion highlight-sweep owns the highlight; deco stays empty
      case "outline-text": return null;
      case "caps-spacing": return null;
      case "shadow": return null;
      case "corner-tick": return <span style={{ position: "absolute", left: -18 * sc, top: -10 * sc, width: 30 * sc, height: 30 * sc, borderLeft: `${5 * sc}px solid ${accent}`, borderTop: `${5 * sc}px solid ${accent}`, opacity: aliveOp(c.localMs) }} />;
      case "side-brackets": return (
        <>
          <span style={{ position: "absolute", left: -30 * sc, top: "50%", transform: "translateY(-50%)", color: accent, fontSize: 64 * sc, fontWeight: 800 }}>[</span>
          <span style={{ position: "absolute", right: -30 * sc, top: "50%", transform: "translateY(-50%)", color: accent, fontSize: 64 * sc, fontWeight: 800 }}>]</span>
        </>
      );
      case "pill-bg": return null;
      case "small-caps": return null;
      case "accent-dot": return <span style={{ display: "inline-block", width: 16 * sc, height: 16 * sc, borderRadius: "50%", backgroundColor: accent, marginLeft: 14 * sc, verticalAlign: "middle", opacity: aliveOp(c.localMs) }} />;
      case "end-arrow": return <span style={{ display: "inline-block", color: accent, fontSize: 56 * sc, fontWeight: 800, marginLeft: 14 * sc, verticalAlign: "middle" }}>→</span>;
      case "top-rule": return rule(220, 6);
      default: return null;
    }
  })();
  const wrapStyle: React.CSSProperties = { ...baseStyle };
  if (deco === "outline-text") wrapStyle.color = "transparent";
  if (deco === "outline-text") (wrapStyle as Record<string, string>).WebkitTextStroke = `${2 * sc}px ${accent}`;
  if (deco === "caps-spacing") { wrapStyle.letterSpacing = "0.18em"; wrapStyle.textTransform = "uppercase"; }
  if (deco === "shadow") wrapStyle.textShadow = `${4 * sc}px ${4 * sc}px 0 ${ngShade(accent, 0.5)}`;
  if (deco === "small-caps") wrapStyle.fontVariant = "small-caps";
  if (deco === "pill-bg") { wrapStyle.backgroundColor = CARD_BG; wrapStyle.borderRadius = 999; wrapStyle.padding = `${10 * sc}px ${26 * sc}px`; }
  if (deco === "highlight") { wrapStyle.backgroundColor = accent; wrapStyle.color = INK; wrapStyle.padding = `${4 * sc}px ${16 * sc}px`; }
  const isBarTop = deco === "bar-top" || deco === "top-rule";
  const isBarBottom = deco === "bar-bottom" || deco.startsWith("underline");
  const isSideDeco = deco === "bar-left" || deco === "bar-right" || deco === "corner-tick" || deco === "side-brackets";
  const isInlineDeco = deco === "accent-dot" || deco === "end-arrow";
  return (
    <span style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10 * sc, maxWidth: 640 * sc, ...wrapStyle }}>
      {isBarTop ? decoEl : null}
      <span style={{ position: "relative", display: "inline-block" }}>
        {isSideDeco ? decoEl : null}
        {textEl}
        {isInlineDeco ? decoEl : null}
      </span>
      {isBarBottom ? decoEl : null}
      {deco === "pill-bg" ? null : null}
    </span>
  );
}

/* -------------------------------- base: quote -------------------------------- */
/* Quote + attribution. `layout` picks the composition, `mark` picks glyph/bar. */

function renderQuote(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const layout = c.entry.params.layout ?? "card";
  const mark = c.entry.params.mark ?? "glyph";
  const quote = ngLine(ls, 0, "Say it in their words");
  const attrib = ngLine(ls, 1, "— Alex");
  const pop = 0.8 + 0.2 * ngSpringOut(ph.enterT);
  const glyph = <span style={{ display: "block", fontSize: 96 * sc, lineHeight: 0.6, color: accent, opacity: aliveOp(c.localMs), fontWeight: 800 }}>“</span>;
  const bar = <span style={{ display: "block", width: 90 * sc, height: 8 * sc, backgroundColor: accent, borderRadius: 4 * sc, opacity: aliveOp(c.localMs) }} />;
  const markEl = mark === "glyph" ? glyph : bar;
  const qText = <span style={{ display: "block", fontWeight: 700, fontSize: 32 * sc, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>{quote}</span>;
  const aText = <span style={{ display: "block", fontSize: 26 * sc, opacity: 0.8 }}>{attrib}</span>;
  const body = (align: "left" | "center"): React.ReactNode => (
    <span style={{ display: "flex", flexDirection: "column", gap: 10 * sc, textAlign: align, alignItems: align === "center" ? "center" : "flex-start", maxWidth: 560 * sc }}>
      {markEl}{qText}{aText}
    </span>
  );
  const inner: React.ReactNode = (() => {
    switch (layout) {
      case "minimal": return mark === "bar"
        ? <span style={{ display: "flex", flexDirection: "column", gap: 8 * sc, maxWidth: 560 * sc }}><span style={{ display: "block", fontSize: 26 * sc, opacity: 0.8 }}>{attrib}</span>{qText}</span>
        : <span style={{ display: "flex", flexDirection: "column", gap: 8 * sc, maxWidth: 560 * sc }}>{qText}<span style={{ display: "block", fontSize: 26 * sc, opacity: 0.8 }}>— {attrib.replace(/^—\s*/, "")}</span></span>;
      case "banner": return mark === "bar" ? (
        <span style={{ display: "flex", flexDirection: "column", gap: 8 * sc, width: 640 * sc, backgroundColor: CARD_BG, borderRight: `${8 * sc}px solid ${accent}`, padding: `${18 * sc}px ${24 * sc}px`, textAlign: "right", alignItems: "flex-end" }}>
          {qText}{aText}
        </span>
      ) : (
        <span style={{ display: "flex", flexDirection: "column", gap: 8 * sc, width: 640 * sc, backgroundColor: CARD_BG, borderLeft: `${8 * sc}px solid ${accent}`, padding: `${18 * sc}px ${24 * sc}px` }}>
          {qText}{aText}
        </span>
      );
      case "side-bar": return mark === "bar" ? (
        <span style={{ display: "flex", gap: 18 * sc, maxWidth: 600 * sc, flexDirection: "row-reverse" }}>
          <span style={{ width: 10 * sc, backgroundColor: accent, borderRadius: 5 * sc, opacity: aliveOp(c.localMs), flexShrink: 0 }} />
          <span style={{ display: "flex", flexDirection: "column", gap: 8 * sc, textAlign: "right" }}>{qText}{aText}</span>
        </span>
      ) : (
        <span style={{ display: "flex", gap: 18 * sc, maxWidth: 600 * sc }}>
          <span style={{ width: 10 * sc, backgroundColor: accent, borderRadius: 5 * sc, opacity: aliveOp(c.localMs), flexShrink: 0 }} />
          <span style={{ display: "flex", flexDirection: "column", gap: 8 * sc }}>{qText}{aText}</span>
        </span>
      );
      case "centered": return body("center");
      case "corner-mark": return (
        <span style={{ position: "relative", display: "block", maxWidth: 560 * sc, paddingTop: 30 * sc }}>
          <span style={{ position: "absolute", right: 0, top: -20 * sc }}>{markEl}</span>
          {qText}<span style={{ display: "block", marginTop: 10 * sc }}>{aText}</span>
        </span>
      );
      case "underline": return mark === "bar"
        ? <span style={{ display: "flex", flexDirection: "column", gap: 10 * sc, maxWidth: 560 * sc }}><span style={{ display: "block", width: 130 * sc, height: 7 * sc, backgroundColor: accent, borderRadius: 4 * sc, opacity: aliveOp(c.localMs) }} />{qText}{aText}</span>
        : <span style={{ display: "flex", flexDirection: "column", gap: 10 * sc, maxWidth: 560 * sc }}>{qText}<span style={{ display: "block", width: 130 * sc, height: 7 * sc, backgroundColor: accent, borderRadius: 4 * sc, opacity: aliveOp(c.localMs) }} />{aText}</span>;
      case "boxed": return (
        <span style={{ display: "block", maxWidth: 600 * sc, border: `${3 * sc}px solid ${accent}`, borderRadius: 20 * sc, padding: `${20 * sc}px ${24 * sc}px` }}>
          {markEl}{qText}<span style={{ display: "block", marginTop: 10 * sc }}>{aText}</span>
        </span>
      );
      case "split": return mark === "bar" ? (
        <span style={{ display: "flex", alignItems: "center", gap: 20 * sc, maxWidth: 640 * sc, flexDirection: "row-reverse" }}>
          <span style={{ flex: 1 }}>{qText}</span>
          <span style={{ width: 3 * sc, height: 70 * sc, backgroundColor: accent, opacity: aliveOp(c.localMs) }} />
          <span style={{ fontSize: 26 * sc, fontWeight: 700, whiteSpace: "nowrap" }}>{attrib}</span>
        </span>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: 20 * sc, maxWidth: 640 * sc }}>
          <span style={{ flex: 1 }}>{qText}</span>
          <span style={{ width: 3 * sc, height: 70 * sc, backgroundColor: accent, opacity: aliveOp(c.localMs) }} />
          <span style={{ fontSize: 26 * sc, fontWeight: 700, whiteSpace: "nowrap" }}>{attrib}</span>
        </span>
      );
      case "large-mark": return (
        <span style={{ display: "flex", gap: 10 * sc, maxWidth: 620 * sc, alignItems: "flex-start" }}>
          <span style={{ fontSize: 150 * sc, lineHeight: 0.7, color: accent, fontWeight: 800, opacity: aliveOp(c.localMs), flexShrink: 0 }}>{mark === "glyph" ? "“" : "❘"}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 8 * sc }}>{qText}{aText}</span>
        </span>
      );
      default: // card
        return (
          <span style={{ display: "block", maxWidth: 600 * sc, backgroundColor: CARD_BG, borderRadius: 22 * sc, padding: `${20 * sc}px ${26 * sc}px`, boxShadow: "0 10px 34px rgba(0,0,0,0.42)" }}>
            {markEl}{qText}<span style={{ display: "block", marginTop: 10 * sc, textAlign: "right" }}>{aText}</span>
          </span>
        );
    }
  })();
  return <div style={{ transform: `scale(${pop.toFixed(3)})` }}>{inner}</div>;
}

/* ------------------------------- base: rating -------------------------------- */
/* Marks fill one by one. `shape` picks the mark, `count` how many, `labelPos` */
/* where line 0 sits; `badge` adds a big number at the left. */

function renderRating(c: NgCtx): React.ReactNode {
  const { ls, accent, sc } = c;
  const shape = c.entry.params.shape ?? "star";
  const count = Math.max(1, Math.min(5, c.entry.params.count ?? 5));
  const labelPos = c.entry.params.labelPos ?? "below";
  const badge = c.entry.params.style === "badge";
  const label = ngLine(ls, 0, "5 out of 5");
  const stars = Array.from({ length: count }, (_, i) => {
    const start = c.dur * (0.12 + i * 0.13);
    const p = ngSpringOut(clamp01((c.localMs - start) / 300));
    const filled = p >= 1;
    const size = 64 * sc;
    const mark = shape === "heart" ? <NgHeart color={accent} filled={filled} size={size} />
      : shape === "bolt" ? <NgBolt color={accent} size={size} />
      : <NgStar color={accent} filled={filled} size={size} />;
    return (
      <span key={i} style={{ transform: `scale(${(0.7 + 0.3 * p).toFixed(3)})`, display: "block", opacity: clamp01(p) }}>
        {mark}
      </span>
    );
  });
  const row = (
    <span style={{ display: "flex", gap: 10 * sc, alignItems: "center", justifyContent: "center" }}>
      {badge ? <span style={{ fontWeight: 800, fontSize: 72 * sc, color: accent, opacity: aliveOp(c.localMs), marginRight: 6 * sc }}>{ngLine(ls, 1, "4.9")}</span> : null}
      {stars}
    </span>
  );
  const lab = <span style={{ fontWeight: 800, fontSize: 32 * sc, textAlign: "center" }}>{label}</span>;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 12 * sc, alignItems: "center" }}>
      {labelPos === "above" ? lab : null}
      {row}
      {labelPos === "below" ? lab : null}
    </span>
  );
}

/* -------------------------------- base: badge -------------------------------- */
/* Short label in a shaped seal. `shape` picks the outline, `size` the scale, */
/* `motion` the behaviour; `tilt` rotates the whole seal. */

function renderBadge(c: NgCtx): React.ReactNode {
  const { ls, accent, sc } = c;
  const shape = c.entry.params.shape ?? "seal";
  const size = c.entry.params.size ?? "lg";
  const motion = c.entry.params.motion ?? "pop";
  const tilt = c.entry.params.style === "tilt" ? -8 : 0;
  const text = ngLine(ls, 0, "NEW");
  const big = size === "lg";
  const fs = big ? 34 : 24;
  const pad = big ? 26 : 18;
  let transform = "";
  if (motion === "spin") transform = `rotate(${((c.localMs % 12000) / 12000) * 360}deg)`;
  else if (motion === "pulse") transform = `scale(${aliveScale(c.localMs).toFixed(3)})`;
  else if (motion === "swing") transform = `rotate(${(Math.sin(c.localMs / 420) * 5).toFixed(2)}deg)`;
  else transform = `scale(${(0.7 + 0.3 * ngSpringOut(c.ph.enterT)).toFixed(3)})`;
  if (tilt) transform += ` rotate(${tilt}deg)`;
  const labelEl = <span style={{ fontWeight: 800, fontSize: fs * sc, whiteSpace: "nowrap" }}>{text}</span>;
  const inner: React.ReactNode = (() => {
    switch (shape) {
      case "burst": return (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: (big ? 220 : 160) * sc, height: (big ? 220 : 160) * sc, color: INK }}>
          <svg width={(big ? 220 : 160) * sc} height={(big ? 220 : 160) * sc} viewBox="0 0 100 100" aria-hidden style={{ position: "absolute", inset: 0 }}>
            <polygon fill={accent} points="96,50 75.1,56.7 89.8,73 68.4,68.4 73,89.8 56.7,75.1 50,96 43.3,75.1 27,89.8 31.6,68.4 10.2,73 24.9,56.7 4,50 24.9,43.3 10.2,27 31.6,31.6 27,10.2 43.3,24.9 50,4 56.7,24.9 73,10.2 68.4,31.6 89.8,27 75.1,43.3" />
          </svg>
          <span style={{ position: "relative" }}>{labelEl}</span>
        </span>
      );
      case "ribbon": return (
        <span style={{ position: "relative", display: "inline-block", backgroundColor: accent, color: INK, padding: `${12 * sc}px ${34 * sc}px`, fontWeight: 800, fontSize: fs * sc, whiteSpace: "nowrap" }}>
          <span style={{ position: "absolute", left: -14 * sc, top: 0, borderTop: `${22 * sc}px solid transparent`, borderBottom: `${22 * sc}px solid transparent`, borderRight: `${14 * sc}px solid ${ngShade(accent, 0.6)}` }} />
          <span style={{ position: "absolute", right: -14 * sc, top: 0, borderTop: `${22 * sc}px solid transparent`, borderBottom: `${22 * sc}px solid transparent`, borderLeft: `${14 * sc}px solid ${ngShade(accent, 0.6)}` }} />
          {text}
        </span>
      );
      case "tag": return (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 10 * sc, backgroundColor: accent, color: INK, padding: `${12 * sc}px ${24 * sc}px ${12 * sc}px ${30 * sc}px`, fontWeight: 800, fontSize: fs * sc, whiteSpace: "nowrap", clipPath: "polygon(14% 0, 100% 0, 100% 100%, 14% 100%, 0 50%)" }}>
          {text}
        </span>
      );
      case "shield": return (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: (big ? 190 : 140) * sc, height: (big ? 210 : 155) * sc }}>
          <svg width={(big ? 190 : 140) * sc} height={(big ? 210 : 155) * sc} viewBox="0 0 100 110" aria-hidden style={{ position: "absolute", inset: 0 }}>
            <path d="M50 4 L92 18 V58 Q92 88 50 106 Q8 88 8 58 V18 Z" fill={accent} />
          </svg>
          <span style={{ position: "relative", color: INK }}>{labelEl}</span>
        </span>
      );
      case "pill": return (
        <span style={{ display: "inline-block", backgroundColor: CARD_BG, color: accent, border: `${3 * sc}px solid ${accent}`, borderRadius: 999, padding: `${10 * sc}px ${pad * sc}px`, fontWeight: 800, fontSize: fs * sc, whiteSpace: "nowrap" }}>
          {text}
        </span>
      );
      case "corner": return (
        <span style={{ position: "relative", display: "inline-block", width: (big ? 190 : 140) * sc, height: (big ? 190 : 140) * sc }}>
          <span style={{ position: "absolute", inset: 0, backgroundColor: accent, clipPath: "polygon(100% 0, 100% 100%, 0 0)", opacity: aliveOp(c.localMs) }} />
          <span style={{ position: "absolute", right: 16 * sc, top: 26 * sc, color: INK, fontWeight: 800, fontSize: fs * sc, transform: "rotate(45deg)", transformOrigin: "center", whiteSpace: "nowrap" }}>{text}</span>
        </span>
      );
      case "hexagon": return (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: (big ? 210 : 150) * sc, height: (big ? 190 : 135) * sc }}>
          <svg width={(big ? 210 : 150) * sc} height={(big ? 190 : 135) * sc} viewBox="0 0 100 92" aria-hidden style={{ position: "absolute", inset: 0 }}>
            <polygon fill={accent} points="50,2 96,26 96,66 50,90 4,66 4,26" />
          </svg>
          <span style={{ position: "relative", color: INK }}>{labelEl}</span>
        </span>
      );
      default: // seal
        return (
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: (big ? 200 : 150) * sc, height: (big ? 200 : 150) * sc }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", backgroundColor: accent }} />
            <span style={{ position: "absolute", inset: 10 * sc, borderRadius: "50%", border: `${3 * sc}px dashed ${CARD_FG}`, opacity: aliveOp(c.localMs) }} />
            <span style={{ position: "relative", color: INK }}>{labelEl}</span>
          </span>
        );
    }
  })();
  return <div style={{ transform }}>{inner}</div>;
}

/* -------------------------------- base: arrow -------------------------------- */
/* Pointer arrow. `direction` rotates the drawing, `style` picks the shaft. */

const ARROW_DEG: Record<string, number> = {
  right: 0, "down-right": 45, down: 90, "down-left": 135,
  left: 180, "up-left": 225, up: 270, "up-right": 315,
};

function renderArrow(c: NgCtx): React.ReactNode {
  const { ls, accent, sc } = c;
  const direction = c.entry.params.direction ?? "right";
  const style = c.entry.params.style ?? "straight";
  const label = ngLine(ls, 0, "Look here");
  const deg = ARROW_DEG[direction] ?? 0;
  const nudge = Math.sin(c.localMs / 300) * 8;
  const rad = (deg * Math.PI) / 180;
  const dx = Math.cos(rad) * nudge;
  const dy = Math.sin(rad) * nudge;
  const shaft = style === "thick" ? 14 : style === "dashed" ? 9 : 9;
  const dash = style === "dashed" ? `${16} ${12}` : undefined;
  const arrowSvg = (() => {
    if (style === "curved") return (
      <svg width={300 * sc} height={300 * sc} viewBox="0 0 300 300" aria-hidden style={{ display: "block" }}>
        <path d="M40 220 Q 90 80 210 110" fill="none" stroke={accent} strokeWidth={shaft * sc} strokeLinecap="round" strokeDasharray={dash} />
        <path d="M178 88 L216 108 L186 140" fill="none" stroke={accent} strokeWidth={shaft * sc} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    if (style === "double") return (
      <svg width={300 * sc} height={300 * sc} viewBox="0 0 300 300" aria-hidden style={{ display: "block" }}>
        <path d="M70 70 L170 150 L70 230" fill="none" stroke={accent} strokeWidth={shaft * sc} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M140 70 L240 150 L140 230" fill="none" stroke={accent} strokeWidth={shaft * sc} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    if (style === "chevron") return (
      <svg width={300 * sc} height={300 * sc} viewBox="0 0 300 300" aria-hidden style={{ display: "block" }}>
        <path d="M90 60 L210 150 L90 240" fill="none" stroke={accent} strokeWidth={shaft * sc} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    return (
      <svg width={300 * sc} height={300 * sc} viewBox="0 0 300 300" aria-hidden style={{ display: "block" }}>
        <path d="M40 150 H225" fill="none" stroke={accent} strokeWidth={shaft * sc} strokeLinecap="round" strokeDasharray={dash} />
        <path d="M180 105 L230 150 L180 195" fill="none" stroke={accent} strokeWidth={shaft * sc} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  })();
  const labelAbove = direction === "down" || direction === "down-left" || direction === "down-right";
  const lab = label ? <span style={{ fontWeight: 700, fontSize: 28 * sc, textAlign: "center" }}>{label}</span> : null;
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 * sc }}>
      {labelAbove ? lab : null}
      <span style={{ display: "block", transform: `rotate(${deg}deg) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`, opacity: aliveOp(c.localMs) }}>
        {arrowSvg}
      </span>
      {labelAbove ? null : lab}
    </span>
  );
}

/* -------------------------------- base: frame -------------------------------- */
/* A framing rectangle around a label. `style` picks the border, `motion` the */
/* behaviour, `thick` the stroke weight, `withLabel` hides the label line. */

function renderFrame(c: NgCtx): React.ReactNode {
  const { ls, accent, sc, ph } = c;
  const style = c.entry.params.style ?? "corners";
  const motion = c.entry.params.motion ?? "draw";
  const thick = c.entry.params.size === "thick";
  const withLabel = c.entry.params.withLabel !== false;
  const label = ngLine(ls, 0, "Focus here");
  const w = thick ? 10 : 6;
  const draw = motion === "draw" ? 0.85 + 0.15 * ph.enter : 1;
  const sweepX = motion === "sweep" ? ph.t * 100 : null;
  // the accent always breathes (aliveOp), whatever the motion: a "static" frame
  // still reads as a living graphic mid-clip, and its 350 ms frame always
  // differs from its 2650 ms frame (the compositions picker guard requires it)
  const op = aliveOp(c.localMs);
  const box: React.CSSProperties = { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 640 * sc, height: 300 * sc, transform: `scale(${draw.toFixed(3)})` };
  const lab = withLabel ? <span style={{ fontWeight: 700, fontSize: 30 * sc, textAlign: "center", padding: `${0}px ${24 * sc}px` }}>{label}</span> : null;
  const corner = (pos: React.CSSProperties) => <span style={{ position: "absolute", width: 56 * sc, height: 56 * sc, opacity: op, ...pos }} />;
  const inner: React.ReactNode = (() => {
    switch (style) {
      case "full-border": return <span style={{ ...box, border: `${w * sc}px solid ${accent}`, opacity: op }}>{lab}</span>;
      case "double-border": return (
        <span style={{ ...box, border: `${w * sc}px solid ${accent}`, opacity: op }}>
          <span style={{ position: "absolute", inset: 14 * sc, border: `${Math.max(3, w - 2) * sc}px solid ${accent}` }} />
          {lab}
        </span>
      );
      case "dashed-border": return <span style={{ ...box, border: `${w * sc}px dashed ${accent}`, opacity: op }}>{lab}</span>;
      case "rounded": return <span style={{ ...box, border: `${w * sc}px solid ${accent}`, borderRadius: 28 * sc, opacity: op }}>{lab}</span>;
      case "side-rails": return (
        <span style={box}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (thick ? 22 : 12) * sc, backgroundColor: accent, opacity: op }} />
          <span style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: (thick ? 22 : 12) * sc, backgroundColor: accent, opacity: op }} />
          {lab}
        </span>
      );
      case "top-bottom": return (
        <span style={box}>
          <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: 12 * sc, backgroundColor: accent, opacity: op }} />
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12 * sc, backgroundColor: accent, opacity: op }} />
          {lab}
        </span>
      );
      case "spotlight": return (
        <span style={box}>
          <span style={{ position: "absolute", inset: 0, backgroundColor: "rgba(20,20,18,0.72)" }} />
          <span style={{ position: "absolute", left: 70 * sc, right: 70 * sc, top: 50 * sc, bottom: 50 * sc, border: `${w * sc}px solid ${accent}`, opacity: op, backgroundColor: "transparent" }} />
          <span style={{ position: "relative", fontWeight: 700, fontSize: 30 * sc }}>{withLabel ? label : ""}</span>
        </span>
      );
      default: // corners
        return (
          <span style={box}>
            {corner({ left: 0, top: 0, borderLeft: `${w * sc}px solid ${accent}`, borderTop: `${w * sc}px solid ${accent}` })}
            {corner({ right: 0, top: 0, borderRight: `${w * sc}px solid ${accent}`, borderTop: `${w * sc}px solid ${accent}` })}
            {corner({ left: 0, bottom: 0, borderLeft: `${w * sc}px solid ${accent}`, borderBottom: `${w * sc}px solid ${accent}` })}
            {corner({ right: 0, bottom: 0, borderRight: `${w * sc}px solid ${accent}`, borderBottom: `${w * sc}px solid ${accent}` })}
            {lab}
          </span>
        );
    }
  })();
  return (
    <span style={{ position: "relative", display: "block" }}>
      {inner}
      {sweepX !== null ? <span style={{ position: "absolute", left: `${sweepX.toFixed(1)}%`, top: -8 * sc, width: 14 * sc, height: 14 * sc, borderRadius: "50%", backgroundColor: accent }} /> : null}
    </span>
  );
}

/* --------------------------------- base: wipe -------------------------------- */
/* A band that sweeps across the stage. `direction` picks the travel, `pattern` */
/* picks the band's composition; the text rides inside the filled part. */

function renderWipe(c: NgCtx): React.ReactNode {
  const { ls, accent, sc } = c;
  const direction = c.entry.params.direction ?? "left";
  const pattern = c.entry.params.pattern ?? "solid";
  const text = ngLine(ls, 0, "NEW VIDEO");
  const t = c.ph.t;
  const vertical = direction === "up" || direction === "down";
  const fromStart = direction === "left" || direction === "up";
  const bandH = 150 * sc;
  const bandW = 640 * sc;
  const textEl = (show: boolean) => (
    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: INK, fontWeight: 800, fontSize: 40 * sc, whiteSpace: "nowrap", opacity: show ? 1 : 0 }}>{text}</span>
  );
  const fill = (frac: number, anchor: "start" | "center" | "end"): React.CSSProperties => {
    const pct = `${(clamp01(frac) * 100).toFixed(1)}%`;
    if (vertical) return { position: "absolute", left: 0, right: 0, height: pct, ...(anchor === "start" ? { bottom: 0 } : anchor === "end" ? { top: 0 } : { top: `calc(50% - ${pct} / 2)` }), backgroundColor: accent };
    return { position: "absolute", top: 0, bottom: 0, width: pct, ...(anchor === "start" ? { left: 0 } : anchor === "end" ? { right: 0 } : { left: `calc(50% - ${pct} / 2)` }), backgroundColor: accent };
  };
  const wrap: React.CSSProperties = { position: "relative", display: "block", width: bandW, height: vertical ? 300 * sc : bandH, overflow: "hidden" };
  if (direction === "diagonal") {
    // Diagonal bands sweep left → right; the pattern picks how many bands run.
    const band = (leftPct: number, wPct: number, color: string, key: number) => (
      <span key={key} style={{ position: "absolute", top: -60 * sc, bottom: -60 * sc, left: `${leftPct.toFixed(1)}%`, width: `${wPct.toFixed(1)}%`, backgroundColor: color, transform: "rotate(18deg)", transformOrigin: "center" }} />
    );
    const sweep = -40 + t * 120; // leading band's left edge, % of stage width
    const bands = pattern === "split"
      ? [band(sweep, 18, accent, 0), band(sweep - 55, 18, ngShade(accent, 0.6), 1)]
      : pattern === "bars"
        ? [0, 1, 2].map((i) => band(sweep - i * 22, 12, i === 0 ? accent : ngShade(accent, 0.75 - i * 0.12), i))
        : pattern === "center-out"
          ? [band(50 - t * 35, t * 70, accent, 0)]
          : [band(sweep, 34, accent, 0)];
    return (
      <span style={{ ...wrap, height: 300 * sc }}>
        {bands}
        {textEl(t > 0.35)}
      </span>
    );
  }
  if (pattern === "split") {
    return (
      <span style={wrap}>
        <span style={fill(t / 2, "start")} />
        <span style={fill(t / 2, "end")} />
        {textEl(t > 0.5)}
      </span>
    );
  }
  if (pattern === "bars") {
    const rates = [1, 0.8, 0.6];
    return (
      <span style={{ ...wrap, display: "flex", flexDirection: vertical ? "row" : "column", gap: 8 * sc }}>
        {rates.map((r, i) => (
          <span key={i} style={{ position: "relative", flex: 1, backgroundColor: i === 0 ? accent : ngShade(accent, 0.75 - i * 0.12), ...(vertical ? { height: "100%", width: `${(clamp01(t * r) * 100).toFixed(1)}%` } : { width: "100%", height: `${(clamp01(t * r) * 100).toFixed(1)}%` }), opacity: fromStart ? 1 : 1 }}>
            {i === 0 && !vertical ? textEl(t > 0.4) : null}
          </span>
        ))}
        {vertical ? textEl(t > 0.4) : null}
      </span>
    );
  }
  if (pattern === "center-out") {
    return (
      <span style={wrap}>
        <span style={fill(t, "center")} />
        {textEl(t > 0.4)}
      </span>
    );
  }
  // solid
  return (
    <span style={wrap}>
      <span style={fill(t, fromStart ? "start" : "end")} />
      {textEl(t > 0.25)}
    </span>
  );
}

/* ------------------------------ base: countdown ------------------------------ */
/* Count modes step down then land the final word; timer modes run mm:ss. */
/* `style` picks the number's frame. */

function renderCountdown(c: NgCtx): React.ReactNode {
  const { ls, accent, sc } = c;
  const mode = c.entry.params.mode ?? "count-3";
  const style = c.entry.params.style ?? "ring";
  const finalWord = ngLine(ls, 0, "GO!");
  const dur = c.dur;
  const localMs = c.localMs;
  let display: string;
  let done = false;
  let stepP = 1;
  if (mode === "timer-up") {
    const s = Math.floor(localMs / 1000);
    display = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    stepP = clamp01(localMs / dur);
  } else if (mode === "timer-down") {
    // counts down from 05:00 over the window, so its face never coincides
    // with timer-up's 00:0x at the same instant
    const s = Math.max(0, Math.ceil(300 - localMs / 1000));
    display = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    stepP = clamp01(localMs / dur);
  } else {
    const total = mode === "count-5" ? 5 : mode === "count-10" ? 10 : 3;
    const stepMs = (dur * 0.8) / total;
    const step = Math.min(total - 1, Math.max(0, Math.floor(localMs / stepMs)));
    const inStep = clamp01((localMs - step * stepMs) / Math.min(340, stepMs));
    stepP = ngSpringOut(inStep);
    if (localMs >= dur * 0.8) { display = finalWord; done = true; }
    else display = String(total - step);
  }
  const numSize = style === "big" ? 150 : 104;
  const num = (
    <span style={{ fontWeight: 800, fontSize: numSize * sc, lineHeight: 1, color: done ? accent : CARD_FG, transform: `scale(${stepP.toFixed(3)})`, display: "inline-block", opacity: aliveOp(localMs) }}>
      {display}
    </span>
  );
  const sub = mode.startsWith("timer") ? <span style={{ fontWeight: 700, fontSize: 26 * sc, opacity: 0.8 }}>{finalWord}</span> : null;
  if (style === "ring") {
    const r = 96;
    const circ = 2 * Math.PI * r;
    return (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * sc }}>
        <span style={{ position: "relative", width: 240 * sc, height: 240 * sc }}>
          <svg width={240 * sc} height={240 * sc} viewBox="0 0 240 240" aria-hidden style={{ display: "block", transform: "rotate(-90deg)" }}>
            <circle cx={120} cy={120} r={r} fill="none" stroke={CARD_BG} strokeWidth={14} />
            <circle cx={120} cy={120} r={r} fill="none" stroke={accent} strokeWidth={14} strokeLinecap="round" strokeDasharray={circ.toFixed(1)} strokeDashoffset={(circ * (1 - stepP)).toFixed(1)} />
          </svg>
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{num}</span>
        </span>
        {sub}
      </span>
    );
  }
  if (style === "block") {
    return (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * sc }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 220 * sc, height: 220 * sc, backgroundColor: CARD_BG, borderRadius: 28 * sc, border: `${4 * sc}px solid ${accent}`, boxShadow: "0 10px 34px rgba(0,0,0,0.42)" }}>{num}</span>
        {sub}
      </span>
    );
  }
  if (style === "bar") {
    return (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * sc }}>
        {num}
        <span style={{ display: "block", width: 400 * sc, height: 16 * sc, backgroundColor: CARD_BG, borderRadius: 999, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${(clamp01(localMs / dur) * 100).toFixed(1)}%`, backgroundColor: accent }} />
        </span>
        {sub}
      </span>
    );
  }
  // big
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 * sc }}>
      {num}
      {sub}
    </span>
  );
}

/* --------------------------------- base: poll -------------------------------- */
/* Question + option bars filling to seeded percentages. `options` picks the */
/* count, `style` the bar treatment, `layout` wide / compact. */

function renderPoll(c: NgCtx): React.ReactNode {
  const { ls, accent, sc } = c;
  const n = Math.max(2, Math.min(4, c.entry.params.count ?? 3));
  const style = c.entry.params.style ?? "bars";
  const compact = c.entry.params.layout === "compact";
  const question = ngLine(ls, 0, "What should I post next?");
  const opts = Array.from({ length: n }, (_, i) => ngLine(ls, i + 1, `Option ${i + 1}`));
  const raw = opts.map((_, i) => 0.25 + ngSeededUnit(c.seed + i * 37));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const pcts = raw.map((r) => Math.round((r / sum) * 100));
  const fill = ngEaseOutCubic(clamp01((c.localMs - c.dur * 0.25) / (c.dur * 0.5)));
  const winner = pcts.indexOf(Math.max(...pcts));
  const w = compact ? 440 : 600;
  const rows = opts.map((opt, i) => {
    const pct = pcts[i]!;
    const isWinner = style === "winner" && i === winner;
    const rowFill = style === "outline" ? "transparent" : isWinner ? accent : ngShade(accent, 0.55);
    const rowText = isWinner ? INK : CARD_FG;
    return (
      <span key={i} style={{ display: "flex", flexDirection: "column", gap: 6 * sc }}>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: (compact ? 22 : 26) * sc, fontWeight: 700 }}>
          <span>{style === "numbered" ? `${i + 1}. ${opt}` : opt}{isWinner ? " ✓" : ""}</span>
          <span style={{ color: accent, opacity: aliveOp(c.localMs) }}>{style === "percent" || style === "winner" || style === "bars" ? `${pct}%` : ""}</span>
        </span>
        <span style={{ display: "block", height: (compact ? 18 : 24) * sc, backgroundColor: CARD_BG, borderRadius: 999, overflow: "hidden", border: style === "outline" ? `${2 * sc}px solid ${accent}` : "none" }}>
          {style === "segmented" ? (
            <span style={{ display: "flex", gap: 4 * sc, height: "100%" }}>
              {Array.from({ length: 5 }, (_, s) => (
                <span key={s} style={{ flex: 1, backgroundColor: s < Math.round((pct / 100) * 5 * fill) ? accent : "transparent" }} />
              ))}
            </span>
          ) : (
            <span style={{ display: "block", height: "100%", width: `${(pct * fill).toFixed(1)}%`, backgroundColor: rowFill }} />
          )}
        </span>
        <span style={{ display: "none" }}>{rowText}</span>
      </span>
    );
  });
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 14 * sc, width: w * sc, backgroundColor: CARD_BG, borderRadius: 22 * sc, padding: `${20 * sc}px ${24 * sc}px`, boxShadow: "0 10px 34px rgba(0,0,0,0.42)" }}>
      <span style={{ fontWeight: 800, fontSize: (compact ? 26 : 30) * sc, lineHeight: 1.25 }}>{question}</span>
      {rows}
    </span>
  );
}

/* ------------------------------ base: chat bubble ---------------------------- */
/* Message bubbles stacking in. `side` picks the alignment, `count` how many, */
/* `style` the bubble treatment; `avatar` adds an initial dot on the first. */

function renderChatBubble(c: NgCtx): React.ReactNode {
  const { ls, accent, sc } = c;
  const side = c.entry.params.side ?? "left";
  const n = Math.max(1, Math.min(3, c.entry.params.count ?? 2));
  const style = c.entry.params.style ?? "rounded";
  const avatar = c.entry.params.withLabel === true;
  const msgs = Array.from({ length: n }, (_, i) => ngLine(ls, i, i === 0 ? "New video is live!" : "Check it out"));
  // typing dots run until 75% of the window — the contact is still typing after
  // the last shown message, so the dots are on the poster frame too
  const typing = style === "typing" && c.localMs < c.dur * 0.75;
  const bubbles = msgs.map((msg, i) => {
    const start = (i * c.dur * 0.62) / Math.max(1, n);
    const p = ngEaseOutQuint(clamp01((c.localMs - start) / 320));
    const outgoing = side === "right" || (side === "alternating" && i % 2 === 1);
    const radius = style === "square" ? 8 : 22;
    return (
      <span key={i} style={{
        display: "block", maxWidth: 460 * sc, alignSelf: outgoing ? "flex-end" : "flex-start",
        backgroundColor: outgoing ? accent : CARD_BG, color: outgoing ? INK : CARD_FG,
        borderRadius: `${radius * sc}px`, padding: `${14 * sc}px ${20 * sc}px`, fontSize: 27 * sc, lineHeight: 1.3,
        fontWeight: outgoing ? 700 : 400, opacity: p, transform: `translateY(${((1 - p) * 18).toFixed(1)}px) scale(${(0.7 + 0.3 * p).toFixed(3)})`,
        ...(style === "tail" ? { borderBottomLeftRadius: outgoing ? `${radius * sc}px` : "4px", borderBottomRightRadius: outgoing ? "4px" : `${radius * sc}px` } : {}),
      }}>
        {msg}
      </span>
    );
  });
  const dots = typing ? (
    <span style={{ display: "inline-flex", gap: 6 * sc, alignSelf: side === "right" ? "flex-end" : "flex-start", backgroundColor: CARD_BG, borderRadius: 22 * sc, padding: `${12 * sc}px ${18 * sc}px` }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 10 * sc, height: 10 * sc, borderRadius: "50%", backgroundColor: CARD_FG, opacity: 0.35 + 0.65 * Math.abs(Math.sin(c.localMs / 300 - i * 0.9)) }} />
      ))}
    </span>
  ) : null;
  const initial = avatar ? (msgs[0]?.trim().replace(/^@/, "").charAt(0).toUpperCase() ?? "C") : "";
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 10 * sc, width: 520 * sc }}>
      {avatar ? (
        <span style={{ display: "flex", alignItems: "center", gap: 10 * sc }}>
          <span style={{ width: 48 * sc, height: 48 * sc, borderRadius: "50%", backgroundColor: ngShade(accent, 0.85), color: CARD_FG, fontWeight: 800, fontSize: 22 * sc, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initial}</span>
          <span style={{ fontWeight: 700, fontSize: 24 * sc }}>Creator</span>
        </span>
      ) : null}
      {bubbles}
      {dots}
    </span>
  );
}

/* --------------------------- dispatch + public view -------------------------- */

function renderByBase(base: NewGraphicBase, c: NgCtx): React.ReactNode {
  switch (base) {
    case "lowerThird": return renderLowerThird(c);
    case "callout": return renderCallout(c);
    case "cta": return renderCta(c);
    case "progress": return renderProgress(c);
    case "counter": return renderCounter(c);
    case "textReveal": return renderTextReveal(c);
    case "quote": return renderQuote(c);
    case "rating": return renderRating(c);
    case "badge": return renderBadge(c);
    case "arrow": return renderArrow(c);
    case "frame": return renderFrame(c);
    case "wipe": return renderWipe(c);
    case "countdown": return renderCountdown(c);
    case "poll": return renderPoll(c);
    case "chatBubble": return renderChatBubble(c);
  }
}

/**
 * One new graphic, drawn at (localMs) inside its own window. SocialOverlayView
 * delegates `ng-*` variants here (see social.tsx). The root mirrors the shared
 * social root: enter rise + enter/exit opacity, so the graphic enters and
 * leaves exactly like the rest of the library.
 */
export const NewGraphicsView: React.FC<{ item: OverlayItem; sc: number; localMs: number }> = ({ item, sc, localMs }) => {
  const entry = getNewGraphic(item.variant ?? "");
  if (!entry) return null;
  const dur = Math.max(1, item.endMs - item.startMs);
  const ph = ngPhase(localMs, dur);
  const enterY = (1 - ph.enter) * 26 * sc;
  const ctx: NgCtx = { entry, ls: linesOf(item), accent: item.color, sc, localMs, dur, ph, seed: seedOf(item.id) };
  const root: React.CSSProperties = {
    fontFamily: FONT, color: CARD_FG,
    opacity: ph.enter * (1 - ph.exit),
    transform: `translateY(${enterY.toFixed(1)}px)`,
    pointerEvents: "none",
  };
  return <div style={root}>{renderByBase(entry.base, ctx)}</div>;
};

/* ---------------------------------- registry --------------------------------- */
/* 15 families x 20 parameterizations = 300. Rows are [id, title, params, */
/* defaultText?, defaultColor?] — family defaults fill text/colour where the */
/* row leaves them blank. Ids are literal strings (greppable for the shared */
/* enum block); the frontend test asserts every id is in OVERLAY_SOCIAL_VARIANTS. */

type NgRow = readonly [string, string, NewGraphicParams, string?, string?];

function fam(
  family: string,
  base: NewGraphicBase,
  defaults: { defaultText: string; defaultColor: string; defaultDurationMs: number; maxLines: number; hint: string },
  rows: readonly NgRow[],
): NewGraphicEntry[] {
  return rows.map(([id, title, params, text, color]) => ({
    id: id as OverlaySocialVariant,
    title,
    family,
    base,
    params,
    defaultText: text ?? defaults.defaultText,
    defaultColor: color ?? defaults.defaultColor,
    defaultDurationMs: defaults.defaultDurationMs,
    maxLines: defaults.maxLines,
    hint: `${title}. ${defaults.hint}`,
  }));
}

const LOWER_THIRDS = fam("lower-thirds", "lowerThird",
  { defaultText: "Creator Name\nVideo Editor", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 2, hint: "Lines: name / role." },
  [
    ["ng-lt-bar-left", "Lower Third Bar Left", { layout: "bar-left", accentSide: "left" }],
    ["ng-lt-bar-right", "Lower Third Bar Right", { layout: "bar-left", accentSide: "right" }],
    ["ng-lt-topbar-left", "Lower Third Top Bar Left", { layout: "bar-top", accentSide: "left" }],
    ["ng-lt-topbar-right", "Lower Third Top Bar Right", { layout: "bar-top", accentSide: "right" }],
    ["ng-lt-underline-left", "Lower Third Underline Left", { layout: "underline", accentSide: "left" }],
    ["ng-lt-underline-right", "Lower Third Underline Right", { layout: "underline", accentSide: "right" }],
    ["ng-lt-boxed-left", "Lower Third Boxed Left", { layout: "boxed", accentSide: "left" }],
    ["ng-lt-boxed-right", "Lower Third Boxed Right", { layout: "boxed", accentSide: "right" }],
    ["ng-lt-pill-left", "Lower Third Pill Left", { layout: "pill", accentSide: "left" }],
    ["ng-lt-pill-right", "Lower Third Pill Right", { layout: "pill", accentSide: "right" }],
    ["ng-lt-split-left", "Lower Third Split Left", { layout: "split", accentSide: "left" }],
    ["ng-lt-split-right", "Lower Third Split Right", { layout: "split", accentSide: "right" }],
    ["ng-lt-corner-left", "Lower Third Corner Left", { layout: "corner", accentSide: "left" }],
    ["ng-lt-corner-right", "Lower Third Corner Right", { layout: "corner", accentSide: "right" }],
    ["ng-lt-fullbar-left", "Lower Third Full Bar Left", { layout: "full-bar", accentSide: "left" }],
    ["ng-lt-fullbar-right", "Lower Third Full Bar Right", { layout: "full-bar", accentSide: "right" }],
    ["ng-lt-outline-left", "Lower Third Outline Left", { layout: "outline", accentSide: "left" }],
    ["ng-lt-outline-right", "Lower Third Outline Right", { layout: "outline", accentSide: "right" }],
    ["ng-lt-stacked-left", "Lower Third Stacked Left", { layout: "stacked", accentSide: "left" }],
    ["ng-lt-stacked-right", "Lower Third Stacked Right", { layout: "stacked", accentSide: "right" }],
  ] as const);

const CALLOUTS = fam("callouts", "callout",
  { defaultText: "Watch this part", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 1, hint: "Line: callout text." },
  [
    ["ng-co-rounded-left", "Rounded Callout Left", { shape: "rounded", tail: "left" }],
    ["ng-co-rounded-right", "Rounded Callout Right", { shape: "rounded", tail: "right" }],
    ["ng-co-rounded-top", "Rounded Callout Top", { shape: "rounded", tail: "top" }],
    ["ng-co-rounded-bottom", "Rounded Callout Bottom", { shape: "rounded", tail: "bottom" }],
    ["ng-co-pill-left", "Pill Callout Left", { shape: "pill", tail: "left" }],
    ["ng-co-pill-right", "Pill Callout Right", { shape: "pill", tail: "right" }],
    ["ng-co-pill-top", "Pill Callout Top", { shape: "pill", tail: "top" }],
    ["ng-co-pill-bottom", "Pill Callout Bottom", { shape: "pill", tail: "bottom" }],
    ["ng-co-square-left", "Square Callout Left", { shape: "square", tail: "left" }],
    ["ng-co-square-right", "Square Callout Right", { shape: "square", tail: "right" }],
    ["ng-co-square-top", "Square Callout Top", { shape: "square", tail: "top" }],
    ["ng-co-square-bottom", "Square Callout Bottom", { shape: "square", tail: "bottom" }],
    ["ng-co-thought-left", "Thought Callout Left", { shape: "thought", tail: "left" }],
    ["ng-co-thought-right", "Thought Callout Right", { shape: "thought", tail: "right" }],
    ["ng-co-thought-top", "Thought Callout Top", { shape: "thought", tail: "top" }],
    ["ng-co-thought-bottom", "Thought Callout Bottom", { shape: "thought", tail: "bottom" }],
    ["ng-co-tag-left", "Tag Callout Left", { shape: "tag", tail: "left" }],
    ["ng-co-tag-right", "Tag Callout Right", { shape: "tag", tail: "right" }],
    ["ng-co-tag-top", "Tag Callout Top", { shape: "tag", tail: "top" }],
    ["ng-co-tag-bottom", "Tag Callout Bottom", { shape: "tag", tail: "bottom" }],
  ] as const);

const CTAS = fam("subscribe-cta", "cta",
  { defaultText: "Get started\nDone", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 2, hint: "Lines: button label / label after the tap." },
  [
    ["ng-cta-subscribe-solid", "Subscribe Solid", { style: "solid", icon: "bell" }, "Subscribe\nSubscribed", "#FF4D2E"],
    ["ng-cta-subscribe-outline", "Subscribe Outline", { style: "outline", icon: "bell" }, "Subscribe\nSubscribed", "#FF4D2E"],
    ["ng-cta-follow-solid", "Follow Solid", { style: "solid", icon: "plus" }, "Follow\nFollowing", "#34D399"],
    ["ng-cta-follow-outline", "Follow Outline", { style: "outline", icon: "plus" }, "Follow\nFollowing", "#34D399"],
    ["ng-cta-join-solid", "Join Solid", { style: "solid", icon: "check" }, "Join now\nJoined", "#FFA946"],
    ["ng-cta-join-outline", "Join Outline", { style: "outline", icon: "check" }, "Join now\nJoined", "#FFA946"],
    ["ng-cta-watch-solid", "Watch Solid", { style: "solid", icon: "play" }, "Watch now\nWatching", "#38BDF8"],
    ["ng-cta-watch-outline", "Watch Outline", { style: "outline", icon: "play" }, "Watch now\nWatching", "#38BDF8"],
    ["ng-cta-shop-solid", "Shop Solid", { style: "solid", icon: "tag" }, "Shop now\nAdded to bag", "#FF4D6D"],
    ["ng-cta-shop-outline", "Shop Outline", { style: "outline", icon: "tag" }, "Shop now\nAdded to bag", "#FF4D6D"],
    ["ng-cta-download-solid", "Download Solid", { style: "solid", icon: "download" }, "Download\nDownloaded", "#34D399"],
    ["ng-cta-download-outline", "Download Outline", { style: "outline", icon: "download" }, "Download\nDownloaded", "#34D399"],
    ["ng-cta-signup-solid", "Sign Up Solid", { style: "solid", icon: "arrow" }, "Sign up\nWelcome in", "#FFA946"],
    ["ng-cta-signup-outline", "Sign Up Outline", { style: "outline", icon: "arrow" }, "Sign up\nWelcome in", "#FFA946"],
    ["ng-cta-learn-solid", "Learn More Solid", { style: "solid", icon: "arrow" }, "Learn more\nOpening", "#FFFFEB"],
    ["ng-cta-learn-outline", "Learn More Outline", { style: "outline", icon: "arrow" }, "Learn more\nOpening", "#FFFFEB"],
    ["ng-cta-guide-solid", "Get the Guide Solid", { style: "solid", icon: "download" }, "Get the guide\nGuide sent", "#FFA946"],
    ["ng-cta-guide-outline", "Get the Guide Outline", { style: "outline", icon: "download" }, "Get the guide\nGuide sent", "#FFA946"],
    ["ng-cta-book-solid", "Book a Call Solid", { style: "solid", icon: "calendar" }, "Book a call\nBooked", "#34D399"],
    ["ng-cta-book-outline", "Book a Call Outline", { style: "outline", icon: "calendar" }, "Book a call\nBooked", "#34D399"],
  ] as const);

const PROGRESS = fam("progress", "progress",
  { defaultText: "Loading the good part", defaultColor: "#34D399", defaultDurationMs: 4000, maxLines: 1, hint: "Line: caption above the bar." },
  [
    ["ng-pg-bar-left", "Progress Bar Left", { kind: "bar-left", labelPos: "below" }],
    ["ng-pg-bar-right", "Progress Bar Right", { kind: "bar-right", labelPos: "below" }],
    ["ng-pg-bar-center", "Progress Bar Centre Out", { kind: "bar-center", labelPos: "above" }],
    ["ng-pg-bar-knob", "Progress Bar Knob", { kind: "bar-knob", labelPos: "above" }],
    ["ng-pg-bar-label-above", "Progress Bar Label Above", { kind: "bar-label-above", labelPos: "above" }],
    ["ng-pg-bar-label-inside", "Progress Bar Label Inside", { kind: "bar-label-inside", labelPos: "inside" }],
    ["ng-pg-bar-thin", "Progress Thin Line", { kind: "bar-thin", labelPos: "above" }],
    ["ng-pg-bar-thick", "Progress Thick Block", { kind: "bar-thick", labelPos: "above" }],
    ["ng-pg-ring", "Progress Ring", { kind: "ring", labelPos: "above" }, "Almost there"],
    ["ng-pg-ring-thick", "Progress Ring Thick", { kind: "ring-thick", labelPos: "above" }, "Almost there"],
    ["ng-pg-ring-dots", "Progress Ring Dots", { kind: "ring-dots", labelPos: "above" }, "Almost there"],
    ["ng-pg-seg-5", "Progress Segments 5", { kind: "seg-5", labelPos: "above" }],
    ["ng-pg-seg-10", "Progress Segments 10", { kind: "seg-10", labelPos: "above" }],
    ["ng-pg-steps", "Progress Steps", { kind: "steps", labelPos: "above" }],
    ["ng-pg-dots", "Progress Dots", { kind: "dots", labelPos: "above" }],
    ["ng-pg-vertical-up", "Progress Vertical Up", { kind: "vertical-up", labelPos: "above" }],
    ["ng-pg-vertical-down", "Progress Vertical Down", { kind: "vertical-down", labelPos: "above" }],
    ["ng-pg-dual", "Progress Dual Bar", { kind: "dual", labelPos: "above" }],
    ["ng-pg-bar-check", "Progress Bar Check", { kind: "bar-check", labelPos: "above" }],
    ["ng-pg-bar-flag", "Progress Bar Flag", { kind: "bar-flag", labelPos: "above" }],
  ] as const);

const COUNTERS = fam("counters", "counter",
  { defaultText: "0\n1000\nviews", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 3, hint: "Lines: from / to / label under the number." },
  [
    ["ng-ct-plain-above", "Counter Plain Above", { format: "plain", labelPos: "above" }],
    ["ng-ct-plain-below", "Counter Plain Below", { format: "plain", labelPos: "below" }],
    ["ng-ct-comma-above", "Counter Comma Above", { format: "comma", labelPos: "above" }, "0\n50000\nfollowers"],
    ["ng-ct-comma-below", "Counter Comma Below", { format: "comma", labelPos: "below" }, "0\n50000\nfollowers"],
    ["ng-ct-k-above", "Counter K Above", { format: "k", labelPos: "above" }, "0\n120000\nviews"],
    ["ng-ct-k-below", "Counter K Below", { format: "k", labelPos: "below" }, "0\n120000\nviews"],
    ["ng-ct-m-above", "Counter M Above", { format: "m", labelPos: "above" }, "0\n2500000\nviews"],
    ["ng-ct-m-below", "Counter M Below", { format: "m", labelPos: "below" }, "0\n2500000\nviews"],
    ["ng-ct-pct-above", "Counter Percent Above", { format: "pct", labelPos: "above" }, "0\n87\ncomplete"],
    ["ng-ct-pct-below", "Counter Percent Below", { format: "pct", labelPos: "below" }, "0\n87\ncomplete"],
    ["ng-ct-usd-above", "Counter Dollars Above", { format: "usd", labelPos: "above" }, "0\n1250\nearned"],
    ["ng-ct-usd-below", "Counter Dollars Below", { format: "usd", labelPos: "below" }, "0\n1250\nearned"],
    ["ng-ct-decimal-above", "Counter Decimal Above", { format: "decimal1", labelPos: "above" }, "0\n9.8\nrating"],
    ["ng-ct-decimal-below", "Counter Decimal Below", { format: "decimal1", labelPos: "below" }, "0\n9.8\nrating"],
    ["ng-ct-mmss-above", "Counter Clock Above", { format: "mmss", labelPos: "above" }, "0\n125\nseconds"],
    ["ng-ct-mmss-below", "Counter Clock Below", { format: "mmss", labelPos: "below" }, "0\n125\nseconds"],
    ["ng-ct-plus-above", "Counter Plus Above", { format: "plus", labelPos: "above" }, "0\n500\nnew followers"],
    ["ng-ct-plus-below", "Counter Plus Below", { format: "plus", labelPos: "below" }, "0\n500\nnew followers"],
    ["ng-ct-usdk-above", "Counter Dollars K Above", { format: "usdk", labelPos: "above" }, "0\n48000\nrevenue"],
    ["ng-ct-usdk-below", "Counter Dollars K Below", { format: "usdk", labelPos: "below" }, "0\n48000\nrevenue"],
  ] as const);

const TEXT_REVEALS = fam("text-reveals", "textReveal",
  { defaultText: "WATCH THIS FIRST", defaultColor: "#FFFFEB", defaultDurationMs: 3500, maxLines: 2, hint: "Line: title text." },
  [
    ["ng-tr-slide-up", "Title Slide Up", { motion: "slide-up", deco: "none" }],
    ["ng-tr-slide-left", "Title Slide Left", { motion: "slide-left", deco: "underline-solid" }, "NEW VIDEO"],
    ["ng-tr-slide-right", "Title Slide Right", { motion: "slide-right", deco: "underline-dashed" }, "LEVEL UP"],
    ["ng-tr-fade", "Title Fade", { motion: "fade", deco: "underline-double" }, "START HERE"],
    ["ng-tr-pop", "Title Pop", { motion: "pop", deco: "underline-thick" }, "THE BIG REVEAL"],
    ["ng-tr-blur-in", "Title Blur In", { motion: "blur-in", deco: "bar-left" }, "DON'T SKIP THIS"],
    ["ng-tr-typewriter", "Title Typewriter", { motion: "typewriter", deco: "bar-right" }, "3 EASY STEPS"],
    ["ng-tr-glitch", "Title Glitch", { motion: "glitch", deco: "bar-top" }, "WATCH TILL THE END"],
    ["ng-tr-underline-sweep", "Title Underline Sweep", { motion: "underline-sweep", deco: "bar-bottom" }, "TRY THIS NOW"],
    ["ng-tr-word-stagger", "Title Word Stagger", { motion: "word-stagger", deco: "highlight" }, "FREE GUIDE INSIDE"],
    ["ng-tr-highlight-sweep", "Title Highlight Sweep", { motion: "highlight-sweep", deco: "outline-text" }, "STEP ONE"],
    ["ng-tr-outline-fill", "Title Outline Fill", { motion: "outline-fill", deco: "caps-spacing" }, "THE SECRET"],
    ["ng-tr-scale-up", "Title Scale Up", { motion: "scale-up", deco: "shadow" }, "FULL BREAKDOWN"],
    ["ng-tr-flip", "Title Flip", { motion: "flip", deco: "corner-tick" }, "SAVE THIS"],
    ["ng-tr-rise-rotate", "Title Rise Rotate", { motion: "rise-rotate", deco: "side-brackets" }, "PART 2 IS LIVE"],
    ["ng-tr-wipe-left", "Title Wipe Left", { motion: "wipe-left", deco: "pill-bg" }, "BEGINNER FRIENDLY"],
    ["ng-tr-wipe-up", "Title Wipe Up", { motion: "wipe-up", deco: "small-caps" }, "NO EXPERIENCE NEEDED"],
    ["ng-tr-spacing-expand", "Title Spacing Expand", { motion: "spacing-expand", deco: "accent-dot" }, "LINK IN BIO"],
    ["ng-tr-bounce", "Title Bounce", { motion: "bounce", deco: "end-arrow" }, "COMMENT BELOW"],
    ["ng-tr-drop-in", "Title Drop In", { motion: "drop-in", deco: "top-rule" }, "FOLLOW FOR MORE"],
  ] as const);

const QUOTES = fam("quote-cards", "quote",
  { defaultText: "Say it in their words\n— Alex", defaultColor: "#34D399", defaultDurationMs: 4000, maxLines: 2, hint: "Lines: quote / attribution." },
  [
    ["ng-qu-card-glyph", "Quote Card Glyph", { layout: "card", mark: "glyph" }],
    ["ng-qu-card-bar", "Quote Card Bar", { layout: "card", mark: "bar" }],
    ["ng-qu-minimal-below", "Quote Minimal Below", { layout: "minimal", mark: "glyph" }],
    ["ng-qu-minimal-above", "Quote Minimal Above", { layout: "minimal", mark: "bar" }],
    ["ng-qu-banner-left", "Quote Banner Left", { layout: "banner", mark: "glyph" }],
    ["ng-qu-banner-right", "Quote Banner Right", { layout: "banner", mark: "bar" }],
    ["ng-qu-sidebar-left", "Quote Side Bar Left", { layout: "side-bar", mark: "glyph" }],
    ["ng-qu-sidebar-right", "Quote Side Bar Right", { layout: "side-bar", mark: "bar" }],
    ["ng-qu-centered-glyph", "Quote Centred Glyph", { layout: "centered", mark: "glyph" }],
    ["ng-qu-centered-bar", "Quote Centred Bar", { layout: "centered", mark: "bar" }],
    ["ng-qu-corner-glyph", "Quote Corner Glyph", { layout: "corner-mark", mark: "glyph" }],
    ["ng-qu-corner-bar", "Quote Corner Bar", { layout: "corner-mark", mark: "bar" }],
    ["ng-qu-underline-below", "Quote Underline Below", { layout: "underline", mark: "glyph" }],
    ["ng-qu-underline-above", "Quote Underline Above", { layout: "underline", mark: "bar" }],
    ["ng-qu-boxed-glyph", "Quote Boxed Glyph", { layout: "boxed", mark: "glyph" }],
    ["ng-qu-boxed-bar", "Quote Boxed Bar", { layout: "boxed", mark: "bar" }],
    ["ng-qu-split-normal", "Quote Split Normal", { layout: "split", mark: "glyph" }],
    ["ng-qu-split-flipped", "Quote Split Flipped", { layout: "split", mark: "bar" }],
    ["ng-qu-largemark-glyph", "Quote Large Mark Glyph", { layout: "large-mark", mark: "glyph" }],
    ["ng-qu-largemark-bar", "Quote Large Mark Bar", { layout: "large-mark", mark: "bar" }],
  ] as const);

const RATINGS = fam("rating", "rating",
  { defaultText: "5 out of 5", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 2, hint: "Line: rating text." },
  [
    ["ng-ra-star3-above", "Stars 3 Above", { shape: "star", count: 3, labelPos: "above" }, "3 out of 3"],
    ["ng-ra-star3-below", "Stars 3 Below", { shape: "star", count: 3, labelPos: "below" }, "3 out of 3"],
    ["ng-ra-star4-above", "Stars 4 Above", { shape: "star", count: 4, labelPos: "above" }, "4 out of 5"],
    ["ng-ra-star4-below", "Stars 4 Below", { shape: "star", count: 4, labelPos: "below" }, "4 out of 5"],
    ["ng-ra-star5-above", "Stars 5 Above", { shape: "star", count: 5, labelPos: "above" }, "5 out of 5"],
    ["ng-ra-star5-below", "Stars 5 Below", { shape: "star", count: 5, labelPos: "below" }, "5 out of 5"],
    ["ng-ra-heart3-above", "Hearts 3 Above", { shape: "heart", count: 3, labelPos: "above" }, "Loved it"],
    ["ng-ra-heart3-below", "Hearts 3 Below", { shape: "heart", count: 3, labelPos: "below" }, "Loved it"],
    ["ng-ra-heart4-above", "Hearts 4 Above", { shape: "heart", count: 4, labelPos: "above" }, "Really loved it"],
    ["ng-ra-heart4-below", "Hearts 4 Below", { shape: "heart", count: 4, labelPos: "below" }, "Really loved it"],
    ["ng-ra-heart5-above", "Hearts 5 Above", { shape: "heart", count: 5, labelPos: "above" }, "Absolutely loved it"],
    ["ng-ra-heart5-below", "Hearts 5 Below", { shape: "heart", count: 5, labelPos: "below" }, "Absolutely loved it"],
    ["ng-ra-bolt3-above", "Bolts 3 Above", { shape: "bolt", count: 3, labelPos: "above" }, "3 out of 3"],
    ["ng-ra-bolt3-below", "Bolts 3 Below", { shape: "bolt", count: 3, labelPos: "below" }, "3 out of 3"],
    ["ng-ra-bolt4-above", "Bolts 4 Above", { shape: "bolt", count: 4, labelPos: "above" }, "4 out of 5"],
    ["ng-ra-bolt4-below", "Bolts 4 Below", { shape: "bolt", count: 4, labelPos: "below" }, "4 out of 5"],
    ["ng-ra-bolt5-above", "Bolts 5 Above", { shape: "bolt", count: 5, labelPos: "above" }, "5 out of 5"],
    ["ng-ra-bolt5-below", "Bolts 5 Below", { shape: "bolt", count: 5, labelPos: "below" }, "5 out of 5"],
    ["ng-ra-star5-badge", "Stars 5 Number Badge", { shape: "star", count: 5, labelPos: "below", style: "badge" }, "5 out of 5\n4.9"],
    ["ng-ra-heart5-badge", "Hearts 5 Number Badge", { shape: "heart", count: 5, labelPos: "below", style: "badge" }, "Loved it\n4.8"],
  ] as const);

const BADGES = fam("badges-ribbons", "badge",
  { defaultText: "NEW", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 1, hint: "Line: badge label." },
  [
    ["ng-ba-seal-sm", "Seal Badge Small", { shape: "seal", size: "sm", motion: "spin" }],
    ["ng-ba-seal-lg", "Seal Badge Large", { shape: "seal", size: "lg", motion: "spin" }],
    ["ng-ba-burst-sm", "Burst Badge Small", { shape: "burst", size: "sm", motion: "pulse" }, "SALE"],
    ["ng-ba-burst-lg", "Burst Badge Large", { shape: "burst", size: "lg", motion: "pulse" }, "SALE"],
    ["ng-ba-ribbon-sm", "Ribbon Badge Small", { shape: "ribbon", size: "sm", motion: "swing" }, "TOP PICK"],
    ["ng-ba-ribbon-lg", "Ribbon Badge Large", { shape: "ribbon", size: "lg", motion: "swing" }, "TOP PICK"],
    ["ng-ba-tag-sm", "Tag Badge Small", { shape: "tag", size: "sm", motion: "swing" }, "HOT"],
    ["ng-ba-tag-lg", "Tag Badge Large", { shape: "tag", size: "lg", motion: "swing" }, "HOT"],
    ["ng-ba-shield-sm", "Shield Badge Small", { shape: "shield", size: "sm", motion: "pop" }, "BEST"],
    ["ng-ba-shield-lg", "Shield Badge Large", { shape: "shield", size: "lg", motion: "pop" }, "BEST"],
    ["ng-ba-pill-sm", "Pill Badge Small", { shape: "pill", size: "sm", motion: "pop" }, "FREE"],
    ["ng-ba-pill-lg", "Pill Badge Large", { shape: "pill", size: "lg", motion: "pop" }, "FREE"],
    ["ng-ba-corner-sm", "Corner Badge Small", { shape: "corner", size: "sm", motion: "pop" }, "50% OFF"],
    ["ng-ba-corner-lg", "Corner Badge Large", { shape: "corner", size: "lg", motion: "pop" }, "50% OFF"],
    ["ng-ba-hexagon-sm", "Hexagon Badge Small", { shape: "hexagon", size: "sm", motion: "pulse" }, "LIMITED"],
    ["ng-ba-hexagon-lg", "Hexagon Badge Large", { shape: "hexagon", size: "lg", motion: "pulse" }, "LIMITED"],
    ["ng-ba-seal-tilt", "Seal Badge Tilted", { shape: "seal", size: "lg", motion: "spin", style: "tilt" }],
    ["ng-ba-burst-tilt", "Burst Badge Tilted", { shape: "burst", size: "lg", motion: "pulse", style: "tilt" }, "SALE"],
    ["ng-ba-ribbon-tilt", "Ribbon Badge Tilted", { shape: "ribbon", size: "lg", motion: "swing", style: "tilt" }, "TOP PICK"],
    ["ng-ba-tag-tilt", "Tag Badge Tilted", { shape: "tag", size: "lg", motion: "swing", style: "tilt" }, "HOT"],
  ] as const);

const ARROWS = fam("arrows-pointers", "arrow",
  { defaultText: "Look here", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 1, hint: "Line: label under the arrow." },
  [
    ["ng-ar-right-straight", "Arrow Right Straight", { direction: "right", style: "straight" }],
    ["ng-ar-right-curved", "Arrow Right Curved", { direction: "right", style: "curved" }],
    ["ng-ar-left-straight", "Arrow Left Straight", { direction: "left", style: "straight" }, "This way"],
    ["ng-ar-left-curved", "Arrow Left Curved", { direction: "left", style: "curved" }, "This way"],
    ["ng-ar-up-straight", "Arrow Up Straight", { direction: "up", style: "straight" }, "Start here"],
    ["ng-ar-up-curved", "Arrow Up Curved", { direction: "up", style: "curved" }, "Start here"],
    ["ng-ar-down-straight", "Arrow Down Straight", { direction: "down", style: "straight" }, "Swipe up"],
    ["ng-ar-down-curved", "Arrow Down Curved", { direction: "down", style: "curved" }, "Swipe up"],
    ["ng-ar-up-right-straight", "Arrow Up Right Straight", { direction: "up-right", style: "straight" }, "Next step"],
    ["ng-ar-up-right-curved", "Arrow Up Right Curved", { direction: "up-right", style: "curved" }, "Next step"],
    ["ng-ar-down-right-straight", "Arrow Down Right Straight", { direction: "down-right", style: "straight" }, "Over here"],
    ["ng-ar-down-right-curved", "Arrow Down Right Curved", { direction: "down-right", style: "curved" }, "Over here"],
    ["ng-ar-up-left-straight", "Arrow Up Left Straight", { direction: "up-left", style: "straight" }, "Watch this"],
    ["ng-ar-up-left-curved", "Arrow Up Left Curved", { direction: "up-left", style: "curved" }, "Watch this"],
    ["ng-ar-down-left-straight", "Arrow Down Left Straight", { direction: "down-left", style: "straight" }, "Tap here"],
    ["ng-ar-down-left-curved", "Arrow Down Left Curved", { direction: "down-left", style: "curved" }, "Tap here"],
    ["ng-ar-double-right", "Arrow Double Right", { direction: "right", style: "double" }],
    ["ng-ar-chevron-right", "Arrow Chevron Right", { direction: "right", style: "chevron" }],
    ["ng-ar-thick-right", "Arrow Thick Right", { direction: "right", style: "thick" }],
    ["ng-ar-dashed-right", "Arrow Dashed Right", { direction: "right", style: "dashed" }],
  ] as const);

const FRAMES = fam("frames", "frame",
  { defaultText: "Focus here", defaultColor: "#34D399", defaultDurationMs: 4000, maxLines: 1, hint: "Line: label inside the frame." },
  [
    ["ng-fr-corners-label", "Frame Corners Labelled", { style: "corners", motion: "draw", withLabel: true }],
    ["ng-fr-corners-plain", "Frame Corners Plain", { style: "corners", motion: "sweep", withLabel: false }],
    ["ng-fr-full-label", "Frame Full Border Labelled", { style: "full-border", motion: "draw", withLabel: true }],
    ["ng-fr-full-plain", "Frame Full Border Plain", { style: "full-border", motion: "pulse", withLabel: false }],
    ["ng-fr-double-label", "Frame Double Border Labelled", { style: "double-border", motion: "draw", withLabel: true }],
    ["ng-fr-double-plain", "Frame Double Border Plain", { style: "double-border", motion: "pulse", withLabel: false }],
    ["ng-fr-dashed-label", "Frame Dashed Labelled", { style: "dashed-border", motion: "pulse", withLabel: true }],
    ["ng-fr-dashed-plain", "Frame Dashed Plain", { style: "dashed-border", motion: "draw", withLabel: false }],
    ["ng-fr-rounded-label", "Frame Rounded Labelled", { style: "rounded", motion: "pulse", withLabel: true }],
    ["ng-fr-rounded-plain", "Frame Rounded Plain", { style: "rounded", motion: "draw", withLabel: false }],
    ["ng-fr-rails-label", "Frame Side Rails Labelled", { style: "side-rails", motion: "static", withLabel: true }],
    ["ng-fr-rails-plain", "Frame Side Rails Plain", { style: "side-rails", motion: "pulse", withLabel: false }],
    ["ng-fr-topbottom-label", "Frame Top Bottom Labelled", { style: "top-bottom", motion: "static", withLabel: true }],
    ["ng-fr-topbottom-plain", "Frame Top Bottom Plain", { style: "top-bottom", motion: "draw", withLabel: false }],
    ["ng-fr-spotlight-label", "Frame Spotlight Labelled", { style: "spotlight", motion: "draw", withLabel: true }],
    ["ng-fr-spotlight-plain", "Frame Spotlight Plain", { style: "spotlight", motion: "pulse", withLabel: false }],
    ["ng-fr-corners-thick", "Frame Corners Thick", { style: "corners", motion: "draw", size: "thick", withLabel: true }],
    ["ng-fr-full-thick", "Frame Full Border Thick", { style: "full-border", motion: "draw", size: "thick", withLabel: true }],
    ["ng-fr-rounded-thick", "Frame Rounded Thick", { style: "rounded", motion: "draw", size: "thick", withLabel: true }],
    ["ng-fr-rails-thick", "Frame Side Rails Thick", { style: "side-rails", motion: "draw", size: "thick", withLabel: true }],
  ] as const);

const WIPES = fam("backgrounds-wipes", "wipe",
  { defaultText: "NEW VIDEO", defaultColor: "#FFA946", defaultDurationMs: 4000, maxLines: 1, hint: "Line: text inside the wipe." },
  [
    ["ng-wi-left-solid", "Wipe Left Solid", { direction: "left", pattern: "solid" }],
    ["ng-wi-left-split", "Wipe Left Split", { direction: "left", pattern: "split" }],
    ["ng-wi-left-bars", "Wipe Left Bars", { direction: "left", pattern: "bars" }],
    ["ng-wi-left-centre", "Wipe Left Centre Out", { direction: "left", pattern: "center-out" }],
    ["ng-wi-right-solid", "Wipe Right Solid", { direction: "right", pattern: "solid" }, "COMING UP"],
    ["ng-wi-right-split", "Wipe Right Split", { direction: "right", pattern: "split" }, "COMING UP"],
    ["ng-wi-right-bars", "Wipe Right Bars", { direction: "right", pattern: "bars" }, "COMING UP"],
    ["ng-wi-right-centre", "Wipe Right Centre Out", { direction: "right", pattern: "center-out" }, "COMING UP"],
    ["ng-wi-up-solid", "Wipe Up Solid", { direction: "up", pattern: "solid" }, "NEXT"],
    ["ng-wi-up-split", "Wipe Up Split", { direction: "up", pattern: "split" }, "NEXT"],
    ["ng-wi-up-bars", "Wipe Up Bars", { direction: "up", pattern: "bars" }, "NEXT"],
    ["ng-wi-up-centre", "Wipe Up Centre Out", { direction: "up", pattern: "center-out" }, "NEXT"],
    ["ng-wi-down-solid", "Wipe Down Solid", { direction: "down", pattern: "solid" }, "WATCH NOW"],
    ["ng-wi-down-split", "Wipe Down Split", { direction: "down", pattern: "split" }, "WATCH NOW"],
    ["ng-wi-down-bars", "Wipe Down Bars", { direction: "down", pattern: "bars" }, "WATCH NOW"],
    ["ng-wi-down-centre", "Wipe Down Centre Out", { direction: "down", pattern: "center-out" }, "WATCH NOW"],
    ["ng-wi-diag-solid", "Wipe Diagonal Solid", { direction: "diagonal", pattern: "solid" }, "PART 2"],
    ["ng-wi-diag-split", "Wipe Diagonal Split", { direction: "diagonal", pattern: "split" }, "PART 2"],
    ["ng-wi-diag-bars", "Wipe Diagonal Bars", { direction: "diagonal", pattern: "bars" }, "PART 2"],
    ["ng-wi-diag-centre", "Wipe Diagonal Centre Out", { direction: "diagonal", pattern: "center-out" }, "PART 2"],
  ] as const);

const COUNTDOWNS = fam("countdowns-timers", "countdown",
  { defaultText: "GO!", defaultColor: "#FF4D2E", defaultDurationMs: 4000, maxLines: 1, hint: "Line: final word (countdowns) or label (timers)." },
  [
    ["ng-cd-3-ring", "Countdown 3 Ring", { mode: "count-3", style: "ring" }],
    ["ng-cd-3-block", "Countdown 3 Block", { mode: "count-3", style: "block" }],
    ["ng-cd-3-big", "Countdown 3 Big", { mode: "count-3", style: "big" }],
    ["ng-cd-3-bar", "Countdown 3 Bar", { mode: "count-3", style: "bar" }],
    ["ng-cd-5-ring", "Countdown 5 Ring", { mode: "count-5", style: "ring" }, "START"],
    ["ng-cd-5-block", "Countdown 5 Block", { mode: "count-5", style: "block" }, "START"],
    ["ng-cd-5-big", "Countdown 5 Big", { mode: "count-5", style: "big" }, "START"],
    ["ng-cd-5-bar", "Countdown 5 Bar", { mode: "count-5", style: "bar" }, "START"],
    ["ng-cd-10-ring", "Countdown 10 Ring", { mode: "count-10", style: "ring" }, "LIVE"],
    ["ng-cd-10-block", "Countdown 10 Block", { mode: "count-10", style: "block" }, "LIVE"],
    ["ng-cd-10-big", "Countdown 10 Big", { mode: "count-10", style: "big" }, "LIVE"],
    ["ng-cd-10-bar", "Countdown 10 Bar", { mode: "count-10", style: "bar" }, "LIVE"],
    ["ng-cd-timer-up-ring", "Timer Up Ring", { mode: "timer-up", style: "ring" }, "Elapsed"],
    ["ng-cd-timer-up-block", "Timer Up Block", { mode: "timer-up", style: "block" }, "Elapsed"],
    ["ng-cd-timer-up-big", "Timer Up Big", { mode: "timer-up", style: "big" }, "Elapsed"],
    ["ng-cd-timer-up-bar", "Timer Up Bar", { mode: "timer-up", style: "bar" }, "Elapsed"],
    ["ng-cd-timer-down-ring", "Timer Down Ring", { mode: "timer-down", style: "ring" }, "Time left"],
    ["ng-cd-timer-down-block", "Timer Down Block", { mode: "timer-down", style: "block" }, "Time left"],
    ["ng-cd-timer-down-big", "Timer Down Big", { mode: "timer-down", style: "big" }, "Time left"],
    ["ng-cd-timer-down-bar", "Timer Down Bar", { mode: "timer-down", style: "bar" }, "Time left"],
  ] as const);

const POLLS = fam("polls", "poll",
  { defaultText: "What should I post next?\nTutorial\nBehind the scenes\nLive Q&A", defaultColor: "#FFA946", defaultDurationMs: 5000, maxLines: 5, hint: "Lines: question / option 1 / option 2 / option 3 (optional)." },
  [
    ["ng-po-2-bars", "Poll 2 Bars", { count: 2, style: "bars", layout: "wide" }, "Which edit style?\nClean cuts\nFast zooms"],
    ["ng-po-2-segmented", "Poll 2 Segmented", { count: 2, style: "segmented", layout: "wide" }, "Which edit style?\nClean cuts\nFast zooms"],
    ["ng-po-2-outline", "Poll 2 Outline", { count: 2, style: "outline", layout: "wide" }, "Which edit style?\nClean cuts\nFast zooms"],
    ["ng-po-2-winner", "Poll 2 Winner", { count: 2, style: "winner", layout: "wide" }, "Which edit style?\nClean cuts\nFast zooms"],
    ["ng-po-3-bars", "Poll 3 Bars", { count: 3, style: "bars", layout: "wide" }],
    ["ng-po-3-segmented", "Poll 3 Segmented", { count: 3, style: "segmented", layout: "wide" }],
    ["ng-po-3-outline", "Poll 3 Outline", { count: 3, style: "outline", layout: "wide" }],
    ["ng-po-3-winner", "Poll 3 Winner", { count: 3, style: "winner", layout: "wide" }],
    ["ng-po-4-bars", "Poll 4 Bars", { count: 4, style: "bars", layout: "wide" }, "Pick a topic\nEditing\nLighting\nAudio\nGear"],
    ["ng-po-4-segmented", "Poll 4 Segmented", { count: 4, style: "segmented", layout: "wide" }, "Pick a topic\nEditing\nLighting\nAudio\nGear"],
    ["ng-po-4-outline", "Poll 4 Outline", { count: 4, style: "outline", layout: "wide" }, "Pick a topic\nEditing\nLighting\nAudio\nGear"],
    ["ng-po-4-winner", "Poll 4 Winner", { count: 4, style: "winner", layout: "wide" }, "Pick a topic\nEditing\nLighting\nAudio\nGear"],
    ["ng-po-2-numbered", "Poll 2 Numbered", { count: 2, style: "numbered", layout: "wide" }, "Best time to post?\nMorning\nEvening"],
    ["ng-po-2-percent", "Poll 2 Percent", { count: 2, style: "percent", layout: "wide" }, "Best time to post?\nMorning\nEvening"],
    ["ng-po-3-numbered", "Poll 3 Numbered", { count: 3, style: "numbered", layout: "wide" }, "Rate this edit\nGreat\nGood\nOkay"],
    ["ng-po-3-percent", "Poll 3 Percent", { count: 3, style: "percent", layout: "wide" }, "Rate this edit\nGreat\nGood\nOkay"],
    ["ng-po-2-bars-compact", "Poll 2 Bars Compact", { count: 2, style: "bars", layout: "compact" }, "Which edit style?\nClean cuts\nFast zooms"],
    ["ng-po-3-bars-compact", "Poll 3 Bars Compact", { count: 3, style: "bars", layout: "compact" }],
    ["ng-po-4-bars-compact", "Poll 4 Bars Compact", { count: 4, style: "bars", layout: "compact" }, "Pick a topic\nEditing\nLighting\nAudio\nGear"],
    ["ng-po-2-winner-compact", "Poll 2 Winner Compact", { count: 2, style: "winner", layout: "compact" }, "Which edit style?\nClean cuts\nFast zooms"],
  ] as const);

const CHAT_BUBBLES = fam("chat-bubbles", "chatBubble",
  { defaultText: "New video is live!\nLink is in the comments", defaultColor: "#34D399", defaultDurationMs: 4000, maxLines: 3, hint: "Lines: message 1 / message 2 / message 3 (optional)." },
  [
    ["ng-ch-left-1-rounded", "Chat Left 1 Rounded", { side: "left", count: 1, style: "rounded" }, "New video is live!"],
    ["ng-ch-left-1-square", "Chat Left 1 Square", { side: "left", count: 1, style: "square" }, "New video is live!"],
    ["ng-ch-left-2-rounded", "Chat Left 2 Rounded", { side: "left", count: 2, style: "rounded" }],
    ["ng-ch-left-2-square", "Chat Left 2 Square", { side: "left", count: 2, style: "square" }],
    ["ng-ch-left-3-rounded", "Chat Left 3 Rounded", { side: "left", count: 3, style: "rounded" }, "New video is live!\nLink is in the comments\nWatching it now"],
    ["ng-ch-left-3-square", "Chat Left 3 Square", { side: "left", count: 3, style: "square" }, "New video is live!\nLink is in the comments\nWatching it now"],
    ["ng-ch-right-1-rounded", "Chat Right 1 Rounded", { side: "right", count: 1, style: "rounded" }, "New video is live!"],
    ["ng-ch-right-1-square", "Chat Right 1 Square", { side: "right", count: 1, style: "square" }, "New video is live!"],
    ["ng-ch-right-2-rounded", "Chat Right 2 Rounded", { side: "right", count: 2, style: "rounded" }],
    ["ng-ch-right-2-square", "Chat Right 2 Square", { side: "right", count: 2, style: "square" }],
    ["ng-ch-right-3-rounded", "Chat Right 3 Rounded", { side: "right", count: 3, style: "rounded" }, "New video is live!\nLink is in the comments\nWatching it now"],
    ["ng-ch-right-3-square", "Chat Right 3 Square", { side: "right", count: 3, style: "square" }, "New video is live!\nLink is in the comments\nWatching it now"],
    ["ng-ch-alt-2-rounded", "Chat Alternating 2 Rounded", { side: "alternating", count: 2, style: "rounded" }],
    ["ng-ch-alt-2-square", "Chat Alternating 2 Square", { side: "alternating", count: 2, style: "square" }],
    ["ng-ch-alt-3-rounded", "Chat Alternating 3 Rounded", { side: "alternating", count: 3, style: "rounded" }, "New video is live!\nLink is in the comments\nWatching it now"],
    ["ng-ch-alt-3-square", "Chat Alternating 3 Square", { side: "alternating", count: 3, style: "square" }, "New video is live!\nLink is in the comments\nWatching it now"],
    ["ng-ch-left-2-typing", "Chat Left 2 Typing", { side: "left", count: 2, style: "typing" }],
    ["ng-ch-right-2-typing", "Chat Right 2 Typing", { side: "right", count: 2, style: "typing" }],
    ["ng-ch-left-2-tail", "Chat Left 2 Tail", { side: "left", count: 2, style: "tail" }],
    ["ng-ch-right-2-avatar", "Chat Right 2 Avatar", { side: "right", count: 2, style: "rounded", withLabel: true }],
  ] as const);

/* --------------------------------- exports ---------------------------------- */

export const NEW_GRAPHICS_REGISTRY: NewGraphicEntry[] = [
  ...LOWER_THIRDS, ...CALLOUTS, ...CTAS, ...PROGRESS, ...COUNTERS,
  ...TEXT_REVEALS, ...QUOTES, ...RATINGS, ...BADGES, ...ARROWS,
  ...FRAMES, ...WIPES, ...COUNTDOWNS, ...POLLS, ...CHAT_BUBBLES,
];

export const NEW_GRAPHIC_IDS: string[] = NEW_GRAPHICS_REGISTRY.map((e) => e.id);

const NG_FAMILY_TITLES: Record<string, string> = {
  "lower-thirds": "Lower Thirds",
  "callouts": "Callouts",
  "subscribe-cta": "Subscribe & CTA",
  "progress": "Progress",
  "counters": "Counters",
  "text-reveals": "Text Reveals",
  "quote-cards": "Quote Cards",
  "rating": "Ratings",
  "badges-ribbons": "Badges & Ribbons",
  "arrows-pointers": "Arrows & Pointers",
  "frames": "Frames",
  "backgrounds-wipes": "Backgrounds & Wipes",
  "countdowns-timers": "Countdowns & Timers",
  "polls": "Polls",
  "chat-bubbles": "Chat Bubbles",
};

export const NEW_GRAPHICS_FAMILIES: NewGraphicFamily[] = Object.keys(NG_FAMILY_TITLES).map((id) => ({
  id,
  title: NG_FAMILY_TITLES[id]!,
  ids: NEW_GRAPHICS_REGISTRY.filter((e) => e.family === id).map((e) => e.id),
}));

/** SOCIAL_META-shaped rows, spread into SOCIAL_META in social.tsx. */
export const NEW_GRAPHICS_META: { id: OverlaySocialVariant; label: string; hint: string; defaultText: string; defaultColor: string }[] =
  NEW_GRAPHICS_REGISTRY.map((e) => ({ id: e.id, label: e.title, hint: e.hint, defaultText: e.defaultText, defaultColor: e.defaultColor }));

const newById = new Map<string, NewGraphicEntry>(NEW_GRAPHICS_REGISTRY.map((e) => [e.id, e]));
export const getNewGraphic = (id: string): NewGraphicEntry | undefined => newById.get(id);
export const isNewGraphicVariant = (id: string | undefined): boolean => !!id && newById.has(id);
