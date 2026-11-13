"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { studioService } from "@/services/studio";
import type { CaptionStyleV2, ProjectSettings } from "@capseasy/shared";
import { BACKGROUND_TYPES, LETTER_ANIMATORS, LETTER_DEFAULT_MS, controlVisible, effectsFor, entrancesFor, exitsFor, getTemplate, isLetterAnimator, type ControlId } from "@capseasy/templates";
import { ColorField, Section, Segmented, Select, Slider, Toggle } from "../controls";
import { FontPicker } from "./FontPicker";
import { MotionPicker } from "./MotionPicker";

const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x.replace(/-/g, " ") }));
const LETTERS_ELSEWHERE = "These need a template that shows the whole line. Such as Pop-Up Word or Classic Subtitle.";
const solid = (s: CaptionStyleV2) => (s.fill.type === "solid" ? s.fill.color : s.fill.stops[0]!.color);

interface StyleProps {
  style: CaptionStyleV2;
  patch: (fn: (s: CaptionStyleV2) => CaptionStyleV2) => void;
  /** name of the look this style started from (null for a custom / legacy style) */
  lookName: string | null;
  onOpenLooks: () => void;
}

/**
 * Every control here is shown only when the current template honours it (`controlVisible`, shared with
 * packages/templates/src/controls.test.tsx, which proves each visible control changes the rendered video).
 */
export const StylePanel: React.FC<StyleProps> = ({ style, patch, lookName, onOpenLooks }) => {
  const tpl = getTemplate(style.templateId);
  const show = (id: ControlId) => controlVisible(id, tpl, style);
  const effects = effectsFor(tpl);
  const entrances = entrancesFor(tpl);
  const lettersHere = LETTER_ANIMATORS.every((t) => entrances.includes(t));
  const entranceGroups = [
    { label: "Whole card", types: ["none", ...entrances.filter((e) => e !== "none" && !isLetterAnimator(e))] },
    {
      label: "Letter by letter · After Effects", types: LETTER_ANIMATORS, disabled: !lettersHere,
      hint: lettersHere ? "Each letter flies in on its own. Recreated from After Effects text presets." : LETTERS_ELSEWHERE,
    },
  ];
  const exits = exitsFor(tpl);
  const exitGroups = [
    { label: "Whole card", types: exits.filter((e) => !isLetterAnimator(e)) },
    {
      label: "Letter by letter · After Effects", types: LETTER_ANIMATORS, disabled: !LETTER_ANIMATORS.every((t) => exits.includes(t)),
      hint: LETTER_ANIMATORS.every((t) => exits.includes(t)) ? "The same After Effects animations played backwards: the card leaves letter by letter as it ends." : LETTERS_ELSEWHERE,
    },
  ];
  const reveal = style.templateOptions.reveal === "all" ? "all" : "progressive";
  const qc = useQueryClient();
  const brand = useQuery({ queryKey: ["brand"], queryFn: () => studioService.getBrand() });
  const colors = brand.data?.colors ?? [];
  const saveBrand = async () => {
    const mine = [solid(style), style.active.color, style.stroke.color, style.background.color].filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    await studioService.saveBrand([...new Set([...mine, ...colors])].slice(0, 12), style.fontId);
    await qc.invalidateQueries({ queryKey: ["brand"] });
  };
  const bgEditable = show("backgroundColor") || show("background");

  return (
    <div className="h-full overflow-y-auto">
      <Section title="Brand kit" hint={colors.length ? undefined : "Save colours and a font once; reuse them everywhere."}>
        {colors.length ? (
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c) => (
              <button key={c} title={c} aria-label={`Brand colour ${c}`} onClick={(e) => patch((s) => (e.shiftKey && tpl.capabilities.color ? { ...s, fill: { type: "solid", color: c } } : { ...s, active: { ...s.active, color: c } }))} className="h-7 w-7 rounded-md border border-st-line" style={{ backgroundColor: c }} />
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void saveBrand()} className="rounded-md bg-st-raised px-2.5 py-2 text-xs hover:bg-st-hover lg:py-1">Save current colours &amp; font</button>
          {brand.data?.fontId && brand.data.fontId !== style.fontId ? (
            <button onClick={() => patch((s) => ({ ...s, fontId: brand.data!.fontId! }))} className="rounded-md bg-st-raised px-2.5 py-1 text-xs hover:bg-st-hover">Use brand font ({brand.data.fontId})</button>
          ) : null}
        </div>
      </Section>

      <Section title="Template">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-st-text">{lookName ?? "Custom style"}</div>
            <p className="text-xs text-st-faint">{tpl.description}</p>
          </div>
          <button type="button" onClick={onOpenLooks} className="shrink-0 rounded-lg border border-st-line bg-st-panel px-3 py-2 text-xs font-medium hover:bg-st-hover lg:py-1.5">Change template</button>
        </div>
        {show("reveal") ? (
          <div className="flex items-center justify-between text-sm text-st-text/90">
            <span>Words appear</span>
            <Segmented value={reveal} options={[{ value: "progressive", label: "As spoken" }, { value: "all", label: "All at once" }]} onChange={(v) => patch((s) => ({ ...s, templateOptions: { ...s.templateOptions, reveal: v } }))} />
          </div>
        ) : null}
      </Section>

      <Section title="Text">
        <FontPicker label="Font" value={style.fontId} onChange={(v) => patch((s) => ({ ...s, fontId: v }))} />
        <Slider label="Size" value={style.fontSize} min={24} max={140} onChange={(v) => patch((s) => ({ ...s, fontSize: v }))} />
        {show("weight") ? <Slider label="Weight" value={style.fontWeight} min={300} max={900} step={100} onChange={(v) => patch((s) => ({ ...s, fontWeight: v }))} /> : null}
        <Select label="Case" value={style.casing} options={[{ value: "none", label: "As spoken" }, { value: "upper", label: "UPPERCASE" }, { value: "lower", label: "lowercase" }, { value: "title", label: "Title Case" }]} onChange={(v) => patch((s) => ({ ...s, casing: v as CaptionStyleV2["casing"] }))} />
        {show("align") ? <Select label="Align" value={style.align} options={opts(["left", "center", "right"])} onChange={(v) => patch((s) => ({ ...s, align: v as CaptionStyleV2["align"] }))} /> : null}
        <Slider label="Letter spacing" value={style.letterSpacing} min={-4} max={20} step={0.5} onChange={(v) => patch((s) => ({ ...s, letterSpacing: v }))} />
        <Slider label="Word spacing" value={style.wordSpacing} min={-10} max={40} step={1} onChange={(v) => patch((s) => ({ ...s, wordSpacing: v }))} />
        <Slider label="Line height" value={style.lineHeight} min={0.8} max={2} step={0.05} onChange={(v) => patch((s) => ({ ...s, lineHeight: v }))} />
      </Section>

      <Section title="Color">
        {show("fillType") ? (
          <div className="flex items-center justify-between text-sm text-st-text/90">
            <span>Text fill</span>
            <Segmented value={style.fill.type} options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]} onChange={(v) => patch((s) => ({ ...s, fill: v === "gradient" ? { type: "gradient", stops: [{ color: solid(s), at: 0 }, { color: s.active.color, at: 1 }], angle: 90 } : { type: "solid", color: solid(s) } }))} />
          </div>
        ) : null}
        {show("textColor") ? <ColorField label={style.fill.type === "gradient" ? "Gradient start" : "Text"} value={solid(style)} onChange={(v) => patch((s) => ({ ...s, fill: s.fill.type === "gradient" ? { ...s.fill, stops: [{ color: v, at: 0 }, ...s.fill.stops.slice(1)] } : { type: "solid", color: v } }))} /> : null}
        {show("gradientColor2") && style.fill.type === "gradient" ? (
          <>
            <ColorField label="Gradient end" value={style.fill.stops[style.fill.stops.length - 1]!.color} onChange={(v) => patch((s) => (s.fill.type === "gradient" ? { ...s, fill: { ...s.fill, stops: [...s.fill.stops.slice(0, -1), { color: v, at: 1 }] } } : s))} />
            <Slider label="Gradient angle" value={style.fill.angle} min={0} max={360} step={5} unit="°" onChange={(v) => patch((s) => (s.fill.type === "gradient" ? { ...s, fill: { ...s.fill, angle: v } } : s))} />
          </>
        ) : null}
        {show("highlightColor") ? <ColorField label={tpl.capabilities.hero ? "Highlight / key word" : "Highlight"} value={style.active.color} onChange={(v) => patch((s) => ({ ...s, active: { ...s.active, color: v } }))} /> : null}
        {show("effect") ? <Select label="Spoken-word effect" value={style.active.effect} options={opts(effects)} onChange={(v) => patch((s) => ({ ...s, active: { ...s.active, effect: v as CaptionStyleV2["active"]["effect"] } }))} /> : null}
        {show("boxColor") ? <ColorField label="Box color" value={style.active.boxColor ?? style.active.color} onChange={(v) => patch((s) => ({ ...s, active: { ...s.active, boxColor: v } }))} /> : null}
        {show("dimUnspoken") ? <Slider label="Not-yet-spoken words" value={Math.round(style.inactiveOpacity * 100)} min={10} max={100} step={5} unit="%" onChange={(v) => patch((s) => ({ ...s, inactiveOpacity: v / 100 }))} /> : null}
        {show("effectStrength") ? <Slider label="Effect strength" value={style.active.scale} min={1} max={1.5} step={0.02} onChange={(v) => patch((s) => ({ ...s, active: { ...s.active, scale: v } }))} /> : null}
      </Section>

      {show("heroScale") ? (
        <Section title="Key word" hint="Click a word in Captions, then ☆ Make key word.">
          <Slider label="Key word size" value={style.hero.scale} min={1} max={3} step={0.05} unit="×" onChange={(v) => patch((s) => ({ ...s, hero: { ...s.hero, scale: v } }))} />
          {show("heroFont") ? <FontPicker label="Key word font" value={style.hero.fontId ?? style.fontId} onChange={(v) => patch((s) => ({ ...s, hero: { ...s.hero, fontId: v } }))} /> : null}
        </Section>
      ) : null}

      <Section title="Outline & shadow">
        <Toggle label="Outline" checked={style.stroke.enabled} onChange={(v) => patch((s) => ({ ...s, stroke: { ...s.stroke, enabled: v, width: s.stroke.width || 3 } }))} />
        {show("outlineWidth") ? (
          <>
            <Slider label="Outline width" value={style.stroke.width} min={1} max={16} step={0.5} onChange={(v) => patch((s) => ({ ...s, stroke: { ...s.stroke, width: v } }))} />
            <ColorField label="Outline color" value={style.stroke.color} onChange={(v) => patch((s) => ({ ...s, stroke: { ...s.stroke, color: v } }))} />
          </>
        ) : null}
        <Toggle label="Drop shadow" checked={style.shadows.length > 0} onChange={(v) => patch((s) => ({ ...s, shadows: v ? [{ x: 0, y: 4, blur: 6, color: "rgba(0,0,0,0.6)" }] : [] }))} />
        {show("shadowColor") ? (
          <>
            <ColorField label="Shadow color" value={style.shadows[0]!.color.startsWith("#") ? style.shadows[0]!.color : "#000000"} onChange={(v) => patch((s) => ({ ...s, shadows: s.shadows.map((x, i) => (i === 0 ? { ...x, color: v } : x)) }))} />
            <Slider label="Shadow softness" value={style.shadows[0]!.blur} min={0} max={40} onChange={(v) => patch((s) => ({ ...s, shadows: s.shadows.map((x, i) => (i === 0 ? { ...x, blur: v } : x)) }))} />
            <Slider label="Shadow distance" value={style.shadows[0]!.y} min={0} max={30} onChange={(v) => patch((s) => ({ ...s, shadows: s.shadows.map((x, i) => (i === 0 ? { ...x, y: v } : x)) }))} />
            <Slider label="Shadow transparency" value={Math.round((1 - (style.shadows[0]!.opacity ?? 1)) * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => patch((s) => ({ ...s, shadows: s.shadows.map((x, i) => (i === 0 ? { ...x, opacity: 1 - v / 100 } : x)) }))} />
          </>
        ) : null}
        <Toggle label="Glow" checked={style.glow.enabled} onChange={(v) => patch((s) => ({ ...s, glow: { ...s.glow, enabled: v, color: v && s.glow.color === "#FFFFFF" ? s.active.color : s.glow.color } }))} />
        {show("glowColor") ? (
          <>
            <ColorField label="Glow color" value={style.glow.color} onChange={(v) => patch((s) => ({ ...s, glow: { ...s.glow, color: v } }))} />
            <Slider label="Glow size" value={style.glow.radius} min={2} max={60} onChange={(v) => patch((s) => ({ ...s, glow: { ...s.glow, radius: v } }))} />
          </>
        ) : null}
      </Section>

      {bgEditable ? (
        <Section title="Background">
          {show("background") ? <Select label="Style" value={BACKGROUND_TYPES.includes(style.background.type as (typeof BACKGROUND_TYPES)[number]) ? style.background.type : "box"} options={opts(BACKGROUND_TYPES)} onChange={(v) => patch((s) => ({ ...s, background: { ...s.background, type: v as CaptionStyleV2["background"]["type"] } }))} /> : null}
          {show("backgroundColor") ? (
            <>
              <ColorField label="Color" value={style.background.color} onChange={(v) => patch((s) => ({ ...s, background: { ...s.background, color: v } }))} />
              <Slider label="Opacity" value={style.background.opacity} min={0.1} max={1} step={0.05} onChange={(v) => patch((s) => ({ ...s, background: { ...s.background, opacity: v } }))} />
            </>
          ) : null}
          {show("backgroundPadding") ? <Slider label="Padding" value={style.background.padding} min={0} max={60} onChange={(v) => patch((s) => ({ ...s, background: { ...s.background, padding: v } }))} /> : null}
          {show("backgroundRadius") ? <Slider label="Corner radius" value={style.background.radius} min={0} max={100} onChange={(v) => patch((s) => ({ ...s, background: { ...s.background, radius: v } }))} /> : null}
          {show("backgroundBlur") ? <Slider label="Frosted blur" value={style.background.blur} min={0} max={40} onChange={(v) => patch((s) => ({ ...s, background: { ...s.background, blur: v } }))} /> : null}
        </Section>
      ) : null}

      <Section title="Position" hint="You can also drag the handle on the video.">
        <Slider label="Vertical" value={Math.round(style.position.y * 100)} min={5} max={95} unit="%" onChange={(v) => patch((s) => ({ ...s, position: { ...s.position, y: v / 100 } }))} />
        <Slider label="Horizontal" value={Math.round(style.position.x * 100)} min={5} max={95} unit="%" onChange={(v) => patch((s) => ({ ...s, position: { ...s.position, x: v / 100 } }))} />
        <Slider label="Max width" value={Math.round(style.maxWidth * 100)} min={30} max={100} unit="%" onChange={(v) => patch((s) => ({ ...s, maxWidth: v / 100 }))} />
        <Slider label="Rotation" value={style.rotation} min={-15} max={15} step={0.5} unit="°" onChange={(v) => patch((s) => ({ ...s, rotation: v }))} />
      </Section>

      <Section title="Motion">
        {show("entrance") ? (
          <MotionPicker
            label="Entrance"
            kind="enter"
            value={style.entrance.type}
            groups={entranceGroups}
            onChange={(v) => patch((s) => ({
              ...s,
              // a pick plays like its preview: letter animators at their fast default, card entrances smooth and readable
              entrance: isLetterAnimator(v)
                ? { ...s.entrance, type: v, durationMs: LETTER_DEFAULT_MS }
                : { ...s.entrance, type: v as CaptionStyleV2["entrance"]["type"], durationMs: isLetterAnimator(s.entrance.type) ? 420 : Math.max(320, s.entrance.durationMs), easing: "outCubic" },
            }))}
          />
        ) : null}
        {show("entrance") && style.entrance.type !== "none" ? <Slider label="Entrance speed" value={style.entrance.durationMs} min={80} max={800} step={20} unit=" ms" onChange={(v) => patch((s) => ({ ...s, entrance: { ...s.entrance, durationMs: v } }))} /> : null}
        {show("stagger") ? (
          <div className="flex items-center justify-between text-sm text-st-text/90">
            <span>Animate</span>
            <Segmented value={style.entrance.stagger} options={[{ value: "none", label: "Whole card" }, { value: "word", label: "Word by word" }, { value: "char", label: "Letters" }]} onChange={(v) => patch((s) => ({ ...s, entrance: { ...s.entrance, stagger: v as CaptionStyleV2["entrance"]["stagger"] } }))} />
          </div>
        ) : null}
        {show("easing") ? <Select label="Easing" value={style.entrance.easing} options={[{ value: "outExpo", label: "Snappy" }, { value: "outCubic", label: "Smooth" }, { value: "outQuad", label: "Gentle" }, { value: "inOutCubic", label: "Ease in-out" }, { value: "linear", label: "Linear" }]} onChange={(v) => patch((s) => ({ ...s, entrance: { ...s.entrance, easing: v as CaptionStyleV2["entrance"]["easing"] } }))} /> : null}
        <MotionPicker
          label="Exit"
          kind="exit"
          value={style.exit.type}
          groups={exitGroups}
          onChange={(v) => patch((s) => ({
            ...s,
            exit: { ...s.exit, type: v as CaptionStyleV2["exit"]["type"], durationMs: isLetterAnimator(v) ? LETTER_DEFAULT_MS : isLetterAnimator(s.exit.type) ? 360 : Math.max(280, s.exit.durationMs) },
          }))}
        />
        {style.exit.type !== "none" ? <Slider label="Exit speed" value={style.exit.durationMs} min={80} max={800} step={20} unit=" ms" onChange={(v) => patch((s) => ({ ...s, exit: { ...s.exit, durationMs: v } }))} /> : null}
        {show("motionIntensity") ? <Slider label="Motion intensity" value={style.motionIntensity} min={0} max={2} step={0.05} onChange={(v) => patch((s) => ({ ...s, motionIntensity: v }))} /> : null}
        <Slider label="Emotion reactivity" value={style.emotionReactivity} min={0} max={1} step={0.05} onChange={(v) => patch((s) => ({ ...s, emotionReactivity: v }))} />
      </Section>
    </div>
  );
};

/** one-click caption pacing (remotion2.md): words per card + the pause that starts a new card */
const PACING = [
  { id: "fast", label: "Fast", words: 2, pauseMs: 250 },
  { id: "normal", label: "Normal", words: 4, pauseMs: 400 },
  { id: "slow", label: "Slow", words: 7, pauseMs: 700 },
] as const;

interface SettingsProps {
  settings: ProjectSettings;
  patch: (p: Partial<ProjectSettings>) => void;
  /** current layout: lines/characters settings only matter to layouts that flow text in lines */
  layout: string;
}

export const SettingsPanel: React.FC<SettingsProps> = ({ settings, patch, layout }) => {
  const usesLines = layout !== "word" && layout !== "stack3" && layout !== "kinetic";
  const pace = PACING.find((p) => p.words === settings.maxWordsPerCard && p.pauseMs === settings.pauseMs)?.id ?? "custom";
  return (
    <div className="h-full overflow-y-auto">
      {layout !== "word" ? (
        <Section title="Pacing">
          <Segmented value={pace} options={[...PACING.map((p) => ({ value: p.id, label: p.label })), ...(pace === "custom" ? [{ value: "custom", label: "Custom" }] : [])]} onChange={(v) => { const p = PACING.find((x) => x.id === v); if (p) patch({ maxWordsPerCard: p.words, pauseMs: p.pauseMs }); }} />
        </Section>
      ) : null}
      <Section title="Card size" hint="How much text shows at once.">
        {layout !== "word" ? <Slider label="Words per card" value={settings.maxWordsPerCard} min={1} max={12} onChange={(v) => patch({ maxWordsPerCard: v })} /> : null}
        {usesLines ? (
          <>
            <Slider label="Max lines" value={settings.maxLines} min={1} max={3} onChange={(v) => patch({ maxLines: v })} />
            <Slider label="Characters per line" value={settings.maxCharsPerLine} min={8} max={60} onChange={(v) => patch({ maxCharsPerLine: v })} />
          </>
        ) : null}
      </Section>
      <Section title="Timing">
        <Slider label="Start a new card after a pause of" value={settings.pauseMs} min={150} max={1500} step={50} unit=" ms" onChange={(v) => patch({ pauseMs: v })} />
        <Slider label="Keep card on screen after speech" value={settings.holdMs} min={0} max={1500} step={50} unit=" ms" onChange={(v) => patch({ holdMs: v })} />
        <Slider label="Minimum card time" value={settings.minCardMs} min={200} max={2000} step={50} unit=" ms" onChange={(v) => patch({ minCardMs: v })} />
        <Select label="During silence" value={settings.gapBehavior} options={[{ value: "hold", label: "Keep last card" }, { value: "clear", label: "Clear screen" }]} onChange={(v) => patch({ gapBehavior: v as ProjectSettings["gapBehavior"] })} />
        <Slider label="Sync offset" value={settings.syncOffsetMs} min={-1000} max={1000} step={10} unit=" ms" onChange={(v) => patch({ syncOffsetMs: v })} />
      </Section>
      <Section title="Clean-up">
        <Toggle label="Remove filler words" hint="um, uh, hmm…" checked={settings.removeFillers} onChange={(v) => patch({ removeFillers: v })} />
        <Select label="Profanity" value={settings.profanity} options={[{ value: "off", label: "Leave as is" }, { value: "mask", label: "Mask (f***)" }, { value: "hide", label: "Hide" }]} onChange={(v) => patch({ profanity: v as ProjectSettings["profanity"] })} />
      </Section>
    </div>
  );
};
