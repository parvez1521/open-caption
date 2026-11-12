"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { TRENDING_LOOKS, fontStack, loadFontFamily, type LookDefinition } from "@capseasy/templates";
import { AnimatedTemplatePreview } from "@/features/studio/panels/AnimatedTemplatePreview";
import { AUTO_DEG_PER_MS, RESUME_AFTER_MS, cardTransform, cylinderRadius, dragDeltaDeg, facing, facingOpacity } from "./heroCylinderMath";

/**
 * Hero visual: the curated Trending templates on a slowly rotating 3D cylinder.
 *
 * - Cards are arranged with CSS 3D transforms (rotateY + translateZ on a preserve-3d ring).
 * - Auto-rotation is SLOW (one turn / 72s), driven by direct DOM writes (no React re-render per
 *   frame), and pauses while the hero is off-screen, the tab is hidden, the visitor is dragging,
 *   or for 2.5s after a drag. prefers-reduced-motion disables auto-rotation entirely.
 * - Drag / swipe (pointer events, touch-action none) spins the ring manually.
 * - Every card's preview is the studio picker's AnimatedTemplatePreview — the template's own Page
 *   through PageView over the same synthetic page — so hero motion is the real template motion.
 *   That component's shared FIFO budget caps live previews at 6 across the page, and each preview
 *   only mounts near the viewport, so the cylinder never runs 10 live renderers at once.
 */

const CARD_W_DESKTOP = 288;
const CARD_W_PHONE = 232;

/** Poster under the live layer: the template's name line in its own font and colours (mirrors the picker poster). */
const CylinderPoster: React.FC<{ look: LookDefinition }> = ({ look }) => {
  const s = look.style;
  const fill = s.fill.type === "solid" ? s.fill.color : s.fill.stops[0]!.color;
  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-3 text-center text-[22px] leading-tight">
      <span
        style={{
          fontFamily: fontStack(s.fontId),
          fontWeight: s.fontWeight,
          color: fill,
          textTransform: s.casing === "upper" ? "uppercase" : s.casing === "lower" ? "lowercase" : "none",
        }}
      >
        {look.templateId === "word_by_word" ? "WATCH" : "Watch this"} <span style={{ color: s.active.color }}>now</span>
      </span>
    </div>
  );
};

export function HeroCylinder() {
  const looks = TRENDING_LOOKS;
  const wrapRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const angleRef = useRef(0);
  const visibleRef = useRef(false);
  const dragRef = useRef<{ startX: number; startAngle: number } | null>(null);
  const lastDragEndRef = useRef(0);
  const reducedRef = useRef(false);
  const [cardW, setCardW] = useState(CARD_W_DESKTOP);
  const [, setFontsTick] = useState(0);

  const radius = useMemo(() => cylinderRadius(cardW, looks.length), [cardW, looks.length]);

  // responsive card width (radius follows)
  useEffect(() => {
    const update = () => setCardW(window.innerWidth < 640 ? CARD_W_PHONE : CARD_W_DESKTOP);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // preview each trending template in its real font, like the picker does — but at idle: every
  // card's preview lazy-loads its own fonts anyway, so this bulk pass (a dozen-plus families)
  // must not compete with the intro and the first paint for bandwidth and main thread.
  useEffect(() => {
    const families = [...new Set(looks.flatMap((l) => [l.style.fontId, l.style.hero.fontId ?? ""]).filter(Boolean))];
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      void Promise.all(families.map(loadFontFamily)).then(() => !cancelled && setFontsTick((n) => n + 1));
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) {
      const id = ric(start, { timeout: 2500 });
      return () => {
        cancelled = true;
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      };
    }
    const t = setTimeout(start, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [looks]);

  // rotation loop: direct DOM writes only
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const io = new IntersectionObserver(([e]) => (visibleRef.current = !!e?.isIntersecting), { threshold: 0.05 });
    io.observe(wrap);

    const apply = () => {
      const ring = ringRef.current;
      if (!ring) return;
      ring.style.transform = `rotateY(${angleRef.current}deg)`;
      for (let i = 0; i < looks.length; i++) {
        const el = cardRefs.current[i];
        if (el) el.style.opacity = String(facingOpacity(facing(i, looks.length, angleRef.current)));
      }
    };
    apply();

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const idle = !dragRef.current && now - lastDragEndRef.current > RESUME_AFTER_MS;
      if (!reducedRef.current && visibleRef.current && !document.hidden && idle) {
        angleRef.current = (angleRef.current + AUTO_DEG_PER_MS * dt) % 360;
        apply();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [looks.length]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startAngle: angleRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !ringRef.current) return;
    angleRef.current = drag.startAngle + dragDeltaDeg(e.clientX - drag.startX);
    ringRef.current.style.transform = `rotateY(${angleRef.current}deg)`;
    for (let i = 0; i < looks.length; i++) {
      const el = cardRefs.current[i];
      if (el) el.style.opacity = String(facingOpacity(facing(i, looks.length, angleRef.current)));
    }
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    lastDragEndRef.current = performance.now();
  };

  return (
    <div className="relative mx-auto w-full max-w-6xl select-none px-2">
      <div
        ref={wrapRef}
        role="img"
        aria-label={`A rotating showcase of trending caption templates: ${looks.map((l) => l.name).join(", ")}`}
        className="relative mx-auto h-[320px] cursor-grab overflow-hidden active:cursor-grabbing sm:h-[360px]"
        style={{ perspective: "1400px", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div ref={ringRef} className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {looks.map((look, i) => (
            <div
              key={look.id}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              aria-hidden
              className="absolute left-1/2 top-1/2 overflow-hidden rounded-2xl border border-[#FFFFEB]/10 bg-[#1C1C1A] shadow-[0_24px_50px_-24px_rgba(0,0,0,0.7)]"
              style={{ width: cardW, transform: cardTransform(i, looks.length, radius), backfaceVisibility: "hidden" }}
            >
              <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                <span className="truncate text-[13px] font-bold text-[#FFFFEB]">{look.name}</span>
                <span className="shrink-0 rounded-full bg-[#FFA946] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#141412]">Trending</span>
              </div>
              <div className="mt-2">
                <AnimatedTemplatePreview look={look} poster={<CylinderPoster look={look} />} />
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                {(look.tags ?? []).slice(0, 2).map((t) => (
                  <span key={t} className="rounded-md bg-[#232320] px-2 py-0.5 text-[11px] font-medium text-[#B4B4AA]">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
