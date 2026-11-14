"use client";

import { useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import type { PlayerRef } from "@remotion/player";
import { CLIP_H, CLIP_W, ClipPlayer, FPS, ShowcaseCard, lookFor, useTranscript } from "./ShowcaseKit";

const INKC = "#FFFFEB";
const CLIP = "john";
const LAYER_W = 214;
const LAYER_H = Math.round((LAYER_W * CLIP_H) / CLIP_W);
const CHECKER = "repeating-conic-gradient(rgba(0,0,0,0.16) 0% 25%, rgba(255,255,235,0.4) 0% 50%) 0 0 / 14px 14px";

const FORMATS = [
  { f: "MP4", d: "Captions burned in, ready to post" },
  { f: "MOV", d: "ProRes 4444 with alpha" },
  { f: "WebM", d: "Transparent, web-light" },
  { f: "SRT · VTT · ASS", d: "Plain subtitles, instant" },
];

/** 04: export the captions alone. Exploded view: untouched video below, alpha caption layer above. */
export function Section4() {
  const { transcript, doc } = useTranscript(CLIP);
  const { style, settings } = useMemo(() => lookFor("hormozi_box", 1.6), []);
  const back = useRef<PlayerRef>(null);
  const dur = transcript?.durationMs ?? 6000;
  // keep the video layer in step with the caption layer
  const sync = useCallback((ms: number) => {
    const p = back.current;
    if (!p) return;
    const want = Math.round((ms / 1000) * FPS);
    if (Math.abs(p.getCurrentFrame() - want) > 2) p.seekTo(want);
  }, []);

  return (
    <ShowcaseCard
      index={4}
      eyebrow="Export"
      accent={INKC}
      wash="radial-gradient(70% 110% at 82% 45%, rgba(228,228,208,0.14) 0%, rgba(228,228,208,0.05) 50%, transparent 80%)"
      title="Captions only,"
      titleAccent="zero re-encode."
      body="Editing in Premiere, Resolve or Final Cut? Export just the animated captions on a transparent background and lay them over your own grade. Your footage is never recompressed. Transparent exports are rendered by the free desktop Companion app."
      points={[
        { k: "ProRes 4444 or WebM", v: "with a real alpha channel." },
        { k: "MP4 made in your browser,", v: "at full quality, no watermark." },
        { k: "Or skip video entirely:", v: "SRT, VTT, ASS and TXT in one click." },
      ]}
    >
      {/* exploded layer stack */}
      <div className="absolute left-0 right-0 top-[10px] h-[400px]" style={{ perspective: 1400 }}>
        <div className="absolute left-1/2 top-1/2" style={{ transformStyle: "preserve-3d", transform: "translate(-50%,-50%) rotateX(56deg) rotateZ(-38deg)" }}>
          {/* video layer */}
          <div className="absolute overflow-hidden rounded-[14px]" style={{ width: LAYER_W, height: LAYER_H, left: -LAYER_W / 2, top: -LAYER_H / 2, boxShadow: "0 30px 50px -20px rgba(0,0,0,0.55)" }}>
            <ClipPlayer clip={CLIP} doc={doc} bare durationMs={dur} style={style} settings={settings} playerRef={back} className="h-full w-full" />
          </div>
          {/* caption layer (alpha) */}
          <motion.div
            className="absolute overflow-hidden rounded-[14px] border border-[#FFFFEB]/15"
            style={{ width: LAYER_W, height: LAYER_H, left: -LAYER_W / 2, top: -LAYER_H / 2, background: CHECKER, transformStyle: "preserve-3d" }}
            animate={{ z: [2, 140, 140, 2, 2] }}
            transition={{ duration: 6, times: [0, 0.25, 0.55, 0.8, 1], repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
          >
            <ClipPlayer clip={CLIP} doc={doc} mode="overlay" durationMs={dur} style={style} settings={settings} onTime={sync} className="h-full w-full" />
          </motion.div>
        </div>
      </div>

      {/* legend */}
      <div className="absolute bottom-[178px] left-[34px] right-[34px] flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12px] text-[#FFFFEB]/65">
          <span className="h-3.5 w-3.5 rounded-[4px] border border-[#FFFFEB]/20" style={{ background: CHECKER }} />
          captions.mov <span className="font-mono text-[10.5px] text-[#8F8F86]">alpha layer</span>
        </span>
        <span className="flex items-center gap-2 text-[12px] text-[#FFFFEB]/65">
          <span className="h-3.5 w-3.5 rounded-[4px] bg-gradient-to-br from-[#b4546a] to-[#3b2a22]" />
          your-footage.mp4 <span className="font-mono text-[10.5px] text-[#8F8F86]">untouched</span>
        </span>
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
