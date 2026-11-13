"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import PrompterRecorder from "@/features/prompter/PrompterRecorder";
import { fetchContentItems, type ContentItem } from "@/features/create/library";
import {
  COUNTDOWN_OPTIONS,
  DEFAULT_PROMPTER_SETTINGS,
  FONT,
  NUDGE_PX,
  PROMPTER_SHORTCUTS,
  SPEAKING_WPM,
  SPEED,
  advanceOffset,
  clampOffset,
  clampSettings,
  estimatedReadSeconds,
  estimatedSecondsRemaining,
  keyActionFor,
  maxScrollOffset,
  prompterTextForScriptItem,
  scrollProgress,
  wordCount,
  type PrompterPosition,
  type PrompterSettings,
} from "@/features/prompter/model";

const inputCls =
  "w-full rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-sand-600";
const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";
const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";
const sectionTitleCls = "font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600";
const cardCls = "rounded-xl border border-sand-200 bg-white p-5";

/** Reading mode raises the effective font floor to this size (the stored setting is untouched). */
const READING_MODE_FONT_FLOOR = 32;

const POSITION_OPTIONS: readonly { value: PrompterPosition; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

function formatReadEstimate(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} seconds`;
  const minutes = totalSeconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} minutes`;
}

/**
 * Teleprompter (Phase 7, slice 7.2): a full reading stage for a script —
 * imported verbatim from a saved Script Studio script or pasted in — with
 * adjustable scroll speed, font size and text position, mirror mode, a
 * pre-roll countdown, pause/resume and documented keyboard controls.
 *
 * The prompter itself only displays and scrolls text. Recording is the
 * separate, optional section below the shortcuts (features/prompter/
 * PrompterRecorder): it uses the camera on-device only, and a take leaves
 * this page only when the user opens it as a project.
 */
export default function PrompterPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  // Source
  const [scripts, setScripts] = useState<ContentItem[]>([]);
  const [scriptsReady, setScriptsReady] = useState(true);
  const [scriptsLoading, setScriptsLoading] = useState(true);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");

  // Stage
  const [text, setText] = useState("");
  const [settings, setSettings] = useState<PrompterSettings>(DEFAULT_PROMPTER_SETTINGS);
  const [playing, setPlaying] = useState(false);
  const [offset, setOffset] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [readingMode, setReadingMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dims, setDims] = useState({ contentHeight: 0, viewportHeight: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const settingsRef = useRef(settings);
  const dimsRef = useRef(dims);

  const hasText = text.length > 0;
  const counting = countdown !== null;
  const effectiveFontSize = readingMode ? Math.max(settings.fontSizePx, READING_MODE_FONT_FLOOR) : settings.fontSizePx;
  const fontFloor = readingMode ? READING_MODE_FONT_FLOOR : FONT.min;
  const maxOffset = maxScrollOffset(dims.contentHeight, dims.viewportHeight);
  const progress = scrollProgress(offset, dims.contentHeight, dims.viewportHeight);
  const finished = hasText && maxOffset > 0 && offset >= maxOffset;
  const words = wordCount(text);
  const readSeconds = estimatedReadSeconds(text, settings);
  const secondsLeft = estimatedSecondsRemaining(offset, dims.contentHeight, dims.viewportHeight, settings.speedPxPerSec);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  // Saved Script Studio scripts (content library, kind "script"). ready:false
  // is the honest pending-setup state: the picker is disabled, pasting still works.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetchContentItems("script")
      .then((list) => {
        if (!live) return;
        setScriptsReady(list.ready);
        setScripts(list.items);
      })
      .catch(() => {
        if (!live) return;
        setScriptsReady(false);
        setScripts([]);
      })
      .finally(() => {
        if (live) setScriptsLoading(false);
      });
    return () => { live = false; };
  }, [signedIn]);

  /* ------------------------------ offset plumbing ----------------------------- */

  const updateOffset = (next: number) => {
    offsetRef.current = next;
    setOffset(next);
  };

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { dimsRef.current = dims; }, [dims]);

  const measure = () => {
    const viewport = stageRef.current?.clientHeight ?? 0;
    const content = contentRef.current?.offsetHeight ?? 0;
    setDims((cur) => (cur.contentHeight === content && cur.viewportHeight === viewport ? cur : { contentHeight: content, viewportHeight: viewport }));
  };

  useEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    if (stageRef.current) observer.observe(stageRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
    // contentRef's node changes with the loaded text, so re-observe then
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, effectiveFontSize, settings.position, readingMode]);

  // Keep the offset inside the scrollable range when measurements shrink.
  useEffect(() => {
    const clamped = clampOffset(offsetRef.current, dims.contentHeight, dims.viewportHeight);
    if (clamped !== offsetRef.current) updateOffset(clamped);
  }, [dims]);

  /* --------------------------------- playback -------------------------------- */

  // Scroll loop: one rAF chain while playing and not counting down. The
  // offset lives in state (updated at most once per frame) and is applied
  // as a translateY transform on the content.
  useEffect(() => {
    if (!playing || counting || !hasText) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      const { contentHeight, viewportHeight } = dimsRef.current;
      const max = maxScrollOffset(contentHeight, viewportHeight);
      const advanced = advanceOffset(offsetRef.current, elapsed, settingsRef.current, true);
      if (max === 0) {
        // the script fits the screen: nothing can scroll, and without this stop the loop
        // ran forever with Play stuck on (the end-check below requires max > 0)
        setPlaying(false);
        return;
      }
      if (advanced >= max) {
        updateOffset(max);
        setPlaying(false);
        return;
      }
      updateOffset(clampOffset(advanced, contentHeight, viewportHeight));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, counting, hasText]);

  // Countdown: 1s ticks while a countdown is showing; reaching the last
  // second clears it, which lets the scroll loop start.
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => {
      setCountdown((cur) => (cur === null || cur <= 1 ? null : cur - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [counting]);

  const startPlay = () => {
    if (!hasText) return;
    const { contentHeight, viewportHeight } = dimsRef.current;
    // A script that fits the screen has nothing to scroll — Play is a no-op there, and
    // the controls say so instead of starting a scroll that can never end.
    if (maxScrollOffset(contentHeight, viewportHeight) === 0) return;
    if (offsetRef.current >= maxScrollOffset(contentHeight, viewportHeight)) {
      updateOffset(0); // at the end: Play starts over
    }
    if (offsetRef.current === 0 && settings.countdownSec > 0) {
      setCountdown(settings.countdownSec);
    }
    setPlaying(true);
  };

  const togglePlay = () => {
    if (countdown !== null) {
      // Pausing during the countdown cancels it.
      setCountdown(null);
      setPlaying(false);
      return;
    }
    if (playing) {
      setPlaying(false);
      return;
    }
    startPlay();
  };

  const restart = () => {
    setCountdown(null);
    setPlaying(false);
    updateOffset(0);
  };

  /* ---------------------------------- sources --------------------------------- */

  const loadText = (nextText: string, note: string | null) => {
    setText(nextText);
    setLoadedNote(note);
    setSourceError(null);
    restart();
  };

  const chooseScript = (id: string) => {
    setSelectedScriptId(id);
    const item = scripts.find((s) => s.id === id);
    if (!item) return;
    const imported = prompterTextForScriptItem(item);
    if (imported === null) {
      setSourceError("That saved item could not be read as a script. So nothing was loaded.");
      return;
    }
    loadText(imported, `Loaded from Script Studio: ${item.title}`);
  };

  const usePastedText = () => {
    if (!pasteText.trim()) return;
    setSelectedScriptId("");
    loadText(pasteText, "Loaded from pasted text.");
  };

  /* --------------------------------- settings --------------------------------- */

  const updateSettings = (patch: Partial<PrompterSettings>) =>
    setSettings((cur) => clampSettings({ ...cur, ...patch }));

  /* -------------------------------- fullscreen -------------------------------- */

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stageRef.current?.requestFullscreen();
    }
  };

  /* --------------------------------- keyboard --------------------------------- */

  // Re-registered every render so the handler always sees current state.
  // Events from form fields are ignored — the paste box, sliders and the
  // script picker keep their normal behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      const action = keyActionFor(e);
      if (!action) return;
      switch (action) {
        case "toggle-play":
          e.preventDefault();
          togglePlay();
          break;
        case "speed-up":
          e.preventDefault();
          updateSettings({ speedPxPerSec: settings.speedPxPerSec + SPEED.step });
          break;
        case "speed-down":
          e.preventDefault();
          updateSettings({ speedPxPerSec: settings.speedPxPerSec - SPEED.step });
          break;
        case "nudge-down":
          e.preventDefault();
          updateOffset(clampOffset(offsetRef.current + NUDGE_PX, dimsRef.current.contentHeight, dimsRef.current.viewportHeight));
          break;
        case "nudge-up":
          e.preventDefault();
          updateOffset(clampOffset(offsetRef.current - NUDGE_PX, dimsRef.current.contentHeight, dimsRef.current.viewportHeight));
          break;
        case "restart":
          e.preventDefault();
          restart();
          break;
        case "exit":
          // The browser leaves full screen on Escape natively; this covers
          // stages fullscreened by other means and keeps the action wired.
          if (document.fullscreenElement) void document.exitFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const alignClass = settings.position === "left" ? "mr-auto" : settings.position === "right" ? "ml-auto" : "mx-auto";

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Tele<em className="italic text-sand-600">prompter</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            Read a script at your pace. Bring one in from Script Studio, or paste your own text. Then set the scroll speed, size and position, and press play.
          </p>
          <details className="mt-3 max-w-[68ch] rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
            <summary className="cursor-pointer font-semibold">About the optional record mode</summary>
            <p className="mt-1.5">
              The Teleprompter only displays your text and scrolls it. To film yourself reading, the optional record mode uses your camera entirely on this device. Nothing is uploaded.
            </p>
          </details>
        </div>

        {/* -------------------------------------------------- Source */}
        <section className="pt-10" aria-label="Script source">
          <h2 className={sectionTitleCls}>Your script</h2>
          <div className={`${cardCls} mt-4 space-y-5`}>
            <div>
              <label className={labelCls} htmlFor="prompter-script-picker">
                Saved script
              </label>
              <select
                id="prompter-script-picker"
                className={`${inputCls} mt-1`}
                value={selectedScriptId}
                disabled={!scriptsReady || scriptsLoading || scripts.length === 0}
                onChange={(e) => chooseScript(e.target.value)}
              >
                <option value="">
                  {scriptsLoading ? "Loading your saved scripts…" : scripts.length === 0 ? "No saved scripts" : "Choose a saved script…"}
                </option>
                {scripts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title || "(untitled script)"}
                  </option>
                ))}
              </select>
              {!scriptsReady ? (
                <p role="status" className="mt-2 text-[13px] leading-relaxed text-sand-700">
                  Your content library is not set up on the server yet — a database update is
                  pending, so saved scripts can&apos;t be loaded until then. Pasting your own
                  text below still works.
                </p>
              ) : !scriptsLoading && scripts.length === 0 ? (
                <p className="mt-2 text-[13px] leading-relaxed text-sand-700">
                  No saved scripts yet. Scripts are made in Creator Studio → Script Studio —{" "}
                  <Link href="/create" className="font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink">
                    open Creator Studio
                  </Link>
                  .
                </p>
              ) : null}
            </div>

            <div className="border-t border-sand-200 pt-5">
              <label className={labelCls} htmlFor="prompter-paste">
                Paste your own
              </label>
              <textarea
                id="prompter-paste"
                className={`${inputCls} mt-1`}
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the text you want to read…"
              />
              <div className="mt-3">
                <button type="button" className={primaryBtn} disabled={!pasteText.trim()} onClick={usePastedText}>
                  Use this text
                </button>
              </div>
            </div>

            {loadedNote ? <p role="status" className="text-[13px] font-medium text-sand-800">{loadedNote}</p> : null}
            {sourceError ? <p role="alert" className="text-[13px] font-medium text-obsidian">{sourceError}</p> : null}
          </div>
        </section>

        {/* -------------------------------------------------- Stage */}
        <section className="pt-10" aria-label="Prompter stage">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={sectionTitleCls}>Stage</h2>
            {hasText ? (
              <p className="text-[13px] tabular-nums text-sand-700">
                {words} words · about {formatReadEstimate(readSeconds)} at a typical speaking pace ({SPEAKING_WPM} words per minute)
                {maxOffset > 0 ? <> · about {secondsLeft}s of scrolling left</> : null}
              </p>
            ) : null}
          </div>

          <div
            ref={stageRef}
            className={`relative mt-4 overflow-hidden rounded-xl bg-[#0B0B0A] ring-1 ring-sand-200 ${readingMode ? "h-[72vh]" : "h-[55vh] sm:h-[60vh]"}`}
          >
            {hasText ? (
              <div ref={contentRef} style={{ transform: `translateY(${-offset}px)` }}>
                <div
                  className={`${alignClass} max-w-[880px] px-6 py-14 sm:px-10`}
                  style={{
                    textAlign: settings.position,
                    transform: settings.mirror ? "scaleX(-1)" : undefined,
                  }}
                >
                  <p
                    className="whitespace-pre-wrap break-words font-medium text-obsidian"
                    style={{ fontSize: `${effectiveFontSize}px`, lineHeight: 1.45 }}
                  >
                    {text}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center">
                <p className="max-w-md text-[16px] leading-relaxed text-sand-600">
                  Pick a saved script or paste your own text to start.
                </p>
              </div>
            )}

            {counting ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" aria-live="polite">
                <span className="font-sora text-[96px] font-bold tabular-nums text-obsidian">{countdown}</span>
              </div>
            ) : null}

            {finished && !counting ? (
              <div className="absolute inset-x-0 bottom-8 z-10 flex items-center justify-center gap-3">
                <span className="rounded-full bg-black/70 px-4 py-2 font-sora text-[13px] font-semibold text-obsidian">
                  End of script
                </span>
                <button type="button" className={primaryBtn} onClick={restart}>
                  Restart
                </button>
              </div>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 h-1 bg-sand-300/40" aria-hidden>
              <div className="h-full bg-orange-accent transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>

          {/* -------------------------------------------------- Controls */}
          <div className={`${cardCls} mt-4`}>
            <div className={`flex items-end gap-x-5 gap-y-4 ${readingMode ? "flex-nowrap overflow-x-auto pb-1" : "flex-wrap"}`}>
              <div className="flex shrink-0 gap-2">
                <button type="button" className={primaryBtn} disabled={!hasText || (maxOffset === 0 && !playing && !counting)} onClick={togglePlay}>
                  {counting ? "Cancel countdown" : playing ? "Pause" : "Play"}
                </button>
                <button type="button" className={ghostBtn} disabled={!hasText} onClick={restart}>
                  Restart
                </button>
                {hasText && maxOffset === 0 ? (
                  <span className="self-center text-[12px] text-sand-600">This script fits the screen — nothing to scroll.</span>
                ) : null}
              </div>

              <label className={`${labelCls} w-40 shrink-0`}>
                Speed — {settings.speedPxPerSec} px/s
                <input
                  type="range"
                  className="mt-1 w-full"
                  min={SPEED.min}
                  max={SPEED.max}
                  step={SPEED.step}
                  value={settings.speedPxPerSec}
                  onChange={(e) => updateSettings({ speedPxPerSec: Number(e.target.value) })}
                />
                <span className="mt-0.5 flex justify-between text-[11px] font-medium normal-case tracking-normal text-sand-600">
                  <span>Slow</span>
                  <span>Fast</span>
                </span>
              </label>

              <label className={`${labelCls} w-40 shrink-0`}>
                Font size — {effectiveFontSize}px
                <input
                  type="range"
                  className="mt-1 w-full"
                  min={fontFloor}
                  max={FONT.max}
                  step={FONT.step}
                  value={effectiveFontSize}
                  onChange={(e) => updateSettings({ fontSizePx: Number(e.target.value) })}
                />
              </label>

              <div className="shrink-0">
                <span className={labelCls}>Text position</span>
                <div className="mt-1 flex rounded-full border border-sand-300 p-1" role="group" aria-label="Text position">
                  {POSITION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={settings.position === option.value}
                      onClick={() => updateSettings({ position: option.value })}
                      className={`rounded-full px-3.5 py-1.5 font-sora text-[12px] font-semibold transition-colors cursor-pointer ${settings.position === option.value ? "bg-ink text-dune-white" : "text-sand-700 hover:text-ink"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className={`${labelCls} w-32 shrink-0`}>
                Countdown
                <select
                  className={`${inputCls} mt-1`}
                  value={settings.countdownSec}
                  onChange={(e) => updateSettings({ countdownSec: Number(e.target.value) })}
                >
                  {COUNTDOWN_OPTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec === 0 ? "Off" : `${sec} seconds`}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={ghostBtn}
                  aria-pressed={settings.mirror}
                  onClick={() => updateSettings({ mirror: !settings.mirror })}
                  title="Flip the script text left-right. For reading through a mirror or teleprompter glass."
                >
                  Flip text {settings.mirror ? "on" : "off"}
                </button>
                <button
                  type="button"
                  className={ghostBtn}
                  aria-pressed={readingMode}
                  onClick={() => setReadingMode((cur) => !cur)}
                >
                  Reading mode {readingMode ? "on" : "off"}
                </button>
                <button type="button" className={ghostBtn} onClick={toggleFullscreen}>
                  {isFullscreen ? "Exit full screen" : "Full screen"}
                </button>
              </div>
            </div>
            {readingMode ? (
              <p className="mt-3 text-[12px] leading-relaxed text-sand-600">
                Reading mode: the stage is taller, text is at least {READING_MODE_FONT_FLOOR}px, and
                the controls stay on one row — scroll that row sideways on a small screen.
              </p>
            ) : null}
          </div>
        </section>

        {/* -------------------------------------------------- Shortcuts */}
        <section className="pt-10 pb-4" aria-label="Keyboard shortcuts">
          <h2 className={sectionTitleCls}>Keyboard shortcuts</h2>
          <div className={`${cardCls} mt-4`}>
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {PROMPTER_SHORTCUTS.map((shortcut) => (
                <li key={`${shortcut.keys}-${shortcut.action}`} className="flex items-center justify-between gap-3 text-[13px] text-sand-800">
                  <span>{shortcut.action}</span>
                  <kbd className="rounded-md border border-sand-300 bg-sand-100 px-2 py-0.5 font-sora text-[11px] font-semibold text-ink">
                    {shortcut.keys}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-sand-600">
              Shortcuts pause while you type in a text box, or use a slider or the script picker. So those keep working as normal.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- Record (A13) */}
        <div className="pb-4">
          <PrompterRecorder />
        </div>
      </div>
    </StudioShell>
  );
}
