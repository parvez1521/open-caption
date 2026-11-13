/** Overlay layouts: a neon frame whose border lines run across the whole video, an iOS-style notification, a pop-up chat bubble. */
import React from "react";
import { effectiveIntensity, exitStyle, combineMotion } from "../motion";
import { backgroundCss, containerCss, displayText, famCss, fillCss, layoutBox, scaleOf } from "../text";
import type { PageRenderProps } from "../types";
import { EASE, keyframes, linear01, tween, withAlpha } from "./kit";
import { dropFilter, fitScale, glowLayers, optStr, px, rowWidth, shadowLayers, specOf, strokeOf } from "./graphic-common";

const textShadow = (layers: string[]) => (layers.length ? layers.join(", ") : undefined);

// ---------------------------------------------------------------- boxed

/**
 * Small Inter lead-in words over one big italic serif word (the card's last), in a dark box with a 1 px neon border.
 * The border's four lines carry on across the whole video, with dots where they cross.
 */
export const BoxedLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const texts = page.words.map((w) => displayText(w, style));
  const bigIdx = texts.length - 1;
  const bigText = displayText(page.words[bigIdx]!, style, style.hero.casing ?? style.casing);
  const lead = texts.slice(0, bigIdx);
  const bigFont = style.hero.fontId ?? "Playfair Display";
  const bigWeight = style.hero.fontWeight ?? 600;
  const italic = style.templateOptions.heroItalic !== false;
  const lead0 = style.fontSize * sc;
  const big0 = lead0 * style.hero.scale;
  const gap = (s: number) => 0.28 * s + style.wordSpacing * sc;
  const leadSpec = specOf(style, sc);
  const bigSpec = specOf(style, sc, { fontId: bigFont, fontWeight: bigWeight, fontStyle: italic ? "italic" : "normal" });
  const padX = 0.3;
  const inner = Math.max(rowWidth(lead, lead0, leadSpec, measure, gap(lead0)), measure(bigText, { ...bigSpec, fontSize: big0 }) * 1.06);
  const f = fitScale(inner + 2 * padX * big0, box.width);
  const leadSize = lead0 * f;
  const big = big0 * f;
  const line = style.active.color;
  const bw = Math.max(1, 2 * sc);
  const dot = 8 * sc;
  // the lines reach the frame edges from wherever the box sits (kept to ~2x the frame: a blur exit precomposes them)
  const pos = page.position ?? style.position;
  const reachX = pos.x * canvas.width + 2;
  const reachY = pos.y * canvas.height + 2;

  // boxedBoxIn: scale .95 -> 1 (0.18 s ease); lines slide in from -/+40 px (0.18 s, delays 0.04 / 0.08 s)
  const pBox = tween(timeMs, page.startMs, 180, EASE.ease, 0, settled);
  const p1 = tween(timeMs, page.startMs, 180, EASE.ease, 40, settled);
  const p2 = tween(timeMs, page.startMs, 180, EASE.ease, 80, settled);
  const shift = 0.5 * big * k;
  // thin, low-opacity guides (the box border itself stays at full strength)
  const lineCss: React.CSSProperties = { position: "absolute", backgroundColor: line, opacity: 0.35, boxShadow: `0 0 ${px(4 * sc)} ${withAlpha(line, 0.6)}` };
  // the box: rgba(0,0,0,.65) with a faint tint of the line colour, so the frame still reads on a black backdrop
  const tint = /^#?([0-9a-f]{6})$/i.exec(line.trim());
  const n = tint ? parseInt(tint[1]!, 16) : 0;
  const boxFill = `rgba(${Math.round(((n >> 16) & 255) * 0.1)},${Math.round(((n >> 8) & 255) * 0.1)},${Math.round((n & 255) * 0.1)},0.7)`;
  // a substantial frame: at least ~55 % of the caption width, whatever the words
  const minBox = Math.min(box.width, 0.55 * box.width);
  const bigFill = style.hero.fill ? fillCss(style.hero.fill) : fillCss({ type: "gradient", angle: 180, stops: [{ color: "#FFFFFF", at: 0.2 }, { color: line, at: 1 }] });
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ position: "relative", ...backgroundCss(style, sc), ...combineMotion({ opacity: pBox, transform: `scale(${(1 - 0.05 * k * (1 - pBox)).toFixed(4)})` }, exitStyle(style, page.endMs - timeMs, settled, big)) }}>
        {/* the frame's lines, run out across the video (templateOptions.guideLines: false hides them) */}
        {style.templateOptions.guideLines !== false ? (
          <>
            <div style={{ ...lineCss, left: -reachX, width: canvas.width * 2, top: 0, height: bw }} />
            <div style={{ ...lineCss, left: -reachX, width: canvas.width * 2, bottom: 0, height: bw }} />
            <div style={{ ...lineCss, top: -reachY, height: canvas.height * 2, left: 0, width: bw }} />
            <div style={{ ...lineCss, top: -reachY, height: canvas.height * 2, right: 0, width: bw }} />
          </>
        ) : null}
        <div style={{
          position: "relative", backgroundColor: boxFill, filter: dropFilter({ ...style, glow: { ...style.glow, enabled: false } }, sc), border: `${px(bw)} solid ${line}`,
          boxShadow: `0 0 ${px(8 * sc)} ${withAlpha(line, 0.55)}`, minWidth: minBox, boxSizing: "border-box",
          padding: `${px(0.16 * big)} ${px(padX * big)} ${px(0.14 * big)}`, rowGap: 0.04 * big, display: "flex", flexDirection: "column", alignItems: "flex-start",
        }}>
          {lead.length ? (
            <div style={{
              display: "flex", flexWrap: "nowrap", columnGap: gap(leadSize), whiteSpace: "pre", fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle,
              fontSize: leadSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing * sc, ...strokeOf(style, sc),
              opacity: p1, transform: `translateX(${px(-shift * (1 - p1))})`,
            }}>
              {lead.map((t, i) => <span key={i} style={{ ...fillCss(page.words[i]!.color ? { type: "solid", color: page.words[i]!.color! } : style.fill) }}>{t}</span>)}
            </div>
          ) : null}
          <div style={{
            fontFamily: famCss(bigFont), fontWeight: bigWeight, fontStyle: italic ? "italic" : "normal", fontSize: big, lineHeight: style.lineHeight * 0.95, whiteSpace: "pre",
            letterSpacing: style.letterSpacing * sc * (big / Math.max(1, leadSize)) * 0.2, paddingRight: 0.06 * big, ...strokeOf(style, sc),
            opacity: p2, transform: `translateX(${px(shift * (1 - p2))})`,
            filter: [`drop-shadow(0 0 ${px(0.05 * big)} ${withAlpha(line, 0.4)})`, ...(style.glow.enabled ? [`drop-shadow(0 0 ${px(style.glow.radius * sc)} ${withAlpha(style.glow.color, style.glow.intensity)})`] : [])].join(" "),
          }}>
            <span style={bigFill}>{bigText}</span>
          </div>
        </div>
        {/* dots where the lines cross */}
        {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => (
          <div key={i} style={{ position: "absolute", width: dot, height: dot, borderRadius: dot, backgroundColor: line, boxShadow: `0 0 ${px(4 * sc)} ${line}`,
            left: x ? undefined : bw / 2 - dot / 2, right: x ? bw / 2 - dot / 2 : undefined, top: y ? undefined : bw / 2 - dot / 2, bottom: y ? bw / 2 - dot / 2 : undefined }} />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- notification

/** original, generic app glyphs (no brand marks): a chat bubble, a phone handset, an envelope */
const GLYPHS: Record<string, { bg: string; svg: React.ReactNode }> = {
  messages: {
    bg: "linear-gradient(180deg, #5BE07A 0%, #2DBE4E 100%)",
    svg: <><ellipse cx="12" cy="11.2" rx="8.2" ry="6.6" fill="#FFFFFF" /><path d="M6.4 15.2 L4.6 19.6 L10.4 16.9 Z" fill="#FFFFFF" /></>,
  },
  phone: {
    bg: "linear-gradient(180deg, #5BE07A 0%, #2DBE4E 100%)",
    svg: <path fill="#FFFFFF" d="M7.2 4.2c.7-.4 1.5-.2 1.9.5l1.6 3c.3.6.2 1.3-.3 1.7l-1.3 1c.9 2 2.4 3.6 4.4 4.6l1.1-1.2c.4-.5 1.2-.6 1.7-.3l2.9 1.8c.6.4.8 1.2.4 1.8l-.9 1.5c-.6 1-1.7 1.5-2.8 1.2-5.2-1.4-9-5.4-10.2-10.6-.3-1.1.2-2.2 1.1-2.7z" />,
  },
  mail: {
    bg: "linear-gradient(180deg, #4FB4FF 0%, #1C6FEA 100%)",
    svg: <><rect x="4" y="6.5" width="16" height="11" rx="1.8" fill="#FFFFFF" /><path d="M4.8 7.6 L12 13 L19.2 7.6" fill="none" stroke="#1C6FEA" strokeWidth="1.6" strokeLinejoin="round" /></>,
  },
};

function notifMotion(kind: string, timeMs: number, start: number, k: number, size: number, settled?: boolean): React.CSSProperties {
  if (settled) return {};
  if (kind === "pop") {
    // scale 0 -> 1.06 (70 %) -> 1; 0.45 s cubic-bezier(.34,1.56,.64,1)
    const t = linear01(timeMs, start, 450);
    const s = keyframes(t, [[0, 1 - k], [0.7, 1 + 0.06 * k], [1, 1]], EASE.outBack);
    return { opacity: Math.min(1, t / 0.25), transform: `scale(${Math.max(0, s).toFixed(4)})` };
  }
  if (kind === "slide-left") {
    // X -120 % -> 0; 0.5 s cubic-bezier(.22,1,.36,1)
    const p = tween(timeMs, start, 500, EASE.outQuint);
    return { opacity: Math.min(1, p * 3), transform: `translateX(${(-120 * k * (1 - p)).toFixed(2)}%)` };
  }
  // slide down: Y -60 px, scale .92 -> Y +4 px (60 %) -> 0; 0.7 s cubic-bezier(.34,1.56,.64,1), 0.05 s delay
  const t = linear01(timeMs, start + 50, 700);
  const y = keyframes(t, [[0, -3.75 * size * k], [0.6, 0.25 * size * k], [1, 0]], EASE.outBack);
  const s = keyframes(t, [[0, 1 - 0.08 * k], [0.6, 1], [1, 1]], EASE.outBack);
  return { opacity: Math.min(1, t / 0.35), transform: `translateY(${px(y)}) scale(${s.toFixed(4)})` };
}

/** An iOS-style notification banner: app tile, sender, "now", and the card as the message. */
export const NotificationLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const size = style.fontSize * sc;
  const glyph = GLYPHS[optStr(style, "app", "messages")] ?? GLYPHS.messages!;
  const icon = 2.3 * size;
  const width = Math.min(box.width, 17 * size);
  const texts = page.words.map((w) => displayText(w, style));
  const font = { fontFamily: famCss(style.fontId), letterSpacing: style.letterSpacing * sc, lineHeight: style.lineHeight };
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ ...backgroundCss(style, sc), ...combineMotion(notifMotion(optStr(style, "motion", "slide-down"), timeMs, page.startMs, k, size, settled), exitStyle(style, page.endMs - timeMs, settled, size)), filter: dropFilter(style, sc) }}>
        <div style={{
          width, boxSizing: "border-box", display: "flex", textAlign: "left", alignItems: "center", columnGap: 0.7 * size, padding: `${px(0.62 * size)} ${px(0.8 * size)}`,
          // the frosted banner, faked with near-opaque white (backdrop blur can't be exported)
          backgroundColor: optStr(style, "banner", "rgba(250,250,252,0.94)"), borderRadius: 1.1 * size, border: `${px(Math.max(1, 0.06 * size))} solid rgba(255,255,255,0.55)`,
          boxShadow: `0 ${px(0.125 * size)} ${px(0.375 * size)} rgba(0,0,0,0.18)`,
        }}>
          <div style={{ flex: "none", width: icon, height: icon, borderRadius: 0.24 * icon, backgroundImage: glyph.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={icon * 0.72} height={icon * 0.72} viewBox="0 0 24 24">{glyph.svg}</svg>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", rowGap: 0.08 * size }}>
            <div style={{ ...font, display: "flex", alignItems: "baseline", justifyContent: "space-between", columnGap: 0.5 * size, fontSize: 0.92 * size }}>
              <span style={{ fontWeight: 600, color: "rgba(0,0,0,0.85)", whiteSpace: "nowrap" }}>{optStr(style, "sender", "Messages")}</span>
              <span style={{ fontWeight: 400, fontSize: 0.8 * size, color: "rgba(60,60,67,0.6)", whiteSpace: "nowrap" }}>{optStr(style, "time", "now")}</span>
            </div>
            <div style={{ ...font, fontSize: size, fontWeight: style.fontWeight, fontStyle: style.fontStyle, wordSpacing: style.wordSpacing * sc, ...strokeOf(style, sc), textShadow: textShadow(glowLayers(style, sc)) }}>
              {texts.map((t, i) => (
                <React.Fragment key={page.words[i]!.id}>
                  <span style={fillCss(page.words[i]!.color ? { type: "solid", color: page.words[i]!.color! } : style.fill)}>{t}</span>
                  {i < texts.length - 1 ? " " : null}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- pop-up chat

/** A mint pill speech bubble with a tail (right, or left), popping in with a twist. */
export const PopupChatLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const left = optStr(style, "tail", "right") === "left";
  const bubble = optStr(style, "bubble", "#5EE5AC");
  const texts = page.words.map((w) => displayText(w, style));
  const base = style.fontSize * sc;
  const gap = (s: number) => 0.26 * s + style.wordSpacing * sc;
  const f = fitScale(rowWidth(texts, base, specOf(style, sc), measure, gap(base)) + 2 * 0.67 * base, box.width);
  const size = base * f;
  // popIn: scale 0, rotate -15deg (+15deg mirrored) -> 1, 0; 0.6 s cubic-bezier(.34,1.56,.64,1), 0.05 s delay, from the bottom centre
  const p = tween(timeMs, page.startMs, 600, EASE.outBack, 50, settled);
  const from = Math.max(0, 1 - k);
  const pop: React.CSSProperties = settled ? {} : {
    opacity: Math.min(1, Math.max(0, (timeMs - page.startMs - 50) / 120)),
    transform: `rotate(${((left ? 15 : -15) * k * (1 - p)).toFixed(2)}deg) scale(${Math.max(0, from + (1 - from) * p).toFixed(4)})`,
  };
  const layers = [...shadowLayers(style, sc), ...glowLayers(style, sc)];
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ position: "relative", transformOrigin: "50% 100%", ...backgroundCss(style, sc), ...combineMotion(pop, exitStyle(style, page.endMs - timeMs, settled, size)) }}>
        <svg width={0.62 * size} height={0.56 * size} viewBox="0 0 24 22" style={{ position: "absolute", bottom: -0.08 * size, [left ? "left" : "right"]: -0.14 * size, transform: left ? "scaleX(-1)" : undefined, overflow: "visible" }}>
          <path d="M0 2 C 5 9, 12 17, 24 21 C 17 15, 14 8, 13 0 Z" fill={bubble} />
        </svg>
        <div style={{
          position: "relative", display: "flex", flexWrap: "nowrap", columnGap: gap(size), whiteSpace: "pre", backgroundColor: bubble, borderRadius: 9999,
          padding: `${px(0.28 * size)} ${px(0.67 * size)}`, boxShadow: `0 ${px(0.11 * size)} ${px(0.42 * size)} ${withAlpha(bubble, 0.3)}`,
          fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: size, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing * sc,
          ...strokeOf(style, sc), textShadow: textShadow(layers),
        }}>
          {texts.map((t, i) => <span key={page.words[i]!.id} style={fillCss(page.words[i]!.color ? { type: "solid", color: page.words[i]!.color! } : style.fill)}>{t}</span>)}
        </div>
      </div>
    </div>
  );
};
