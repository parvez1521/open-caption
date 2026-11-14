"use client";

import { useMemo } from "react";
import { ClipPlayer, Frame, ShowcaseCard, Tag, lookFor, useTranscript } from "./ShowcaseKit";

const INKC = "#FFFFEB";
const CLIP = "drluv";
const CHECKER = "repeating-conic-gradient(rgba(0,0,0,0.16) 0% 25%, rgba(255,255,235,0.4) 0% 50%) 0 0 / 14px 14px";

const FORMATS = [
  { f: "MP4", d: "Captions burned in, ready to post" },
  { f: "MOV", d: "ProRes 4444 with alpha" },
  { f: "WebM", d: "Transparent, web-light" },
  { f: "SRT · VTT · ASS", d: "Plain subtitles, instant" },
];

/** 04: export the captions alone. The real captioned video plays, face in frame;
// the format cards below say what leaves the app (the captions, not a re-encode). */
export function Section4() {
  const { transcript, doc } = useTranscript(CLIP);
  const { style, settings } = useMemo(() => lookFor("hormozi_box", 1.6), []);
  const dur = transcript?.durationMs ?? 6000;

  return (
    <ShowcaseCard
      index={4}
      eyebrow="Export"
      accent={INKC}
      wash="radial-gradient(70% 110% at 82% 45%, rgba(228,228,208,0.14) 0%, rgba(228,228,208,0.05) 50%, transparent 80%)"
      title="Captions only,"
      titleAccent="zero re-encode."
      body="Editing in Premiere, Resolve or Final Cut? Export just the animated captions on a transparent background. Lay them over your own grade. Your footage is never recompressed. Transparent exports are rendered by the free desktop Companion app."
      points={[
        { k: "ProRes 4444 or WebM", v: "with a real alpha channel." },
        { k: "MP4 made in your browser,", v: "at full quality, no watermark." },
        { k: "Or skip video entirely:", v: "SRT, VTT, ASS and TXT in one click." },
      ]}
    >
      <div className="absolute left-[36px] top-[70px]">
        <Frame width={276}>
          <ClipPlayer clip={CLIP} doc={doc} durationMs={dur} style={style} settings={settings} className="h-full w-full" />
        </Frame>
      </div>

      {/* what leaves the app: the captions alone, the footage untouched */}
      <div className="absolute left-[336px] top-[70px] w-[192px]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B4B4AA]">What exports</span>
          <span className="font-mono text-[10px] text-[#8F8F86]">live render</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#FFFFEB]/10 bg-[#232320] px-3 py-2.5">
            <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] border border-[#FFFFEB]/20" style={{ background: CHECKER }} />
            <span className="min-w-0 text-[12px] leading-[1.4] text-[#FFFFEB]/70">
              <span className="font-mono font-semibold text-[#FFFFEB]">captions.mov</span> <span className="font-mono text-[10.5px] text-[#8F8F86]">alpha layer</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-[#FFFFEB]/10 bg-[#232320] px-3 py-2.5">
            <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] bg-gradient-to-br from-[#b4546a] to-[#3b2a22]" />
            <span className="min-w-0 text-[12px] leading-[1.4] text-[#FFFFEB]/70">
              <span className="font-mono font-semibold text-[#FFFFEB]">your-footage.mp4</span> <span className="font-mono text-[10.5px] text-[#8F8F86]">untouched</span>
            </span>
          </div>
        </div>
        <div className="mt-3">
          <Tag>captions out · footage stays</Tag>
        </div>
      </div>

      {/* formats */}
      <div className="absolute bottom-[46px] left-[34px] right-[34px] grid grid-cols-2 gap-2">
        {FORMATS.map((x, k) => (
          <div key={x.f} className={`rounded-xl border px-3.5 py-2.5 ${k === 1 ? "border-[#FFFFEB]/60 bg-[#262622] text-[#FFFFEB]" : "border-[#FFFFEB]/10 bg-[#232320]"}`}>
            <div className="font-mono text-[12px] font-semibold">{x.f}</div>
            <div className={`text-[11.5px] ${k === 1 ? "text-[#FFFFEB]/60" : "text-[#FFFFEB]/65"}`}>{x.d}</div>
          </div>
        ))}
      </div>
    </ShowcaseCard>
  );
}
