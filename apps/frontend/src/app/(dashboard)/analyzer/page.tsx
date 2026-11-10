"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import { studioService, type StudioData } from "@/services/studio";
import StudioShell from "@/components/studio/StudioShell";
import { ProjectCardsSkeleton } from "@/components/brand/Skeletons";
import { analyzeReel, type ReelBeat } from "@/features/analyzer/analyze";
import {
  buildAnalysisBody,
  fmtMs,
  readAnalysisBody,
  recordEdit,
  type AnalysisBody,
} from "@/features/analyzer/breakdownItem";
import { useDeviceVideo } from "@/features/upload/useDeviceVideo";
import { useSceneAnalysis } from "@/features/clipper/useSceneAnalysis";
import {
  createContentItem,
  deleteContentItem,
  fetchContentItems,
  updateContentItem,
  type ContentItem,
} from "@/features/create/library";

/**
 * Reel Analyzer (Phase 6, slice 6.1 UI): a measured breakdown of one reel —
 * hook, beats, call to action, pacing — from the two things this app can
 * actually measure on this device: the project's spoken transcript (its
 * captions) and the picture's scene cuts (the clipper's frame-difference
 * detection). No platform analytics are read, no figure is shown without
 * its method, and there is no overall score. The breakdown can be tidied
 * (edits are marked as edits), annotated, labelled as the user's own video
 * or a named competitor's, and saved to the content library as an
 * "analysis" item — which also feeds the hook library below and can be
 * attached as context in Creator Studio chat.
 */
export default function AnalyzerPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studio, setStudio] = useState<StudioData | null>(null);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  /** The breakdown being shown / edited; null until a project with captions is analysed or a saved analysis is loaded. */
  const [body, setBody] = useState<AnalysisBody | null>(null);
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null);
  const [competitorName, setCompetitorName] = useState("");

  const [savedItems, setSavedItems] = useState<ContentItem[] | null>(null);
  const [libraryReady, setLibraryReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [hookFilter, setHookFilter] = useState<"all" | "competitors">("all");

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsService.getProjectsPage({ includeArchived: false, limit: 100 }),
    enabled: signedIn,
  });
  const projects = data?.projects ?? [];

  // The saved analyses (content library, kind "analysis"). ready:false is the
  // honest pending-setup state: analysing still works, saving does not.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetchContentItems("analysis")
      .then((list) => {
        if (!live) return;
        setLibraryReady(list.ready);
        setSavedItems(list.items);
      })
      .catch(() => {
        if (!live) return;
        setLibraryReady(false);
        setSavedItems([]);
      });
    return () => { live = false; };
  }, [signedIn]);

  const startNew = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const used = projects.map((p) => /^Untitled (\d+)$/i.exec(p.title.trim())?.[1]).filter(Boolean).map(Number);
      const project = await projectsService.createProject(`Untitled ${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`);
      // captions are made in the studio (upload + on-device transcription); the user returns here and picks the project
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn't create a project. Try again.");
      setCreating(false);
    }
  };

  const selectProject = async (id: string) => {
    setSelectedId(id);
    setStudio(null);
    setBody(null);
    setLoadedItemId(null);
    setSavedNote(null);
    setSaveError(null);
    setStudioError(null);
    setStudioLoading(true);
    try {
      setStudio(await studioService.getStudio(id));
    } catch (e) {
      setStudioError(e instanceof Error ? e.message : "Couldn't load that project. Try again.");
    } finally {
      setStudioLoading(false);
    }
  };

  const doc = studio?.document?.doc ?? null;
  const visibleWords = useMemo(() => (doc?.words ?? []).filter((w) => !w.hidden), [doc]);
  const hasCaptions = visibleWords.length > 0;
  const lastWordEndMs = useMemo(
    () => visibleWords.reduce((max, w) => Math.max(max, w.endMs), 0),
    [visibleWords],
  );
  const durationMs = studio?.video?.durationMs ?? lastWordEndMs;

  const { video: deviceVideo, status: deviceStatus } = useDeviceVideo(studio?.video ?? null);
  const scene = useSceneAnalysis(deviceVideo?.id, deviceVideo?.url, durationMs);
  const cutsKey = scene.cuts.map((c) => c.atMs).join(",");

  // Measure (and re-measure when the scene cuts land). A saved analysis the
  // user loaded is never overwritten, and neither is a breakdown the user
  // has already edited — a late cuts re-run must not clobber their edits.
  useEffect(() => {
    if (!studio || !hasCaptions || loadedItemId) return;
    const projectId = studio.project.id;
    const breakdown = analyzeReel({
      words: visibleWords,
      durationMs,
      sceneCutsMs: scene.state === "ready" ? scene.cuts.map((c) => c.atMs) : [],
    });
    setBody((prev) => {
      if (prev && prev.sourceProjectId === projectId && prev.editedFields.length > 0) return prev;
      return buildAnalysisBody({
        subject: prev && prev.sourceProjectId === projectId ? prev.subject : { type: "own" },
        sourceProjectId: projectId,
        videoTitle: studio.project.title,
        durationMs,
        breakdown,
        notes: prev && prev.sourceProjectId === projectId ? prev.notes : "",
      });
    });
    // cutsKey stands in for scene.cuts (a fresh array identity per render is not a change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio, hasCaptions, loadedItemId, visibleWords, durationMs, scene.state, cutsKey]);

  const parsedSaved = useMemo(
    () =>
      (savedItems ?? [])
        .map((item) => ({ item, body: readAnalysisBody(item.body) }))
        .filter((x): x is { item: ContentItem; body: AnalysisBody } => x.body !== null),
    [savedItems],
  );
  const hookRows = parsedSaved.filter(
    (x) => hookFilter === "all" || x.body.subject.type === "competitor",
  );

  /* ------------------------------ editing ------------------------------ */

  const editHookText = (text: string) =>
    setBody((prev) =>
      prev
        ? recordEdit(
            { ...prev, breakdown: { ...prev.breakdown, hook: { ...prev.breakdown.hook, text } } },
            "hook.text",
          )
        : prev,
    );

  const editBeat = (index: number, patch: Partial<Pick<ReelBeat, "label" | "text">>, field: string) =>
    setBody((prev) => {
      if (!prev) return prev;
      const beats = prev.breakdown.beats.map((b, i) => (i === index ? { ...b, ...patch } : b));
      return recordEdit({ ...prev, breakdown: { ...prev.breakdown, beats } }, field);
    });

  const chooseSubject = (type: "own" | "competitor") =>
    setBody((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        subject: type === "own" ? { type: "own" as const } : { type: "competitor" as const, name: competitorName },
      };
    });

  const editCompetitorName = (name: string) => {
    setCompetitorName(name);
    setBody((prev) => (prev ? { ...prev, subject: { type: "competitor" as const, name } } : prev));
  };

  /* ------------------------------ saving ------------------------------- */

  const save = async () => {
    if (!body) return;
    if (body.subject.type === "competitor" && !body.subject.name.trim()) {
      setSaveError("Name the competitor before saving this as a competitor's video.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSavedNote(null);
    try {
      const payload = body as unknown as Record<string, unknown>;
      const title = `Analysis — ${body.videoTitle}`;
      if (loadedItemId) {
        const updated = await updateContentItem(loadedItemId, { title, body: payload });
        setSavedItems((cur) => (cur ?? []).map((i) => (i.id === updated.id ? updated : i)));
        setSavedNote("Saved — this analysis was updated.");
      } else {
        const created = await createContentItem({ kind: "analysis", title, body: payload, source: "manual" });
        setLoadedItemId(created.id);
        setSavedItems((cur) => [created, ...(cur ?? [])]);
        setSavedNote("Saved to your content library.");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save this analysis. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const loadItem = (item: ContentItem) => {
    const parsed = readAnalysisBody(item.body);
    if (!parsed) return;
    setBody(parsed);
    setLoadedItemId(item.id);
    setCompetitorName(parsed.subject.type === "competitor" ? parsed.subject.name : "");
    setSavedNote(null);
    setSaveError(null);
  };

  const removeItem = async (item: ContentItem) => {
    try {
      await deleteContentItem(item.id);
      setSavedItems((cur) => (cur ?? []).filter((i) => i.id !== item.id));
      if (loadedItemId === item.id) setLoadedItemId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't delete that analysis. Try again.");
    }
  };

  const editedMark = (field: string) =>
    body && body.editedFields.includes(field) ? (
      <span className="rounded-md bg-sand-200 px-1.5 py-0.5 font-sora text-[10px] font-bold uppercase tracking-wide text-sand-700">Edited</span>
    ) : null;

  const inputClass =
    "w-full rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-sand-500";
  const labelClass = "font-sora text-[12px] font-bold uppercase tracking-wider text-sand-600";
  const cardClass = "rounded-xl border border-sand-200 bg-white px-5 py-5";
  const methodClass = "mt-2 text-[12px] leading-relaxed text-sand-600";

  const sceneUnavailable = hasCaptions && studio !== null && (scene.state === "unavailable" || deviceStatus === "missing");

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Reel <em className="italic text-sand-600">Analyzer</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            A measured breakdown of one reel — its hook, its beats, its call to action and its pacing —
            from a project that already has captions. Pick a project below, or start with a new video.
          </p>
          <p className="mt-3 max-w-[68ch] rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
            The Analyzer measures the video itself on this device — the spoken transcript and the
            picture cuts. It does not access Instagram or YouTube analytics, retention, or any other
            private platform data. Every figure shows how it was measured, and there is no overall score.
          </p>
          <button
            onClick={() => void startNew()}
            disabled={creating}
            className="mt-5 rounded-full bg-ink px-5 py-2.5 font-sora text-[13px] font-semibold text-dune-white transition hover:opacity-85 disabled:opacity-50 cursor-pointer"
          >
            {creating ? "Creating project…" : "Start with a new video"}
          </button>
          <p className="mt-3 max-w-2xl text-[13px] text-sand-700">
            Captions are made in the studio: the new project opens there so you can upload the video
            and let transcription finish, then return here and pick the project below.
          </p>
          {createError ? <p role="alert" className="mt-3 text-[13px] font-medium text-obsidian">{createError}</p> : null}
        </div>

        <div className="pt-8">
          <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Pick a project to analyse</h2>
          {isLoading ? (
            <div className="mt-4"><ProjectCardsSkeleton /></div>
          ) : isError ? (
            <div className="mt-4 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
              <p className="font-sora text-[14px] font-semibold text-obsidian">Couldn&apos;t load your projects.</p>
              <button onClick={() => refetch()} className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer">Retry</button>
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-16 text-center">
              <p className="font-serif text-2xl font-semibold text-ink">No projects <em className="italic text-sand-600">yet.</em></p>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-sand-800">Start with a new video above: upload it in the studio and let the captions finish, then it can be analysed here.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => void selectProject(p.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition cursor-pointer ${selectedId === p.id ? "border-ink bg-sand-100" : "border-sand-200 bg-sand-50 hover:border-sand-300 hover:bg-sand-100"}`}
                  >
                    <span className="min-w-0 truncate font-sora text-[14px] font-semibold text-ink">{p.title}</span>
                    <span className="shrink-0 font-sora text-[12px] font-semibold text-sand-600">{selectedId === p.id ? "Selected" : "Analyse →"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {studioLoading ? (
            <p role="status" className="pt-6 text-[14px] text-sand-700">Loading that project…</p>
          ) : studioError ? (
            <p role="alert" className="pt-6 text-[14px] font-medium text-obsidian">{studioError}</p>
          ) : studio && !hasCaptions ? (
            <div className="mt-6 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center">
              <p className="font-serif text-2xl font-semibold text-ink">No captions <em className="italic text-sand-600">yet.</em></p>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-sand-800">
                This project has no captions yet — open it in the studio and let transcription finish, then analyse it here.
              </p>
              <Link href={`/projects/${studio.project.id}`} className="mt-6 inline-block rounded-full bg-ink px-6 py-2.5 font-sora text-[13px] font-semibold text-dune-white transition hover:opacity-85">
                Open in the studio
              </Link>
            </div>
          ) : null}

          {studio && hasCaptions && body ? (
            <div className="mt-6 space-y-3">
              {scene.state === "loading" ? (
                <p role="status" className="rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] text-sand-800">
                  Measuring scene cuts… The breakdown below is from the transcript; cut-based figures update when the measurement finishes.
                </p>
              ) : null}
              {sceneUnavailable ? (
                <p role="status" className="rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] text-sand-800">
                  Scene cuts could not be measured for this file on this device, so cut-based figures read zero.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {body ? (
          <div className="pt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-sand-200 pb-4">
              <h2 className="font-serif text-2xl font-semibold text-ink">
                Breakdown — <em className="italic text-sand-600">{body.videoTitle}</em>
              </h2>
              <p className="text-[13px] tabular-nums text-sand-600">
                Duration {fmtMs(body.durationMs)}
                {body.sourceProjectId ? (
                  <>
                    {" · "}
                    <Link href={`/projects/${body.sourceProjectId}`} className="font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink">Open in the studio</Link>
                  </>
                ) : null}
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {/* Hook */}
              <section className={cardClass} aria-label="Hook">
                <div className="flex items-center gap-2">
                  <h3 className={labelClass}>Hook — first {Math.round(body.breakdown.hook.windowMs / 1000)} seconds</h3>
                  {editedMark("hook.text")}
                </div>
                <textarea
                  value={body.breakdown.hook.text}
                  onChange={(e) => editHookText(e.target.value)}
                  rows={2}
                  aria-label="Hook text"
                  className={`${inputClass} mt-3`}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {body.breakdown.hook.hasQuestion ? (
                    <span className="rounded-md bg-sand-200 px-2 py-0.5 font-sora text-[11px] font-bold uppercase tracking-wide text-sand-700">Question opening</span>
                  ) : null}
                  {body.breakdown.hook.hasNumber ? (
                    <span className="rounded-md bg-sand-200 px-2 py-0.5 font-sora text-[11px] font-bold uppercase tracking-wide text-sand-700">Number in hook</span>
                  ) : null}
                  {!body.breakdown.hook.hasQuestion && !body.breakdown.hook.hasNumber ? (
                    <span className="text-[13px] text-sand-700">No question or number signal in the hook.</span>
                  ) : null}
                  {body.editedFields.includes("hook.text") ? (
                    <span className="text-[12px] text-sand-600">(measured on the original transcript)</span>
                  ) : null}
                </div>
                <p className={methodClass}>{body.breakdown.hook.method}</p>
              </section>

              {/* On-screen text */}
              <section className={cardClass} aria-label="On-screen text">
                <h3 className={labelClass}>On-screen text</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-sand-800">{body.breakdown.onScreenText.note}</p>
              </section>

              {/* Beat map */}
              <section className={cardClass} aria-label="Beat map">
                <h3 className={labelClass}>Beat map</h3>
                {body.breakdown.beats.length === 0 ? (
                  <p className="mt-2 text-[14px] text-sand-800">No beats — this breakdown has no transcript words.</p>
                ) : (
                  <>
                    <ul className="mt-3 space-y-3">
                      {body.breakdown.beats.map((beat, i) => (
                        <li key={beat.index} className="rounded-lg border border-sand-200 bg-sand-50 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-sora text-[13px] font-bold tabular-nums text-ink">{fmtMs(beat.startMs)}–{fmtMs(beat.endMs)}</span>
                            <input
                              value={beat.label}
                              onChange={(e) => editBeat(i, { label: e.target.value as ReelBeat["label"] }, `beats.${i}.label`)}
                              aria-label={`Beat ${i + 1} label`}
                              className="w-36 rounded-md border border-sand-300 bg-white px-2 py-1 font-sora text-[13px] font-semibold text-ink outline-none"
                            />
                            {editedMark(`beats.${i}.label`)}
                            {editedMark(`beats.${i}.text`)}
                            <span className="ml-auto text-[12px] tabular-nums text-sand-600">{beat.wordCount} words</span>
                          </div>
                          <textarea
                            value={beat.text}
                            onChange={(e) => editBeat(i, { text: e.target.value }, `beats.${i}.text`)}
                            rows={2}
                            aria-label={`Beat ${i + 1} text`}
                            className={`${inputClass} mt-2`}
                          />
                        </li>
                      ))}
                    </ul>
                    <p className={methodClass}>{body.breakdown.beats[0]?.method}</p>
                  </>
                )}
              </section>

              {/* CTA */}
              <section className={cardClass} aria-label="Call to action">
                <h3 className={labelClass}>Call to action</h3>
                {body.breakdown.cta.found.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {body.breakdown.cta.found.map((m, i) => (
                      <li key={`${m.wordIndex}-${i}`} className="text-[14px] text-sand-800">
                        <span className="font-semibold text-ink">&ldquo;{m.phrase}&rdquo;</span>
                        <span className="tabular-nums text-sand-600"> at {fmtMs(m.atMs)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[14px] text-sand-800">No call-to-action phrase found in the transcript.</p>
                )}
                <p className={methodClass}>{body.breakdown.cta.method}</p>
              </section>

              {/* Pacing & metrics */}
              <section className={cardClass} aria-label="Pacing and metrics">
                <h3 className={labelClass}>Pacing &amp; metrics</h3>
                <dl className="mt-2 divide-y divide-sand-200">
                  {body.breakdown.metrics.map((metric) => (
                    <div key={metric.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-0.5 py-2.5">
                      <dt className="w-44 shrink-0 font-sora text-[13px] font-semibold text-ink">{metric.label}</dt>
                      <dd className="font-sora text-[14px] font-bold tabular-nums text-ink">{metric.display}</dd>
                      <dd className="min-w-0 flex-1 text-[12px] leading-relaxed text-sand-600">{metric.method}</dd>
                    </div>
                  ))}
                </dl>
                <p className={methodClass}>{body.breakdown.pacing.method}</p>
              </section>

              {/* Notes */}
              <section className={cardClass} aria-label="Your notes">
                <h3 className={labelClass}>Your notes</h3>
                <textarea
                  value={body.notes}
                  onChange={(e) => setBody((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                  rows={3}
                  placeholder="What you notice about this reel — saved with the analysis."
                  aria-label="Your notes"
                  className={`${inputClass} mt-3`}
                />
              </section>

              {/* Subject + save */}
              <section className={cardClass} aria-label="Save this analysis">
                <h3 className={labelClass}>Whose video is this?</h3>
                <div className="mt-3 flex flex-wrap items-center gap-5">
                  <label className="flex items-center gap-2 text-[14px] text-sand-800 cursor-pointer">
                    <input type="radio" name="analysis-subject" checked={body.subject.type === "own"} onChange={() => chooseSubject("own")} />
                    My video
                  </label>
                  <label className="flex items-center gap-2 text-[14px] text-sand-800 cursor-pointer">
                    <input type="radio" name="analysis-subject" checked={body.subject.type === "competitor"} onChange={() => chooseSubject("competitor")} />
                    A competitor&apos;s video
                  </label>
                  {body.subject.type === "competitor" ? (
                    <input
                      value={competitorName}
                      onChange={(e) => editCompetitorName(e.target.value)}
                      placeholder="Competitor name"
                      aria-label="Competitor name"
                      className="w-56 rounded-lg border border-sand-300 bg-white px-3 py-2 text-[14px] text-ink outline-none placeholder:text-sand-500"
                    />
                  ) : null}
                </div>
                {!libraryReady ? (
                  <p role="status" className="mt-4 rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
                    Your content library is not set up on the server yet — a database update is pending. You can still analyse; saving is unavailable until then.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => void save()}
                    disabled={saving || !libraryReady}
                    className="rounded-full bg-ink px-5 py-2.5 font-sora text-[13px] font-semibold text-dune-white transition hover:opacity-85 disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving…" : loadedItemId ? "Save changes" : "Save this analysis"}
                  </button>
                  {savedNote ? <p role="status" className="text-[13px] font-medium text-sand-800">{savedNote}</p> : null}
                  {saveError ? <p role="alert" className="text-[13px] font-medium text-obsidian">{saveError}</p> : null}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* Saved analyses */}
        <div className="pt-10">
          <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Saved analyses</h2>
          {savedItems === null ? (
            <p role="status" className="mt-4 text-[14px] text-sand-700">Loading your saved analyses…</p>
          ) : !libraryReady ? (
            <p role="status" className="mt-4 rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
              Your content library is not set up on the server yet — a database update is pending. You can still analyse; saving is unavailable until then.
            </p>
          ) : parsedSaved.length === 0 ? (
            <p className="mt-4 text-[14px] text-sand-800">No saved analyses yet. Analyse a project above and save the breakdown — it will be listed here.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {parsedSaved.map(({ item, body: saved }) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate font-sora text-[14px] font-semibold text-ink">{item.title}</span>
                  <span className="rounded-md bg-sand-200 px-2 py-0.5 font-sora text-[11px] font-bold uppercase tracking-wide text-sand-700">
                    {saved.subject.type === "competitor" ? `Competitor: ${saved.subject.name}` : "Own"}
                  </span>
                  {item.createdAt ? (
                    <span className="text-[12px] text-sand-600">
                      {new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  ) : null}
                  <button onClick={() => loadItem(item)} className="rounded-full bg-ink px-4 py-2 font-sora text-[12px] font-semibold text-dune-white hover:opacity-85 transition cursor-pointer">Load</button>
                  <button onClick={() => void removeItem(item)} className="rounded-full border border-orange-accent/60 px-4 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/10 transition-colors cursor-pointer">Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Hook library */}
        <div className="pt-10 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Hook library</h2>
            <div className="ml-auto flex rounded-full border border-sand-300 p-1" role="tablist" aria-label="Hook library filters">
              <button role="tab" aria-selected={hookFilter === "all"} onClick={() => setHookFilter("all")} className={`rounded-full px-3.5 py-1.5 font-sora text-[12px] font-semibold transition-colors cursor-pointer ${hookFilter === "all" ? "bg-ink text-dune-white" : "text-sand-700 hover:text-ink"}`}>All</button>
              <button role="tab" aria-selected={hookFilter === "competitors"} onClick={() => setHookFilter("competitors")} className={`rounded-full px-3.5 py-1.5 font-sora text-[12px] font-semibold transition-colors cursor-pointer ${hookFilter === "competitors" ? "bg-ink text-dune-white" : "text-sand-700 hover:text-ink"}`}>Competitors only</button>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-sand-700">Every hook from your saved analyses — yours and your competitors&apos; — in one list.</p>
          {savedItems === null ? (
            <p role="status" className="mt-4 text-[14px] text-sand-700">Loading…</p>
          ) : hookRows.length === 0 ? (
            <p className="mt-4 text-[14px] text-sand-800">
              {hookFilter === "competitors" ? "No competitor analyses saved yet." : "No hooks yet — save an analysis and its hook appears here."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
              {hookRows.map(({ item, body: saved }) => (
                <li key={item.id} className="px-5 py-4">
                  <p className="text-[14px] font-medium leading-relaxed text-ink">{saved.breakdown.hook.text || "(no hook text)"}</p>
                  <p className="mt-1 text-[12px] tabular-nums text-sand-600">
                    {saved.videoTitle}
                    {" · "}
                    {saved.subject.type === "competitor" ? `Competitor: ${saved.subject.name}` : "Own video"}
                    {" · "}
                    {saved.breakdown.pacing.wordsPerMin.toFixed(1)} words/min
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
