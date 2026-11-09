import React from "react";
import type { CaptionStyleV2 } from "@capseasy/shared";
import { blockRevealAt, panelsRevealAt } from "../motion";

/**
 * The travelling solid block of the "block-reveal" entrance. Geometry comes from the same pure
 * blockRevealAt() that drives the text clip in entranceStyle, so block and reveal never desync in
 * the picker, the studio preview or the export. Render inside a positioned caption container;
 * returns null outside the entrance window (or when settled).
 */
export const BlockRevealBlock: React.FC<{ style: CaptionStyleV2; localMs: number; settled?: boolean }> = ({ style, localMs, settled }) => {
  if (settled || style.entrance.type !== "block-reveal" || localMs < 0) return null;
  const b = blockRevealAt(localMs, style.entrance.durationMs);
  if (b.done) return null;
  const color = style.active.boxColor ?? style.active.color;
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: `${b.blockLeftPct.toFixed(2)}%`,
        top: 0,
        bottom: 0,
        width: `${b.blockWidthPct.toFixed(2)}%`,
        backgroundColor: color,
        transform: `scaleY(${b.blockScaleY.toFixed(3)})`,
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
};

/**
 * Curtain Panels: the 4 staggered panels of the "panels-reveal" entrance, retracting upward over
 * text that was already there. Geometry comes from the same panelsRevealAt() that drives the text
 * clip in entranceStyle. Panel colour MUST-WIRE: background.color when the look has a background,
 * else active.color (the fallback flicker uses for its glow colour).
 */
export const PanelsRevealPanels: React.FC<{ style: CaptionStyleV2; localMs: number; settled?: boolean }> = ({ style, localMs, settled }) => {
  if (settled || style.entrance.type !== "panels-reveal" || localMs < 0) return null;
  const pr = panelsRevealAt(localMs, style.entrance.durationMs);
  if (pr.done) return null;
  const color = style.background.type !== "none" ? style.background.color : style.active.color;
  return (
    <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, display: "flex", pointerEvents: "none", zIndex: 5, overflow: "hidden" }}>
      {pr.panels.map((p) => (
        <span key={p.index} style={{ flex: 1, backgroundColor: color, transform: `translateY(${p.topPct.toFixed(2)}%)` }} />
      ))}
    </span>
  );
};
