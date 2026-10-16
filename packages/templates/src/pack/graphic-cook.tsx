/**
 * Full-frame knockout: the whole frame turns black and the spoken word is cut out of it, so the video shows only
 * inside the letters.
 *
 * Why a <canvas>: the layout never sees the video pixels, and the in-browser exporter can't do mix-blend-mode, only
 * draws mask-image as a linear gradient, and turns inline SVG into an image (which loses web fonts, so an SVG text
 * mask would export in a fallback font). A 2D canvas punched with `destination-out` is a real alpha hole in
 * the preview, in the server render (a screenshot) and in the exporter (which draws <canvas> elements with
 * drawImage). Canvas text uses the document's loaded web fonts, so the hole is in the real typeface.
 * The drawing is a pure function of the props (the spec below), redrawn whenever the spec changes.
 */
import React, { useLayoutEffect, useRef } from "react";
import { continueRender, delayRender } from "remotion";
import { effectiveIntensity, exitStyle } from "../motion";
import { displayText, famCss, layoutBox, scaleOf } from "../text";
import type { PageRenderProps } from "../types";
import { EASE, tween, withAlpha } from "./kit";
import { optStr, specOf } from "./graphic-common";

interface CookSpec {
  w: number;
  h: number;
  matte: string;
  text: string;
  font: string;
  letterSpacing: number;
  wordSpacing: number;
  /** centre of the word */
  x: number;
  y: number;
  rotate: number;
  /** 0..1: how far the letters are cut through (the hole fades in) */
  hole: number;
  /** exit motion applied to the word (CSS transform / filter strings) */
  transform: string;
  filter: string;
  rim: { width: number; color: string } | null;
  lineHeight: number;
}

function draw(cv: HTMLCanvasElement, s: CookSpec) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.clearRect(0, 0, s.w, s.h);
  ctx.fillStyle = s.matte;
  ctx.fillRect(0, 0, s.w, s.h);
  if (!s.text) return;
  ctx.font = s.font;
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string; wordSpacing?: string };
  c.letterSpacing = `${s.letterSpacing}px`;
  c.wordSpacing = `${s.wordSpacing}px`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(s.text);
  // centre the ink (not the em box) on the anchor
  const dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  let t = new DOMMatrix().translate(s.x, s.y).rotate(s.rotate);
  if (s.transform) {
    try { t = t.multiply(new DOMMatrix(s.transform)); } catch { /* unparsable transform: draw without it */ }
  }
  ctx.setTransform(t);
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = Math.max(0, Math.min(1, s.hole));
  if (s.filter) ctx.filter = s.filter;
  ctx.fillText(s.text, 0, dy);
  if (s.rim && s.rim.width > 0) {
    // a fine keyline on the cut edge: on video it reads as the edge of the cut-out, on black it shows the word
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.6 * Math.max(0, Math.min(1, s.hole));
    ctx.strokeStyle = s.rim.color;
    ctx.lineWidth = s.rim.width;
    ctx.lineJoin = "round";
    ctx.strokeText(s.text, 0, dy);
  }
}

const KnockoutCanvas: React.FC<{ spec: CookSpec; style: React.CSSProperties }> = ({ spec, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(spec);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    draw(cv, spec);
    // the web font must be ready for canvas text: hold the frame until it is (fonts normally load before the first frame)
    if (typeof document !== "undefined" && document.fonts && !document.fonts.check(spec.font, spec.text || "A")) {
      const handle = delayRender(`knockout font ${spec.font}`);
      document.fonts.load(spec.font, spec.text || "A").catch(() => undefined).then(() => {
        if (ref.current) draw(ref.current, spec);
        continueRender(handle);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} width={spec.w} height={spec.h} data-knockout={key} style={style} />;
};

/** the word on screen: the latest one that has started (one word per card) */
export function currentWordIndex(page: PageRenderProps["page"], timeMs: number): number {
  let idx = 0;
  page.words.forEach((w, i) => { if (timeMs >= w.startMs) idx = i; });
  return idx;
}

export const CookLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = Math.max(0.3, Math.min(2, effectiveIntensity(style, page.emotion)));
  const idx = currentWordIndex(page, timeMs);
  const word = page.words[idx]!;
  const text = displayText(word, style);
  const spec0 = specOf(style, sc);
  // as big as the frame allows: the word spans the caption width (and never more than 80% of the height)
  const base = style.fontSize * sc;
  const w = measure(text, { ...spec0, fontSize: base }) || 1;
  const size = Math.min(base * Math.min(1, box.width / w), canvas.height * 0.8);
  // the hole fades in, 0.42 s cubic-bezier(.22,1,.36,1); stronger motion intensity makes it snappier
  const t0 = idx === 0 ? page.startMs : word.startMs;
  const hole = tween(timeMs, t0, 420 / k, EASE.outQuint, 0, settled);
  const exit = exitStyle(style, page.endMs - timeMs, settled, size);
  const rimW = style.stroke.enabled ? style.stroke.width * sc : 0;
  const spec: CookSpec = {
    w: Math.round(canvas.width), h: Math.round(canvas.height), matte: optStr(style, "matte", "#000000"), text,
    font: `${style.fontStyle} ${style.fontWeight} ${size.toFixed(2)}px ${famCss(style.fontId)}`,
    letterSpacing: +(style.letterSpacing * sc).toFixed(2), wordSpacing: +(style.wordSpacing * sc).toFixed(2),
    x: +box.cx.toFixed(2), y: +box.cy.toFixed(2), rotate: style.rotation, hole: +hole.toFixed(4),
    transform: typeof exit.transform === "string" ? exit.transform : "", filter: typeof exit.filter === "string" ? exit.filter : "",
    rim: rimW > 0 ? { width: +rimW.toFixed(2), color: style.stroke.color } : null, lineHeight: style.lineHeight,
  };
  // shadows and glow fall from the black frame INTO the letters (an inner shadow on the video)
  const filters = [
    ...style.shadows.map((s) => `drop-shadow(${(s.x * sc).toFixed(2)}px ${(s.y * sc).toFixed(2)}px ${(s.blur * sc).toFixed(2)}px ${s.color})`),
    ...(style.glow.enabled ? [`drop-shadow(0 0 ${(style.glow.radius * sc).toFixed(2)}px ${withAlpha(style.glow.color, style.glow.intensity)})`] : []),
  ];
  return (
    // a full-frame layer, centred like every caption container (the exit fades the whole black frame)
    <div style={{ position: "absolute", left: canvas.width / 2, top: canvas.height / 2, width: canvas.width, height: canvas.height, transform: "translate(-50%, -50%)", opacity: exit.opacity, pointerEvents: "none" }}>
      <KnockoutCanvas spec={spec} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", filter: filters.length ? filters.join(" ") : undefined }} />
    </div>
  );
};
