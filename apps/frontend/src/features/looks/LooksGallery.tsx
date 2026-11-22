"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LOOKS, LOOK_SECTIONS, type LookDefinition } from "@capseasy/templates";
import { TemplateCard } from "@/features/studio/panels/LooksPanel";
import { useFavouriteLooks } from "@/lib/favouriteLooks";
import { Search } from "@/components/ui/icons";

/**
 * The /looks gallery: every built-in look, grouped by LOOK_SECTIONS in
 * registry order. The sections cover most of the catalogue; the looks no
 * section claims (the Classic tail of LOOKS) get their own last group, so
 * the page never silently drops a look. Tapping a look starts a new project
 * with it (/start?look=<id> — /start forwards it to the fresh project and
 * the Studio applies it once). Favourites are the same local-only hearts as
 * the Studio picker.
 *
 * Layout: one fluid grid (auto-fill, min-width cards) — never a fixed
 * three-cards-in-a-row, no bento grid, no glass card, no hover animation.
 * Full dark, the site's own palette only.
 */

interface GallerySection {
  id: string;
  label: string;
  looks: LookDefinition[];
}

function gallerySections(): GallerySection[] {
  const byId = new Map(LOOKS.map((l) => [l.id, l]));
  const sections = LOOK_SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    looks: s.lookIds.map((id) => byId.get(id)!).filter(Boolean),
  }));
  const sectioned = new Set(sections.flatMap((s) => s.looks.map((l) => l.id)));
  const classic = LOOKS.filter((l) => !sectioned.has(l.id));
  if (classic.length) sections.push({ id: "classic", label: "Classic", looks: classic });
  return sections;
}

export default function LooksGallery() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const sections = useMemo(() => gallerySections(), []);
  const knownLookIds = useMemo(() => new Set(LOOKS.map((l) => l.id)), []);
  const { favourites, toggleFavourite } = useFavouriteLooks(knownLookIds);
  const toggleFavouriteLook = useCallback((look: LookDefinition) => toggleFavourite(look.id), [toggleFavourite]);
  const chooseLook = useCallback((look: LookDefinition) => router.push(`/start?look=${look.id}`), [router]);

  const needle = q.trim().toLowerCase();
  const numberQuery = /^#?(\d+)$/.exec(needle)?.[1];
  const shown = useMemo(() => {
    if (!needle) return null;
    return LOOKS.filter((l) =>
      numberQuery ? l.number === Number(numberQuery) : [l.name, l.category, l.description, ...(l.tags ?? [])].some((t) => t.toLowerCase().includes(needle)),
    );
  }, [needle, numberQuery]);

  const renderCard = (look: LookDefinition) => (
    <TemplateCard key={look.id} look={look} chosen={false} favourite={favourites.has(look.id)} onChoose={chooseLook} onToggleFavourite={toggleFavouriteLook} />
  );

  return (
    <div>
      <label className="mt-8 flex items-center gap-2 rounded-lg border border-[#FFFFEB]/15 bg-[#1C1C1A] px-3.5 focus-within:border-[#FFFFEB]/40">
        <Search className="h-4 w-4 shrink-0 text-[#FFFFEB]/50" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a look by name or #number"
          aria-label="Find a look"
          className="min-w-0 flex-1 bg-transparent py-3 text-sm text-[#FFFFEB] outline-none placeholder:text-[#FFFFEB]/40"
        />
      </label>

      {needle ? (
        <div className="mt-8">
          <p className="text-sm text-[#FFFFEB]/60" role="status">
            {shown!.length} of {LOOKS.length} looks matching “{q.trim()}”
          </p>
          {shown!.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#FFFFEB]/60">No looks match “{q}”.</p>
          ) : (
            <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">{shown!.map(renderCard)}</div>
          )}
        </div>
      ) : (
        <>
          <nav aria-label="Look sections" className="mt-6 flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#section-${s.id}`}
                className="rounded-full border border-[#FFFFEB]/15 bg-[#1C1C1A] px-3.5 py-2 text-xs font-semibold text-[#FFFFEB]/75 hover:text-[#FFFFEB]"
              >
                {s.label} · {s.looks.length}
              </a>
            ))}
          </nav>
          <p className="mt-6 text-sm text-[#FFFFEB]/60" role="status">
            {LOOKS.length} looks. Tap one to start a project with it.
          </p>
          {sections.map((s) => (
            <section key={s.id} id={`section-${s.id}`} aria-labelledby={`heading-${s.id}`} className="mt-10 scroll-mt-28">
              <h2 id={`heading-${s.id}`} className="text-xl font-bold text-[#FFFFEB]">
                {s.label} <span className="ml-1 text-sm font-medium text-[#FFFFEB]/50">{s.looks.length}</span>
              </h2>
              <div className="mt-5 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">{s.looks.map(renderCard)}</div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
