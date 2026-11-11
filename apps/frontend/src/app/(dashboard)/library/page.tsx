"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import StudioShell from "@/components/studio/StudioShell";
import { describeAssetLicence, formatBytes } from "@/features/studio/mediaAssets";
import { clearAssetPreviews, deleteAsset, listAllAssets, type MediaAssetRecord } from "@/features/studio/mediaStore";
import {
  DERIVED_KIND_LABELS,
  classifyDerivedAsset,
  clearProjectDerivedCache,
  collectReferencedAssetIds,
  planDerivedCleanup,
  summarizeDerivedCache,
  type DerivedCleanupPlan,
  type DerivedKind,
} from "@/features/studio/derivedCache";
import { readCompositionSettings } from "@/features/studio/stageC";
import { studioService } from "@/services/studio";

const DERIVED_SINGULAR: Record<Exclude<DerivedKind, "previews">, string> = {
  reversed: "Reversed copy",
  freeze: "Freeze-frame still",
  "noise-suppressed": "Noise-suppressed copy",
};
import {
  LIBRARY_FILTERS,
  countByKind,
  filterLibraryAssets,
  formatDimensions,
  formatDurationMs,
  projectTitleFor,
  type LibraryKindFilter,
} from "@/features/studio/mediaLibrary";

/**
 * Media Library: every file in the device media bin (IndexedDB `assets` store), across all
 * projects. The bytes live in this browser only — nothing here is uploaded — so this page is a
 * window onto this device, not onto the account. Actions are the ones that genuinely work from
 * here: open the owning project, download the stored file, or delete it from this device.
 * Placing an image / using a video as source happens inside the project (Media panel), where
 * the live studio session owns the settings save — hence "Open in project", not a fake attach.
 */
export default function LibraryPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [assets, setAssets] = useState<MediaAssetRecord[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryKindFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<MediaAssetRecord | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const [deleteCheckingId, setDeleteCheckingId] = useState<string | null>(null);
  const [cleanupProjectId, setCleanupProjectId] = useState<string | null>(null);
  const [cleanupPrep, setCleanupPrep] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; plan: DerivedCleanupPlan; referenced: Set<string> }
    | null
  >(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void listAllAssets().then((list) => { if (live) setAssets(list); });
    return () => { live = false; };
  }, [signedIn]);

  // Project titles for the "belongs to" column; the bin only stores project ids.
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsService.getProjectsPage({ includeArchived: true, limit: 100 }),
    enabled: signedIn,
  });
  const titles = useMemo(
    () => new Map((projectsData?.projects ?? []).map((p) => [p.id, p.title])),
    [projectsData],
  );

  const all = assets ?? [];
  const counts = countByKind(all);
  const visible = filterLibraryAssets(all, query, filter, titles);
  const totalSize = all.reduce((n, a) => n + a.size, 0);
  const derived = useMemo(() => summarizeDerivedCache(assets ?? []), [assets]);

  /**
   * Prepare a per-project derived-cache cleanup. The referenced set is loaded
   * from the project's stored composition FIRST: a derived copy a segment,
   * audio clip, overlay or the noise-suppression setting still points at is
   * KEPT and named in the plan, never silently deleted. If the references
   * can't be loaded, the cleanup fails closed — except for a bin whose
   * project is no longer in the account's project list at all (its stored
   * composition was deleted with the project, so nothing can reference it).
   */
  const prepareCleanup = async (projectId: string) => {
    setCleanupNotice(null);
    setCleanupProjectId(projectId);
    setCleanupPrep({ status: "loading" });
    try {
      let referenced: Set<string>;
      try {
        const data = await studioService.getStudio(projectId);
        const resolved = readCompositionSettings({
          settingsComposition: data.project.settings_json?.composition ?? null,
          compositionJson: data.project.composition_json,
        });
        referenced = collectReferencedAssetIds({
          composition: resolved.settings,
          overlays: data.project.settings_json?.overlays ?? [],
        });
      } catch {
        if (projectsData && !titles.has(projectId)) {
          referenced = new Set();
        } else {
          throw new Error("Couldn't check what this project's timeline still uses, so nothing was cleared. Check your connection and try again.");
        }
      }
      setCleanupPrep({ status: "ready", plan: planDerivedCleanup(all, projectId, referenced), referenced });
    } catch (e) {
      setCleanupPrep({ status: "error", message: e instanceof Error ? e.message : "Couldn't prepare the cleanup." });
    }
  };

  const confirmCleanup = async () => {
    if (!cleanupProjectId || cleanupPrep?.status !== "ready" || cleanupBusy) return;
    const projectId = cleanupProjectId;
    const referenced = cleanupPrep.referenced;
    const title = projectTitleFor(projectId, titles);
    setCleanupBusy(true);
    try {
      const result = await clearProjectDerivedCache(
        { listAll: listAllAssets, deleteAsset, clearPreviews: clearAssetPreviews },
        projectId,
        referenced,
      );
      setAssets(result.remaining);
      setCleanupNotice(
        `Cleared processed copies for “${title}”: freed ${formatBytes(result.freedBytes)} on this device; ${formatBytes(result.afterBytes)} of processed data remains, including anything the timeline still uses. Your original media was not touched.`,
      );
    } finally {
      setCleanupBusy(false);
      setCleanupProjectId(null);
      setCleanupPrep(null);
    }
  };

  const download = (a: MediaAssetRecord) => {
    const url = URL.createObjectURL(a.blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = a.name;
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /**
   * Delete asks the same question the derived-cache cleanup asks: is this file still
   * referenced by its project's timeline? The generic warning used to be the only guard,
   * so one click could orphan a project's media. Referenced → blocked with the reason;
   * references uncheckable while the project exists → fail closed, like the cleanup.
   */
  const requestDelete = async (asset: MediaAssetRecord) => {
    setDeleteBlocked(null);
    if (!asset.projectId) {
      setDeleteTarget(asset);
      return;
    }
    setDeleteCheckingId(asset.id);
    try {
      let referenced: Set<string>;
      try {
        const data = await studioService.getStudio(asset.projectId);
        const resolved = readCompositionSettings({
          settingsComposition: data.project.settings_json?.composition ?? null,
          compositionJson: data.project.composition_json,
        });
        referenced = collectReferencedAssetIds({
          composition: resolved.settings,
          overlays: data.project.settings_json?.overlays ?? [],
        });
      } catch {
        if (projectsData && !titles.has(asset.projectId)) {
          referenced = new Set();
        } else {
          throw new Error("check-failed");
        }
      }
      if (referenced.has(asset.id)) {
        setDeleteBlocked(
          `“${asset.name}” is used in ${projectTitleFor(asset.projectId, titles)}'s timeline, so it can't be deleted here. Remove it from the project first.`,
        );
        return;
      }
      setDeleteTarget(asset);
    } catch {
      setDeleteBlocked("Couldn't check whether that file is still used by its project, so it wasn't deleted. Check your connection and try again.");
    } finally {
      setDeleteCheckingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await deleteAsset(target.id);
    setAssets((cur) => (cur ?? []).filter((a) => a.id !== target.id));
  };

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Media <em className="italic text-sand-600">Library</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">
            Every video, audio and image file imported into your projects&apos; media bins, in one place.
          </p>
          <details className="mt-3 max-w-[68ch] rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
            <summary className="cursor-pointer font-semibold">Where these files live</summary>
            <p className="mt-1.5">
              These files live in this browser on this device only — nothing here is uploaded.
              This library is empty on other devices, and clearing this browser&apos;s site data
              removes the files.
            </p>
          </details>
          {deleteBlocked ? (
            <p role="alert" className="mt-4 rounded-lg border border-orange-accent/50 bg-orange-accent/10 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
              {deleteBlocked}
            </p>
          ) : null}
        </div>

        {/* Stock audio used to live here too; it moved out (owner order 2026-11-11):
            the Library is footage/media only — sound effects live in the editor's
            Sound Effects panel, which is where they are added to a project. */}

        {assets === null ? (
          <p role="status" className="pt-8 text-[14px] text-sand-700">Loading the media on this device…</p>
        ) : all.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-16 text-center">
            <p className="font-serif text-2xl font-semibold text-ink">No media on this device <em className="italic text-sand-600">yet.</em></p>
            <p className="mx-auto mt-3 max-w-[52ch] text-[14px] leading-relaxed text-sand-800">
              Media gets here when you import it inside a project: open a project, go to its Media
              panel, and choose &ldquo;Import media&rdquo;. Files you import appear here as well as in
              that project&apos;s bin.
            </p>
            <Link href="/dashboard" className="mt-7 inline-block rounded-full bg-ink px-7 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 transition-all">
              Go to your projects
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 pt-8">
              <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-sand-300 bg-white px-3 py-2.5 sm:max-w-xs">
                <svg className="h-4 w-4 shrink-0 text-sand-500" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M20 20l-3.5-3.5" /></svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by file name, type or project" aria-label="Search media by file name, type or project" className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-sand-500" />
              </label>
              <div className="flex rounded-full border border-sand-300 p-1" role="tablist" aria-label="Media type filters">
                {LIBRARY_FILTERS.map((f) => (
                  <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-3.5 py-1.5 font-sora text-[12px] font-semibold transition-colors cursor-pointer ${filter === f.id ? "bg-ink text-dune-white" : "text-sand-700 hover:text-ink"}`}>
                    {f.label} ({counts[f.id]})
                  </button>
                ))}
              </div>
              <p className="ml-auto text-[12px] tabular-nums text-sand-600">{all.length} file{all.length === 1 ? "" : "s"} · {formatBytes(totalSize)} on this device</p>
            </div>

            {derived.totalBytes > 0 && (
              <section aria-label="Processed copies" className="mt-6 rounded-xl border border-sand-200 bg-sand-50 px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-sora text-[14px] font-bold text-ink">Processed copies on this device</h2>
                  <p className="text-[12px] tabular-nums text-sand-600">{formatBytes(derived.totalBytes)} across all projects</p>
                </div>
                <p className="mt-1.5 max-w-[72ch] text-[12px] leading-relaxed text-sand-700">
                  Copies the editor made from your media on this device — reversed or
                  noise-cleaned versions, freeze-frame stills, thumbnails. Clearing them never
                  touches your originals, and a copy a timeline still uses is kept and named
                  first.
                </p>
                {cleanupNotice && <p role="status" className="mt-2 text-[12px] font-semibold text-sand-800">{cleanupNotice}</p>}
                <ul className="mt-3 divide-y divide-sand-200">
                  {derived.projects.map((p) => (
                    <li key={p.projectId} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-sand-800">
                          <Link href={`/projects/${p.projectId}`} className="font-semibold text-ink underline decoration-sand-300 underline-offset-2 hover:text-sand-800">
                            {projectTitleFor(p.projectId, titles)}
                          </Link>
                          {" · "}{formatBytes(p.totalBytes)}
                        </p>
                        <p className="mt-0.5 text-[12px] text-sand-600">
                          {(Object.keys(DERIVED_KIND_LABELS) as DerivedKind[])
                            .filter((k) => p.byKind[k] > 0)
                            .map((k) => `${DERIVED_KIND_LABELS[k]} ${formatBytes(p.byKind[k])}`)
                            .join(" · ")}
                        </p>
                      </div>
                      <button onClick={() => void prepareCleanup(p.projectId)} className="rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">
                        Clear derived cache
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {visible.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center">
                <p className="font-sora text-[14px] font-semibold text-ink">
                  {query ? `No files match “${query}” in this filter.` : "No files of this type on this device."}
                </p>
                <button onClick={() => { setQuery(""); setFilter("all"); }} className="mt-4 rounded-full border border-sand-300 px-5 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Clear search and filters</button>
              </div>
            ) : (
              <ul className="mt-6 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
                {visible.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <AssetTile asset={a} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sora text-[14px] font-bold text-ink" title={a.name}>{a.name}</p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-sand-600">
                        <span className="font-semibold uppercase tracking-wide">{a.kind}</span>
                        {" · "}{formatBytes(a.size)}
                        {a.kind !== "image" ? <>{" · "}{formatDurationMs(a.durationMs)}</> : null}
                        {a.width || a.height ? <>{" · "}{formatDimensions(a.width, a.height)}</> : null}
                        {classifyDerivedAsset(a) ? <>{" · "}<span className="font-semibold">Derived: {DERIVED_SINGULAR[classifyDerivedAsset(a)!]}</span></> : null}
                      </p>
                      {a.licence ? (
                        <p className="mt-0.5 text-[12px] text-sand-600">
                          <span className="font-semibold">Licence:</span> {describeAssetLicence(a.licence)} — “{a.licence.title}”
                          {a.licence.author ? <> by {a.licence.author}</> : null}
                          {" · retrieved "}{a.licence.retrievedAt}
                          {a.licence.contentIdRegistered === true ? <>{" · "}<span className="font-semibold text-obsidian">Content-ID registered</span></> : null}
                          {" · "}
                          <a href={a.licence.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink">source</a>
                        </p>
                      ) : null}
                      <p className="mt-0.5 truncate text-[12px] text-sand-600">
                        Project:{" "}
                        <Link href={`/projects/${a.projectId}`} className="font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink">
                          {projectTitleFor(a.projectId, titles)}
                        </Link>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/projects/${a.projectId}`} className="rounded-full bg-ink px-4 py-2 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 transition-all">Open in project</Link>
                      <button onClick={() => download(a)} className="rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Download</button>
                      <button onClick={() => void requestDelete(a)} disabled={deleteCheckingId === a.id} className="rounded-full border border-orange-accent/60 px-4 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/10 transition-colors cursor-pointer disabled:opacity-60">{deleteCheckingId === a.id ? "Checking…" : "Delete from device"}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[12px] leading-relaxed text-sand-600">
              To place an image as an overlay or use a video as a project&apos;s source, open its project —
              those actions run in the project&apos;s Media panel, where the edit is saved.
            </p>
          </>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sand-deep sm:p-8" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Delete media file">
            <h3 className="font-serif text-2xl font-semibold text-ink">Delete from this device?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-sand-800">
              <strong className="text-ink">&ldquo;{deleteTarget.name}&rdquo;</strong> will be removed from this
              browser&apos;s media bin for its project. It is not stored anywhere else, so this can&apos;t be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Keep it</button>
              <button onClick={() => void confirmDelete()} className="rounded-full bg-orange-accent px-6 py-2.5 font-sora text-[12px] font-semibold text-[#141412] hover:bg-orange-accent/85 transition-all cursor-pointer">Delete file</button>
            </div>
          </div>
        </div>
      )}
      {cleanupProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => { if (!cleanupBusy) { setCleanupProjectId(null); setCleanupPrep(null); } }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sand-deep sm:p-8" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Clear derived cache">
            <h3 className="font-serif text-2xl font-semibold text-ink">Clear derived cache?</h3>
            <p className="mt-1 text-[13px] font-semibold text-sand-700">Project: {projectTitleFor(cleanupProjectId, titles)}</p>
            {cleanupPrep?.status === "loading" && (
              <p role="status" className="mt-3 text-[14px] text-sand-800">Checking what this project&apos;s timeline still uses…</p>
            )}
            {cleanupPrep?.status === "error" && (
              <p className="mt-3 text-[14px] leading-relaxed text-sand-800">{cleanupPrep.message}</p>
            )}
            {cleanupPrep?.status === "ready" && (
              <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-sand-800">
                <p>
                  This removes derived previews and processed copies — <strong className="text-ink">your original
                  media stays</strong>, on this device only.
                </p>
                {cleanupPrep.plan.deleteAssets.length > 0 ? (
                  <div>
                    <p className="font-semibold text-ink">Will be deleted ({formatBytes(cleanupPrep.plan.deleteAssets.reduce((n, d) => n + d.bytes, 0))}):</p>
                    <ul className="mt-1 list-disc pl-5">
                      {cleanupPrep.plan.deleteAssets.map((d) => (
                        <li key={d.id}>{d.name} — {DERIVED_SINGULAR[d.kind]}, {formatBytes(d.bytes)}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>No unreferenced processed copies to delete.</p>
                )}
                {cleanupPrep.plan.stripPreviewAssetIds.length > 0 && (
                  <p>
                    Thumbnail / waveform previews will also be removed from {cleanupPrep.plan.stripPreviewAssetIds.length}{" "}
                    file{cleanupPrep.plan.stripPreviewAssetIds.length === 1 ? "" : "s"} ({formatBytes(cleanupPrep.plan.stripPreviewBytes)}) —
                    those files stay; their tiles will show a plain placeholder afterwards.
                  </p>
                )}
                {cleanupPrep.plan.keptReferenced.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink">Kept — this project&apos;s timeline still uses {cleanupPrep.plan.keptReferenced.length === 1 ? "it" : "them"}:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {cleanupPrep.plan.keptReferenced.map((d) => (
                        <li key={d.id}>{d.name} — {DERIVED_SINGULAR[d.kind]}, {formatBytes(d.bytes)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[13px] text-sand-600">Expected to free {formatBytes(cleanupPrep.plan.expectedFreedBytes)}; the result is measured again after clearing.</p>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setCleanupProjectId(null); setCleanupPrep(null); }} disabled={cleanupBusy} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer disabled:opacity-50">Cancel</button>
              {cleanupPrep?.status === "ready" && (
                <button onClick={() => void confirmCleanup()} disabled={cleanupBusy || cleanupPrep.plan.expectedFreedBytes === 0} className="rounded-full bg-orange-accent px-6 py-2.5 font-sora text-[12px] font-semibold text-[#141412] hover:bg-orange-accent/85 transition-all cursor-pointer disabled:opacity-50">
                  {cleanupBusy ? "Clearing…" : "Clear derived cache"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </StudioShell>
  );
}

/** Library tile: the image itself, a captured video frame, or a mini waveform for audio — same sources as the Media panel rows. */
const AssetTile: React.FC<{ asset: MediaAssetRecord }> = ({ asset }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = asset.kind === "image" ? asset.blob : asset.thumb;
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [asset]);
  if (asset.kind === "audio") return <AudioTile peaks={asset.peaks} />;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-12 w-[72px] shrink-0 rounded-md bg-[#0B0B0A] object-cover" draggable={false} />;
  }
  return (
    <div className="grid h-12 w-[72px] shrink-0 place-items-center rounded-md bg-[#0B0B0A] text-[10px] font-semibold uppercase tracking-wide text-sand-500">
      {asset.kind}
    </div>
  );
};

const AudioTile: React.FC<{ peaks: number[] | null }> = ({ peaks }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.length) return;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "#34D399";
    const per = c.width / peaks.length;
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * (c.height - 4));
      g.fillRect(i * per, (c.height - h) / 2, Math.max(1, per - 0.5), h);
    });
  }, [peaks]);
  if (!peaks?.length) {
    return <div className="grid h-12 w-[72px] shrink-0 place-items-center rounded-md bg-[#0B0B0A] text-[10px] font-semibold uppercase tracking-wide text-sand-500">Audio</div>;
  }
  return <canvas ref={ref} width={72} height={48} className="h-12 w-[72px] shrink-0 rounded-md bg-[#0B0B0A]" aria-hidden />;
};
