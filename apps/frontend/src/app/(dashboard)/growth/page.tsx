"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import {
  METRIC_KEYS,
  PLATFORM_SUGGESTIONS,
  engagementOf,
  validatePostRow,
  type CompetitorProfile,
  type GrowthPost,
  type GrowthPostInput,
  type MetricKey,
} from "@/features/growth/model";
import { growthCsvTemplate, parseGrowthCsv, type GrowthCsvError } from "@/features/growth/csv";
import {
  createCompetitor,
  createGrowthPost,
  deleteCompetitor,
  deleteGrowthPost,
  fetchCompetitors,
  fetchGrowthPosts,
  importGrowthPosts,
  updateCompetitor,
  updateGrowthPost,
  type ImportResult,
} from "@/features/growth/api";
import {
  computeWeeklyReport,
  readAnalysisForReport,
  type AnalysisForReport,
} from "@/features/growth/report";
import {
  assemblePlan,
  buildPlanBrief,
  canDraftPlan,
  nextWeekMonday,
  readWeeklyPlan,
  type WeeklyPlanBody,
} from "@/features/growth/plan";
import { usePlanDeps } from "@/features/growth/usePlanDeps";
import { createContentItem, fetchContentItems, type ContentItem } from "@/features/create/library";
import { runChatTurn } from "@/features/create/chat";
import { SourceBadge } from "@/features/create/SourceBadge";

const inputCls =
  "w-full rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-sand-600";
const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";
const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";
const sectionTitleCls = "font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600";
const cardCls = "rounded-xl border border-sand-200 bg-white p-5";

/**
 * A section's basis ("how this figure was worked out") — kept on the page, one tap away,
 * instead of a paragraph under every card. The data-source labels themselves (Manual/CSV,
 * source mix) stay visible as before; this only moves the arithmetic.
 */
function BasisLine({ basis }: { basis: string }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[12px] font-semibold text-sand-600">How this is worked out</summary>
      <p className="mt-1 text-[12px] leading-relaxed text-sand-600">{basis}</p>
    </details>
  );
}

const METRIC_LABELS: Record<MetricKey, string> = {
  views: "Views",
  reach: "Reach",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** ISO timestamp -> the value a datetime-local input expects, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

function formatPostedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const errText = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

interface ParsedPlan {
  item: ContentItem;
  plan: WeeklyPlanBody;
}

export default function GrowthPage() {
  const router = useRouter();
  const deps = usePlanDeps();
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [posts, setPosts] = useState<GrowthPost[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [growthReady, setGrowthReady] = useState(true);
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [analysisItems, setAnalysisItems] = useState<ContentItem[]>([]);
  const [libraryReady, setLibraryReady] = useState(true);
  const [planItems, setPlanItems] = useState<ContentItem[]>([]);

  // Post form
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postPlatform, setPostPlatform] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [postPostedAt, setPostPostedAt] = useState(nowLocalInput);
  const [postMetrics, setPostMetrics] = useState<Record<MetricKey, string>>({
    views: "", reach: "", likes: "", comments: "", shares: "", saves: "",
  });
  const [postError, setPostError] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  // CSV
  const [csvRows, setCsvRows] = useState<GrowthPostInput[]>([]);
  const [csvErrors, setCsvErrors] = useState<GrowthCsvError[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Competitors
  const [editingCompetitorId, setEditingCompetitorId] = useState<string | null>(null);
  const [compName, setCompName] = useState("");
  const [compPlatform, setCompPlatform] = useState("");
  const [compHandle, setCompHandle] = useState("");
  const [compNotes, setCompNotes] = useState("");
  const [compError, setCompError] = useState<string | null>(null);
  const [compBusy, setCompBusy] = useState(false);

  // Plan drafting
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [postList, compList, analyses, plans] = await Promise.all([
        fetchGrowthPosts(),
        fetchCompetitors(),
        fetchContentItems("analysis").catch(() => null),
        fetchContentItems("weekly-plan").catch(() => null),
      ]);
      setPosts(postList.posts);
      setCompetitors(compList.competitors);
      setGrowthReady(postList.ready && compList.ready);
      if (analyses) setAnalysisItems(analyses.items);
      if (plans) setPlanItems(plans.items);
      setLibraryReady((analyses?.ready ?? false) && (plans?.ready ?? false));
    } catch (e) {
      setLoadError(errText(e, "Couldn't load Growth Studio. Try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!signedIn) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const refreshPosts = async () => {
    const list = await fetchGrowthPosts();
    setPosts(list.posts);
    setGrowthReady(list.ready);
  };

  const analyses: AnalysisForReport[] = useMemo(
    () =>
      analysisItems
        .map((item) => readAnalysisForReport(item.body))
        .filter((x): x is AnalysisForReport => x !== null),
    [analysisItems],
  );

  const report = useMemo(
    () => computeWeeklyReport(posts, Date.now(), { competitors, analyses }),
    [posts, competitors, analyses],
  );

  const savedPlans: ParsedPlan[] = useMemo(
    () =>
      planItems
        .map((item) => {
          const plan = readWeeklyPlan(item.body);
          return plan ? { item, plan } : null;
        })
        .filter((x): x is ParsedPlan => x !== null),
    [planItems],
  );

  const breakdownsFor = (name: string): AnalysisForReport[] =>
    analyses.filter((a) => a.competitorName !== null && a.competitorName.toLowerCase() === name.toLowerCase());
  const competitorAnalyses = analyses.filter((a) => a.competitorName !== null);

  // ---------------------------------------------------------- post form

  const resetPostForm = () => {
    setEditingPostId(null);
    setPostPlatform("");
    setPostTitle("");
    setPostUrl("");
    setPostPostedAt(nowLocalInput());
    setPostMetrics({ views: "", reach: "", likes: "", comments: "", shares: "", saves: "" });
    setPostError(null);
  };

  const startEditPost = (post: GrowthPost) => {
    setEditingPostId(post.id);
    setPostPlatform(post.platform);
    setPostTitle(post.title);
    setPostUrl(post.postUrl ?? "");
    setPostPostedAt(toLocalInput(post.postedAt));
    setPostMetrics({
      views: post.views === null ? "" : String(post.views),
      reach: post.reach === null ? "" : String(post.reach),
      likes: post.likes === null ? "" : String(post.likes),
      comments: post.comments === null ? "" : String(post.comments),
      shares: post.shares === null ? "" : String(post.shares),
      saves: post.saves === null ? "" : String(post.saves),
    });
    setPostError(null);
  };

  const submitPost = async () => {
    setPostError(null);
    const raw: Record<string, unknown> = {
      platform: postPlatform,
      title: postTitle,
      postUrl: postUrl.trim() === "" ? null : postUrl,
      postedAt: postPostedAt ? new Date(postPostedAt).toISOString() : "",
    };
    for (const key of METRIC_KEYS) raw[key] = postMetrics[key].trim() === "" ? null : postMetrics[key].trim();
    const validated = validatePostRow(raw);
    if (!validated.ok) {
      setPostError(validated.errors.join(" "));
      return;
    }
    setPostBusy(true);
    try {
      if (editingPostId) {
        const updated = await updateGrowthPost(editingPostId, validated.value);
        setPosts((cur) => cur.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createGrowthPost(validated.value);
        setPosts((cur) => [created, ...cur]);
      }
      resetPostForm();
    } catch (e) {
      setPostError(errText(e, "Couldn't save the post. Try again."));
    } finally {
      setPostBusy(false);
    }
  };

  const removePost = async (post: GrowthPost) => {
    try {
      await deleteGrowthPost(post.id);
      setPosts((cur) => cur.filter((p) => p.id !== post.id));
      if (editingPostId === post.id) resetPostForm();
    } catch (e) {
      setPostError(errText(e, "Couldn't delete the post. Try again."));
    }
  };

  // ---------------------------------------------------------- CSV

  const downloadTemplate = () => {
    const blob = new Blob([growthCsvTemplate()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = "growth-posts-template.csv";
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const onCsvFile = async (file: File | null) => {
    setImportResult(null);
    setCsvError(null);
    setCsvRows([]);
    setCsvErrors([]);
    setCsvFileName(file?.name ?? null);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseGrowthCsv(text);
      setCsvRows(parsed.rows);
      setCsvErrors(parsed.errors);
    } catch {
      setCsvError("Couldn't read that file. Choose a CSV file and try again.");
    }
  };

  const importCsv = async () => {
    setCsvBusy(true);
    setCsvError(null);
    try {
      const result = await importGrowthPosts(csvRows);
      setImportResult(result);
      setCsvRows([]);
      await refreshPosts();
    } catch (e) {
      setCsvError(errText(e, "Couldn't import those posts. Try again."));
    } finally {
      setCsvBusy(false);
    }
  };

  // ---------------------------------------------------------- competitors

  const resetCompetitorForm = () => {
    setEditingCompetitorId(null);
    setCompName("");
    setCompPlatform("");
    setCompHandle("");
    setCompNotes("");
    setCompError(null);
  };

  const startEditCompetitor = (profile: CompetitorProfile) => {
    setEditingCompetitorId(profile.id);
    setCompName(profile.name);
    setCompPlatform(profile.platform);
    setCompHandle(profile.handle ?? "");
    setCompNotes(profile.notes ?? "");
    setCompError(null);
  };

  const submitCompetitor = async () => {
    setCompError(null);
    if (!compName.trim()) {
      setCompError("name is required");
      return;
    }
    setCompBusy(true);
    try {
      const payload = {
        name: compName.trim(),
        platform: compPlatform.trim(),
        handle: compHandle.trim() === "" ? null : compHandle.trim(),
        notes: compNotes.trim() === "" ? null : compNotes.trim(),
      };
      if (editingCompetitorId) {
        const updated = await updateCompetitor(editingCompetitorId, payload);
        setCompetitors((cur) => cur.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCompetitor(payload);
        setCompetitors((cur) => [created, ...cur]);
      }
      resetCompetitorForm();
    } catch (e) {
      setCompError(errText(e, "Couldn't save the competitor. Try again."));
    } finally {
      setCompBusy(false);
    }
  };

  const removeCompetitor = async (profile: CompetitorProfile) => {
    try {
      await deleteCompetitor(profile.id);
      setCompetitors((cur) => cur.filter((c) => c.id !== profile.id));
      if (editingCompetitorId === profile.id) resetCompetitorForm();
    } catch (e) {
      setCompError(errText(e, "Couldn't delete the competitor. Try again."));
    }
  };

  // ---------------------------------------------------------- plan

  const draftPlan = async () => {
    setPlanError(null);
    const brief = buildPlanBrief(report, posts.length);
    if (!brief) {
      setPlanError("Add at least one post first — a plan is drafted from your own stored numbers.");
      return;
    }
    setPlanBusy(true);
    try {
      const weekStart = nextWeekMonday(new Date());
      const outcome = await runChatTurn("calendar", brief, {}, deps);
      const body = assemblePlan({
        weekStart,
        items: outcome.payload.items ?? [],
        report,
        source: outcome.source,
        fellBack: outcome.fellBack,
        note: outcome.note,
        generatedAt: new Date().toISOString(),
      });
      const created = await createContentItem({
        kind: "weekly-plan",
        title: `Weekly plan — ${weekStart}`,
        body: body as unknown as Record<string, unknown>,
        source: outcome.source,
      });
      setPlanItems((cur) => [created, ...cur]);
    } catch (e) {
      setPlanError(errText(e, "Couldn't draft the plan. Try again."));
    } finally {
      setPlanBusy(false);
    }
  };

  const draftable = canDraftPlan(report, posts.length);

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Growth <em className="italic text-sand-600">Studio</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            A weekly read on your own numbers: what you posted, how each post did, and a plan for
            next week built from those numbers only.
          </p>
          <p className="mt-3 max-w-[68ch] rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
            Every figure here is yours — typed in (Manual) or imported (CSV). Nothing is scraped,
            synced or estimated.
          </p>
        </div>

        {loading ? (
          <p role="status" className="pt-8 text-[14px] text-sand-700">Loading your Growth Studio data…</p>
        ) : loadError ? (
          <div className="mt-8 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
            <p className="font-sora text-[14px] font-semibold text-obsidian">{loadError}</p>
            <button onClick={() => void loadAll()} className={ghostBtn}>Retry</button>
          </div>
        ) : (
          <>
            {!growthReady ? (
              <p role="alert" className="mt-8 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] leading-relaxed text-obsidian">
                Growth Studio is not set up on the server yet — a database update is pending. Your
                posts and competitors can&apos;t be saved until then, and nothing is stored on this
                device as a substitute.
              </p>
            ) : null}
            {!libraryReady ? (
              <p className="mt-4 rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
                Saved analyses and weekly plans are not available yet — the content library is not
                set up on the server. The competitor breakdown and plan sections below stay empty
                until then; your posts and competitors are unaffected.
              </p>
            ) : null}

            {/* -------------------------------------------------- Posts */}
            <section className="pt-10" aria-label="Your posts">
              <h2 className={sectionTitleCls}>Your posts</h2>
              <form
                className={`${cardCls} mt-4 space-y-4`}
                onSubmit={(e) => { e.preventDefault(); void submitPost(); }}
              >
                <p className="font-sora text-[13px] font-semibold text-ink">
                  {editingPostId ? "Edit post" : "Add a post"}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelCls}>
                    Platform
                    <input
                      className={`${inputCls} mt-1`}
                      value={postPlatform}
                      onChange={(e) => setPostPlatform(e.target.value)}
                      list="growth-platforms"
                      disabled={!growthReady}
                      placeholder="instagram"
                    />
                    <datalist id="growth-platforms">
                      {PLATFORM_SUGGESTIONS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </label>
                  <label className={labelCls}>
                    Posted at
                    <input
                      className={`${inputCls} mt-1`}
                      type="datetime-local"
                      value={postPostedAt}
                      onChange={(e) => setPostPostedAt(e.target.value)}
                      disabled={!growthReady}
                    />
                  </label>
                </div>
                <label className={labelCls}>
                  Title
                  <input
                    className={`${inputCls} mt-1`}
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    disabled={!growthReady}
                  />
                </label>
                <label className={labelCls}>
                  Post URL (optional)
                  <input
                    className={`${inputCls} mt-1`}
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    disabled={!growthReady}
                    placeholder="https://…"
                  />
                </label>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {METRIC_KEYS.map((key) => (
                    <label key={key} className={labelCls}>
                      {METRIC_LABELS[key]}
                      <input
                        className={`${inputCls} mt-1`}
                        type="number"
                        min={0}
                        step={1}
                        value={postMetrics[key]}
                        onChange={(e) => setPostMetrics((cur) => ({ ...cur, [key]: e.target.value }))}
                        disabled={!growthReady}
                        placeholder="Not entered"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[12px] leading-relaxed text-sand-600">
                  Leave a metric blank when you did not record it — blank is stored as
                  &ldquo;not entered&rdquo;, never as zero.
                </p>
                {postError ? <p role="alert" className="text-[13px] font-medium text-obsidian">{postError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={primaryBtn} disabled={!growthReady || postBusy}>
                    {postBusy ? "Saving…" : editingPostId ? "Save changes" : "Add post"}
                  </button>
                  {editingPostId ? (
                    <button type="button" className={ghostBtn} onClick={resetPostForm}>Cancel edit</button>
                  ) : null}
                </div>
              </form>

              {posts.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center">
                  <p className="font-serif text-2xl font-semibold text-ink">No posts <em className="italic text-sand-600">yet.</em></p>
                  <p className="mx-auto mt-2 max-w-md text-[14px] text-sand-800">
                    Add your first post above, or import a spreadsheet below. The weekly report
                    starts from your posts — there is nothing to show until some exist.
                  </p>
                </div>
              ) : (
                <ul className="mt-6 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">
                  {posts.map((post) => (
                    <li key={post.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-sora text-[14px] font-bold text-ink" title={post.title}>
                            {post.title || "(untitled post)"}
                          </p>
                          <p className="mt-0.5 text-[12px] text-sand-600">
                            <span className="font-semibold uppercase tracking-wide">{post.platform}</span>
                            {" · "}{formatPostedAt(post.postedAt)}
                            {post.postUrl ? (
                              <>{" · "}<a href={post.postUrl} target="_blank" rel="noreferrer" className="font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink">Open post</a></>
                            ) : null}
                          </p>
                          <p className="mt-1 text-[12px] tabular-nums text-sand-700">
                            {METRIC_KEYS.map((key) => (
                              <span key={key} className="mr-3">
                                {METRIC_LABELS[key]}: {post[key] === null ? "—" : post[key]}
                              </span>
                            ))}
                            <span className="font-semibold text-ink">
                              {post.likes !== null && post.comments !== null && post.shares !== null && post.saves !== null
                                ? `Engagement: ${engagementOf(post)}`
                                : `Engagement so far: ${engagementOf(post)} (some figures not entered)`}
                            </span>
                          </p>
                        </div>
                        <span className="rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800">
                          {post.source === "csv" ? "CSV" : "Manual"}
                        </span>
                        <div className="flex gap-2">
                          <button type="button" className={ghostBtn} disabled={!growthReady} onClick={() => startEditPost(post)}>Edit</button>
                          {confirmDeleteId === post.id ? (
                            <>
                              <button type="button" className={ghostBtn} onClick={() => { setConfirmDeleteId(null); void removePost(post); }}>Confirm delete</button>
                              <button type="button" className={ghostBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                            </>
                          ) : (
                            <button type="button" className={ghostBtn} disabled={!growthReady} onClick={() => setConfirmDeleteId(post.id)}>Delete</button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* -------------------------------------------------- CSV import */}
            <section className="pt-10" aria-label="Import from CSV">
              <h2 className={sectionTitleCls}>Import from CSV</h2>
              <div className={`${cardCls} mt-4 space-y-4`}>
                <p className="text-[13px] leading-relaxed text-sand-800">
                  Keep your numbers in a spreadsheet? Download the template, fill it in, and import
                  it here. Parsing happens in this browser first so you can check the rows; the
                  server re-validates every row when you import, and rejects any row it does not
                  accept.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={ghostBtn} onClick={downloadTemplate}>Download the template</button>
                  <label className={ghostBtn}>
                    {csvFileName ?? "Choose a CSV file"}
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      disabled={!growthReady}
                      onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                {csvErrors.length > 0 ? (
                  <ul className="space-y-1 text-[13px] text-obsidian">
                    {csvErrors.map((err, i) => (
                      <li key={i}>Line {err.line}: {err.message}</li>
                    ))}
                  </ul>
                ) : null}
                {csvFileName ? (
                  <p className="text-[13px] text-sand-800">
                    {csvRows.length} valid row{csvRows.length === 1 ? "" : "s"} ready to import
                    {csvErrors.length ? `, ${csvErrors.length} row error${csvErrors.length === 1 ? "" : "s"} above` : ""}.
                  </p>
                ) : null}
                {csvError ? <p role="alert" className="text-[13px] font-medium text-obsidian">{csvError}</p> : null}
                {importResult ? (
                  <p className="text-[13px] text-sand-800">
                    Imported {importResult.imported} post{importResult.imported === 1 ? "" : "s"}.
                    {importResult.rejected.length
                      ? ` The server rejected ${importResult.rejected.length}: ${importResult.rejected.map((r) => `row ${r.index + 1} (${r.errors.join("; ")})`).join(", ")}`
                      : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={!growthReady || csvBusy || csvRows.length === 0}
                  onClick={() => void importCsv()}
                >
                  {csvBusy ? "Importing…" : `Import ${csvRows.length} post${csvRows.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </section>

            {/* -------------------------------------------------- Competitors */}
            <section className="pt-10" aria-label="Competitors">
              <h2 className={sectionTitleCls}>Competitors</h2>
              <form
                className={`${cardCls} mt-4 space-y-4`}
                onSubmit={(e) => { e.preventDefault(); void submitCompetitor(); }}
              >
                <p className="font-sora text-[13px] font-semibold text-ink">
                  {editingCompetitorId ? "Edit competitor" : "Add a competitor"}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelCls}>
                    Name
                    <input className={`${inputCls} mt-1`} value={compName} onChange={(e) => setCompName(e.target.value)} disabled={!growthReady} />
                  </label>
                  <label className={labelCls}>
                    Platform
                    <input className={`${inputCls} mt-1`} value={compPlatform} onChange={(e) => setCompPlatform(e.target.value)} list="growth-platforms" disabled={!growthReady} />
                  </label>
                  <label className={labelCls}>
                    Handle (optional)
                    <input className={`${inputCls} mt-1`} value={compHandle} onChange={(e) => setCompHandle(e.target.value)} disabled={!growthReady} />
                  </label>
                  <label className={labelCls}>
                    Notes (optional)
                    <input className={`${inputCls} mt-1`} value={compNotes} onChange={(e) => setCompNotes(e.target.value)} disabled={!growthReady} />
                  </label>
                </div>
                {compError ? <p role="alert" className="text-[13px] font-medium text-obsidian">{compError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={primaryBtn} disabled={!growthReady || compBusy}>
                    {compBusy ? "Saving…" : editingCompetitorId ? "Save changes" : "Add competitor"}
                  </button>
                  {editingCompetitorId ? (
                    <button type="button" className={ghostBtn} onClick={resetCompetitorForm}>Cancel edit</button>
                  ) : null}
                </div>
              </form>

              {competitors.length === 0 ? (
                <p className="mt-6 text-[14px] text-sand-700">
                  No competitors added yet. Add the creators you learn from; when you analyse one of
                  their videos in the Reel Analyzer and save it, its breakdown appears here.
                </p>
              ) : (
                <ul className="mt-6 space-y-3">
                  {competitors.map((profile) => {
                    const breakdowns = breakdownsFor(profile.name);
                    return (
                      <li key={profile.id} className={`${cardCls}`}>
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-sora text-[14px] font-bold text-ink">{profile.name}</p>
                            <p className="mt-0.5 text-[12px] text-sand-600">
                              {profile.platform || "Platform not set"}
                              {profile.handle ? ` · ${profile.handle}` : ""}
                            </p>
                            {profile.notes ? <p className="mt-1 text-[13px] text-sand-800">{profile.notes}</p> : null}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" className={ghostBtn} disabled={!growthReady} onClick={() => startEditCompetitor(profile)}>Edit</button>
                            {confirmDeleteId === profile.id ? (
                              <>
                                <button type="button" className={ghostBtn} onClick={() => { setConfirmDeleteId(null); void removeCompetitor(profile); }}>Confirm delete</button>
                                <button type="button" className={ghostBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                              </>
                            ) : (
                              <button type="button" className={ghostBtn} disabled={!growthReady} onClick={() => setConfirmDeleteId(profile.id)}>Delete</button>
                            )}
                          </div>
                        </div>
                        {breakdowns.length ? (
                          <ul className="mt-3 space-y-2 border-t border-sand-200 pt-3">
                            {breakdowns.map((b, i) => (
                              <li key={i} className="text-[13px] text-sand-800">
                                <span className="font-semibold text-ink">{b.videoTitle || "(untitled video)"}</span>
                                {b.hookText ? <> — hook: &ldquo;{b.hookText}&rdquo;</> : null}
                                {b.wordsPerMin !== null ? <> · {b.wordsPerMin} words/min</> : null}
                                {" · "}
                                {b.ctaPhrases.length ? `CTA: ${b.ctaPhrases.join(", ")}` : "no CTA found"}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 border-t border-sand-200 pt-3 text-[13px] text-sand-600">
                            No analysed breakdowns for this competitor yet.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className={`${cardCls} mt-6`}>
                <p className="font-sora text-[13px] font-semibold text-ink">Competitor hook library</p>
                {competitorAnalyses.length === 0 ? (
                  <p className="mt-2 text-[13px] text-sand-700">
                    Not enough data yet — save a competitor breakdown from the Reel Analyzer and its hook lands here.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {competitorAnalyses.map((b, i) => (
                      <li key={i} className="text-[13px] text-sand-800">
                        <span className="font-semibold text-ink">{b.competitorName}</span>
                        {" · "}{b.videoTitle || "(untitled video)"}
                        {b.hookText ? <> — &ldquo;{b.hookText}&rdquo;</> : null}
                        {b.wordsPerMin !== null ? <> · {b.wordsPerMin} words/min</> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* -------------------------------------------------- Weekly report */}
            <section className="pt-10" aria-label="Weekly report">
              <h2 className={sectionTitleCls}>Weekly report</h2>
              <div className="mt-4 grid gap-4">
                <div className={cardCls}>
                  <p className="font-sora text-[13px] font-semibold text-ink">Overview — last 7 days</p>
                  <BasisLine basis={report.overview.basis} />
                  <p className="mt-1 text-[12px] text-sand-600">
                    Source mix: {report.overview.sourceMix.manual} Manual, {report.overview.sourceMix.csv} CSV
                    {" · "}Prior 7 days: {report.overview.priorWindowPosts} posts
                  </p>
                  {report.overview.status === "insufficient" ? (
                    <p className="mt-3 text-[13px] text-sand-700">
                      Not enough data yet — add a post from the last 7 days.
                    </p>
                  ) : (
                    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {METRIC_KEYS.map((key) => {
                        const m = report.overview.metrics[key];
                        return (
                          <li key={key} className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2">
                            <p className="font-sora text-[12px] font-semibold text-sand-600">{METRIC_LABELS[key]}</p>
                            <p className="font-sora text-[16px] font-bold tabular-nums text-ink">{m.total}</p>
                            {m.reportedCount < report.overview.postsInWindow ? (
                              <p className="text-[11px] text-sand-600">reported on {m.reportedCount} of {report.overview.postsInWindow} posts</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className={cardCls}>
                  <p className="font-sora text-[13px] font-semibold text-ink">Best posting hours — all your posts</p>
                  <BasisLine basis={report.bestHours.basis} />
                  {report.bestHours.status === "insufficient" ? (
                    <p className="mt-3 text-[13px] text-sand-700">
                      Not enough data yet — add at least 3 posts, with times spread across the day.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-1 text-[13px] text-sand-800">
                      {report.bestHours.hours.map((h) => (
                        <li key={h.hour}>
                          <span className="font-semibold text-ink">{pad2(h.hour)}:00</span>
                          {" — "}avg {h.avgEngagement} engagement across {h.posts} posts
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={cardCls}>
                  <p className="font-sora text-[13px] font-semibold text-ink">Top and bottom posts — last 7 days</p>
                  <BasisLine basis={report.topBottom.basis} />
                  {report.topBottom.status === "insufficient" ? (
                    <p className="mt-3 text-[13px] text-sand-700">
                      Not enough data yet — posts from the last 7 days are ranked here.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="font-sora text-[12px] font-semibold text-sand-600">Top</p>
                        <ul className="mt-1 space-y-1 text-[13px] text-sand-800">
                          {report.topBottom.top.map((p) => (
                            <li key={p.id}>{p.title || "(untitled post)"} — {engagementOf(p)} engagement ({p.source === "csv" ? "CSV" : "Manual"})</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-sora text-[12px] font-semibold text-sand-600">Bottom</p>
                        {report.topBottom.bottom.length ? (
                          <ul className="mt-1 space-y-1 text-[13px] text-sand-800">
                            {report.topBottom.bottom.map((p) => (
                              <li key={p.id}>{p.title || "(untitled post)"} — {engagementOf(p)} engagement ({p.source === "csv" ? "CSV" : "Manual"})</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-[13px] text-sand-600">Not enough posts this week for a bottom list.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className={cardCls}>
                  <p className="font-sora text-[13px] font-semibold text-ink">Trend — last 7 days vs prior 7 days</p>
                  <BasisLine basis={report.trend.basis} />
                  {report.trend.status === "insufficient" ? (
                    <p className="mt-3 text-[13px] text-sand-700">
                      Not enough data yet — a trend needs a post in each of the last two weeks.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-1 text-[13px] text-sand-800">
                      <li>
                        <span className="font-semibold text-ink">Posts</span>
                        {": "}{report.trend.postCount.current} vs {report.trend.postCount.prior}
                        {" — "}
                        {report.trend.postCount.deltaPct === null
                          ? "no prior-period baseline"
                          : `${report.trend.postCount.deltaPct >= 0 ? "+" : ""}${report.trend.postCount.deltaPct.toFixed(1)}% vs prior 7 days`}
                      </li>
                      {METRIC_KEYS.map((key) => {
                        const entry = report.trend.metrics[key];
                        return (
                          <li key={key}>
                            <span className="font-semibold text-ink">{METRIC_LABELS[key]}</span>
                            {": "}{entry.currentTotal} vs {entry.priorTotal}
                            {" — "}
                            {entry.deltaPct === null
                              ? "no prior-period baseline"
                              : `${entry.deltaPct >= 0 ? "+" : ""}${entry.deltaPct.toFixed(1)}% vs prior 7 days`}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className={cardCls}>
                  <p className="font-sora text-[13px] font-semibold text-ink">Your niche — competitor breakdowns</p>
                  <BasisLine basis={report.niche.basis} />
                  {report.niche.status === "insufficient" ? (
                    <p className="mt-3 text-[13px] text-sand-700">
                      Not enough data yet — save a competitor breakdown from the Reel Analyzer.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3 text-[13px] text-sand-800">
                      <ul className="space-y-1">
                        {report.niche.perCompetitor.map((c) => (
                          <li key={c.name}>
                            <span className="font-semibold text-ink">{c.name}</span>
                            {" — "}{c.breakdowns} breakdown{c.breakdowns === 1 ? "" : "s"}
                            {c.avgWordsPerMin !== null ? ` · avg ${c.avgWordsPerMin} words/min` : ""}
                            {c.ctaPhrases.length ? ` · CTAs: ${c.ctaPhrases.join(", ")}` : ""}
                          </li>
                        ))}
                      </ul>
                      {report.niche.commonCtas.length ? (
                        <p>
                          Most common competitor CTAs:{" "}
                          {report.niche.commonCtas.map((c) => `${c.phrase} (${c.count})`).join(", ")}
                        </p>
                      ) : null}
                      {report.niche.ownAvgWordsPerMin !== null ? (
                        <p>Your own analysed videos average {report.niche.ownAvgWordsPerMin} words/min.</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* -------------------------------------------------- Weekly plan */}
            <section className="pt-10 pb-4" aria-label="Weekly plan">
              <h2 className={sectionTitleCls}>Weekly plan</h2>
              <div className={`${cardCls} mt-4`}>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={!growthReady || planBusy || !draftable}
                  onClick={() => void draftPlan()}
                >
                  {planBusy ? "Drafting…" : "Draft next week's plan"}
                </button>
                <p className="mt-3 text-[12px] leading-relaxed text-sand-600">
                  The plan is drafted from your own stored numbers; times come from your best
                  hours; titles come from the generator named by the badge on each saved plan.
                  {!draftable ? " Add at least one post before drafting — there is nothing to base a plan on yet." : ""}
                </p>
                {planError ? <p role="alert" className="mt-3 text-[13px] font-medium text-obsidian">{planError}</p> : null}
              </div>

              {savedPlans.length === 0 ? (
                <p className="mt-6 text-[14px] text-sand-700">No saved plans yet. Draft one above and it will be kept here.</p>
              ) : (
                <div className="mt-6 space-y-4">
                  {savedPlans.map(({ item, plan }) => (
                    <article key={item.id} className={cardCls}>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="font-sora text-[14px] font-bold text-ink">Week of {plan.weekStart}</p>
                        <SourceBadge source={plan.source} />
                      </div>
                      {plan.fellBack && plan.note ? (
                        <p className="mt-2 text-[12px] leading-relaxed text-sand-600">{plan.note}</p>
                      ) : null}
                      <p className="mt-1 text-[12px] text-sand-600">
                        Based on {plan.reportSnapshot.postsAnalysed} posts
                        {" ("}{plan.reportSnapshot.sourceMix.manual} Manual, {plan.reportSnapshot.sourceMix.csv} CSV{")"}.
                      </p>
                      {plan.recommendations.length ? (
                        <div className="mt-4">
                          <p className="font-sora text-[12px] font-semibold text-sand-600">Recommendations</p>
                          <ul className="mt-2 space-y-2">
                            {plan.recommendations.map((rec, i) => (
                              <li key={i} className="text-[13px] text-sand-800">
                                {rec.text}
                                <BasisLine basis={rec.basis} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="mt-4">
                        <p className="font-sora text-[12px] font-semibold text-sand-600">Days</p>
                        <ul className="mt-2 divide-y divide-sand-200">
                          {plan.days.map((day) => (
                            <li key={day.date} className="py-2.5">
                              <p className="font-sora text-[12px] font-semibold text-ink">{day.date}</p>
                              {day.items.length ? (
                                <ul className="mt-1 space-y-1.5">
                                  {day.items.map((dayItem, i) => (
                                    <li key={i} className="text-[13px] text-sand-800">
                                      {dayItem.title}
                                      {dayItem.detail ? <span className="text-sand-600"> — {dayItem.detail}</span> : null}
                                      {dayItem.suggestedTime ? (
                                        <span className="block text-[12px] text-sand-600">
                                          Suggested time: {dayItem.suggestedTime}
                                          {dayItem.timeBasis ? ` — ${dayItem.timeBasis}` : ""}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-[13px] text-sand-600">No post drafted</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </StudioShell>
  );
}
