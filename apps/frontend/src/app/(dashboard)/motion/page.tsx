"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  MOTION_TEMPLATES,
  defaultMotionConfig,
  listMotionCategories,
  searchMotionTemplates,
  type MotionCategory,
  type MotionSort,
} from "@capseasy/motion";
import StudioShell from "@/components/studio/StudioShell";
import { MotionPreview } from "@/features/motion/MotionPreview";
import { buildMotionOverlayItem } from "@/features/motion/addToProject";
import { motionCategoryLabel } from "@/features/motion/categoryLabel";

/**
 * Motion Studio discovery: every template in the motion registry, searchable / filterable /
 * sortable through the registry's own helpers, each card playing the REAL graphic (MotionPreview
 * renders the same OverlayView as the Studio and the export — lazily, under the shared
 * live-preview budget, so first paint stays light). Picking a card opens its customize page.
 */
const SORT_OPTIONS: { value: MotionSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "recent", label: "Recent" },
  { value: "title", label: "Title A–Z" },
  { value: "category", label: "Category" },
];

export default function MotionDiscoveryPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MotionCategory | "all">("all");
  const [sort, setSort] = useState<MotionSort>("featured");

  const categories = useMemo(() => listMotionCategories(), []);
  const results = useMemo(
    () => searchMotionTemplates({ query, category: category === "all" ? undefined : category }, sort),
    [query, category, sort],
  );
  // one preview item per template, built from the registry defaults (stable across re-renders)
  const previewItems = useMemo(
    () => new Map(MOTION_TEMPLATES.map((t) => [t.id, buildMotionOverlayItem(defaultMotionConfig(t.id), 0)])),
    [],
  );

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
  };

  return (
    <StudioShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-10 sm:py-10">
        <div className="border-b border-sand-200 pb-8">
          <p className="wb-eyebrow">46 templates · included in every plan</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl">
            Motion <em className="italic text-sand-600">Studio</em>
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-sand-800">
            Animated graphics for your videos: subscribe pills, follow cards, counters, titles and more. Pick one, make it yours, and add it to a project. Every preview below is the real graphic, playing. Motion templates are separate from the 150 caption looks. Both are included.
          </p>
        </div>

        <div className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates — try “follow”, “counter”, “qr”…"
              aria-label="Search motion templates"
              className="wb-field min-w-0 flex-1 sm:max-w-md"
            />
            <label className="flex items-center gap-2 text-[13px] font-medium text-sand-700">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as MotionSort)}
                aria-label="Sort templates"
                className="rounded-wb-field border border-sand-200 bg-sand-50 px-3 py-2.5 text-[13px] font-medium text-ink outline-none focus:border-emerald-accent"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <span className="text-[13px] tabular-nums text-sand-600" role="status">
              Showing {results.length} of {MOTION_TEMPLATES.length} templates
            </span>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setCategory("all")}
              aria-pressed={category === "all"}
              className={`relative rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-[''] ${category === "all" ? "border-ink bg-ink text-[#141412] shadow-[inset_0_-2px_0_var(--color-wb-blue)]" : "border-sand-200 bg-sand-50 text-sand-800 hover:border-sand-300"}`}
            >
              All ({MOTION_TEMPLATES.length})
            </button>
            {categories.map(({ category: c, count }) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`relative rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-[''] ${category === c ? "border-ink bg-ink text-[#141412] shadow-[inset_0_-2px_0_var(--color-wb-blue)]" : "border-sand-200 bg-sand-50 text-sand-800 hover:border-sand-300"}`}
              >
                {motionCategoryLabel(c)} ({count})
              </button>
            ))}
          </div>
        </div>

        {results.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-16 text-center">
            <p className="font-serif text-2xl font-semibold text-ink">No templates match that search.</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-sand-800">Try a different word. Or clear the search and browse the full set.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="wb-btn-primary mt-5"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((t) => (
              <Link
                key={t.id}
                href={`/motion/${t.id}`}
                className="flex flex-col overflow-hidden rounded-wb-panel border border-sand-200 bg-sand-100 transition-colors hover:border-sand-300"
                aria-label={`Customise ${t.title}`}
              >
                <MotionPreview item={previewItems.get(t.id)!} />
                <span className="flex flex-1 flex-col gap-1 px-4 py-3">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-sora text-[14px] font-semibold text-ink">{t.title}</span>
                    <span className="shrink-0 rounded-full border border-sand-200 px-2 py-0.5 text-[11px] font-semibold text-sand-600">{motionCategoryLabel(t.category)}</span>
                  </span>
                  <span className="text-[13px] leading-snug text-sand-700">{t.description}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StudioShell>
  );
}
