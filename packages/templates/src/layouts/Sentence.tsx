import React from "react";
import { combineMotion, effectiveIntensity, entranceStyle, exitStyle, staggerUnit } from "../motion";
import { backgroundCss, baseTextCss, containerCss, displayText, layoutBox, lineWidth, scaleOf } from "../text";
import type { PageRenderProps } from "../types";
import { WordSpan, staggerPlan } from "./WordSpan";
import { BlockRevealBlock, PanelsRevealPanels } from "./BlockReveal";

/** Full sentence block: explicit lines from the segmenter, active-word effect, real-metric fitting. */
export const SentenceLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const intensity = effectiveIntensity(style, page.emotion);
  const local = timeMs - page.startMs;
  const reveal = style.templateOptions.reveal === "all" ? "all" : "progressive";

  const baseSize = style.fontSize * sc;
  const lines = page.lines.map((l) => l.map((w) => displayText(w, style)));
  const widest = Math.max(1, ...lines.map((t) => lineWidth(t, baseSize, style, sc, measure)));
  const size = widest > box.width ? baseSize * (box.width / widest) : baseSize;

  const justify = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
  const baseCss = baseTextCss(style, sc, size);
  const stagger = staggerPlan(style, page, lines);

  return (
    <div style={containerCss(box, style.rotation)}>
      <BlockRevealBlock style={style} localMs={local} settled={settled} />
      <PanelsRevealPanels style={style} localMs={local} settled={settled} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: justify,
          rowGap: (style.lineHeight - 1) * size * 0.5,
          ...backgroundCss(style, sc),
          ...combineMotion(
            staggerUnit(style) === "none" ? entranceStyle(style, local, canvas.fps, intensity, settled, size) : {},
            exitStyle(style, page.endMs - timeMs, settled, size),
          ),
        }}
      >
        {page.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: justify, whiteSpace: "pre" }}>
            {line.map((w, wi) => (
              <WordSpan
                key={w.id}
                word={w}
                display={lines[li]![wi]!}
                timeMs={timeMs}
                style={style}
                canvas={canvas}
                intensity={intensity}
                baseCss={baseCss}
                trailingSpace={wi < line.length - 1}
                settled={settled}
                reveal={reveal}
                stagger={stagger?.(w.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
