"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { exportsService } from "@/services/exports";
import StudioShell from "@/components/studio/StudioShell";
import { distinctExportKinds, exportDownloadState, exportStatusLabel, filterExports, type GlobalExport } from "@/lib/workspace/exports";

const STATUS_FILTERS = ["ready", "expired", "queued", "rendering", "failed", "cancelled"] as const;

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ExportRowView({ exp }: { exp: GlobalExport }) {
  const [busy, setBusy] = useState(false);
  // Honest re-download: rows store no signed URL — the server mints a fresh
  // 600s link per click while the export is ready and inside its retention
  // window. Past expiry there is nothing to fetch, so no button is shown.
  const downloadState = exportDownloadState(exp);
  const label = exportStatusLabel(exp);

  const download = async () => {
    setBusy(true);
    try {
      const url = await exportsService.downloadUrl(exp.id);
      window.open(url, "_blank", "noopener");
    } catch (err: any) {
      window.alert(err?.message || "Couldn't get the download link. The export may have expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-sora text-[14px] font-bold text-ink">{exp.project_title ?? "Untitled project"}</p>
        <p className="mt-0.5 text-[12px] text-sand-600">
          {(exp.kind ?? "file").toUpperCase()}{exp.resolution ? ` · ${exp.resolution}` : ""} · {fmtSize(exp.file_size)} · {new Date(exp.created_at).toLocaleString()}
        </p>
      </div>
      <span className={`rounded-full px-3 py-1 font-sora text-[11px] font-semibold ${label === "ready" ? "bg-ink text-dune-white" : label === "expired" || label === "failed" ? "border border-orange-accent/60 text-obsidian bg-orange-accent/10" : "bg-sand-200 text-sand-800"}`}>{label}</span>
      <Link href={`/projects/${exp.project_id}`} className="rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors">Open project</Link>
      {downloadState === "downloadable" ? (
        <button onClick={() => void download()} disabled={busy} className="rounded-full bg-ink px-4 py-2 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer">{busy ? "Preparing…" : "Download"}</button>
      ) : downloadState === "expired" ? (
        <span className="text-[12px] text-sand-600">
          Download link expired{exp.expires_at ? ` on ${new Date(exp.expires_at).toLocaleDateString()}` : ""} — the file is gone. To get it again, open the project and export it again.
        </span>
      ) : (
        <span className="text-[12px] text-sand-600">{label === "failed" || label === "cancelled" ? "This export did not finish — export again from the project." : "Not ready yet."}</span>
      )}
    </li>
  );
}

/** Exports history: every export the signed-in user has made, across all projects, newest first. */
export default function ExportsPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const { data: exports = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["exports"],
    queryFn: () => exportsService.listExports(),
    enabled: signedIn,
  });

  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const kinds = distinctExportKinds(exports);
  const visible = filterExports(exports, { kind: kindFilter || null, status: statusFilter || null, from: fromFilter || null, to: toFilter || null });
  const filtersActive = !!(kindFilter || statusFilter || fromFilter || toFilter);

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Exports <em className="italic text-sand-600">history</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">Every export across all your projects, newest first. Downloads stay available until each export&apos;s retention window ends.</p>
        </div>

        <div className="pt-8">
          {isLoading ? (
            <div className="h-40 rounded-xl bg-sand-100 animate-pulse" />
          ) : isError ? (
            <div className="rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
              <p className="font-sora text-[14px] font-semibold text-obsidian">Couldn&apos;t load your exports.</p>
              <button onClick={() => refetch()} className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer">Retry</button>
            </div>
          ) : exports.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-16 text-center">
              <p className="font-serif text-2xl font-semibold text-ink">No exports <em className="italic text-sand-600">yet.</em></p>
              <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-relaxed text-sand-800">Open a project, style its captions, and export — the file will show up here.</p>
              <Link href="/captions" className="mt-7 inline-block rounded-full bg-ink px-7 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 transition-all">Go to your projects</Link>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[13px] text-sand-700">
                  Kind
                  <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Filter by kind" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-[13px] text-ink outline-none cursor-pointer">
                    <option value="">All kinds</option>
                    {kinds.map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[13px] text-sand-700">
                  Status
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-[13px] text-ink outline-none cursor-pointer">
                    <option value="">Any status</option>
                    {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[13px] text-sand-700">
                  From
                  <input type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} aria-label="Filter from date" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-[13px] text-ink outline-none" />
                </label>
                <label className="flex items-center gap-2 text-[13px] text-sand-700">
                  To
                  <input type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)} aria-label="Filter to date" className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-[13px] text-ink outline-none" />
                </label>
                {filtersActive ? (
                  <button onClick={() => { setKindFilter(""); setStatusFilter(""); setFromFilter(""); setToFilter(""); }} className="rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Clear filters</button>
                ) : null}
                <span className="text-[12px] text-sand-600" role="status">{visible.length} of {exports.length} exports</span>
              </div>
              {visible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center">
                  <p className="font-sora text-[14px] font-semibold text-ink">No exports match these filters.</p>
                  <button onClick={() => { setKindFilter(""); setStatusFilter(""); setFromFilter(""); setToFilter(""); }} className="mt-4 rounded-full border border-sand-300 px-5 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Clear filters</button>
                </div>
              ) : (
                <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
                  {visible.map((exp) => <ExportRowView key={exp.id} exp={exp} />)}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
