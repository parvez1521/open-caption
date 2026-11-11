"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Search } from "@/components/ui/icons";
import type { CaptionStyleV2, ProjectSettings } from "@capseasy/shared";
import { withAlpha } from "@motion-ai/caption-engine/core";
import { LOOKS, LOOK_SECTIONS, fontStack, loadFontFamily, resolveStyle, type LookDefinition } from "@capseasy/templates";
import { studioService } from "@/services/studio";
import { AnimatedTemplatePreview } from "./AnimatedTemplatePreview";

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

/**
 * Looks that actually HAVE a pre-rendered still in apps/frontend/public/looks/ — the original
 * gallery set rendered by packages/compositions/scripts/look-previews.ts. Every other built-in
 * look has no still file on disk.
 *
 * Phase 9 W2, quirk (d): the poster used to request `/looks/<id>.webp` for EVERY built-in look,
 * so ~126 cards (including Roll Hero) first painted a 404 <img> over the black stage — a black
 * card — until the error arrived and the swatch fallback took over (or the live layer granted).
 * Looks without a still now go straight to the swatch. If previews are re-rendered for more
 * looks, add their ids here; a stale entry only costs the graceful swatch, never a black card.
 */
export const LOOKS_WITH_STILLS: ReadonlySet<string> = new Set([
  "beast_bounce", "bold_pill", "cartoon_stack_classic", "chat_bubble", "comic_burst",
  "desi_clean", "explainer", "film_noir", "gaming_hud", "glow_stack_classic",
  "gradient_pop", "highlighter_card", "hormozi_box", "ice_duo", "karaoke_fill",
  "kinetic_mix", "lower_third", "luxe_serif", "metal_script", "minimal_pro",
  "motivational", "neon_duo", "neon_sign", "netflix_sub", "outline_fill",
  "pop_clean", "read_along", "retro_3d", "retro_vhs", "scribble",
  "serif_accent_glow", "serif_behind", "serif_pop_classic", "soft_glow", "staggered_splash",
  "storytime", "terminal", "vintage_cinematic", "wave_bounce",
]);

/**
 * Live-text preview in the template's own font and colours: the poster whenever no rendered still exists.
 * Looks composed as dark text on a light box/pill/bubble carry that background behind the words — without
 * it the swatch was dark text on the card's black stage, i.e. invisible ("no preview at all").
 */
const SwatchPreview: React.FC<{ look: LookDefinition }> = ({ look }) => {
  const bg = look.style.background;
  const hasBg = bg && bg.type !== "none";
  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-3 text-center text-[22px] leading-tight">
      <span className="relative inline-block" style={hasBg ? { padding: "0.35em 0.6em" } : undefined}>
        {hasBg ? (
          <span aria-hidden className="absolute inset-0" style={{ backgroundColor: withAlpha(bg.color, bg.opacity), borderRadius: Math.max(4, bg.radius / 2) }} />
        ) : null}
        <span className="relative" style={swatchStyle(look)}>
          {look.templateId === "word_by_word" ? "WATCH" : "Watch this"} <span style={{ color: look.style.active.color }}>now</span>
        </span>
      </span>
    </div>
  );
};

/**
 * Poster for a template card: the pre-rendered still when one exists, otherwise the live-text swatch.
 * The live animated layer (AnimatedTemplatePreview) mounts over this poster near the viewport, so every
 * template — with or without a still — plays its real motion.
 */
export const TemplatePoster: React.FC<{ look: LookDefinition }> = ({ look }) => {
  const [stillOk, setStillOk] = useState(true);
  if (!LOOKS_WITH_STILLS.has(look.id) || !stillOk) return <SwatchPreview look={look} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/looks/${look.id}.webp`} alt={`${look.name} caption style`} loading="lazy" decoding="async" onError={() => setStillOk(false)} className="absolute inset-0 h-full w-full object-contain" />
  );
};

/**
 * One template card. Memoized: a selection change re-renders ONLY the card losing "In use" and the
 * card gaining it — previously every StudioPage render (selection, the 15 Hz playback feed, …)
 * re-rendered all 141 cards and their previews, which is what made selecting feel like a glitch.
 */
export const TemplateCard = React.memo(function TemplateCard({
  look,
  chosen,
  onChoose,
  onRemove,
}: {
  look: LookDefinition;
  chosen: boolean;
  onChoose: (look: LookDefinition) => void;
  onRemove?: (look: LookDefinition) => void;
}) {
  const choose = () => {
    // warm the chosen template's fonts in parallel with the (synchronous, local) apply: the studio
    // keeps rendering with the current pages until they land, then recomputes metrics — no blank gap
    void loadFontFamily(look.style.fontId);
    if (look.style.hero.fontId) void loadFontFamily(look.style.hero.fontId);
    onChoose(look);
  };
  return (
    // A div with button semantics, not a <button>: the card contains a real delete
    // <button>, and a button inside a button is invalid HTML (the old span role="button"
    // workaround was neither focusable nor reliably clickable for keyboards).
    <div
      role="button"
      tabIndex={0}
      onClick={choose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
        }
      }}
      aria-pressed={chosen}
      className={`group block w-full cursor-pointer overflow-hidden rounded-xl border bg-st-panel text-left transition-colors ${chosen ? "border-st-ink shadow-[0_0_0_3px_var(--color-st-lav)]" : "border-st-line hover:border-st-ink/30"}`}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <span className="truncate text-sm font-bold text-st-text">
          {look.name}
          {look.number ? <span className="ml-1.5 font-medium text-st-faint">#{look.number}</span> : null}
        </span>
        {onRemove ? (
          <button type="button" aria-label={`Delete ${look.name}`} onClick={(e) => { e.stopPropagation(); onRemove(look); }} className="rounded px-1 text-xs text-st-faint hover:bg-st-or/30 hover:text-st-text">✕</button>
        ) : chosen ? (
          <span className="rounded-full bg-st-em px-2 py-0.5 text-[10px] font-semibold text-[#141412]">In use</span>
        ) : null}
      </div>
      <AnimatedTemplatePreview look={look} poster={<TemplatePoster look={look} />} />
      <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
        {look.trending ? (
          <span className="rounded-md bg-[#FFA946] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#141412]">Trending</span>
        ) : null}
        {(look.tags ?? [look.category]).map((t) => (
          <span key={t} className="rounded-md bg-st-raised px-2 py-0.5 text-[11px] font-medium text-st-muted">{t}</span>
        ))}
      </div>
    </div>
  );
});

export const LooksPanel: React.FC<Props> = ({ currentLookId, onChoose, currentStyle, currentSettings }) => {
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ["my-looks"], queryFn: () => studioService.listLooks() });
  const myLooks = useMemo<LookDefinition[]>(
    () => (mine.data ?? []).map((l) => ({ id: `user:${l.id}`, name: l.name, description: "Saved template", category: "My templates", templateId: l.template_id, style: resolveStyle(l.style_json), settings: l.settings_json })),
    [mine.data],
  );
  const cats = useMemo(() => ["All", ...LOOK_SECTIONS.map((s) => s.label), ...(myLooks.length ? ["My templates"] : [])], [myLooks.length]);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const saveCurrent = async () => {
    const name = window.prompt("Name this template", "My template")?.trim();
    if (!name) return;
    setSaving(true);
    try {
      await studioService.saveLook(name, currentStyle, { maxWordsPerCard: currentSettings.maxWordsPerCard, maxLines: currentSettings.maxLines, gapBehavior: currentSettings.gapBehavior });
      await qc.invalidateQueries({ queryKey: ["my-looks"] });
      setCat("My templates");
    } finally {
      setSaving(false);
    }
  };
  const removeLook = (look: LookDefinition) => {
    if (!window.confirm(`Delete "${look.name}"?`)) return;
    void studioService.deleteLook(look.id.slice(5)).then(() => qc.invalidateQueries({ queryKey: ["my-looks"] }));
  };

  // NOTE: no panel-wide font preload any more. It downloaded every look's full font set (100+ families,
  // up to 7 weights each) the moment the panel opened and finished with a panel-wide re-render — the
  // contention that made the first selection feel slow. Each preview now loads its own fonts as it
  // approaches the viewport (see AnimatedTemplatePreview), and selecting warms the chosen look's fonts.

  const all = [...myLooks, ...LOOKS];
  const needle = q.trim().toLowerCase();
  const section = LOOK_SECTIONS.find((s) => s.label === cat);
  const inCat = cat === "All" ? all : cat === "My templates" ? myLooks : section ? section.lookIds.map((id) => all.find((l) => l.id === id)!).filter(Boolean) : all;
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a template or #number" aria-label="Find a template" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-st-faint" />
          </label>
          <button onClick={() => void saveCurrent()} disabled={saving} title="Save the current style as your own template" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-st-line bg-st-panel px-3 text-sm font-medium hover:bg-st-hover disabled:opacity-50">
            <Save className="h-4 w-4" aria-hidden />{saving ? "Saving…" : "Save template"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={`rounded-full border px-3 py-2 text-xs transition-colors ${cat === c ? "border-st-ink bg-st-ink text-st-panel shadow-[inset_0_-2px_0_var(--color-wb-blue)]" : "border-st-line bg-st-panel text-st-muted hover:text-st-text"}`}>{c}</button>
          ))}
        </div>
        <p className="text-xs tabular-nums text-st-faint" role="status">
          {shown.length} of {LOOKS.length} looks{cat !== "All" ? ` in ${cat}` : ""}{needle ? ` matching “${q.trim()}”` : ""}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {shown.length === 0 ? <p className="py-8 text-center text-sm text-st-faint">No templates match “{q}”.</p> : null}
        {shown.map((look) => (
          <TemplateCard
            key={look.id}
            look={look}
            chosen={look.id === currentLookId}
            onChoose={onChoose}
            onRemove={look.category === "My templates" ? removeLook : undefined}
          />
        ))}
      </div>
    </div>
  );
};
