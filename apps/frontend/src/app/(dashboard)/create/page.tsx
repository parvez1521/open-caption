"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import {
  CAPTION_TONES,
  HOOK_STYLES,
  LOCAL_MODEL,
  PLATFORMS,
  itemCopyText,
  sourceNote,
  type CaptionTone,
  type GeneratedItem,
  type GeneratorKind,
  type HookStyle,
  type Platform,
  type Source,
} from "@/features/create/model";
import { generateContent, type GenerationOutcome } from "@/features/create/service";
import { fetchCloudAiStatus, runCloudModel, type CloudAiStatus } from "@/features/create/cloudAi";
import { addDraft, loadDrafts, removeDraft, type Draft } from "@/features/create/drafts";
import {
  canRunLocalModel,
  disableLocalModel,
  enableLocalModel,
  getModelState,
  onModelState,
  runLocalModel,
  type ModelState,
} from "@/features/create/localModel";
import { SourceBadge } from "@/features/create/SourceBadge";

const TABS: { id: GeneratorKind; label: string }[] = [
  { id: "ideas", label: "Ideas" },
  { id: "hooks", label: "Hooks" },
  { id: "captions", label: "Caption suggestions" },
];

const inputCls =
  "w-full rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-sand-600";
const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";
const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";

interface Batch {
  kind: GeneratorKind;
  items: GeneratedItem[];
  source: Source;
  note?: string;
}

export default function GeneratorsPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<GeneratorKind>("ideas");

  // form state (the niche / audience / tone fields are the brand-voice inputs in this version)
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [ideasPlatform, setIdeasPlatform] = useState<Platform>("reels");
  const [ideasCount, setIdeasCount] = useState(5);
  const [topic, setTopic] = useState("");
  const [hookStyle, setHookStyle] = useState<HookStyle>("curiosity");
  const [hooksPlatform, setHooksPlatform] = useState<Platform>("reels");
  const [hooksCount, setHooksCount] = useState(5);
  const [captionTopic, setCaptionTopic] = useState("");
  const [captionPlatform, setCaptionPlatform] = useState<Platform>("reels");
  const [tone, setTone] = useState<CaptionTone>("friendly");

  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [modelState, setModelState] = useState<ModelState>(() => getModelState());
  const [modelError, setModelError] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudAiStatus | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
    setDrafts(loadDrafts());
    // Is the site's free AI switched on? One cached probe; null/unconfigured = the cloud path
    // simply does not exist and the page behaves exactly as before.
    void fetchCloudAiStatus().then(setCloud);
  }, [router]);

  const cloudOn = !!cloud?.configured;

  useEffect(() => onModelState(setModelState), []);

  const modelReady = modelState.status === "ready";

  const enable = async () => {
    setModelError(null);
    try {
      await enableLocalModel();
    } catch (e) {
      setModelError(e instanceof Error ? e.message : "The model could not be downloaded or loaded.");
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const input =
        tab === "ideas"
          ? { niche, platform: ideasPlatform, audience, count: ideasCount }
          : tab === "hooks"
            ? { topic, style: hookStyle, platform: hooksPlatform, count: hooksCount }
            : { topic: captionTopic, platform: captionPlatform, tone };
      const outcome: GenerationOutcome = await generateContent(tab, input, {
        runCloud: cloudOn ? runCloudModel : undefined,
        modelEnabled: modelReady,
        runModel: runLocalModel,
      });
      setBatch({ kind: tab, items: outcome.items, source: outcome.source, note: outcome.note });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (key: string, item: GeneratedItem) => {
    try {
      await navigator.clipboard.writeText(itemCopyText(item));
      setCopiedId(key);
      setTimeout(() => setCopiedId((c) => (c === key ? null : c)), 1600);
    } catch { /* clipboard unavailable: the text stays selectable on screen */ }
  };

  const saveDraft = (item: GeneratedItem) => {
    if (!batch) return;
    setDrafts(addDraft({ kind: batch.kind, source: batch.source, item }));
  };

  if (!signedIn) return <StudioShell><div className="px-4 sm:px-10 py-10 max-w-3xl mx-auto"><div className="h-40 rounded-xl bg-sand-100 animate-pulse" /></div></StudioShell>;

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-3xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <p className="font-sora text-[11px] font-semibold uppercase tracking-wider text-sand-500">Creator Studio</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Content <em className="italic text-sand-600">generators</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            Ideas, opening hooks and caption suggestions, in plainly labelled modes. The template engine builds
            results from patterns and your inputs: it works offline, instantly, and it is not a model. When the free
            AI is switched on for this site, a full-size model on a server writes instead — nothing runs on your
            device. There is also an optional model below that runs on your own device. Every batch shows which one
            wrote it.
          </p>
        </div>

        {/* Free AI: shown only when this deployment has a provider key configured (status probed on load) */}
        {cloudOn && cloud ? (
          <section className="mt-8 rounded-xl border border-sand-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <h2 className="font-sora text-[15px] font-bold text-ink">Free AI</h2>
                <p className="mt-1 text-[13px] text-sand-700">
                  Switched on for this site. Batches are written by {cloud.modelName} ({cloud.provider}), a
                  full-size model running on {cloud.provider}&rsquo;s servers — nothing is downloaded to or run on
                  your device. Your topic text is sent to {cloud.provider} when you generate, and generations are
                  rate-limited per account so the shared free service lasts. If it is ever unavailable, the template
                  engine{modelReady ? " or the local model" : ""} steps in automatically — the badge on every batch
                  always says which one wrote it.
                </p>
              </div>
              <p className="font-sora text-[12px] font-semibold text-sand-800">On — it writes your batches</p>
            </div>
          </section>
        ) : null}

        {/* Local model: off by default, explicit opt-in with name, licence and size shown first */}
        <section className="mt-8 rounded-xl border border-sand-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="font-sora text-[15px] font-bold text-ink">Optional local model</h2>
              <p className="mt-1 text-[13px] text-sand-700">
                {LOCAL_MODEL.name} ({LOCAL_MODEL.id}), licence {LOCAL_MODEL.licence}. One-time download of{" "}
                {LOCAL_MODEL.approxDownloadLabel}, then it runs entirely in this browser tab and is cached for next
                time. Nothing you type is sent to a server. It is off by default, and the template engine keeps
                working whether it is on, off or unavailable.
              </p>
            </div>
            {modelState.status === "ready" ? (
              <div className="space-y-2 text-right">
                <p className="font-sora text-[12px] font-semibold text-sand-800">
                  On, running on {modelState.device === "webgpu" ? "your graphics card" : "your processor"}
                </p>
                <button onClick={() => disableLocalModel()} className={ghostBtn}>Turn off</button>
              </div>
            ) : modelState.status === "loading" ? (
              <div className="w-56 space-y-2">
                <p className="font-sora text-[12px] font-semibold text-sand-800">
                  Downloading model, {Math.round(modelState.progress * 100)}%
                </p>
                <div className="h-2 rounded-full bg-sand-100 overflow-hidden">
                  <div className="h-full bg-ink transition-all" style={{ width: `${Math.round(modelState.progress * 100)}%` }} />
                </div>
              </div>
            ) : (
              <button onClick={() => void enable()} disabled={!canRunLocalModel()} className={primaryBtn}>
                Download &amp; enable
              </button>
            )}
          </div>
          {!canRunLocalModel() ? (
            <p className="mt-3 text-[12px] text-sand-600">This browser cannot run a local model (it needs Web Workers and WebAssembly). The template engine below works as normal.</p>
          ) : null}
          {modelState.status === "error" || modelError ? (
            <p className="mt-3 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">
              The local model could not be loaded{modelError ? `: ${modelError}` : modelState.status === "error" ? `: ${modelState.message}` : ""}. The template engine below works as normal.
            </p>
          ) : null}
        </section>

        {/* Tabs */}
        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Generators">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-5 py-2.5 font-sora text-[12px] font-semibold transition-colors cursor-pointer ${
                tab === t.id ? "bg-ink text-dune-white" : "border border-sand-300 text-sand-800 hover:border-ink hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Forms */}
        <section className="mt-6 rounded-xl border border-sand-200 bg-white p-6">
          {tab === "ideas" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="g-niche">Niche or topic</label><input id="g-niche" className={inputCls} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. home workouts for busy parents" /></div>
              <div><label className={labelCls} htmlFor="g-audience">Audience</label><input id="g-audience" className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. complete beginners" /></div>
              <div><label className={labelCls} htmlFor="g-iplatform">Platform</label><select id="g-iplatform" className={inputCls} value={ideasPlatform} onChange={(e) => setIdeasPlatform(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-icount">How many ideas</label><input id="g-icount" type="number" min={1} max={10} className={inputCls} value={ideasCount} onChange={(e) => setIdeasCount(Number(e.target.value))} /></div>
            </div>
          ) : tab === "hooks" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="g-topic">Topic</label><input id="g-topic" className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. morning routines" /></div>
              <div><label className={labelCls} htmlFor="g-style">Hook style</label><select id="g-style" className={inputCls} value={hookStyle} onChange={(e) => setHookStyle(e.target.value as HookStyle)}>{HOOK_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-hplatform">Platform</label><select id="g-hplatform" className={inputCls} value={hooksPlatform} onChange={(e) => setHooksPlatform(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-hcount">How many hooks</label><input id="g-hcount" type="number" min={1} max={10} className={inputCls} value={hooksCount} onChange={(e) => setHooksCount(Number(e.target.value))} /></div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="g-ctopic">Topic</label><input id="g-ctopic" className={inputCls} value={captionTopic} onChange={(e) => setCaptionTopic(e.target.value)} placeholder="e.g. our new bakery's sourdough" /></div>
              <div><label className={labelCls} htmlFor="g-tone">Tone</label><select id="g-tone" className={inputCls} value={tone} onChange={(e) => setTone(e.target.value as CaptionTone)}>{CAPTION_TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-cplatform">Platform</label><select id="g-cplatform" className={inputCls} value={captionPlatform} onChange={(e) => setCaptionPlatform(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button onClick={() => void generate()} disabled={busy} className={primaryBtn}>
              {busy ? "Working…" : cloudOn ? "Generate with free AI" : modelReady ? "Generate with local model" : "Generate"}
            </button>
            <span className="text-[12px] text-sand-600">
              {cloudOn
                ? "The free AI service writes this batch; another mode steps in automatically if it is unavailable."
                : modelReady
                  ? "The local model is on: it writes this batch, or the template engine steps in if it cannot run."
                  : "Using the template engine. It is instant and works offline."}
            </span>
          </div>
        </section>

        {/* Results */}
        {batch ? (
          <section className="mt-6 space-y-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-3">
              <SourceBadge source={batch.source} />
              <p className="text-[12px] text-sand-600">{sourceNote(batch.source)}</p>
            </div>
            {batch.note ? (
              <p className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">{batch.note}</p>
            ) : null}
            {batch.items.map((item, i) => {
              const key = `${batch.kind}-${i}`;
              return (
                <article key={key} className="rounded-xl border border-sand-200 bg-white p-5">
                  <p className="text-[14px] font-medium text-ink whitespace-pre-line">{item.title}</p>
                  {item.detail ? <p className="mt-1 text-[13px] text-sand-700">{item.detail}</p> : null}
                  {item.hashtags?.length ? <p className="mt-2 text-[13px] text-sand-700">{item.hashtags.join(" ")}</p> : null}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void copy(key, item)} className={ghostBtn}>{copiedId === key ? "Copied" : "Copy"}</button>
                    <button onClick={() => saveDraft(item)} className={ghostBtn}>Save draft</button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        {/* Drafts: local only, labelled as such */}
        <section className="mt-10">
          <h2 className="font-sora text-[15px] font-bold text-ink">Saved drafts</h2>
          <p className="mt-1 text-[13px] text-sand-700">
            Drafts are stored on this device only, in this browser. They are not uploaded or synced, and there is no
            shared library yet.
          </p>
          {drafts.length ? (
            <div className="mt-4 space-y-3">
              {drafts.map((d) => (
                <article key={d.id} className="rounded-xl border border-sand-200 bg-white p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <SourceBadge source={d.source} />
                    <span className="text-[11px] uppercase tracking-wide text-sand-500">{d.kind}</span>
                  </div>
                  <p className="mt-2 text-[14px] font-medium text-ink whitespace-pre-line">{d.item.title}</p>
                  {d.item.detail ? <p className="mt-1 text-[13px] text-sand-700">{d.item.detail}</p> : null}
                  {d.item.hashtags?.length ? <p className="mt-2 text-[13px] text-sand-700">{d.item.hashtags.join(" ")}</p> : null}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void copy(`draft-${d.id}`, d.item)} className={ghostBtn}>{copiedId === `draft-${d.id}` ? "Copied" : "Copy"}</button>
                    <button onClick={() => setDrafts(removeDraft(d.id))} className={ghostBtn}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-sand-600">Nothing saved yet. Generate a batch and save the ones you like.</p>
          )}
        </section>
      </div>
    </StudioShell>
  );
}
