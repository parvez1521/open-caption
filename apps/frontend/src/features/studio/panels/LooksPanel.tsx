"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Search } from "lucide-react";
import type { CaptionStyleV2, ProjectSettings } from "@capseasy/shared";
import { LOOKS, LOOK_SECTIONS, fontStack, loadFontFamily, resolveStyle, type LookDefinition } from "@capseasy/templates";
import { studioService } from "@/services/studio";

interface Props {
  currentLookId: string | null;
  onChoose: (look: LookDefinition) => void;
  currentStyle: CaptionStyleV2;
  currentSettings: ProjectSettings;
}

function swatchStyle(look: LookDefinition): React.CSSProperties {
  const s = look.style;
  const fill = s.fill.type === "solid" ? s.fill.color : s.fill.stops[0]!.color;
  return {
    fontFamily: fontStack(s.fontId),
    fontWeight: s.fontWeight,
    color: fill,
    textTransform: s.casing === "upper" ? "uppercase" : s.casing === "lower" ? "lowercase" : "none",
    WebkitTextStroke: s.stroke.enabled ? `${Math.min(2, s.stroke.width / 2)}px ${s.stroke.color}` : undefined,
    paintOrder: "stroke fill",
    textShadow: s.shadows[0] ? `0 ${Math.min(3, s.shadows[0].y)}px ${Math.min(6, s.shadows[0].blur)}px ${s.shadows[0].color}` : undefined,
  } as React.CSSProperties;
}

/** Built-in looks have previews rendered by the real composition (packages/compositions/scripts/look-previews.ts). */
const BUILT_IN = new Set(LOOKS.map((l) => l.id));

/** Live-text preview in the look's own font and colours: the fallback whenever no rendered still exists. */
const SwatchPreview: React.FC<{ look: LookDefinition }> = ({ look }) => (
  <div className="flex aspect-[8/3] items-center justify-center bg-black px-3 text-center text-[22px] leading-tight">
    <span style={swatchStyle(look)}>
      {look.templateId === "word_by_word" ? "WATCH" : "Watch this"} <span style={{ color: look.style.active.color }}>now</span>
    </span>
  </div>
);

/**
 * Wide still of the look on black (as the previews are rendered); its actual animation loops on hover (and always
 * for the selected look). Rendered stills only exist for some looks — when the file is missing the card falls back
 * to the live-text swatch instead of showing a dead black box (most pack looks have no rendered still).
 */
const LookPreview: React.FC<{ look: LookDefinition; playing: boolean }> = ({ look, playing }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);
  const [stillOk, setStillOk] = useState(true);
  const active = hover || playing;
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      void v.play().catch(() => undefined);
    } else v.pause();
  }, [active]);
  if (!stillOk) return <SwatchPreview look={look} />;
  return (
    <div className="relative aspect-[8/3] overflow-hidden bg-black" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/looks/${look.id}.webp`} alt={`${look.name} caption style`} loading="lazy" decoding="async" onError={() => setStillOk(false)} className="absolute inset-0 h-full w-full object-contain" />
      {active ? (
        <video ref={ref} src={`/looks/${look.id}.mp4`} muted loop playsInline preload="auto" aria-hidden className="absolute inset-0 h-full w-full object-contain" />
      ) : null}
    </div>
  );
};

export const LooksPanel: React.FC<Props> =({ currentLookId, onChoose, currentStyle, currentSettings }) => {
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ["my-looks"], queryFn: () => studioService.listLooks() });
  const myLooks = useMemo<LookDefinition[]>(
    () => (mine.data ?? []).map((l) => ({ id: `user:${l.id}`, name: l.name, description: "Saved look", category: "My looks", templateId: l.template_id, style: resolveStyle(l.style_json), settings: l.settings_json })),
    [mine.data],
  );
  const cats = useMemo(() => ["All", ...LOOK_SECTIONS.map((s) => s.label), ...(myLooks.length ? ["My looks"] : [])], [myLooks.length]);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const saveCurrent = async () => {
    const name = window.prompt("Name this look", "My look")?.trim();
    if (!name) return;
    setSaving(true);
    try {
      await studioService.saveLook(name, currentStyle, { maxWordsPerCard: currentSettings.maxWordsPerCard, maxLines: currentSettings.maxLines, gapBehavior: currentSettings.gapBehavior });
      await qc.invalidateQueries({ queryKey: ["my-looks"] });
      setCat("My looks");
    } finally {
      setSaving(false);
    }
  };
  const removeLook = (look: LookDefinition) => {
    if (!window.confirm(`Delete "${look.name}"?`)) return;
    void studioService.deleteLook(look.id.slice(5)).then(() => qc.invalidateQueries({ queryKey: ["my-looks"] }));
  };
  const [, setTick] = useState(0);

  // preview each look in its real font
  useEffect(() => {
    const families = [...new Set(LOOKS.flatMap((l) => [l.style.fontId, l.style.hero.fontId ?? ""]).filter(Boolean))];
    void Promise.all(families.map(loadFontFamily)).then(() => setTick((n) => n + 1));
  }, []);

  const all = [...myLooks, ...LOOKS];
  const needle = q.trim().toLowerCase();
  const section = LOOK_SECTIONS.find((s) => s.label === cat);
  const inCat = cat === "All" ? all : cat === "My looks" ? myLooks : section ? section.lookIds.map((id) => all.find((l) => l.id === id)!).filter(Boolean) : all;
  // "12" or "#12" finds look number 12
  const numberQuery = /^#?(\d+)$/.exec(needle)?.[1];
  const shown = inCat.filter(
    (l) => !needle || (numberQuery ? l.number === Number(numberQuery) : [l.name, l.category, l.description, ...(l.tags ?? [])].some((t) => t.toLowerCase().includes(needle))),
  );
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-st-line p-3">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-st-line bg-st-panel px-2.5 focus-within:border-st-ink/40">
            <Search className="h-4 w-4 shrink-0 text-st-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a look or #number" aria-label="Find a look" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-st-faint" />
          </label>
          <button onClick={() => void saveCurrent()} disabled={saving} title="Save the current style as your own look" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-st-line bg-st-panel px-3 text-sm font-medium hover:bg-st-hover disabled:opacity-50">
            <Save className="h-4 w-4" aria-hidden />{saving ? "Saving…" : "Save look"}
          </button>
        </div>
        <div className="hidden flex-wrap gap-1.5 lg:flex">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`rounded-full border px-3 py-1.5 text-xs transition lg:px-2.5 lg:py-1 ${cat === c ? "border-st-ink bg-st-ink text-st-panel" : "border-st-line bg-st-panel text-st-muted hover:text-st-text"}`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {shown.length === 0 ? <p className="py-8 text-center text-sm text-st-faint">No looks match “{q}”.</p> : null}
        {shown.map((look) => {
          const chosen = look.id === currentLookId;
          return (
            <button
              key={look.id}
              onClick={() => onChoose(look)}
              aria-pressed={chosen}
              className={`group block w-full overflow-hidden rounded-2xl border bg-st-panel text-left transition ${chosen ? "border-st-ink shadow-[0_0_0_3px_var(--color-st-lav)]" : "border-st-line hover:border-st-ink/30 hover:shadow-[0_8px_20px_-14px_rgba(26,26,26,0.5)]"}`}
            >
              <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                <span className="truncate text-sm font-bold text-st-text">
                  {look.name}
                  {look.number ? <span className="ml-1.5 font-medium text-st-faint">#{look.number}</span> : null}
                </span>
                {look.category === "My looks" ? (
                  <span role="button" aria-label={`Delete ${look.name}`} onClick={(e) => { e.stopPropagation(); removeLook(look); }} className="rounded px-1 text-xs text-st-faint hover:bg-st-or/30 hover:text-st-text">✕</span>
                ) : chosen ? (
                  <span className="rounded-full bg-st-em px-2 py-0.5 text-[10px] font-semibold text-st-ink">In use</span>
                ) : null}
              </div>
              {BUILT_IN.has(look.id) ? (
                <LookPreview look={look} playing={chosen} />
              ) : (
                <SwatchPreview look={look} />
              )}
              <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
                {(look.tags ?? [look.category]).map((t) => (
                  <span key={t} className="rounded-md bg-st-raised px-2 py-0.5 text-[11px] font-medium text-st-muted">{t}</span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
