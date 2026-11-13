"use client";

import { useMemo, useState } from "react";
import { ClipPlayer, Frame, ShowcaseCard, Tag, fmt, lookFor, useTranscript } from "./ShowcaseKit";

const EMERALD = "#34D399";
const CLIP = "gereon";

/** 01: every word carries its own start and end, straight from local whisper. */
export function Section1Productivity() {
  const { transcript, doc } = useTranscript(CLIP);
  const { style, settings } = useMemo(() => lookFor("explainer", 1.5), []);
  const [t, setT] = useState(0);
  const words = transcript?.words ?? [];
  const dur = transcript?.durationMs ?? 6000;
  const cur = words.find((w) => t >= w.startMs && t < w.endMs) ?? [...words].reverse().find((w) => w.startMs <= t) ?? words[0];

  return (
    <ShowcaseCard
      index={1}
      eyebrow="Transcription"
      accent={EMERALD}
      wash="radial-gradient(70% 110% at 82% 45%, rgba(52,211,153,0.16) 0%, rgba(52,211,153,0.05) 45%, transparent 75%)"
      title="Word-perfect"
      titleAccent="timing."
      body="Speech recognition runs right in your browser. It stamps every word with its start and end. So captions land on the syllable, instead of drifting a beat behind."
      points={[
        { k: "Word-level timestamps,", v: "not sentence blocks." },
        { k: "Nothing to install:", v: "it runs in the tab you already have open." },
        { k: "Drag any word", v: "on the timeline to nudge it by a frame." },
      ]}
    >
      <div className="absolute left-[34px] top-[64px]">
        <Frame width={262}>
          <ClipPlayer clip={CLIP} doc={doc} durationMs={dur} style={style} settings={settings} onTime={setT} className="h-full w-full" />
        </Frame>
      </div>

      {/* word inspector */}
      <div className="absolute left-[322px] top-[84px] w-[204px] rounded-2xl border border-[#FFFFEB]/10 bg-[#232320] p-4 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B4B4AA]">Now speaking</span>
          <span className="flex h-2 w-2 rounded-full bg-[#34D399] shadow-[0_0_0_4px_rgba(52,211,153,0.2)]" />
        </div>
        <div className="mt-2 truncate text-[30px] font-bold leading-tight tracking-[-0.02em]">{cur?.text.replace(/[.,!?]$/, "") ?? "…"}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
          <div className="rounded-lg bg-[#FFFFEB]/[0.04] px-2 py-1.5">
            <div className="text-[#B4B4AA]">start</div>
            <div className="font-semibold">{fmt(cur?.startMs ?? 0)}</div>
          </div>
          <div className="rounded-lg bg-[#FFFFEB]/[0.04] px-2 py-1.5">
            <div className="text-[#B4B4AA]">end</div>
            <div className="font-semibold">{fmt(cur?.endMs ?? 0)}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-[#FFFFEB]/60">
          <span>{cur ? cur.endMs - cur.startMs : 0} ms</span>
          <span>{words.length} words · {(dur / 1000).toFixed(1)} s</span>
        </div>
      </div>

      <div className="absolute left-[322px] top-[300px] flex w-[204px] flex-col gap-2">
        <Tag dark>whisper · in your browser</Tag>
        <Tag>no install · no per-minute bill</Tag>
      </div>

      {/* timeline */}
      <div className="absolute bottom-[44px] left-[34px] right-[34px] rounded-2xl border border-[#FFFFEB]/10 bg-[#232320] px-4 pb-4 pt-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-[0.14em] text-[#B4B4AA]">Captions track</span>
          <span className="font-mono text-[#FFFFEB]/60">{fmt(t)}</span>
        </div>
        <div className="relative mt-2 h-[14px] border-b border-[#FFFFEB]/10">
          {Array.from({ length: Math.floor(dur / 1000) + 1 }, (_, s) => (
            <span key={s} className="absolute bottom-0 font-mono text-[9px] text-[#8F8F86]" style={{ left: `${((s * 1000) / dur) * 100}%` }}>
              <span className="absolute bottom-0 h-[5px] w-px bg-[#FFFFEB]/25" />
              <span className="ml-1">{s}s</span>
            </span>
          ))}
        </div>
        <div className="relative mt-2 h-[38px]">
          {words.map((w) => {
            const on = w === cur;
            const past = w.endMs <= t;
            return (
              <div
                key={w.id}
                className="absolute top-0 flex h-full items-center justify-center overflow-hidden rounded-md border px-1 text-[10px] font-semibold transition-colors duration-150"
                style={{
                  left: `calc(${(w.startMs / dur) * 100}% + 1px)`,
                  width: `calc(${((w.endMs - w.startMs) / dur) * 100}% - 2px)`,
                  background: on ? EMERALD : past ? "rgba(255,255,235,0.10)" : "#3A3A35",
                  borderColor: on ? "#10B981" : "rgba(255,255,235,0.14)",
                  color: on ? "#06281C" : past ? "rgba(255,255,235,0.75)" : "#FFFFEB",
                  boxShadow: on ? "0 6px 16px -6px rgba(16,185,129,0.8)" : undefined,
                }}
              >
                {on ? (
                  <>
                    <span className="absolute inset-y-1 left-0.5 w-[3px] rounded-full bg-[#06281C]/40" />
                    <span className="absolute inset-y-1 right-0.5 w-[3px] rounded-full bg-[#06281C]/40" />
                  </>
                ) : null}
                {/* label only when the whole word fits: a cut-off "tha..." reads as placeholder text */}
                {((w.endMs - w.startMs) / dur) * 460 >= w.text.replace(/[.,!?]$/, "").length * 6.4 + 10 ? <span className="whitespace-nowrap">{w.text.replace(/[.,!?]$/, "")}</span> : null}
              </div>
            );
          })}
          <div className="pointer-events-none absolute -bottom-1 -top-3 w-[2px] rounded-full bg-[#FFA946]" style={{ left: `${(t / dur) * 100}%` }}>
            <span className="absolute -left-[4px] -top-1 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[#FFA946]" />
          </div>
        </div>
      </div>
    </ShowcaseCard>
  );
}
