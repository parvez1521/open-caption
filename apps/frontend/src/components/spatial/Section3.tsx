"use client";

import { useMemo, useState } from "react";
import { ClipPlayer, Frame, ShowcaseCard, Tag, fmt, lookFor, usePages, useTranscript } from "./ShowcaseKit";

const ORANGE = "#FF8A00";
const CLIP = "kangkana";
const ROW = 46;

/** 03: the engine picks one key word per card; the list shows exactly what the renderer chose. */
export function Section3() {
  const { transcript, doc } = useTranscript(CLIP);
  const { style, settings } = useMemo(() => lookFor("staggered_splash", 1.4), []);
  const pages = usePages(doc, style, settings);
  const [t, setT] = useState(0);
  const idx = Math.max(0, pages.findIndex((p) => t >= p.startMs && t < p.endMs));
  const shift = Math.max(0, Math.min(idx - 2, pages.length - 7)) * ROW;

  return (
    <ShowcaseCard
      index={3}
      eyebrow="Emphasis"
      accent={ORANGE}
      wash="radial-gradient(70% 110% at 82% 45%, rgba(255,169,70,0.22) 0%, rgba(255,169,70,0.07) 45%, transparent 78%)"
      title="Keywords"
      titleAccent="that pop."
      body="On every card, the engine picks the word that carries the meaning. It gives that word the look.'s hero treatment: bigger, bolder, its own colour or box. Swipe-stopping, with no manual keyframes."
      points={[
        { k: "Picked automatically,", v: "favouring numbers, names and strong words." },
        { k: "Always yours:", v: "click any word to make it the hero." },
        { k: "Hero and body text", v: "style independently: font, size, colour." },
      ]}
    >
      <div className="absolute left-[36px] top-[70px]">
        <Frame width={276}>
          <ClipPlayer clip={CLIP} doc={doc} durationMs={transcript?.durationMs ?? 6000} style={style} settings={settings} onTime={setT} className="h-full w-full" />
        </Frame>
      </div>

      <div className="absolute left-[336px] top-[70px] w-[192px]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B4B4AA]">Cards</span>
          <span className="font-mono text-[10px] text-[#8F8F86]">{pages.length ? `${idx + 1} / ${pages.length}` : "…"}</span>
        </div>
        <div className="relative h-[322px] overflow-hidden rounded-2xl border border-[#FFFFEB]/10 bg-[#232320] [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
          <div className="transition-transform duration-500 ease-out" style={{ transform: `translateY(${-shift}px)` }}>
            {pages.map((p, k) => {
              const on = k === idx;
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 transition-colors duration-200" style={{ height: ROW, background: on ? "rgba(255,169,70,0.16)" : undefined, borderBottom: "1px solid rgba(255,255,235,0.07)" }}>
                  <span className="w-[36px] shrink-0 font-mono text-[9.5px] text-[#B4B4AA]">{fmt(p.startMs).slice(3)}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                    {p.words.map((w, j) =>
                      j === p.heroIndex ? (
                        <span key={w.id} className={`rounded-md px-1.5 py-0.5 text-[12px] font-bold uppercase ${on ? "text-[#141412]" : "text-[#FFFFEB]"}`} style={{ background: on ? "#FFA946" : "rgba(255,169,70,0.35)" }}>
                          {w.text.replace(/[.,!?]$/, "")}
                        </span>
                      ) : (
                        <span key={w.id} className="text-[12px] text-[#FFFFEB]/60">
                          {w.text.replace(/[.,!?]$/, "")}
                        </span>
                      ),
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Tag>
            <span className="h-2 w-2 rounded-sm bg-[#FFA946]" /> hero word
          </Tag>
          <Tag>≤ 3 words / card</Tag>
        </div>
      </div>

      <div className="absolute bottom-[46px] left-[36px] right-[34px] rounded-2xl bg-[#262622] px-4 py-3 text-[#FFFFEB]">
        <div className="flex items-center justify-between">
          <span className="text-[13px]">
            <span className="text-[#FFFFEB]/65">This card&apos;s hero:</span>{" "}
            <b className="font-accent text-[20px] font-normal italic text-[#FFA946]">{pages[idx]?.words[pages[idx]!.heroIndex]?.text.replace(/[.,!?]$/, "") ?? "…"}</b>
          </span>
          <span className="font-mono text-[11px] text-[#B4B4AA]">picked by the engine</span>
        </div>
      </div>
    </ShowcaseCard>
  );
}
