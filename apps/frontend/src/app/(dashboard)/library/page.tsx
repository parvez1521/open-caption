"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import StudioShell from "@/components/studio/StudioShell";
import { formatBytes } from "@/features/studio/mediaAssets";
import { deleteAsset, listAllAssets, type MediaAssetRecord } from "@/features/studio/mediaStore";
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
  const visible = filterLibraryAssets(all, query, filter);
  const totalSize = all.reduce((n, a) => n + a.size, 0);

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
          <p className="mt-3 max-w-[68ch] rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
            These files live in this browser on this device only — they are not uploaded or stored on
            our servers. This library is empty on other devices and in other browsers, and clearing
            this browser&apos;s site data removes them.
          </p>
        </div>

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
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by file name" aria-label="Search media by file name" className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-sand-500" />
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
                      </p>
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
                      <button onClick={() => setDeleteTarget(a)} className="rounded-full border border-orange-accent/60 px-4 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/10 transition-colors cursor-pointer">Delete from device</button>
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
