/**
 * "Post. Track. Repeat." — the Growth Studio story in 8 seconds.
 *
 * Beat 1 (0–2.5 s): the weekly plan — Tuesday 18:00 gets its "Scheduled"
 * pill. Beat 2 (2.5–5 s): the last-7-days bars rise and the view counts
 * climb, best time 18:00 lands. Beat 3 (5–7 s): the next clip slides into
 * the queue and becomes "Scheduled". End card: "Post. Track. Repeat."
 *
 * Honest to the product: the plan is the real weekly plan (day titles +
 * suggested times from the weekly report), the bars are the real report
 * (overview / trend / best hours). No screen is faked — this is a schematic
 * of what the Coach plans and the report measures.
 */
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { EndCard, HOME, LoopFade, TopLabel, progress, sans, spring01, useFrame, useHomeFonts } from "./shared";

const PLAN = [
  { day: "Tue", time: "18:00", title: "How to caption a reel", meta: "Reel · 0:42" },
  { day: "Wed", time: "18:00", title: "3 caption mistakes", meta: "Reel · 0:38" },
  { day: "Thu", time: "18:00", title: "The hook that worked", meta: "Reel · 0:45" },
];

const BARS = [
  { label: "Clip 01", value: 1200, maxH: 120 },
  { label: "Clip 02", value: 2600, maxH: 200 },
  { label: "Clip 03", value: 4800, maxH: 280 },
];

function fmtK(v: number) {
  return `${(v / 1000).toFixed(1)}K`;
}

export const HomeGrowthStudio: React.FC = () => {
  useHomeFonts();
  const { frame, fps } = useFrame();

  const row1Border = progress(frame, 10, 25);
  const schedPill = spring01(frame, fps, 40);
  const bestTime = spring01(frame, fps, 150);
  const trend = spring01(frame, fps, 145);
  const row2Up = progress(frame, 160, 180);
  const row2Pill = progress(frame, 170, 186);

  return (
    <AbsoluteFill style={{ backgroundColor: HOME.dark }}>
      <LoopFade>
        <TopLabel
          right={
            bestTime > 0 ? (
              <div
                style={{
                  transform: `scale(${0.8 + 0.2 * bestTime})`,
                  opacity: bestTime,
                  fontFamily: sans,
                  fontSize: 18,
                  fontWeight: 700,
                  color: HOME.emerald,
                  border: `1.5px solid ${HOME.emerald}`,
                  borderRadius: 999,
                  padding: "7px 16px",
                }}
              >
                Best time · 18:00
              </div>
            ) : null
          }
        >
          GROWTH STUDIO · WEEKLY PLAN
        </TopLabel>

        {/* weekly plan card */}
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 92,
            width: 560,
            height: 440,
            borderRadius: 18,
            border: `1px solid ${HOME.line}`,
            backgroundColor: HOME.panel,
            padding: 26,
          }}
        >
          <div style={{ fontFamily: sans, fontSize: 26, fontWeight: 800, color: HOME.cream }}>Weekly plan</div>
          <div style={{ marginTop: 4, fontFamily: sans, fontSize: 17, color: HOME.creamFaint }}>Week of 17 Nov · from your last 7 days</div>

          {PLAN.map((row, i) => {
            const isRow1 = i === 0;
            const isRow2 = i === 1;
            const translateY = isRow2 ? (1 - row2Up) * 12 : 0;
            const scheduled = isRow1 || (isRow2 && row2Pill > 0.5);
            return (
              <div
                key={row.day}
                style={{
                  marginTop: 16,
                  height: 96,
                  borderRadius: 14,
                  backgroundColor: HOME.raised,
                  border: isRow1 ? `1.5px solid rgba(52,211,153,${0.35 + 0.65 * row1Border})` : `1px solid ${HOME.line}`,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 20px",
                  gap: 18,
                  transform: `translateY(${translateY}px)`,
                }}
              >
                <div style={{ width: 76, flexShrink: 0 }}>
                  <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, color: HOME.cream }}>{row.day}</div>
                  <div style={{ fontFamily: sans, fontSize: 17, color: HOME.creamDim }}>{row.time}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 700, color: HOME.cream, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.title}
                  </div>
                  <div style={{ marginTop: 3, fontFamily: sans, fontSize: 16, color: HOME.creamFaint }}>{row.meta}</div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: sans,
                    fontSize: 16,
                    fontWeight: 700,
                    color: scheduled ? HOME.dark : HOME.creamDim,
                    backgroundColor: scheduled ? HOME.emerald : "transparent",
                    border: scheduled ? "none" : `1.5px solid ${HOME.line}`,
                    borderRadius: 999,
                    padding: "7px 14px",
                    transform: isRow1 ? `scale(${0.8 + 0.2 * schedPill})` : undefined,
                    opacity: isRow1 ? schedPill : 1,
                  }}
                >
                  {scheduled ? "✓ Scheduled" : "Queued"}
                </span>
              </div>
            );
          })}
        </div>

        {/* last 7 days card */}
        <div
          style={{
            position: "absolute",
            left: 624,
            top: 92,
            width: 616,
            height: 440,
            borderRadius: 18,
            border: `1px solid ${HOME.line}`,
            backgroundColor: HOME.panel,
            padding: 26,
          }}
        >
          <div style={{ fontFamily: sans, fontSize: 26, fontWeight: 800, color: HOME.cream }}>Last 7 days</div>
          <div style={{ marginTop: 4, fontFamily: sans, fontSize: 17, color: HOME.creamFaint }}>Views across your clips</div>

          <div style={{ position: "relative", height: 300, marginTop: 14 }}>
            {BARS.map((b, i) => {
              const p = spring01(frame, fps, 80 + i * 15);
              const count = interpolate(frame, [80 + i * 15, 140 + i * 15], [0, b.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const labelIn = progress(frame, 80 + i * 15, 94 + i * 15);
              const x = 30 + i * 190;
              const barH = Math.max(4, p * b.maxH);
              return (
                <div key={b.label} style={{ position: "absolute", left: x, bottom: 34, width: 110, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, color: HOME.cream, marginBottom: 8, opacity: labelIn }}>{fmtK(count)}</div>
                  <div style={{ width: 110, height: barH, borderRadius: "10px 10px 0 0", backgroundColor: i === 2 ? HOME.emerald : "#3A3A36" }} />
                  <div style={{ marginTop: 10, fontFamily: sans, fontSize: 16, color: HOME.creamDim }}>{b.label}</div>
                </div>
              );
            })}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 30, height: 2, backgroundColor: HOME.line }} />
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <span
              style={{
                fontFamily: sans,
                fontSize: 18,
                fontWeight: 700,
                color: HOME.emerald,
                opacity: trend,
                transform: `scale(${0.85 + 0.15 * trend})`,
                display: "inline-block",
              }}
            >
              ↑ 32% vs last week
            </span>
            <span style={{ fontFamily: sans, fontSize: 18, color: HOME.creamDim, opacity: trend }}>·&nbsp;</span>
            <span style={{ fontFamily: sans, fontSize: 18, color: HOME.creamDim }}>12 clips posted</span>
          </div>
        </div>
      </LoopFade>
      <EndCard lead="Post. Track." accent="Repeat." sub="Your growth, on a schedule." />
    </AbsoluteFill>
  );
};
