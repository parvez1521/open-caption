"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  MotionConfigSchema,
  defaultMotionConfig,
  getMotionTemplate,
  type MotionConfig,
  type MotionTemplate,
} from "@capseasy/motion";
import StudioShell from "@/components/studio/StudioShell";
import { ColorField } from "@/features/studio/controls";
import { useMediaAssets } from "@/features/studio/useMediaAssets";
import { validateImageFile } from "@/features/studio/mediaAssets";
import { deleteAsset, listProjectAssets, type MediaAssetRecord } from "@/features/studio/mediaStore";
import { MotionPreview } from "@/features/motion/MotionPreview";
import { MotionExportSection } from "@/features/motion/MotionExportSection";
import { MOTION_STAGING_PROJECT_ID, addMotionToProject, buildMotionOverlayItem } from "@/features/motion/addToProject";
import { MotionTemplateFields } from "@/features/motion/MotionTemplateFields";
import { deleteMotionPreset, listMotionPresets, saveMotionPreset, type MotionPreset } from "@/features/motion/presets";
import { motionCategoryLabel } from "@/features/motion/categoryLabel";
import { projectsService } from "@/services/projects";

/**
 * Motion Studio customize: one registry template, configured live. The control set is GENERATED
 * from the registry entry's fields[] (text / colour / image) plus the duration bounds the shared
 * MotionConfigSchema enforces; the big stage plays the real graphic (controlled clock — play,
 * pause, restart, scrub) over a selectable PREVIEW background (preview-only in this wave; the
 * choice is never saved with the graphic). "Add to project" inserts the configured overlay into
 * a real project's settings via addMotionToProject and opens that project in the Studio.
 */

const DURATION_MIN = 400;
const DURATION_MAX = 30000;

type BackdropId = "checker" | "dark" | "light" | "brand";
const BACKDROPS: { id: BackdropId; label: string; style: React.CSSProperties }[] = [
  {
    id: "checker",
    label: "Transparent",
    style: {
      backgroundColor: "#1C1C1A",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%232A2A27'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%232A2A27'/%3E%3C/svg%3E")`,
      backgroundSize: "16px 16px",
    },
  },
  { id: "dark", label: "Dark", style: { backgroundColor: "#141412" } },
  { id: "light", label: "Light", style: { backgroundColor: "#F2F0E4" } },
  { id: "brand", label: "Brand green", style: { backgroundColor: "#0F3D2E" } },
];

const clampDuration = (ms: number) => Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(ms) || DURATION_MIN));

export default function MotionCustomizeRoute() {
  const params = useParams();
  const template = getMotionTemplate(typeof params.templateId === "string" ? params.templateId : "");
  if (!template) {
    return (
      <StudioShell>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-10">
          <p className="font-serif text-2xl font-semibold text-ink">That template does not exist.</p>
          <p className="mt-2 text-[14px] text-sand-800">It may have been renamed. Browse the full set in Motion Studio.</p>
          <Link href="/motion" className="mt-5 inline-block rounded-full bg-ink px-5 py-2.5 font-sora text-[13px] font-semibold text-[#141412] transition hover:opacity-85">
            Back to Motion Studio
          </Link>
        </div>
      </StudioShell>
    );
  }
  return <Customize template={template} />;
}

const Customize: React.FC<{ template: MotionTemplate }> = ({ template }) => {
  const router = useRouter();
  const defaults = useMemo(() => defaultMotionConfig(template.id), [template.id]);
  const [text, setText] = useState(defaults.text);
  const [color, setColor] = useState(defaults.color);
  const [durationMs, setDurationMs] = useState(defaults.durationMs);
  const [backdrop, setBackdrop] = useState<BackdropId>("dark");
  const [playing, setPlaying] = useState(true);
  const [clockMs, setClockMs] = useState(0);

  // image field: uploads are staged in the device media bin under the Motion Studio staging
  // project; "Add to project" copies the record into the target project's bin (addToProject.ts)
  const staging = useMediaAssets(MOTION_STAGING_PROJECT_ID);
  const [asset, setAsset] = useState<MediaAssetRecord | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const assetSrc = useMemo(() => (asset ? URL.createObjectURL(asset.blob) : undefined), [asset]);
  useEffect(() => () => { if (assetSrc) URL.revokeObjectURL(assetSrc); }, [assetSrc]);

  const config: MotionConfig = useMemo(
    () => ({ variant: template.id, text, color, durationMs }),
    [template.id, text, color, durationMs],
  );
  const configValid = MotionConfigSchema.safeParse(config).success;
  const previewItem = useMemo(() => buildMotionOverlayItem(config, 0, asset ? { id: asset.id, name: asset.name } : null), [config, asset]);

  // the controlled preview clock: advances in real time while playing, loops over the duration
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      lastTick.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (lastTick.current != null) {
        const delta = now - lastTick.current;
        setClockMs((c) => (c + delta) % Math.max(1, durationMs));
      }
      lastTick.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationMs]);

  // ---- presets (device-local; text / colour / duration only — see presets.ts) ----
  const [presets, setPresets] = useState<MotionPreset[]>(() => listMotionPresets(template.id));
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const refreshPresets = useCallback(() => setPresets(listMotionPresets(template.id)), [template.id]);
  const onSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const ok = saveMotionPreset(template.id, { name, text, color, durationMs });
    setPresetNote(ok ? `Saved “${name}”.` : "Could not save the preset. Check the colour and duration are valid. Or this browser's storage is unavailable or full.");
    if (ok) {
      setPresetName("");
      setSavingPreset(false);
      refreshPresets();
    }
  };
  const onApplyPreset = (p: MotionPreset) => {
    setText(p.text);
    setColor(p.color);
    setDurationMs(clampDuration(p.durationMs));
    setClockMs(0);
    setPresetNote(`Applied “${p.name}”.`);
  };
  const onDeletePreset = (p: MotionPreset) => {
    deleteMotionPreset(template.id, p.name);
    refreshPresets();
    setPresetNote(`Deleted “${p.name}”.`);
  };

  // ---- add to project ----
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsService.getProjectsPage({ includeArchived: false, limit: 100 }),
  });
  const projects = projectsQuery.data?.projects ?? [];
  const [projectId, setProjectId] = useState<string>("");
  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0]!.id);
  }, [projects, projectId]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const insertInto = async (targetId: string) => {
    setAdding(true);
    setAddError(null);
    try {
      await addMotionToProject(targetId, { config, assetId: asset?.id ?? null });
      router.push(`/projects/${targetId}`);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Couldn't add the graphic to that project. Try again.");
      setAdding(false);
    }
  };
  const onNewProject = async () => {
    setAdding(true);
    setAddError(null);
    try {
      const used = projects.map((p) => /^Untitled (\d+)$/i.exec(p.title.trim())?.[1]).filter(Boolean).map(Number);
      const project = await projectsService.createProject(`Untitled ${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`);
      await addMotionToProject(project.id, { config, assetId: asset?.id ?? null });
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Couldn't create a project. Try again.");
      setAdding(false);
    }
  };

  const onUploadImage = async (file: File) => {
    setAssetError(null);
    // Image field: the generic media-bin importer also accepts video/audio, so
    // enforce image-only HERE (type + size, decode is enforced by the probe)
    // instead of trusting the file input's accept attribute alone.
    const v = validateImageFile(file);
    if (!v.ok) {
      setAssetError(v.error);
      return;
    }
    const before = new Set((await listProjectAssets(MOTION_STAGING_PROJECT_ID)).map((a) => a.id));
    const errors = await staging.importFiles([file]);
    if (errors.length) {
      setAssetError(errors.map((e) => e.error).join(" "));
      return;
    }
    const fresh = (await listProjectAssets(MOTION_STAGING_PROJECT_ID)).filter((a) => !before.has(a.id) && a.kind === "image");
    const rec = fresh[fresh.length - 1];
    if (rec) {
      if (asset) void deleteAsset(asset.id);
      setAsset(rec);
    }
  };
  const onRemoveImage = () => {
    if (asset) void deleteAsset(asset.id);
    setAsset(null);
  };

  const backdropStyle = BACKDROPS.find((b) => b.id === backdrop)!.style;

  return (
    <StudioShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-10 sm:py-10">
        <Link href="/motion" className="text-[13px] font-semibold text-sand-600 transition hover:text-ink">← Motion Studio</Link>
        <div className="mt-3 flex flex-wrap items-baseline gap-3 border-b border-sand-200 pb-6">
          <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl">{template.title}</h1>
          <span className="rounded-full border border-sand-200 px-2.5 py-0.5 text-[11px] font-semibold text-sand-600">{motionCategoryLabel(template.category)}</span>
        </div>
        <p className="mt-3 max-w-2xl text-[14px] text-sand-800">{template.description}</p>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* stage (primary) */}
          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-xl border border-sand-200" style={backdropStyle}>
              <MotionPreview item={previewItem} assetSrc={assetSrc} timeMs={clockMs} transparent />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} className="rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-sand-300">
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={() => { setClockMs(0); lastTick.current = null; }}
                className="rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-sand-300"
              >
                Restart
              </button>
              <input
                type="range"
                min={0}
                max={durationMs}
                step={10}
                value={Math.floor(clockMs)}
                onChange={(e) => { setClockMs(Number(e.target.value)); lastTick.current = null; }}
                aria-label="Scrub preview"
                className="min-w-32 flex-1 accent-[#34D399]"
              />
              <span className="text-[12px] tabular-nums text-sand-600">{(clockMs / 1000).toFixed(1)}s / {(durationMs / 1000).toFixed(1)}s</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-sand-700" id="backdrop-label">Preview background</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="backdrop-label">
                {BACKDROPS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBackdrop(b.id)}
                    aria-pressed={backdrop === b.id}
                    className={`relative rounded-full border px-3 py-1.5 text-[12px] font-semibold transition before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-[''] ${backdrop === b.id ? "border-ink bg-ink text-[#141412]" : "border-sand-200 bg-sand-50 text-sand-800 hover:border-sand-300"}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <span className="text-[12px] text-sand-600">Preview only — the background is not saved with the graphic.</span>
            </div>
          </div>

          {/* controls (secondary, right column) */}
          <div className="space-y-8 lg:col-span-5">
            <section aria-label="Customise" className="space-y-4">
              {/* The form is the SHARED MotionTemplateFields — the Studio inspector's
                  "Edit template" block renders the same component (P4, 2026-11-11). */}
              <MotionTemplateFields
                template={template}
                text={text}
                color={color}
                onTextChange={setText}
                onColorChange={setColor}
                image={{
                  assetName: asset?.name ?? null,
                  onSelect: (next) => { if (next === null) onRemoveImage(); },
                  onUpload: (f) => void onUploadImage(f),
                  busy: staging.importing,
                  error: assetError,
                }}
                durationMs={durationMs}
                onDurationChange={setDurationMs}
                tone="page"
              />
              {!configValid ? <p role="alert" className="text-[12px] text-orange-accent">Check the colour (it needs a #rrggbb hex value) — the graphic can&apos;t be added until it is valid.</p> : null}
            </section>

            <section aria-label="Presets" className="border-t border-sand-200 pt-6">
              <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Presets</h2>
              <p className="mt-1.5 text-[12px] text-sand-600">Saved on this device. A preset keeps the text, colour and duration. Not the image.</p>
              {presets.length ? (
                <ul className="mt-3 space-y-1.5">
                  {presets.map((p) => (
                    <li key={p.name} className="flex items-center gap-2 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{p.name}</span>
                      <button type="button" onClick={() => onApplyPreset(p)} className="shrink-0 rounded-full border border-sand-200 px-3 py-1 text-[12px] font-semibold text-ink transition hover:border-sand-300">Apply</button>
                      <button type="button" onClick={() => onDeletePreset(p)} className="shrink-0 rounded-full border border-sand-200 px-3 py-1 text-[12px] font-semibold text-orange-accent transition hover:border-sand-300">Delete</button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {savingPreset ? (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Preset name"
                    aria-label="Preset name"
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-sand-500 focus:border-sand-400"
                  />
                  <button type="button" onClick={onSavePreset} disabled={!presetName.trim()} className="shrink-0 rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-[#141412] transition hover:opacity-85 disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setSavingPreset(false)} className="shrink-0 rounded-full border border-sand-200 px-3 py-2 text-[12px] font-semibold text-ink">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setSavingPreset(true); setPresetNote(null); }} className="mt-3 rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-sand-300">
                  Save preset
                </button>
              )}
              {presetNote ? <p role="status" className="mt-2 text-[12px] text-sand-600">{presetNote}</p> : null}
            </section>

            <section aria-label="Add to project" className="border-t border-sand-200 pt-6">
              <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Add to project</h2>
              <p className="mt-1.5 text-[12px] text-sand-600">The graphic is placed in the project&apos;s overlays — at the start, or right after its last overlay — and the project opens in the Studio.</p>
              {projectsQuery.isLoading ? (
                <p className="mt-3 text-[13px] text-sand-600">Loading your projects…</p>
              ) : projectsQuery.isError ? (
                <p role="alert" className="mt-3 text-[13px] text-orange-accent">Couldn&apos;t load your projects. <button type="button" onClick={() => void projectsQuery.refetch()} className="font-semibold underline underline-offset-2">Retry</button></p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {projects.length ? (
                    <>
                      <label className="block text-[13px] font-medium text-sand-800">
                        <span className="mb-1.5 block">Project</span>
                        <select
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          aria-label="Choose a project"
                          className="w-full rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-[14px] text-ink outline-none focus:border-sand-400"
                        >
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" onClick={() => projectId && void insertInto(projectId)} disabled={adding || !configValid || !projectId} className="w-full rounded-full bg-ink px-5 py-2.5 font-sora text-[13px] font-semibold text-[#141412] transition hover:opacity-85 disabled:opacity-50 cursor-pointer">
                        {adding ? "Adding…" : "Add to this project"}
                      </button>
                    </>
                  ) : (
                    <p className="text-[13px] text-sand-700">No projects yet. Create one and the graphic goes straight into it.</p>
                  )}
                  <button type="button" onClick={() => void onNewProject()} disabled={adding || !configValid} className="w-full rounded-full border border-sand-200 bg-sand-50 px-5 py-2.5 font-sora text-[13px] font-semibold text-ink transition hover:border-sand-300 disabled:opacity-50 cursor-pointer">
                    New project
                  </button>
                </div>
              )}
              {addError ? <p role="alert" className="mt-2 text-[12px] text-orange-accent">{addError}</p> : null}
            </section>

            {/* Wave 3: standalone overlay export (solid background, in-browser, no project created). */}
            <MotionExportSection config={config} asset={asset ? { id: asset.id, name: asset.name } : null} assetSrc={assetSrc} />
          </div>
        </div>
      </div>
    </StudioShell>
  );
};
