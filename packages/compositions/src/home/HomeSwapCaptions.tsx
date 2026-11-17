/**
 * "Same captions. New cut." — the footage-swap story in 8 seconds.
 *
 * Beat 1 (0–2.2 s): v1 footage plays, words light up one by one, the
 * playhead sweeps the caption timeline. Beat 2 (2.2–4.5 s): "Keep my
 * captions" is chosen and v2 (the graded cut) slides in over v1 — the
 * caption text and the timeline never move. Beat 3 (4.5–7 s): the same
 * words light up again on the new cut, "Captions kept" lands. End card:
 * "Same captions. New cut. No re-transcribe."
 *
 * Honest to the product: the radio copy is the real UploadPanel copy
 * ("Keep my captions" / "Captions stay on the same timeline. No
 * re-transcribe."), the swap keeps the same video id and the same doc.
 */
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { EndCard, HOME, LoopFade, TopLabel, progress, sans, spring01, useFrame, useHomeFonts } from "./shared";

const WORDS = ["MAKE", "IT", "POP"];

/** Which word is lit at this frame: beat 1 is 12–66, beat 3 is 150–204. */
function activeWord(frame: number): number {
  const beat = (start: number) => {
    if (frame < start || frame >= start + 54) return -1;
    return Math.min(2, Math.floor((frame - start) / 18));
  };
  const b1 = beat(12);
  if (b1 >= 0) return b1;
  return beat(150);
}

function FootageScene({ graded }: { graded: boolean }) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: graded ? "#1D2420" : "#262622",
        overflow: "hidden",
      }}
    >
      {/* flat "graded" scene: horizon + hills, then the sun on top so it stays visible; colours shift cool on v2 */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 132, backgroundColor: graded ? "#243029" : "#2E2E2A" }} />
      <div
        style={{
          position: "absolute",
          left: -80,
          bottom: 60,
          width: 420,
          height: 420,
          borderRadius: 210,
          backgroundColor: graded ? "#2A352C" : "#34342F",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -60,
          bottom: 40,
          width: 340,
          height: 340,
          borderRadius: 170,
          backgroundColor: graded ? "#28332B" : "#31312D",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 560,
          top: 96,
          width: 92,
          height: 92,
          borderRadius: 46,
          backgroundColor: graded ? HOME.emerald : HOME.orange,
        }}
      />
    </AbsoluteFill>
  );
}

export const HomeSwapCaptions: React.FC = () => {
  useHomeFonts();
  const { frame, fps } = useFrame();

  const swapP = spring01(frame, fps, 78); // v2 slides in 2.6–~3.5 s
  const keepPulse = interpolate(frame, [66, 74, 86], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const keptBadge = spring01(frame, fps, 150);
  const active = activeWord(frame);

  // Playhead sweeps the timeline in beats 1 and 3, holds at the end between.
  const playX = (() => {
    if (frame < 12) return 260;
    if (frame < 66) return interpolate(frame, [12, 66], [260, 1150]);
    if (frame < 150) return 1150;
    if (frame < 204) return interpolate(frame, [150, 204], [260, 1150]);
    return 1150;
  })();

  return (
    <AbsoluteFill style={{ backgroundColor: HOME.dark }}>
      <LoopFade>
        <TopLabel
          right={
            <div
              style={{
                opacity: progress(frame, 70, 82),
                fontFamily: sans,
                fontSize: 18,
                fontWeight: 700,
                color: HOME.emerald,
                border: `1.5px solid ${HOME.emerald}`,
                borderRadius: 999,
                padding: "7px 16px",
              }}
            >
              ✓ Keep my captions
            </div>
          }
        >
          CAPTIONIT STUDIO · REPLACE FOOTAGE
        </TopLabel>

        {/* video stage */}
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 92,
            width: 780,
            height: 440,
            borderRadius: 18,
            overflow: "hidden",
            border: `1px solid ${HOME.line}`,
          }}
        >
          <FootageScene graded={false} />
          {/* v2 slides in over v1 */}
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - swapP) * 780}px)` }}>
            <FootageScene graded />
          </div>
          {/* file chips: v1 fades out as v2 covers */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              opacity: 1 - progress(frame, 108, 128),
              fontFamily: sans,
              fontSize: 18,
              fontWeight: 600,
              color: HOME.cream,
              backgroundColor: "rgba(20,20,18,0.85)",
              borderRadius: 999,
              padding: "8px 14px",
            }}
          >
            clip-v1.mp4 · 0:42
          </div>
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              opacity: progress(frame, 112, 130),
              fontFamily: sans,
              fontSize: 18,
              fontWeight: 600,
              color: HOME.cream,
              backgroundColor: "rgba(20,20,18,0.85)",
              borderRadius: 999,
              padding: "8px 14px",
            }}
          >
            clip-v2.mp4 · graded · 0:42
          </div>
          {/* "Captions kept" badge */}
          {keptBadge > 0 ? (
            <div
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                transform: `scale(${0.8 + 0.2 * keptBadge})`,
                opacity: keptBadge,
                fontFamily: sans,
                fontSize: 18,
                fontWeight: 700,
                color: HOME.dark,
                backgroundColor: HOME.emerald,
                borderRadius: 999,
                padding: "8px 14px",
              }}
            >
              ✓ Captions kept
            </div>
          ) : null}
          {/* caption text — NOT part of either footage layer, so it visibly stays put */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 34,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                backgroundColor: "rgba(20,20,18,0.55)",
                borderRadius: 14,
                padding: "14px 26px",
                display: "flex",
                gap: 18,
                alignItems: "baseline",
              }}
            >
              {WORDS.map((w, i) => {
                const on = active === i;
                return (
                  <span
                    key={w}
                    style={{
                      fontFamily: sans,
                      fontWeight: 800,
                      fontSize: 72,
                      letterSpacing: 1,
                      lineHeight: 1,
                      color: on ? HOME.orange : i === 2 ? HOME.orange : HOME.cream,
                      opacity: on ? 1 : 0.55,
                      transform: on ? "scale(1.07)" : "scale(1)",
                      display: "inline-block",
                    }}
                  >
                    {w}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* replace dialog — the real UploadPanel copy */}
        <div
          style={{
            position: "absolute",
            left: 844,
            top: 92,
            width: 396,
            height: 440,
            borderRadius: 18,
            border: `1px solid ${HOME.line}`,
            backgroundColor: HOME.panel,
            padding: 24,
          }}
        >
          <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 700, color: HOME.cream }}>What happens to your captions</div>
          <div
            style={{
              marginTop: 20,
              borderRadius: 14,
              border: `2px solid ${HOME.emerald}`,
              backgroundColor: "#1E2A24",
              padding: 18,
              transform: `scale(${1 + 0.015 * keepPulse})`,
              boxShadow: keepPulse > 0 ? `0 0 0 ${Math.round(6 * keepPulse)}px rgba(52,211,153,0.25)` : "none",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: HOME.emerald,
                  color: HOME.dark,
                  fontSize: 14,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✓
              </span>
              <span style={{ fontFamily: sans, fontSize: 22, fontWeight: 700, color: HOME.cream }}>Keep my captions</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: sans, fontSize: 17, lineHeight: 1.45, color: HOME.creamDim }}>
              Captions stay on the same timeline. No re-transcribe.
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              borderRadius: 14,
              border: `1px solid ${HOME.line}`,
              padding: 18,
              opacity: 0.6,
            }}
          >
            <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 700, color: HOME.cream }}>Start fresh with new captions</div>
            <div style={{ marginTop: 8, fontFamily: sans, fontSize: 16, lineHeight: 1.45, color: HOME.creamDim }}>
              The old captions are deleted and new ones are generated.
            </div>
          </div>
          <div style={{ marginTop: 22, fontFamily: sans, fontSize: 18, lineHeight: 1.5, color: HOME.emerald, opacity: progress(frame, 140, 156) }}>
            Same video, new cut. Timeline untouched.
          </div>
        </div>

        {/* caption timeline strip — pinned, never moves */}
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 556,
            width: 1200,
            height: 64,
            borderRadius: 14,
            border: `1px solid ${HOME.line}`,
            backgroundColor: HOME.panel,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ marginLeft: 24, fontFamily: sans, fontSize: 18, fontWeight: 600, color: HOME.creamFaint }}>Caption timeline</span>
          {[
            { w: "MAKE", x: 300, bw: 120 },
            { w: "it", x: 440, bw: 70 },
            { w: "POP", x: 530, bw: 130 },
          ].map((b, i) => (
            <span
              key={b.w}
              style={{
                position: "absolute",
                left: b.x,
                top: 14,
                width: b.bw,
                height: 36,
                borderRadius: 8,
                backgroundColor: active === i ? HOME.orange : HOME.raised,
                color: active === i ? HOME.dark : HOME.creamDim,
                fontFamily: sans,
                fontSize: 17,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {b.w}
            </span>
          ))}
          {/* playhead */}
          <span style={{ position: "absolute", left: playX, top: 8, width: 3, height: 48, backgroundColor: HOME.emerald, borderRadius: 2 }} />
          <span style={{ position: "absolute", right: 24, fontFamily: sans, fontSize: 18, fontWeight: 700, color: HOME.emerald }}>Timeline pinned</span>
        </div>
      </LoopFade>
      <EndCard lead="Same captions." accent="New cut." sub="No re-transcribe." />
    </AbsoluteFill>
  );
};
