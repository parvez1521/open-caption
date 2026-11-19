"use client";

import { AI_EDIT_STYLES, type AiEditPreviewShape, type AiEditStyle } from "../aiEditStyles";
import { radioGroupKeyDown } from "@/lib/a11y/radioGroup";

/**
 * AI Edit style chooser: one card per style, each with its house-made SVG
 * preview (flat shapes from the style descriptor — never copied artwork).
 * A 2-column grid, never 3-in-a-row (design ban list). The chosen style is
 * a radio group, so keyboard and screen-reader users get the same choice.
 */

function PreviewSvg({ style }: { style: AiEditStyle }) {
  const shape = (s: AiEditPreviewShape, i: number) => {
    if (s.kind === "rect") return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx ?? 0} fill={s.fill} />;
    if (s.kind === "circle") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />;
    return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.width} strokeLinecap="round" />;
  };
  return (
    <svg viewBox="0 0 96 54" className="h-auto w-full rounded-lg" role="img" aria-label={`${style.label} style preview`}>
      <rect x={0} y={0} width={96} height={54} fill={style.preview.bg} />
      {style.preview.shapes.map(shape)}
    </svg>
  );
}

export interface AiEditStyleChooserProps {
  value: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
}

export const AiEditStyleChooser: React.FC<AiEditStyleChooserProps> = ({ value, onChange, disabled }) => (
  <div onKeyDown={radioGroupKeyDown} role="radiogroup" aria-label="Visual style" className="grid grid-cols-2 gap-2">
    {AI_EDIT_STYLES.map((style) => {
      const selected = value === style.id;
      return (
        <button
          key={style.id}
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onClick={() => onChange(style.id)}
          className={`rounded-xl border p-2 text-left disabled:opacity-50 ${
            selected ? "border-st-em bg-st-em/10" : "border-st-line bg-st-raised"
          }`}
        >
          <PreviewSvg style={style} />
          <span className="mt-2 block font-sora text-[13px] font-bold text-st-text">{style.label}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-st-faint">{style.hint}</span>
        </button>
      );
    })}
  </div>
);
