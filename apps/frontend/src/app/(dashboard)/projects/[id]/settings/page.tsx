"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXPORT_RESOLUTION_LABEL,
  EXPORT_RESOLUTIONS,
  ProjectSettingsSchema,
  type ExportSettings,
  type Platform,
} from "@capseasy/shared";
import { projectsService } from "@/services/projects";
import { studioService } from "@/services/studio";
import StudioShell from "@/components/studio/StudioShell";
import { buildStageCWritePatch, STAGE_C_ENABLED } from "@/features/studio/stageC";

const PLATFORMS: Platform[] = ["tiktok", "reels", "shorts", "youtube", "linkedin", "podcast", "custom"];
const ASPECTS = ["9:16", "16:9", "1:1", "4:5"] as const;

const inputCls = "w-full rounded-lg border border-sand-300 bg-white px-4 py-3 text-[14px] text-ink placeholder:text-sand-500 outline-none transition-colors focus:border-sand-600 focus:ring-2 focus:ring-sand-200";
const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";

/**
 * Per-project settings: ONE place for the controls that already exist for a
 * single project, each wired to its real storage —
 *   · title / description / language / platform / aspect-ratio preset and
 *     the A15 folder + tags → the projects row, via the PATCH allow-list;
 *   · export defaults (resolution + fps) → settings_json.exportSettings,
 *     written the way the studio writes settings: the FULL parsed settings
 *     object (plus the Stage-C composition dual-write), never a partial
 *     blob that would clobber the rest;
 *   · archive / unarchive and permanent delete → the existing project APIs.
 * Deliberately NOT here (they don't exist as per-project controls today):
 * brand-kit assignment (brand kits are account-level; projects carry no
 * brand_kit_id), caption style editing (the studio owns style_json), and
 * the in-studio canvas aspect (settings.canvas, edited in the studio).
 */
export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id as string;

  const projectQuery = useQuery({ queryKey: ["project-settings", id], queryFn: () => projectsService.getProjectById(id) });
  const studioQuery = useQuery({ queryKey: ["studio", id], queryFn: () => studioService.getStudio(id) });
  const project = projectQuery.data;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("");
  const [platform, setPlatform] = useState("");
  const [aspect, setAspect] = useState("");
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState("");
  const [detailsReady, setDetailsReady] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [exportSettings, setExportSettings] = useState<ExportSettings>({ resolution: "1080p", fps: 30 });
  const [exportReady, setExportReady] = useState(false);
  const [savingExport, setSavingExport] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!project || detailsReady) return;
    setTitle(project.title);
    setDescription(project.description ?? "");
    setLanguage(project.language ?? "");
    setAspect(project.aspect_ratio ?? "");
    setFolder(project.folder ?? "");
    setTags((project.tags ?? []).join(", "));
    setDetailsReady(true);
  }, [project, detailsReady]);

  useEffect(() => {
    const p = studioQuery.data?.project;
    if (!p || exportReady) return;
    setPlatform(p.platform ?? "");
    setExportSettings(ProjectSettingsSchema.parse(p.settings_json ?? {}).exportSettings);
    setExportReady(true);
  }, [studioQuery.data, exportReady]);

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSavingDetails(true);
    setDetailsMsg(null);
    setDetailsError(null);
    try {
      await projectsService.updateProjectDetails(id, {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        language: language.trim() ? language.trim() : null,
        platform: platform ? platform : null,
        aspect_ratio: aspect ? (aspect as (typeof ASPECTS)[number]) : null,
        folder: folder.trim() ? folder.trim() : null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setDetailsMsg("Saved.");
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project-settings", id] });
    } catch (err: any) {
      setDetailsError(err?.message || "Couldn't save the project details. Please try again.");
    } finally {
      setSavingDetails(false);
    }
  };

  const saveExportDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    const studio = studioQuery.data;
    if (!studio) return;
    setSavingExport(true);
    setExportMsg(null);
    setExportError(null);
    try {
      // Full-settings write, exactly like the studio's persist path: parse
      // the stored blob through the schema, swap only exportSettings, and
      // dual-write the composition column while Stage C is enabled.
      const full = ProjectSettingsSchema.parse(studio.project.settings_json ?? {});
      const next = { ...full, exportSettings };
      await studioService.savePatch(id, {
        settings_json: next,
        ...(STAGE_C_ENABLED ? buildStageCWritePatch(next.composition) : {}),
      });
      setExportMsg("Export defaults saved — the studio's export box starts from these.");
      void qc.invalidateQueries({ queryKey: ["studio", id] });
    } catch (err: any) {
      setExportError(err?.message || "Couldn't save the export defaults. Please try again.");
    } finally {
      setSavingExport(false);
    }
  };

  const runArchiveToggle = async () => {
    if (!project) return;
    setBusyAction(project.archived_at ? "Restoring…" : "Archiving…");
    try {
      if (project.archived_at) await projectsService.unarchiveProject(id);
      else await projectsService.archiveProject(id);
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void projectQuery.refetch();
    } catch (err: any) {
      window.alert(err?.message || "That didn't work. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await projectsService.deleteProject(id);
      qc.removeQueries({ queryKey: ["studio", id] });
      router.push("/captions");
    } catch (err: any) {
      setDeleting(false);
      setDeleteOpen(false);
      window.alert(err?.message || "Couldn't delete the project. Please try again.");
    }
  };

  const loading = projectQuery.isLoading || studioQuery.isLoading;
  const loadError = projectQuery.isError || (projectQuery.isSuccess && !project);

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-3xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <Link href={`/projects/${id}`} className="font-sora text-[12px] font-semibold text-sand-700 hover:text-ink">← Back to the studio</Link>
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Project <em className="italic text-sand-600">settings</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">The controls for this one project, in one place — each one saves to the same place the rest of the app already reads.</p>
        </div>

        {loading ? (
          <div className="mt-8 h-40 rounded-xl bg-sand-100 animate-pulse" />
        ) : loadError || !project ? (
          <div className="mt-8 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
            <p className="font-sora text-[14px] font-semibold text-obsidian">Couldn&apos;t load this project.</p>
            <button onClick={() => { void projectQuery.refetch(); void studioQuery.refetch(); }} className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer">Retry</button>
          </div>
        ) : (
          <>
            {/* Details */}
            <section className="pt-8">
              <h2 className="font-sora text-[15px] font-bold text-ink">Details</h2>
              <form onSubmit={saveDetails} className="mt-4 rounded-xl border border-sand-200 bg-white p-6 space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="ps-title" className={labelCls}>Title</label>
                  <input id="ps-title" value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ps-description" className={labelCls}>Description</label>
                  <textarea id="ps-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="What this project is — only you see this." className={inputCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label htmlFor="ps-language" className={labelCls}>Transcription language</label>
                    <input id="ps-language" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Auto-detect (or en, hi, …)" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ps-platform" className={labelCls}>Platform preset</label>
                    <select id="ps-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls}>
                      <option value="">Not set</option>
                      {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ps-aspect" className={labelCls}>Aspect ratio preset</label>
                    <select id="ps-aspect" value={aspect} onChange={(e) => setAspect(e.target.value)} className={inputCls}>
                      <option value="">Not set</option>
                      {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ps-folder" className={labelCls}>Folder</label>
                    <input id="ps-folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="No folder" className={inputCls} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ps-tags" className={labelCls}>Tags (comma-separated)</label>
                  <input id="ps-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. hook, client-work" className={inputCls} />
                </div>
                {detailsError ? <p role="alert" className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">{detailsError}</p> : null}
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={savingDetails || !title.trim()} className="rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer">{savingDetails ? "Saving…" : "Save details"}</button>
                  {detailsMsg ? <span role="status" className="text-[13px] text-sand-700">{detailsMsg}</span> : null}
                </div>
              </form>
            </section>

            {/* Export defaults */}
            <section className="pt-10">
              <h2 className="font-sora text-[15px] font-bold text-ink">Export defaults</h2>
              <p className="mt-1 text-[13px] text-sand-700">Stored on this project — the studio&apos;s export box starts from these values.</p>
              <form onSubmit={saveExportDefaults} className="mt-4 rounded-xl border border-sand-200 bg-white p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label htmlFor="ps-resolution" className={labelCls}>Resolution</label>
                    <select id="ps-resolution" value={exportSettings.resolution} onChange={(e) => setExportSettings((s) => ({ ...s, resolution: e.target.value as ExportSettings["resolution"] }))} className={inputCls}>
                      {EXPORT_RESOLUTIONS.map((r) => <option key={r} value={r}>{EXPORT_RESOLUTION_LABEL[r]}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ps-fps" className={labelCls}>Frame rate</label>
                    <select id="ps-fps" value={exportSettings.fps} onChange={(e) => setExportSettings((s) => ({ ...s, fps: Number(e.target.value) as ExportSettings["fps"] }))} className={inputCls}>
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                    </select>
                  </div>
                </div>
                {exportError ? <p role="alert" className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">{exportError}</p> : null}
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={savingExport || !exportReady} className="rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer">{savingExport ? "Saving…" : "Save export defaults"}</button>
                  {exportMsg ? <span role="status" className="text-[13px] text-sand-700">{exportMsg}</span> : null}
                </div>
              </form>
            </section>

            {/* Archive + danger zone */}
            <section className="pt-10">
              <h2 className="font-sora text-[15px] font-bold text-ink">Archive &amp; delete</h2>
              <div className="mt-4 rounded-xl border border-sand-200 bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-sora text-[13px] font-semibold text-ink">{project.archived_at ? "This project is archived" : "Archive this project"}</p>
                    <p className="text-[13px] text-sand-700">Archived projects leave the active list but keep everything.</p>
                  </div>
                  <button onClick={() => void runArchiveToggle()} disabled={!!busyAction} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-60 transition-colors cursor-pointer">{busyAction ?? (project.archived_at ? "Unarchive" : "Archive")}</button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-5">
                  <div>
                    <p className="font-sora text-[13px] font-semibold text-ink">Delete this project</p>
                    <p className="text-[13px] text-sand-700">Uploads, transcript and exports are removed. This can&apos;t be undone.</p>
                  </div>
                  <button onClick={() => setDeleteOpen(true)} className="rounded-full bg-orange-accent px-5 py-2.5 font-sora text-[12px] font-semibold text-[#141412] hover:bg-orange-accent/85 transition-all cursor-pointer">Delete project</button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {deleteOpen && project ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] p-4" onClick={() => !deleting && setDeleteOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sand-deep animate-fade-in-up sm:p-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-2xl font-semibold text-ink">Delete this project?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-sand-800"><strong className="text-ink">&quot;{project.title}&quot;</strong> and its uploads, transcript, and exports will be removed. This can&apos;t be undone.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteOpen(false)} disabled={deleting} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Keep it</button>
              <button onClick={() => void handleDelete()} disabled={deleting} className="rounded-full bg-orange-accent px-6 py-2.5 font-sora text-[12px] font-semibold text-[#141412] hover:bg-orange-accent/85 disabled:opacity-60 transition-all cursor-pointer">{deleting ? "Deleting…" : "Delete project"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </StudioShell>
  );
}
