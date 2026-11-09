"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface WorksWheelItem {
  title: string;
  category?: string;
  image: string;
  video?: string;
  href?: string;
}

export interface WorksWheelProps extends Omit<
  React.ComponentPropsWithoutRef<"section">,
  "children"
> {
  items: WorksWheelItem[];
  label?: string;
  action?: string;
  scrollDriven?: boolean;
}

/* Geometry tuned for responsive 9:16 portrait video cards */
const CARD_H = 0.52; // front card height, of the stage
const CARD_MAX_W = 0.40; // max card width ratio
const CARD_RATIO = 0.5625; // 9:16 aspect ratio
const STEP = 32; // degrees between cards on the drum
const DRUM = 2.4; // drum radius
const LENS = 2.8; // perspective distance
const RING_R = 1.25; // ring radius
const BOW = 2.0;
const TITLE = 0.12; 
const INDEX = 0.038;

const WHEEL_UNITS = 900;
const DRAG_UNITS = 420;
const SETTLE = 140;
const EASE = 0.12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Stage = { w: number; h: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

const bowAt = (drumDeg: number, bow: number) =>
  -bow * (1 - Math.cos(rad(drumDeg)));

function place(
  ringDeg: number,
  drumDeg: number,
  ringR: number,
  drumR: number,
  bow: number,
  m: number,
) {
  return (
    `translateX(${m * bowAt(drumDeg, bow)}px)` +
    ` rotateZ(${(1 - m) * ringDeg}deg) translateY(${-(1 - m) * ringR}px)` +
    ` rotateX(${m * drumDeg}deg) translateZ(${m * drumR}px)`
  );
}

export interface WorksWheelRef {
  setTarget: (v: number) => void;
}

export const WorksWheel = React.forwardRef<WorksWheelRef, WorksWheelProps>(({
  items,
  label = "Looks",
  className,
  scrollDriven = false,
  ...props
}, ref) => {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<(HTMLElement | null)[]>([]);
  const labelRef = React.useRef<HTMLDivElement>(null);
  const titleRef = React.useRef<HTMLDivElement>(null);

  const turn = React.useRef(0);
  const target = React.useRef(0);
  const [active, setActive] = React.useState(0);
  const [stage, setStage] = React.useState<Stage>({ w: 0, h: 0 });

  const count = items.length;
  const last = Math.max(count - 1, 0);

  React.useImperativeHandle(ref, () => ({
    setTarget: (v: number) => {
      target.current = clamp(v, 0, last);
    }
  }), [last]);

  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = React.useMemo(() => {
    const { w, h } = stage;
    const isMobile = w < 768;
    const effectiveCardH = isMobile ? CARD_H * 1.15 : CARD_H;
    const effectiveMaxW = isMobile ? 0.85 : CARD_MAX_W;
    const cardW = Math.min(h * effectiveCardH * CARD_RATIO, w * effectiveMaxW);
    const cardH = cardW / CARD_RATIO;
    const drumR = cardH * DRUM;
    const ringR = cardH * RING_R;
    const ringScale = count
      ? clamp((((2 * Math.PI * ringR) / count) * 0.82) / (cardW || 1), 0.16, 1)
      : 1;
    return {
      cardW,
      cardH,
      ringR,
      ringScale,
      drumR,
      bow: cardH * BOW,
      depth: cardH * LENS,
      title: Math.max(cardH * TITLE, isMobile ? 22 : 28),
      index: Math.max(cardH * INDEX, 12),
    };
  }, [stage, count]);

  React.useEffect(() => {
    if (!stage.h) return;
    let frame = 0;
    const { ringR, ringScale, drumR, bow } = metrics;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const gap = target.current - turn.current;
      if (Math.abs(gap) < 0.0005) turn.current = target.current;
      else turn.current += gap * (reduced ? 1 : EASE);

      const t = turn.current;
      const m = clamp(t, 0, 1);
      const pos = Math.max(0, t - 1);

      if (wheelRef.current) {
        wheelRef.current.style.transform = `translateZ(${-m * drumR}px)`;
      }

      for (let i = 0; i < count; i++) {
        const d = i - pos;
        const drumDeg = d * STEP;
        const card = cardRefs.current[i];
        if (card) {
          card.style.transform = place(
            d * (360 / count),
            drumDeg,
            ringR,
            drumR,
            bow,
            m,
          );
          
          // Smooth opacity fade to prevent abrupt clipping
          const dist = Math.abs(d);
          const drumAlpha = clamp(1 - (dist - 1.2) / 2.5, 0, 1);
          const alpha = lerp(1, drumAlpha, m);
          card.style.opacity = String(alpha);
          card.style.zIndex = String(Math.round(100 - dist * 2));
          card.style.pointerEvents = alpha > 0.5 ? "auto" : "none";
        }
        const face = card?.firstElementChild as HTMLElement | null;
        if (face) face.style.transform = `scale(${lerp(ringScale, 1, m)})`;
      }

      if (labelRef.current) labelRef.current.style.opacity = String(1 - m);
      if (titleRef.current) titleRef.current.style.opacity = String(m);

      const near = clamp(Math.round(pos), 0, last);
      setActive((prev) => (prev === near ? prev : near));
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [metrics, stage.h, count, last, reduced]);

  const to = React.useCallback(
    (next: number) => {
      target.current = clamp(next, 0, last + 1);
    },
    [last],
  );

  React.useEffect(() => {
    if (scrollDriven) return;
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const next = target.current + event.deltaY / WHEEL_UNITS;
      if (next > 0 && next < last + 1) event.preventDefault();
      to(next);
      window.clearTimeout(settling.current);
      settling.current = window.setTimeout(
        () => to(Math.round(target.current)),
        SETTLE,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settling.current);
    };
  }, [to, last, scrollDriven]);

  const drag = React.useRef<number | null>(null);
  const settling = React.useRef(0);

  return (
    <section
      aria-label={label}
      className={cn(
        "relative h-full min-h-[30rem] sm:min-h-[36rem] w-full overflow-hidden select-none bg-transparent text-[#FFFFEB]",
        className,
      )}
      {...props}
    >
      <div
        ref={stageRef}
        tabIndex={0}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`works-wheel-${active}`}
        className="focus-visible:outline-[#FFFFEB] absolute inset-0 cursor-grab touch-pan-y outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 active:cursor-grabbing"
        style={{ perspective: `${metrics.depth}px` }}
        onPointerDown={(event) => {
          if (scrollDriven) return;
          drag.current = event.clientY;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (scrollDriven || drag.current === null) return;
          to(target.current + (drag.current - event.clientY) / DRAG_UNITS);
          drag.current = event.clientY;
        }}
        onPointerUp={() => {
          if (scrollDriven) return;
          drag.current = null;
          if (target.current > 1) to(Math.round(target.current));
        }}
        onKeyDown={(event) => {
          if (scrollDriven) return;
          if (event.key === "ArrowDown") to(Math.round(target.current) + 1);
          else if (event.key === "ArrowUp") to(Math.round(target.current) - 1);
          else return;
          event.preventDefault();
        }}
      >
        <div
          ref={wheelRef}
          className="absolute top-1/2 left-1/2 [transform-style:preserve-3d]"
        >
          {items.map((item, i) => {
            const Tag = (item.href ? "a" : "div") as "a";
            return (
              <React.Fragment key={item.title}>
                <Tag
                  id={`works-wheel-${i}`}
                  role="option"
                  aria-selected={i === active}
                  href={item.href || "/login"}
                  ref={(node: HTMLElement | null) => {
                    cardRefs.current[i] = node;
                  }}
                  className="group absolute [backface-visibility:hidden] transition-transform"
                  style={{
                    width: metrics.cardW,
                    height: metrics.cardH,
                    marginLeft: -metrics.cardW / 2,
                    marginTop: -metrics.cardH / 2,
                  }}
                >
                  <span className="relative block size-full overflow-hidden rounded-xl sm:rounded-2xl border border-[#FFFFEB]/10 bg-[#1E1E1B] shadow-[0_24px_50px_-20px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover:border-[#FFFFEB]/40 group-hover:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.65)]">
                    {item.video ? (
                      <video
                        src={item.video}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="size-full object-cover scale-[1.01]"
                      />
                    ) : (
                      <img
                        src={item.image}
                        alt={item.title}
                        draggable={false}
                        className="size-full object-cover scale-[1.01]"
                      />
                    )}
                  </span>
                </Tag>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Ring center title and front-card title */}
      <div
        ref={labelRef}
        className="pointer-events-none absolute inset-0 grid place-items-center tracking-tight font-styled font-bold text-[#FFFFEB]"
        style={{ fontSize: metrics.title }}
      >
        <span className="text-center px-4">
          {label}
        </span>
      </div>

      <div
        ref={titleRef}
        className="pointer-events-none absolute top-1/2 left-[5%] sm:left-[8%] -translate-y-1/2 tracking-tight opacity-0 max-w-[280px] sm:max-w-[420px]"
        style={{ fontSize: metrics.title }}
      >
        <span className="font-styled font-bold text-[#FFFFEB] block leading-tight">
          {items[active]?.title}
        </span>
        {items[active]?.category && (
          <span className="text-xs sm:text-sm font-mono text-[#34D399] font-bold block mt-1 uppercase tracking-wider">
            {items[active]?.category}
          </span>
        )}
      </div>

      {/* Index list down the right */}
      <ol
        className="hidden md:block absolute top-[10%] right-[3%] text-right leading-[1.8] font-mono"
        style={{ fontSize: metrics.index }}
      >
        {items.map((item, i) => (
          <li key={item.title}>
            <button
              type="button"
              onClick={() => {
                if (!scrollDriven) to(i + 1);
              }}
              className={cn(
                "cursor-pointer transition-colors outline-none",
                scrollDriven ? "cursor-default" : "hover:text-[#FFFFEB]",
                i === active
                  ? "text-[#FFFFEB] font-bold underline decoration-[#FFA946] decoration-2 underline-offset-4"
                  : "text-[#FFFFEB]/45",
              )}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
});

WorksWheel.displayName = "WorksWheel";

export default WorksWheel;
