"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaptionDocSchema, ProjectSettingsSchema, type CaptionDoc, type CaptionStyleV2, type ProjectSettings } from "@capseasy/shared";
import { applyLook, getLook, resolveStyle, type LookDefinition } from "@capseasy/templates";
import { hasActiveSession } from "@/features/transcribe/session";
import { RevisionConflict, studioService, type StudioData } from "@/services/studio";

export type SaveState = "saved" | "dirty" | "saving" | "offline" | "conflict";
export const DEFAULT_LOOK = "hormozi_box";

const SAVE_DEBOUNCE_MS = 800;
const HISTORY_LIMIT = 200;

/**
 * Single source of truth for the editor: server data (polled while a job runs), the locally edited caption
 * document with autosave + undo/redo + conflict handling, and the project's style/settings.
 */
export function useStudio(projectId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["studio", projectId],
    queryFn: async () => {
      // polls say which document revision they already have, so an unchanged document isn't downloaded again
      const prev = qc.getQueryData<StudioData>(["studio", projectId]);
      const next = await studioService.getStudio(projectId, prev?.document.doc ? prev.document.revision : undefined);
      return next.document.unchanged && prev ? { ...next, document: prev.document } : next;
    },
    // a copy prefetched from the dashboard shows at once and is refreshed behind it
    refetchOnMount: "always",
    // poll while processing, or while waiting for the very first document to appear; slower the longer it waits
    // (a job waiting for a desktop helper can sit queued for hours in a forgotten tab). Hidden tabs don't poll.
    refetchInterval: (q) => {
      const d = q.state.data as StudioData | undefined;
      if (!d) return false;
      // a run in this tab reports its own progress; the studio is refetched when it ends
      if (hasActiveSession(projectId)) return false;
      // a failed job waits for the user (Retry), not for the server: no polling for it
      const job = d.job && (d.job.status === "queued" || d.job.status === "processing") ? d.job : null;
      if (!job) return !d.job && d.video && !d.document.doc && !d.canTranscribe ? 8000 : false;
      const ageS = (Date.now() - new Date(job.created_at).getTime()) / 1000;
      if (job.status === "queued" && ageS > 60) return 30_000;
      return ageS < 120 ? 2500 : ageS < 600 ? 8000 : 30_000;
    },
    refetchIntervalInBackground: false,
  });
  const data = query.data;

  // ---------- caption document
  const [doc, setDocState] = useState<CaptionDoc | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<{ revision: number; doc: CaptionDoc } | null>(null);
  const docRef = useRef<CaptionDoc | null>(null);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const inflightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);
  /**
   * ONE undo history for the whole editor (owner bug 2026-11-10: "undo/redo kaam nahi kar raha").
   * A snapshot captures the caption doc AND the style/settings/look, so Ctrl+Z and the toolbar
   * buttons cover template picks, style tweaks, overlay add/move/delete and adjust sliders —
   * not just word edits. Snapshots hold references only; every store in this hook is updated
   * immutably, so a stored reference can never be mutated behind history's back.
   */
  interface Snapshot {
    doc: CaptionDoc | null;
    style: CaptionStyleV2 | null;
    settings: ProjectSettings;
    lookId: string | null;
  }
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const [, bump] = useState(0);
  // style/settings refs are declared in their section below; history helpers read them at call
  // time (same call-time-binding pattern flush() already uses for conflictRef).
  const snapNow = (): Snapshot => ({ doc: docRef.current, style: styleRef.current, settings: settingsRef.current, lookId: lookRef.current });
  /** Record the current state as one undo step. Actions sharing a coalesceKey within 600 ms
   *  collapse into a single step (typing, slider drags). Any real action clears the redo stack. */
  const recordHistory = (coalesceKey?: string) => {
    const now = Date.now();
    const coalesce = coalesceKey && lastKey.current?.key === coalesceKey && now - lastKey.current.at < 600;
    if (!coalesce) {
      past.current.push(snapNow());
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    lastKey.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    future.current = [];
  };

  // adopt the server document when we have none yet, or when a newer one arrives and nothing has been edited here
  // (opening from a prefetched copy must never leave the editor on an older revision); never overwrite local edits
  useEffect(() => {
    if (!data?.document.doc) return;
    if (docRef.current && (dirtyRef.current || inflightRef.current || past.current.length > 0 || data.document.revision <= revisionRef.current)) return;
    const parsed = CaptionDocSchema.safeParse(data.document.doc);
    if (!parsed.success) return;
    docRef.current = parsed.data;
    revisionRef.current = data.document.revision;
    setDocState(parsed.data);
  }, [data?.document.doc, data?.document.revision]);

  const flush = useCallback(async () => {
    if (inflightRef.current || !dirtyRef.current || !docRef.current) return;
    inflightRef.current = true;
    const sending = docRef.current;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      revisionRef.current = await studioService.saveDocument(projectId, revisionRef.current, sending);
      retryRef.current = 0;
      setSaveState(dirtyRef.current ? "dirty" : "saved");
    } catch (e) {
      dirtyRef.current = true;
      if (e instanceof RevisionConflict) {
        setConflict(e.server);
        setSaveState("conflict");
      } else {
        setSaveState("offline");
        const delay = Math.min(15000, 2000 * 2 ** retryRef.current++);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void flush();
        }, delay);
      }
    } finally {
      inflightRef.current = false;
      if (dirtyRef.current && !timerRef.current && !conflictRef.current) timerRef.current = setTimeout(() => { timerRef.current = null; void flush(); }, SAVE_DEBOUNCE_MS);
    }
  }, [projectId]);
  const conflictRef = useRef<typeof conflict>(null);
  conflictRef.current = conflict;

  /** Resolves once every local edit is on the server (or gives up after 15 s). Used before exporting. */
  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (conflictRef.current) throw new Error("Resolve the editing conflict first.");
      if (dirtyRef.current && !inflightRef.current) await flush();
      if (!dirtyRef.current && !inflightRef.current) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Could not save your latest edits. Check your connection and try again.");
  }, [flush]);

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    setSaveState((s) => (s === "conflict" ? s : "dirty"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  /** Apply a caption-doc edit as one undo step (see recordHistory for coalescing). */
  const edit = useCallback(
    (fn: (d: CaptionDoc) => CaptionDoc, opts: { coalesceKey?: string } = {}) => {
      const cur = docRef.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      recordHistory(opts.coalesceKey);
      docRef.current = next;
      setDocState(next);
      schedule();
    },
    [schedule],
  );

  /** Restore one snapshot across all four stores; saves whichever side actually changed. */
  const restoreSnapshot = (snap: Snapshot) => {
    if (snap.doc && snap.doc !== docRef.current) {
      docRef.current = snap.doc;
      setDocState(snap.doc);
      schedule();
    }
    if (snap.style !== styleRef.current || snap.settings !== settingsRef.current || snap.lookId !== lookRef.current) {
      styleRef.current = snap.style;
      settingsRef.current = snap.settings;
      lookRef.current = snap.lookId;
      setStyleState(snap.style);
      setSettingsState(snap.settings);
      setLookId(snap.lookId);
      persist();
    }
  };

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(snapNow());
    restoreSnapshot(prev);
    lastKey.current = null;
    bump((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snapNow());
    restoreSnapshot(next);
    lastKey.current = null;
    bump((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const resolveConflict = useCallback(
    (choice: "mine" | "theirs") => {
      const c = conflictRef.current;
      if (!c) return;
      revisionRef.current = c.revision;
      if (choice === "theirs") {
        docRef.current = c.doc;
        setDocState(c.doc);
        past.current = [];
        future.current = [];
        dirtyRef.current = false;
        setSaveState("saved");
      } else {
        dirtyRef.current = true;
      }
      setConflict(null);
      conflictRef.current = null;
      if (choice === "mine") void flush();
    },
    [flush],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || inflightRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ---------- style + settings (persisted on the project)
  const [style, setStyleState] = useState<CaptionStyleV2 | null>(null);
  const [settings, setSettingsState] = useState<ProjectSettings>(() => ProjectSettingsSchema.parse({}));
  const [lookId, setLookId] = useState<string | null>(null);
  const styleRef = useRef<CaptionStyleV2 | null>(null);
  const settingsRef = useRef(settings);
  const lookRef = useRef<string | null>(null);
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialised = useRef(false);

  const persist = useCallback(() => {
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(() => {
      const s = styleRef.current;
      if (!s) return;
      studioService
        .savePatch(projectId, { style_json: s, settings_json: settingsRef.current, look_id: lookRef.current, template_id: s.templateId })
        .catch(() => setSaveState("offline"));
    }, SAVE_DEBOUNCE_MS);
  }, [projectId]);

  useEffect(() => {
    if (initialised.current || !data) return;
    initialised.current = true;
    const p = data.project;
    const parsedSettings = ProjectSettingsSchema.parse(p.settings_json ?? {});
    let s: CaptionStyleV2;
    let sett = parsedSettings;
    let look = p.look_id;
    if (p.style_json) {
      s = resolveStyle(p.style_json);
    } else {
      // first open: start from the default look so the very first preview already looks great
      const l = getLook(DEFAULT_LOOK)!;
      const applied = applyLook(l);
      s = applied.style;
      sett = ProjectSettingsSchema.parse({ ...parsedSettings, ...applied.settings });
      look = l.id;
    }
    styleRef.current = s;
    settingsRef.current = sett;
    lookRef.current = look;
    setStyleState(s);
    setSettingsState(sett);
    setLookId(look);
    if (!p.style_json) persist();
  }, [data, persist]);

  const chooseLook = useCallback(
    (look: LookDefinition) => {
      const applied = applyLook(look, settingsRef.current?.maxWordsPerCard);
      const sett = ProjectSettingsSchema.parse({ ...settingsRef.current, ...applied.settings });
      // re-picking the look already in effect (with no tweaks since) is not an undoable action
      if (look.id === lookRef.current && JSON.stringify(applied.style) === JSON.stringify(styleRef.current) && JSON.stringify(sett) === JSON.stringify(settingsRef.current)) return;
      recordHistory();
      styleRef.current = applied.style;
      settingsRef.current = sett;
      lookRef.current = look.id;
      setStyleState(applied.style);
      setSettingsState(sett);
      setLookId(look.id);
      persist();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist],
  );

  const patchStyle = useCallback(
    (fn: (s: CaptionStyleV2) => CaptionStyleV2) => {
      if (!styleRef.current) return;
      const next = resolveStyle(fn(styleRef.current));
      if (JSON.stringify(next) === JSON.stringify(styleRef.current)) return;
      // slider drags and colour wells fire continuously: one undo step per burst, not per tick
      recordHistory("style");
      styleRef.current = next;
      setStyleState(next);
      persist();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist],
  );

  const patchSettings = useCallback(
    (patch: Partial<ProjectSettings>) => {
      // a patch that changes nothing (e.g. an overlay drag clamped to zero) earns no undo step
      const cur = settingsRef.current;
      const changed = Object.entries(patch).some(([k, v]) => JSON.stringify(cur[k as keyof ProjectSettings]) !== JSON.stringify(v));
      if (!changed) return;
      const next = ProjectSettingsSchema.parse({ ...settingsRef.current, ...patch });
      // coalesce per patched key set: an adjust-slider drag (same keys, many ticks) is one step,
      // while a different control touched right after stays its own step
      recordHistory(`settings:${Object.keys(patch).sort().join(",")}`);
      settingsRef.current = next;
      setSettingsState(next);
      persist();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist],
  );

  /** A new video replaced the old one: its captions are gone on the server, drop them here too (no save, no undo). */
  const resetDoc = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    docRef.current = null;
    revisionRef.current = 0;
    dirtyRef.current = false;
    past.current = [];
    future.current = [];
    lastKey.current = null;
    setConflict(null);
    setSaveState("saved");
    setDocState(null);
  }, []);

  const rename = useCallback(
    async (title: string) => {
      await studioService.savePatch(projectId, { title });
      await qc.invalidateQueries({ queryKey: ["studio", projectId] });
    },
    [projectId, qc],
  );

  return useMemo(
    () => ({
      query, data, doc, style, settings, lookId, saveState, conflict,
      canUndo: past.current.length > 0, canRedo: future.current.length > 0,
      edit, undo, redo, resolveConflict, chooseLook, patchStyle, patchSettings, rename, resetDoc,
      refetch: () => qc.invalidateQueries({ queryKey: ["studio", projectId] }),
      saveNow,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, data, doc, style, settings, lookId, saveState, conflict, edit, undo, redo, resolveConflict, chooseLook, patchStyle, patchSettings, rename, resetDoc, saveNow],
  );
}
