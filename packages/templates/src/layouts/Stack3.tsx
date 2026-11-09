import React from "react";
import { combineMotion, effectiveIntensity, entranceStyle, exitStyle, SPRINGS, springMs } from "../motion";
import { fitSize } from "../measure";
import { backgroundCss, baseTextCss, containerCss, displayText, famCss, fillCss, layoutBox, scaleOf, shadowCss, strokeCss } from "../text";
import { applyCasing } from "@motion-ai/caption-engine/core";
import type { PageRenderProps } from "../types";
import { STACK_SKINS, type StackSkin } from "./skins";
import { WordSpan } from "./WordSpan";
import { BlockRevealBlock } from "./BlockReveal";

/** Body line / giant hero word / body line. The hero is the card's star; splash pins lines to its edges. */
export const Stack3Layout: React.FC<PageRenderProps & { skinId: string }> = ({ page, timeMs, style, canvas, measure, settled, skinId }) => {
  const skin: StackSkin = STACK_SKINS[skinId] ?? STACK_SKINS.staggered_3line!;
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const intensity = effectiveIntensity(style, page.emotion);
  const local = timeMs - page.startMs;

  const words = page.words;
  const heroIdx = Math.min(page.heroIndex, words.length - 1);
  const hero = words[heroIdx];
  const line1 = words.slice(0, heroIdx);
  const line3 = words.slice(heroIdx + 1);

  const heroRaw = displayText(hero!, style, "none");
  const heroText = skin.heroCasing === "upper" ? heroRaw.toUpperCase() : skin.heroCasing === "lower" ? heroRaw.toLowerCase() : applyCasing(heroRaw, style.casing);

  const bodyFont = skin.bodyFont(style);
  const bodyWeight = skin.bodyWeight(style);
  const bodySpecBase = { fontFamily: famCss(bodyFont), fontWeight: bodyWeight, fontStyle: style.fontStyle, letterSpacing: style.letterSpacing * sc };
  const bodyRaw = style.fontSize * skin.bodySizeScale * sc;
  const joined = (ws: typeof words) => ws.map((w) => displayText(w, style)).join(" ");
  const size1 = fitSize(joined(line1), bodyRaw, box.width, bodySpecBase, measure);
  const size3 = fitSize(joined(line3), bodyRaw, box.width, bodySpecBase, measure);

  const heroFont = skin.heroFont(style);
  const heroWeight = skin.heroWeight(style);
  const heroSize = fitSize(heroText, style.fontSize * skin.heroScale(style) * sc, box.width, {
    fontFamily: famCss(heroFont), fontWeight: heroWeight, letterSpacing: style.letterSpacing * sc,
  }, measure);
  const heroWidth = Math.min(measure(heroText, { fontFamily: famCss(heroFont), fontWeight: heroWeight, fontSize: heroSize, letterSpacing: style.letterSpacing * sc }), box.width);
  const heroLeft = (box.width - heroWidth) / 2;
  const splash = skin.splash && style.templateOptions.layoutMode !== "centre";

  // the hero lands with the card, not after the body words before it (they arrive alongside it)
  const heroVisible = timeMs >= page.startMs;
  const heroPop = settled || !hero ? 1 : springMs(timeMs, page.startMs, canvas.fps, { ...SPRINGS.snappy, damping: 15, stiffness: 260 });
  const lineGap = style.fontSize * sc * skin.lineGapScale * (style.lineHeight / 1.15);

  const skinBody = skin.bodyCss ? skin.bodyCss(style) : {};
  const userTextFx: React.CSSProperties = { textShadow: shadowCss(style, sc), ...strokeCss(style.stroke, sc) };
  const bodyColor = skin.bodyColor(style);

  const bodyLine = (ws: typeof words, size: number, side: "left" | "right") => {
    const baseCss: React.CSSProperties = {
      ...baseTextCss({ ...style, fontId: bodyFont, fontWeight: bodyWeight }, sc, size),
      ...fillCss({ type: "solid", color: bodyColor }),
      ...(style.fill.type === "gradient" ? fillCss(style.fill) : {}),
      lineHeight: 1.18,
      ...skinBody,
      ...userTextFx,
    };
    const pos: React.CSSProperties = splash
      ? side === "left" ? { position: "absolute", left: heroLeft, top: 0 } : { position: "absolute", right: heroLeft, top: 0 }
      : style.align === "left" ? { position: "absolute", left: 0, top: 0 }
      : style.align === "right" ? { position: "absolute", right: 0, top: 0 }
      : { position: "absolute", left: "50%", transform: "translateX(-50%)", top: 0 };
    return (
      <div style={{ whiteSpace: "nowrap", ...pos }}>
        {ws.map((w, i) => (
          <WordSpan
            key={w.id}
            word={w}
            display={displayText(w, style)}
            timeMs={timeMs}
            style={style}
            canvas={canvas}
            intensity={intensity}
            baseCss={baseCss}
            trailingSpace={i < ws.length - 1}
            settled={settled}
            effect={style.active.effect}
          />
        ))}
      </div>
    );
  };

  const lineWrap = (size: number): React.CSSProperties => ({ position: "relative", width: "100%", height: size * 1.18 });

  return (
    <div style={containerCss(box, style.rotation)}>
      <BlockRevealBlock style={style} localMs={local} settled={settled} />
      <div
        style={{
          position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: box.width, boxSizing: "border-box",
          gap: Math.max(0, lineGap - bodyRaw),
          ...backgroundCss(style, sc),
          ...combineMotion(entranceStyle(style, local, canvas.fps, intensity, settled, style.fontSize * sc), exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc)),
        }}
      >
        {skin.backdrop ? skin.backdrop(style, heroSize, lineGap) : null}
        {line1.length > 0 && <div style={lineWrap(size1)}>{bodyLine(line1, size1, "left")}</div>}
        {heroText && (
          <div
            style={{
              position: "relative", zIndex: 2, fontFamily: famCss(heroFont), fontSize: heroSize, fontWeight: heroWeight,
              lineHeight: 1.05, opacity: heroVisible ? 1 : 0, transform: `scale(${0.85 + heroPop * 0.15})`,
              letterSpacing: style.letterSpacing * sc, wordSpacing: style.wordSpacing * sc,
              ...skin.heroCss(style, heroSize, sc),
            }}
          >
            {heroText}
            {skin.heroSuffix ? skin.heroSuffix(style) : null}
          </div>
        )}
        {line3.length > 0 && <div style={lineWrap(size3)}>{bodyLine(line3, size3, "right")}</div>}
      </div>
    </div>
  );
};
