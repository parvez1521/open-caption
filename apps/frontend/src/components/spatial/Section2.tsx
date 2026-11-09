"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getLook } from "@capseasy/templates";
import { ClipPlayer, Frame, ShowcaseCard, Tag, lookFor, useTranscript } from "./ShowcaseKit";

const VIOLET = "#A855F7";
const CLIP = "mckensie";
const DEMO_LOOKS = ["hormozi_box", "beast_bounce", "karaoke_fill", "highlighter_card", "neon_sign", "staggered_splash"].filter((id) => getLook(id));

/** 02: one transcript, any look. Chips switch the real renderer live. */
export function Section2() {
  const { transcript, doc } = useTranscript(CLIP);
  const [i, setI] = useState(0);
  const [pinned, setPinned] = useState(false);
  const lookId = DEMO_LOOKS[i]!;
  const { style, settings } = useMemo(() => lookFor(lookId, 1.45), [lookId]);

  useEffect(() => {
    if (pinned) return;
    const id = setInterval(() => setI((v) => (v + 1) % DEMO_LOOKS.length), 3400);
    return () => clearInterval(id);
  }, [pinned]);

  return (
    <ShowcaseCard
      index={2}
      eyebrow="Looks"
      accent={VIOLET}
      wash="radial-gradient(70% 110% at 82% 45%, rgba(240,215,255,0.85) 0%, rgba(240,215,255,0.35) 45%, transparent 78%)"
      title="20+ looks,"
      titleAccent="one click."
      body="Viral boxes, karaoke fills, glowing neon, three-line stacks. Every look is a complete, tuned style: font, colour, motion and the spoken-word effect. Your words and timing never change."
      points={[
        { k: "Switch any time:", v: "edits, splits and positions stay put." },
        { k: "Tweak everything:", v: "font, size, stroke, shadow, motion speed." },
        { k: "Save your own", v: "as a brand look and reuse it on every video." },
      ]}
    >
      <div className="absolute left-[36px] top-[70px]">
        <Frame width={276}>
          <ClipPlayer clip={CLIP} doc={doc} durationMs={transcript?.durationMs ?? 6000} style={style} settings={settings} className="h-full w-full" />
        </Frame>
        <AnimatePresence mode="wait">
          <motion.div
            key={lookId}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute -right-6 top-6"
          >
            <Tag dark>{getLook(lookId)?.name}</Tag>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute left-[340px] top-[70px] w-[188px]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FFFFEB]/45">Pick a look</span>
          <span className="font-mono text-[10px] text-[#FFFFEB]/40">{pinned ? "picked" : "auto"}</span>
        </div>
        <div className="flex flex-col gap-2">
          {DEMO_LOOKS.map((id, k) => {
            const look = getLook(id)!;
            const on = k === i;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setI(k);
                  setPinned(true);
                }}
                className="group relative flex items-center justify-between overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-[border-color,box-shadow,background-color] duration-200"
                style={{
                  background: on ? "#262622" : "rgba(255,255,235,0.05)",
                  borderColor: on ? "rgba(255,255,235,0.45)" : "rgba(255,255,235,0.1)",
                  boxShadow: on ? "0 14px 30px -14px rgba(0,0,0,0.6)" : undefined,
                }}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[13px] font-semibold ${on ? "text-[#FFFFEB]" : "text-[#FFFFEB]"}`}>{look.name}</span>
                  <span className={`block truncate text-[10.5px] ${on ? "text-[#FFFFEB]/55" : "text-[#FFFFEB]/45"}`}>{look.tags?.join(" · ") ?? look.category}</span>
                </span>
                {on && !pinned ? (
                  <motion.span key={`bar-${i}`} className="absolute bottom-0 left-0 h-[2px] bg-[#C084FC]" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 3.4, ease: "linear" }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-[46px] left-[36px] right-[34px] flex items-center justify-between rounded-2xl border border-[#FFFFEB]/8 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {["#FFA946", "#34D399", "#C084FC", "#FFFFEB"].map((c) => (
              <span key={c} className="h-5 w-5 rounded-full border-2 border-[#FFFFEB]" style={{ background: c }} />
            ))}
          </div>
          <span className="text-[13px] text-[#FFFFEB]/70">Same transcript, same timing, new style.</span>
        </div>
        <span className="font-mono text-[11px] text-[#FFFFEB]/45">live render</span>
      </div>
    </ShowcaseCard>
  );
}
