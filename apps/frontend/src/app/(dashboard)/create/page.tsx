"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import {
  CAPTION_FORMATS,
  CAPTION_TONES,
  HOOK_STYLES,
  IDEA_CATEGORIES,
  IDEA_DIFFICULTIES,
  IDEA_DURATIONS,
  IDEA_OBJECTIVES,
  LOCAL_MODEL,
  PLATFORMS,
  REPURPOSE_TRANSFORMS,
  SCRIPT_FORMATS,
  itemCopyText,
  sourceNote,
  type CaptionFormat,
  type CaptionTone,
  type GeneratedItem,
  type GeneratorKind,
  type HookStyle,
  type IdeaCategory,
  type IdeaDifficulty,
  type IdeaDuration,
  type IdeaObjective,
  type Platform,
  type RepurposeTransform,
  type ScriptFormat,
  type Source,
  type SponsoredInput,
} from "@/features/create/model";
import { generateContent, type GenerationOutcome } from "@/features/create/service";
import { fetchCloudAiStatus, runCloudModel, type CloudAiStatus } from "@/features/create/cloudAi";
import { DRAFTS_KEY, addDraft, loadDrafts, removeDraft, type Draft } from "@/features/create/drafts";
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
import { activateBrandProfile, fetchBrandProfiles, type BrandProfile } from "@/features/create/brandProfile";
import { generateScriptContent } from "@/features/create/scriptService";
import { scriptToText, type ScriptDoc } from "@/features/create/scripts";
import { appendCta, applyTagGroup, ctaOptions, hashtagGroupBody, tagsFromGroupBody } from "@/features/create/captionStudio";
import {
  createContentItem,
  deleteContentItem,
  fetchContentItems,
  type ContentItem,
} from "@/features/create/library";
import {
  extractItemText,
  generatorKindToContentKind,
  planDraftMigration,
  scriptSummary,
} from "@/features/create/libraryMigration";

type StudioTab = "ideas" | "hooks" | "scripts" | "captions" | "repurpose";

const TABS: { id: StudioTab; label: string }[] = [
  { id: "ideas", label: "Ideas" },
  { id: "hooks", label: "Hooks" },
  { id: "scripts", label: "Scripts" },
  { id: "captions", label: "Captions" },
  { id: "repurpose", label: "Repurpose" },
];

const SCRIPT_DURATIONS: { sec: number; label: string }[] = [
  { sec: 15, label: "15 sec" },
  { sec: 30, label: "30 sec" },
  { sec: 45, label: "45 sec" },
  { sec: 60, label: "1 min" },
  { sec: 90, label: "90 sec" },
  { sec: 180, label: "3 min" },
  { sec: 300, label: "5 min" },
  { sec: 600, label: "10 min" },
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

const fmtTime = (sec: number): string => {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const asSource = (value: string): Source =>
  value === "cloud" || value === "model" ? value : "template";

/** Display fields for a library item whose body is a { item } payload or a plain { title, detail } record. */
function libraryDisplay(item: ContentItem): { title: string; detail?: string; hashtags?: string[] } {
  const body = item.body as Record<string, unknown>;
  const inner = body?.item;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const it = inner as Record<string, unknown>;
    if (typeof it.title === "string") {
      return {
        title: it.title,
        detail: typeof it.detail === "string" ? it.detail : undefined,
        hashtags: Array.isArray(it.hashtags) ? it.hashtags.filter((t): t is string => typeof t === "string") : undefined,
      };
    }
  }
  if (typeof body?.title === "string") {
    return {
      title: body.title,
      detail: typeof body.detail === "string" ? body.detail : undefined,
      hashtags: Array.isArray(body.hashtags) ? body.hashtags.filter((t): t is string => typeof t === "string") : undefined,
    };
  }
  if (item.kind === "hashtag-group") {
    const tags = tagsFromGroupBody(body);
    return { title: item.title, detail: tags.length ? tags.join(" ") : undefined };
  }
  return { title: item.title };
}

export default function GeneratorsPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<StudioTab>("ideas");

  // form state (the niche / audience / tone fields are the brand-voice inputs in this version)
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [ideasPlatform, setIdeasPlatform] = useState<Platform>("reels");
  const [ideasCount, setIdeasCount] = useState(5);
  const [ideaCategory, setIdeaCategory] = useState<IdeaCategory>("educational");
  const [ideaDifficulty, setIdeaDifficulty] = useState<IdeaDifficulty>("medium");
  const [ideaDuration, setIdeaDuration] = useState<IdeaDuration>("30-60s");
  const [ideaObjective, setIdeaObjective] = useState<IdeaObjective>("engagement");
  const [topic, setTopic] = useState("");
  const [hookStyle, setHookStyle] = useState<HookStyle>("curiosity");
  const [hooksPlatform, setHooksPlatform] = useState<Platform>("reels");
  const [hooksCount, setHooksCount] = useState(5);
  const [captionTopic, setCaptionTopic] = useState("");
  const [captionPlatform, setCaptionPlatform] = useState<Platform>("reels");
  const [tone, setTone] = useState<CaptionTone>("friendly");
  const [captionFormat, setCaptionFormat] = useState<CaptionFormat>("instagram");
  const [sponsoredOn, setSponsoredOn] = useState(false);
  const [sponsoredTalking, setSponsoredTalking] = useState("");
  const [sponsoredTags, setSponsoredTags] = useState("");
  const [sponsoredDisclosure, setSponsoredDisclosure] = useState("#ad");
  const [scriptTopic, setScriptTopic] = useState("");
  const [scriptFormat, setScriptFormat] = useState<ScriptFormat>("reel");
  const [scriptDurationSec, setScriptDurationSec] = useState(30);
  const [scriptTone, setScriptTone] = useState<CaptionTone>("friendly");
  const [repurposeTransform, setRepurposeTransform] = useState<RepurposeTransform>("script-to-linkedin");
  const [repurposeSourceText, setRepurposeSourceText] = useState("");
  const [repurposeError, setRepurposeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<Record<number, string>>({});
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [repurposePickId, setRepurposePickId] = useState("");

  const [batch, setBatch] = useState<Batch | null>(null);
  const [scriptDoc, setScriptDoc] = useState<ScriptDoc | null>(null);
  const [scriptSource, setScriptSource] = useState<Source>("template");
  const [scriptNote, setScriptNote] = useState<string | undefined>(undefined);
  const [scriptSaved, setScriptSaved] = useState(false);
  const [scriptSaveNote, setScriptSaveNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [modelState, setModelState] = useState<ModelState>(() => getModelState());
  const [modelError, setModelError] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudAiStatus | null>(null);

  // Brand Voice profile (3.2)
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [useProfile, setUseProfile] = useState(true);
  const nicheTouched = useRef(false);
  const audienceTouched = useRef(false);

  // Content library (3.8)
  const [libraryReady, setLibraryReady] = useState<boolean | null>(null);
  const [libraryItems, setLibraryItems] = useState<ContentItem[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<ContentItem[]>([]);
  const [migrationNote, setMigrationNote] = useState<string | null>(null);
  const migrationAttempted = useRef(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [ctaPicks, setCtaPicks] = useState<Record<number, string>>({});
  const [groupPicks, setGroupPicks] = useState<Record<number, string>>({});
  const [groupNames, setGroupNames] = useState<Record<number, string>>({});
  const [groupSaved, setGroupSaved] = useState<Record<number, boolean>>({});

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const resolvedProfile: BrandProfile | null = voiceReady && useProfile && activeProfile ? activeProfile : null;

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
    // Brand Voice profiles: no bar (and no behaviour change) until the server
    // reports voiceReady with an active profile.
    void fetchBrandProfiles()
      .then((result) => {
        setProfiles(result.profiles);
        setActiveProfileId(result.activeId);
        setVoiceReady(result.voiceReady);
        const active = result.profiles.find((p) => p.id === result.activeId) ?? null;
        if (active && result.voiceReady) {
          if (!nicheTouched.current) setNiche((prev) => (prev.trim() ? prev : (active.voice.niche ?? "")));
          if (!audienceTouched.current) setAudience((prev) => (prev.trim() ? prev : (active.voice.audience ?? "")));
        }
      })
      .catch(() => { /* profiles unavailable: generators behave exactly as before */ });
    // Content library + one-time draft migration.
    void (async () => {
      try {
        const list = await fetchContentItems();
        setLibraryReady(list.ready);
        setLibraryItems(list.items);
        if (!list.ready) return;
        try {
          const groups = await fetchContentItems("hashtag-group");
          if (groups.ready) setHashtagGroups(groups.items);
        } catch { /* groups are an extra; the library itself already loaded */ }
        const localDrafts = loadDrafts();
        if (!localDrafts.length || migrationAttempted.current) return;
        migrationAttempted.current = true;
        const inputs = planDraftMigration(localDrafts);
        const failed: Draft[] = [];
        let moved = 0;
        for (let i = 0; i < localDrafts.length; i++) {
          try {
            await createContentItem(inputs[i]!);
            moved += 1;
          } catch {
            failed.push(localDrafts[i]!);
          }
        }
        try {
          if (!failed.length) localStorage.removeItem(DRAFTS_KEY);
          else localStorage.setItem(DRAFTS_KEY, JSON.stringify(failed));
        } catch { /* storage unavailable: the in-memory list below still reflects the outcome */ }
        setDrafts(failed);
        if (moved > 0 && !failed.length) {
          setMigrationNote(`Moved ${moved} draft${moved === 1 ? "" : "s"} from this device into your library.`);
        } else if (moved > 0) {
          setMigrationNote(`Moved ${moved} draft${moved === 1 ? "" : "s"} from this device into your library. Some drafts could not be moved and stayed on this device.`);
        } else if (failed.length) {
          setMigrationNote("Some drafts could not be moved and stayed on this device.");
        }
        if (moved > 0) {
          try {
            const refreshed = await fetchContentItems();
            setLibraryItems(refreshed.items);
            setLibraryReady(refreshed.ready);
          } catch { /* keep the list already on screen */ }
        }
      } catch {
        setLibraryReady(false);
      }
    })();
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

  const generationDeps = () => ({
    runCloud: cloudOn ? runCloudModel : undefined,
    modelEnabled: modelReady,
    runModel: runLocalModel,
    profile: resolvedProfile,
  });

  const generate = async () => {
    if (tab === "repurpose" && !repurposeSourceText.trim()) {
      setRepurposeError("Add the source text you want to repurpose first.");
      return;
    }
    // Every generator needs its subject: without one the engines used to write literal
    // "your topic" content. And sponsored mode must never switch itself off silently —
    // a cleared disclosure used to drop ALL sponsored enforcement without a word.
    setFormError(null);
    if (tab === "scripts" && !scriptTopic.trim()) return setFormError("Add a topic for the script first.");
    if (tab === "hooks" && !topic.trim()) return setFormError("Add a topic for the hooks first.");
    if (tab === "ideas" && !niche.trim()) return setFormError("Add your niche or topic first.");
    if (tab === "captions" && !captionTopic.trim()) return setFormError("Add a topic for the captions first.");
    if (tab === "captions" && sponsoredOn && !sponsoredDisclosure.trim()) {
      return setFormError("Sponsored mode needs a disclosure line (for example #ad). Add one above, or turn Sponsored mode off.");
    }
    setRepurposeError(null);
    setBusy(true);
    try {
      if (tab === "scripts") {
        const outcome = await generateScriptContent(
          { topic: scriptTopic, format: scriptFormat, durationSec: scriptDurationSec, tone: scriptTone, profile: resolvedProfile },
          generationDeps(),
        );
        setScriptDoc(outcome.script);
        setScriptSource(outcome.source);
        setScriptNote(outcome.note);
        setScriptSaved(false);
        setScriptSaveNote(null);
        return;
      }
      const kind: GeneratorKind = tab;
      const input =
        tab === "ideas"
          ? { niche, platform: ideasPlatform, audience, count: ideasCount, category: ideaCategory, difficulty: ideaDifficulty, duration: ideaDuration, objective: ideaObjective, profile: resolvedProfile }
          : tab === "hooks"
            ? { topic, style: hookStyle, platform: hooksPlatform, count: hooksCount, profile: resolvedProfile }
            : tab === "repurpose"
              ? { transform: repurposeTransform, sourceText: repurposeSourceText, profile: resolvedProfile }
              : {
                  topic: captionTopic,
                  platform: captionPlatform,
                  tone,
                  format: captionFormat,
                  profile: resolvedProfile,
                  sponsored: ((): SponsoredInput | undefined => {
                    if (!sponsoredOn || !sponsoredDisclosure.trim()) return undefined;
                    return {
                      talkingPoints: sponsoredTalking.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                      requiredTags: sponsoredTags.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
                      disclosure: sponsoredDisclosure.trim(),
                    };
                  })(),
                };
      const outcome: GenerationOutcome = await generateContent(kind, input, generationDeps());
      setBatch({ kind, items: outcome.items, source: outcome.source, note: outcome.note });
      setSavedKeys(new Set());
      setCtaPicks({});
      setGroupPicks({});
      setGroupNames({});
      setGroupSaved({});
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((c) => (c === key ? null : c)), 1600);
    } catch { /* clipboard unavailable: the text stays selectable on screen */ }
  };

  const copy = async (key: string, item: GeneratedItem) => copyText(key, itemCopyText(item));

  const saveToLibrary = async (item: GeneratedItem, index: number) => {
    if (!batch) return;
    const key = `${batch.kind}-${index}`;
    if (libraryReady) {
      try {
        const created = await createContentItem({
          kind: generatorKindToContentKind(batch.kind),
          title: item.title.slice(0, 200),
          body: { item } as unknown as Record<string, unknown>,
          source: batch.source,
        });
        setLibraryItems((prev) => [created, ...prev]);
        setSavedKeys((prev) => new Set(prev).add(key));
        return;
      } catch { /* fall through to the on-device draft so nothing is lost */ }
    }
    setDrafts(addDraft({ kind: batch.kind, source: batch.source, item }));
    setSavedKeys((prev) => new Set(prev).add(key));
  };

  const saveScriptToLibrary = async () => {
    if (!scriptDoc) return;
    if (!libraryReady) {
      setScriptSaveNote("Your content library is pending a database update on the server, so this script cannot be saved there yet. Copy the script to keep it for now.");
      return;
    }
    try {
      const created = await createContentItem({
        kind: "script",
        title: scriptDoc.title.slice(0, 200),
        body: scriptDoc as unknown as Record<string, unknown>,
        source: scriptSource,
      });
      setLibraryItems((prev) => [created, ...prev]);
      setScriptSaved(true);
      setScriptSaveNote(null);
    } catch {
      setScriptSaveNote("This script could not be saved to your library. Copy the script to keep it for now.");
    }
  };

  const updateBatchItem = (index: number, next: GeneratedItem) => {
    setBatch((prev) => (prev ? { ...prev, items: prev.items.map((it, i) => (i === index ? next : it)) } : prev));
  };

  const appendCtaToItem = (index: number) => {
    if (!batch) return;
    const options = ctaOptions(resolvedProfile);
    const cta = ctaPicks[index] ?? options[0];
    if (!cta) return;
    updateBatchItem(index, appendCta(batch.items[index]!, cta));
  };

  const applyGroupToItem = (index: number) => {
    if (!batch) return;
    const group = hashtagGroups.find((g) => g.id === groupPicks[index]) ?? hashtagGroups[0];
    if (!group) return;
    updateBatchItem(index, applyTagGroup(batch.items[index]!, tagsFromGroupBody(group.body)));
  };

  const saveTagsAsGroup = async (index: number) => {
    if (!batch) return;
    const name = (groupNames[index] ?? "").trim();
    if (!name) return;
    try {
      const created = await createContentItem({
        kind: "hashtag-group",
        title: name,
        body: hashtagGroupBody(batch.items[index]!.hashtags ?? []) as unknown as Record<string, unknown>,
      });
      setHashtagGroups((prev) => [created, ...prev]);
      setGroupSaved((prev) => ({ ...prev, [index]: true }));
      setGroupError((prev) => ({ ...prev, [index]: "" }));
    } catch {
      // never silent: the button must not sit there looking identical after a failed save
      setGroupError((prev) => ({ ...prev, [index]: "Couldn't save that group — try again." }));
    }
  };

  const updateBeat = (index: number, field: "dialogue" | "onScreenText", value: string) => {
    setScriptDoc((prev) =>
      prev ? { ...prev, beats: prev.beats.map((b, i) => (i === index ? { ...b, [field]: value } : b)) } : prev,
    );
    setScriptSaved(false);
  };

  const deleteLibraryItem = async (id: string) => {
    try {
      await deleteContentItem(id);
    } catch {
      // the item stays on screen — removing it anyway would claim a delete that never happened
      setLibraryError("Couldn't delete that item — it is still saved. Try again.");
      return;
    }
    setLibraryError(null);
    setLibraryItems((prev) => prev.filter((it) => it.id !== id));
    setHashtagGroups((prev) => prev.filter((it) => it.id !== id));
  };

  const switchProfile = async (id: string) => {
    setActiveProfileId(id);
    try {
      await activateBrandProfile(id);
    } catch { /* the local selection still applies for this page until the server catches up */ }
  };

  const repurposeCandidates = libraryItems.filter((it) =>
    ["script", "caption", "hook", "idea", "repurpose"].includes(it.kind),
  );

  if (!signedIn) return <StudioShell><div className="px-4 sm:px-10 py-10 max-w-3xl mx-auto"><div className="h-40 rounded-xl bg-sand-100 animate-pulse" /></div></StudioShell>;

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-3xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Creator <em className="italic text-sand-600">Studio</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            Ideas, opening hooks, full scripts, captions and repurposing. Three writers, and every
            batch is labelled with the one that wrote it: the free AI (a full-size model on a
            server), an optional model on your own device, or templates — patterns built from your
            inputs, instant and offline, not a model.
          </p>
          <div className="mt-4">
            <a href="/create/chat" className={ghostBtn}>AI Studio Chat</a>
          </div>
        </div>

        {/* Free AI: shown only when this deployment has a provider key configured (status probed on load) */}
        {cloudOn && cloud ? (
          <section className="mt-8 rounded-xl border border-sand-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <h2 className="font-sora text-[15px] font-bold text-ink">Free AI</h2>
                <p className="mt-1 text-[13px] text-sand-700">
                  On for this site. {cloud.modelName} ({cloud.provider}) writes your batches — your
                  topic text is sent to {cloud.provider} when you generate.
                </p>
                <details className="mt-2 text-[13px] text-sand-700">
                  <summary className="cursor-pointer font-semibold text-sand-800">How it works</summary>
                  <p className="mt-1">
                    Nothing is downloaded to or run on your device. Generations are rate-limited per
                    account so the shared free service lasts. If the free AI is ever unavailable, the
                    template engine{modelReady ? " or the local model" : ""} steps in automatically —
                    the badge on every batch always says which one wrote it.
                  </p>
                </details>
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
                Runs entirely in this browser tab — nothing you type is sent to a server. One-time
                download of {LOCAL_MODEL.approxDownloadLabel}, then it is cached for next time. Off
                by default; the template engine works either way.
              </p>
              <details className="mt-2 text-[13px] text-sand-700">
                <summary className="cursor-pointer font-semibold text-sand-800">Model details</summary>
                <p className="mt-1">{LOCAL_MODEL.name} ({LOCAL_MODEL.id}), licence {LOCAL_MODEL.licence}.</p>
              </details>
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
            <p className="mt-3 text-[12px] text-sand-600">This browser can&apos;t run a local model. The template engine below works as normal.</p>
          ) : null}
          {modelState.status === "error" || modelError ? (
            <p className="mt-3 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">
              The local model could not be loaded{modelError ? `: ${modelError}` : modelState.status === "error" ? `: ${modelState.message}` : ""}. The template engine below works as normal.
            </p>
          ) : null}
        </section>

        {/* Brand Voice profile bar (3.2): only when the server has voice data and an active profile exists */}
        {voiceReady && activeProfile ? (
          <section className="mt-8 rounded-xl border border-sand-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-[13px] text-sand-800">
                Using profile: <span className="font-semibold text-ink">{activeProfile.name}</span>
              </p>
              <div>
                <label className={labelCls} htmlFor="g-profile">Profile</label>
                <select id="g-profile" className={inputCls} value={activeProfileId ?? ""} onChange={(e) => void switchProfile(e.target.value)}>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <a href="/brand" className={ghostBtn}>Edit in Brand Kit</a>
              <label className="flex items-center gap-2 text-[13px] text-sand-800">
                <input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} />
                Use my profile
                {!useProfile ? <span className="text-sand-600">Paused for this session</span> : null}
              </label>
            </div>
            {!useProfile ? (
              <p className="mt-3 text-[12px] text-sand-600">Paused for this session — generations below will not use your profile. Turn it back on at any time.</p>
            ) : null}
          </section>
        ) : null}

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
              <div><label className={labelCls} htmlFor="g-niche">Niche or topic</label><input id="g-niche" className={inputCls} value={niche} onChange={(e) => { nicheTouched.current = true; setNiche(e.target.value); }} placeholder="e.g. home workouts for busy parents" /></div>
              <div><label className={labelCls} htmlFor="g-audience">Audience</label><input id="g-audience" className={inputCls} value={audience} onChange={(e) => { audienceTouched.current = true; setAudience(e.target.value); }} placeholder="e.g. complete beginners" /></div>
              <div><label className={labelCls} htmlFor="g-iplatform">Platform</label><select id="g-iplatform" className={inputCls} value={ideasPlatform} onChange={(e) => setIdeasPlatform(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-icount">How many ideas</label><input id="g-icount" type="number" min={1} max={10} className={inputCls} value={ideasCount} onChange={(e) => setIdeasCount(Number(e.target.value))} /></div>
              <div><label className={labelCls} htmlFor="g-icategory">Category</label><select id="g-icategory" className={inputCls} value={ideaCategory} onChange={(e) => setIdeaCategory(e.target.value as IdeaCategory)}>{IDEA_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-idifficulty">Difficulty</label><select id="g-idifficulty" className={inputCls} value={ideaDifficulty} onChange={(e) => setIdeaDifficulty(e.target.value as IdeaDifficulty)}>{IDEA_DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-iduration">Duration</label><select id="g-iduration" className={inputCls} value={ideaDuration} onChange={(e) => setIdeaDuration(e.target.value as IdeaDuration)}>{IDEA_DURATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-iobjective">Objective</label><select id="g-iobjective" className={inputCls} value={ideaObjective} onChange={(e) => setIdeaObjective(e.target.value as IdeaObjective)}>{IDEA_OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
            </div>
          ) : tab === "hooks" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="g-topic">Topic</label><input id="g-topic" className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. morning routines" /></div>
              <div><label className={labelCls} htmlFor="g-style">Hook style</label><select id="g-style" className={inputCls} value={hookStyle} onChange={(e) => setHookStyle(e.target.value as HookStyle)}>{HOOK_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-hplatform">Platform</label><select id="g-hplatform" className={inputCls} value={hooksPlatform} onChange={(e) => setHooksPlatform(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-hcount">How many hooks</label><input id="g-hcount" type="number" min={1} max={10} className={inputCls} value={hooksCount} onChange={(e) => setHooksCount(Number(e.target.value))} /></div>
            </div>
          ) : tab === "scripts" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelCls} htmlFor="g-stopic">Topic</label><input id="g-stopic" className={inputCls} value={scriptTopic} onChange={(e) => setScriptTopic(e.target.value)} placeholder="e.g. morning routines" /></div>
              <div><label className={labelCls} htmlFor="g-sformat">Format</label><select id="g-sformat" className={inputCls} value={scriptFormat} onChange={(e) => setScriptFormat(e.target.value as ScriptFormat)}>{SCRIPT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-sduration">Duration</label><select id="g-sduration" className={inputCls} value={scriptDurationSec} onChange={(e) => setScriptDurationSec(Number(e.target.value))}>{SCRIPT_DURATIONS.map((d) => <option key={d.sec} value={d.sec}>{d.label}</option>)}</select></div>
              <div><label className={labelCls} htmlFor="g-stone">Tone</label><select id="g-stone" className={inputCls} value={scriptTone} onChange={(e) => setScriptTone(e.target.value as CaptionTone)}>{CAPTION_TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
            </div>
          ) : tab === "repurpose" ? (
            <div className="grid gap-4">
              <div><label className={labelCls} htmlFor="g-rtransform">Transform</label><select id="g-rtransform" className={inputCls} value={repurposeTransform} onChange={(e) => setRepurposeTransform(e.target.value as RepurposeTransform)}>{REPURPOSE_TRANSFORMS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
              {libraryReady && repurposeCandidates.length ? (
                <div><label className={labelCls} htmlFor="g-rpick">Start from a saved item</label><select id="g-rpick" className={inputCls} value={repurposePickId} onChange={(e) => { const id = e.target.value; setRepurposePickId(id); const found = repurposeCandidates.find((it) => it.id === id); if (found) { setRepurposeSourceText(extractItemText(found)); setRepurposeError(null); } }}><option value="">Choose a saved item…</option>{repurposeCandidates.map((it) => <option key={it.id} value={it.id}>{it.kind} · {it.title.slice(0, 80)}</option>)}</select></div>
              ) : null}
              <div><label className={labelCls} htmlFor="g-rsource">Source text</label><textarea id="g-rsource" className={inputCls} rows={8} value={repurposeSourceText} onChange={(e) => { setRepurposeSourceText(e.target.value); if (e.target.value.trim()) setRepurposeError(null); }} placeholder="Paste the script or post you want to repurpose" /></div>
              {repurposeError ? <p className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">{repurposeError}</p> : null}
            </div>
          ) : (
            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={labelCls} htmlFor="g-ctopic">Topic</label><input id="g-ctopic" className={inputCls} value={captionTopic} onChange={(e) => setCaptionTopic(e.target.value)} placeholder="e.g. our new bakery's sourdough" /></div>
                <div><label className={labelCls} htmlFor="g-tone">Tone</label><select id="g-tone" className={inputCls} value={tone} onChange={(e) => setTone(e.target.value as CaptionTone)}>{CAPTION_TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
                <div><label className={labelCls} htmlFor="g-cplatform">Platform</label><select id="g-cplatform" className={inputCls} value={captionPlatform} onChange={(e) => setCaptionPlatform(e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
                <div><label className={labelCls} htmlFor="g-cformat">Format</label><select id="g-cformat" className={inputCls} value={captionFormat} onChange={(e) => setCaptionFormat(e.target.value as CaptionFormat)}>{CAPTION_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-2 text-[13px] text-sand-800">
                  <input type="checkbox" checked={sponsoredOn} onChange={(e) => setSponsoredOn(e.target.checked)} />
                  Sponsored mode
                </label>
                {sponsoredOn ? (
                  <div className="mt-3 grid gap-4">
                    <div><label className={labelCls} htmlFor="g-spoints">Talking points (one per line)</label><textarea id="g-spoints" className={inputCls} rows={3} value={sponsoredTalking} onChange={(e) => setSponsoredTalking(e.target.value)} placeholder={"One required point per line"} /></div>
                    <div><label className={labelCls} htmlFor="g-stags">Required tags (space or comma separated)</label><input id="g-stags" className={inputCls} value={sponsoredTags} onChange={(e) => setSponsoredTags(e.target.value)} placeholder="e.g. #adpartner #brandname" /></div>
                    <div>
                      <label className={labelCls} htmlFor="g-sdisclosure">Disclosure text — goes in every caption</label>
                      <input id="g-sdisclosure" className={inputCls} value={sponsoredDisclosure} onChange={(e) => setSponsoredDisclosure(e.target.value)} placeholder="#ad" />
                      {!sponsoredDisclosure.trim() ? (
                        <p className="mt-1.5 text-[12px] font-medium text-obsidian">Sponsored mode is on but the disclosure is empty — generation will stop until you add one.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {formError ? <p role="alert" className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] font-medium text-obsidian">{formError}</p> : null}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button onClick={() => void generate()} disabled={busy} className={primaryBtn}>
              {busy ? "Working…" : cloudOn ? "Generate with free AI" : modelReady ? "Generate with local model" : "Generate"}
            </button>
            <span className="text-[12px] text-sand-600">
              {cloudOn
                ? "Written by the free AI."
                : modelReady
                  ? "Written by the on-device model."
                  : "Written by templates — instant, works offline."}
            </span>
          </div>
        </section>

        {/* Script results: a beat table, not item cards */}
        {tab === "scripts" && scriptDoc ? (
          <section className="mt-6 space-y-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-3">
              <SourceBadge source={scriptSource} />
              <p className="text-[12px] text-sand-600">{sourceNote(scriptSource)}</p>
            </div>
            {scriptNote ? (
              <p className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">{scriptNote}</p>
            ) : null}
            <h2 className="font-sora text-[15px] font-bold text-ink">{scriptDoc.title}</h2>
            <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-sand-200">
                    <th className="px-4 py-3 font-sora text-[12px] font-semibold text-sand-800">Timing</th>
                    <th className="px-4 py-3 font-sora text-[12px] font-semibold text-sand-800">Beat</th>
                    <th className="px-4 py-3 font-sora text-[12px] font-semibold text-sand-800">Dialogue</th>
                    <th className="px-4 py-3 font-sora text-[12px] font-semibold text-sand-800">On-screen text</th>
                    <th className="px-4 py-3 font-sora text-[12px] font-semibold text-sand-800">B-roll</th>
                  </tr>
                </thead>
                <tbody>
                  {scriptDoc.beats.map((beat, i) => (
                    <tr key={beat.index} className="border-b border-sand-200 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-sand-800">{fmtTime(beat.startSec)}–{fmtTime(beat.endSec)}</td>
                      <td className="px-4 py-3 font-medium text-ink">{beat.label}</td>
                      <td className="px-4 py-3"><textarea className={inputCls} rows={3} value={beat.dialogue} onChange={(e) => updateBeat(i, "dialogue", e.target.value)} aria-label={`Dialogue for beat ${i + 1}`} /></td>
                      <td className="px-4 py-3"><input className={inputCls} value={beat.onScreenText} onChange={(e) => updateBeat(i, "onScreenText", e.target.value)} aria-label={`On-screen text for beat ${i + 1}`} /></td>
                      <td className="px-4 py-3 text-sand-700">{beat.broll}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-5 space-y-2">
              <p className="text-[13px] text-sand-700"><span className="font-sora text-[12px] font-semibold text-sand-800">CTA: </span>{scriptDoc.cta}</p>
              <p className="text-[14px] font-medium text-ink whitespace-pre-line">{scriptDoc.caption}</p>
              {scriptDoc.hashtags.length ? <p className="text-[13px] text-sand-700">{scriptDoc.hashtags.join(" ")}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void copyText("script", scriptToText(scriptDoc))} className={ghostBtn}>{copiedId === "script" ? "Copied" : "Copy script"}</button>
              <button onClick={() => void saveScriptToLibrary()} disabled={scriptSaved} className={ghostBtn}>{scriptSaved ? "Saved" : "Save to library"}</button>
            </div>
            {scriptSaveNote ? <p className="text-[12px] text-sand-600">{scriptSaveNote}</p> : null}
          </section>
        ) : null}

        {/* Batch results (ideas / hooks / captions / repurpose) */}
        {tab !== "scripts" && batch ? (
          <section className="mt-6 space-y-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-3">
              <SourceBadge source={batch.source} />
              <p className="text-[12px] text-sand-600">{sourceNote(batch.source)}</p>
            </div>
            {batch.note ? (
              <p className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">{batch.note}</p>
            ) : null}
            {batch.kind === "captions" && !libraryReady ? (
              <p className="text-[12px] text-sand-600">Hashtag groups need your content library — a database update is pending on the server.</p>
            ) : null}
            {batch.items.map((item, i) => {
              const key = `${batch.kind}-${i}`;
              const isSaved = savedKeys.has(key);
              const ctaOpts = ctaOptions(resolvedProfile);
              return (
                <article key={key} className="rounded-xl border border-sand-200 bg-white p-5">
                  <p className="text-[14px] font-medium text-ink whitespace-pre-line">{item.title}</p>
                  {item.detail ? <p className="mt-1 text-[13px] text-sand-700">{item.detail}</p> : null}
                  {item.mechanism && i === 0 ? (
                    // the mechanism explains the chosen hook STYLE — it is identical on every
                    // card in the batch, so it is printed once, on the first card
                    <div className="mt-2">
                      <p className="font-sora text-[12px] font-semibold text-sand-800">Why this style works</p>
                      <p className="mt-1 text-[13px] text-sand-700">{item.mechanism}</p>
                    </div>
                  ) : null}
                  {item.hashtags?.length ? <p className="mt-2 text-[13px] text-sand-700">{item.hashtags.join(" ")}</p> : null}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void copy(key, item)} className={ghostBtn}>{copiedId === key ? "Copied" : "Copy"}</button>
                    <button onClick={() => void saveToLibrary(item, i)} disabled={isSaved} className={ghostBtn}>{isSaved ? "Saved" : "Save to library"}</button>
                  </div>
                  {batch.kind === "captions" ? (
                    <div className="mt-4 space-y-3 border-t border-sand-200 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={labelCls} htmlFor={`cta-${i}`}>Call to action</label>
                        <select id={`cta-${i}`} className={inputCls} value={ctaPicks[i] ?? ctaOpts[0] ?? ""} onChange={(e) => setCtaPicks((prev) => ({ ...prev, [i]: e.target.value }))}>
                          {ctaOpts.map((cta) => <option key={cta} value={cta}>{cta}</option>)}
                        </select>
                        <button onClick={() => appendCtaToItem(i)} className={ghostBtn}>Append CTA</button>
                      </div>
                      {libraryReady ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className={labelCls} htmlFor={`group-${i}`}>Hashtag group</label>
                            <select id={`group-${i}`} className={inputCls} value={groupPicks[i] ?? hashtagGroups[0]?.id ?? ""} onChange={(e) => setGroupPicks((prev) => ({ ...prev, [i]: e.target.value }))}>
                              {hashtagGroups.length ? hashtagGroups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>) : <option value="">No groups saved yet</option>}
                            </select>
                            <button onClick={() => applyGroupToItem(i)} disabled={!hashtagGroups.length} className={ghostBtn}>Apply group</button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className={labelCls} htmlFor={`group-name-${i}`}>Save tags as group</label>
                            <input id={`group-name-${i}`} className={inputCls} value={groupNames[i] ?? ""} onChange={(e) => setGroupNames((prev) => ({ ...prev, [i]: e.target.value }))} placeholder="Group name" />
                            <button onClick={() => void saveTagsAsGroup(i)} disabled={!!groupSaved[i] || !(groupNames[i] ?? "").trim()} className={ghostBtn}>{groupSaved[i] ? "Saved" : "Save tags as group"}</button>
                            {groupError[i] ? <span role="alert" className="text-[12px] font-medium text-obsidian">{groupError[i]}</span> : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : null}

        {/* Library (3.8): server items when ready; local drafts + pending note when not */}
        <section className="mt-10">
          <h2 className="font-sora text-[15px] font-bold text-ink">Your library</h2>
          {migrationNote ? <p className="mt-1 text-[13px] text-sand-700">{migrationNote}</p> : null}
          {libraryError ? <p role="alert" className="mt-1 text-[13px] font-medium text-obsidian">{libraryError}</p> : null}
          {libraryReady === null ? (
            <p className="mt-3 text-[13px] text-sand-600">Loading your library…</p>
          ) : libraryReady ? (
            libraryItems.length ? (
              <div className="mt-4 space-y-3">
                {libraryItems.map((libItem) => {
                  const display = libraryDisplay(libItem);
                  const summary = libItem.kind === "script" ? scriptSummary(libItem) : null;
                  return (
                    <article key={libItem.id} className="rounded-xl border border-sand-200 bg-white p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <SourceBadge source={asSource(libItem.source)} />
                        <span className="text-[11px] uppercase tracking-wide text-sand-500">{libItem.kind}</span>
                      </div>
                      <p className="mt-2 text-[14px] font-medium text-ink whitespace-pre-line">{display.title}</p>
                      {summary ? <p className="mt-1 text-[13px] text-sand-700">{summary}</p> : display.detail ? <p className="mt-1 text-[13px] text-sand-700">{display.detail}</p> : null}
                      {!summary && display.hashtags?.length ? <p className="mt-2 text-[13px] text-sand-700">{display.hashtags.join(" ")}</p> : null}
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => void copyText(`lib-${libItem.id}`, extractItemText(libItem))} className={ghostBtn}>{copiedId === `lib-${libItem.id}` ? "Copied" : "Copy"}</button>
                        <button onClick={() => void deleteLibraryItem(libItem.id)} className={ghostBtn}>Delete</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-sand-600">Nothing saved yet. Generate a batch and save the ones you like.</p>
            )
          ) : (
            <>
              <p className="mt-1 text-[13px] text-sand-700">
                Drafts are stored on this device only, in this browser. They are not uploaded or synced, and there is no
                shared library yet.
              </p>
              <p className="mt-1 text-[13px] text-sand-700">
                Your server library is pending a database update — once it is applied, saved items will live in your library instead of only on this device.
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
            </>
          )}
        </section>
      </div>
    </StudioShell>
  );
}
