import React from "react";
import { emotionModifier, applyEmotion } from "./emotion";
import { SPRINGS, effectiveIntensity, entranceStyle, springMs } from "./motion";
import { usesCardEntrance } from "./controls";
import { getTemplate } from "./registry";
import { layoutBox, scaleOf } from "./text";
import type { PageRenderProps } from "./types";

/** Pops an emoji above the caption block when its word is spoken (or the card's emotion emoji). */
const EmojiBurst: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, settled }) => {
  if (!style.emoji.enabled) return null;
  const word = page.words.find((w) => w.emoji && w.emoji.position === "above" && timeMs >= w.startMs);
  let char = word?.emoji?.char;
  let at = word?.startMs ?? page.startMs;
  if (!char && page.emotion !== "neutral" && style.emotionReactivity >= 0.5) {
    char = emotionModifier(getTemplate(style.templateId), page.emotion).emoji;
    at = page.startMs;
  }
  if (!char) return null;
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const size = style.fontSize * sc * 1.25 * style.emoji.size;
  const s = settled ? 1 : springMs(timeMs, at, canvas.fps, SPRINGS.bouncy);
  const t = (timeMs - at) / 1000;
  const anim = style.emoji.animation;
  const float = anim === "float" ? Math.sin(t * 3) * 6 * sc : 0;
  const spin = anim === "spin" ? Math.min(360, t * 720) : 0;
  const scale = anim === "none" ? 1 : 0.4 + s * 0.6;
  return (
    <div
      style={{
        position: "absolute", left: box.cx, top: box.cy - size * 1.6 + float, fontSize: size, lineHeight: 1,
        fontFamily: "'Noto Color Emoji', sans-serif", transform: `translate(-50%, -50%) scale(${scale}) rotate(${spin}deg)`, opacity: anim === "none" ? 1 : Math.min(1, s * 2),
      }}
    >
      {char}
    </div>
  );
};

/**
 * Renders ONE derived page with the template named by style.templateId, after applying the card's emotion.
 * Pure in its props, so it is identical in the browser Player and in renderMedia (the WYSIWYG guarantee).
 *
 * Card-level entrance (Package 2 item D): layouts that declare entrances of their own apply
 * entranceStyle themselves; layouts that declare NONE (usesCardEntrance) get the entrance the
 * shared renderer guarantees — entranceStyle on a full-canvas wrapper — but ONLY while the
 * entrance is actually playing and only when a non-"none" type is chosen, so settled renders
 * and un-chosen styles stay byte-identical to before. The wrapper is absolutely positioned
 * inset-0, so the layout's own absolute positioning resolves against the same box as the
 * composition's fill. Exits are unaffected (layouts already apply exitStyle everywhere).
 */
export const PageView: React.FC<PageRenderProps> = (props) => {
  const { page, timeMs } = props;
  if (page.words.length === 0) return null;
  if (timeMs < page.startMs || timeMs >= page.endMs) return null;
  const tpl = getTemplate(props.style.templateId);
  const style = applyEmotion(props.style, tpl, page.emotion);
  const Template = tpl.Page;
  const localMs = timeMs - page.startMs;
  const cardEnter = usesCardEntrance(tpl) && style.entrance.type !== "none" && !props.settled && localMs < style.entrance.durationMs
    ? entranceStyle(style, localMs, props.canvas.fps, effectiveIntensity(style, page.emotion), props.settled, style.fontSize * scaleOf(props.canvas))
    : null;
  return (
    <>
      {cardEnter ? (
        <div style={{ position: "absolute", inset: 0, ...cardEnter }}>
          <Template {...props} style={style} />
        </div>
      ) : (
        <Template {...props} style={style} />
      )}
      <EmojiBurst {...props} style={style} />
    </>
  );
};
