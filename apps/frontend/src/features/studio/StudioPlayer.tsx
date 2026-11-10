"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionedVideo, type CaptionedVideoInput } from "@capseasy/compositions";
import type { Platform } from "@capseasy/shared";
import { Pause, Play } from "lucide-react";
import { fmtTime } from "./controls";
import { safeZoneFor, safeZoneStyle } from "./safeZone";

interface Props {
  input: CaptionedVideoInput;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  position: { x: number; y: number };
  onMovePosition: (p: { x: number; y: number }) => void;
  onTime: (ms: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** phones: the Player's own controls would cover the captions, so a compact transport sits under the video
   *  instead, and the position grip moves to the frame edge (vertical drag) so it never covers the words */
  compact?: boolean;
  /** the project's platform preset for the safe-zone guide; falls back to the input's settings, then "custom" */
  platform?: Platform;
}

const clamp = (v: number) => Math.min(0.95, Math.max(0.05, v));

/** The same CaptionedVideo composition that renders the export, plus a drag handle to place the captions. */
export const StudioPlayer = forwardRef<PlayerRef, Props>(function StudioPlayer({ input, width, height, fps, durationMs, position, onMovePosition, onTime, onPlayingChange, compact = false, platform }, ref) {
  const innerRef = useRef<PlayerRef | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Slice 5.5 (b): the platform safe-zone guide is PREVIEW CHROME ONLY — local state plus a
  // sibling overlay div; it is never written into `input`, so the composition the Player
  // renders (and every export renders) is identical with the guide on or off.
  const [showSafeZone, setShowSafeZone] = useState(false);
  const zone = useMemo(
    () => safeZoneFor(platform ?? (input.settings as { platform?: Platform } | undefined)?.platform ?? "custom"),
    [platform, input.settings],
  );
  const [nowMs, setNowMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Phase 9 W2, quirk (c): a transient media error LATCHES in the preview. The composition's
  // video element passes no onError, so Remotion's preview video THROWS on a media error, and
  // @remotion/player's ErrorBoundary keeps the fallback on screen forever — its state has no
  // reset; only a full page reload recovered it. (A resize crossing the studio's 1024px layout
  // breakpoint remounts this Player mid-load, which is exactly the kind of moment a browser
  // aborts a blob-URL load with a media error.) Recovery: our own errorFallback with a retry
  // that remounts the Player (key bump), which resets the boundary and reloads the same —
  // still valid — media URL.
  const [attempt, setAttempt] = useState(0);
  const durationInFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));

  const setRef = (r: PlayerRef | null) => {
    innerRef.current = r;
    if (typeof ref === "function") ref(r);
    else if (ref) (ref as React.MutableRefObject<PlayerRef | null>).current = r;
  };

  // ~15 Hz time feed so the caption list / timeline follow playback without re-rendering every frame
  useEffect(() => {
    const p = innerRef.current;
    if (!p) return;
    let last = 0;
    const onFrame = (e: { detail: { frame: number } }) => {
      const now = performance.now();
      if (now - last < 66) return;
      last = now;
      onTime((e.detail.frame / fps) * 1000);
      setNowMs((e.detail.frame / fps) * 1000);
    };
    const onSeeked = (e: { detail: { frame: number } }) => { onTime((e.detail.frame / fps) * 1000); setNowMs((e.detail.frame / fps) * 1000); };
    const onPlay = () => { setIsPlaying(true); onPlayingChange?.(true); };
    const onPause = () => { setIsPlaying(false); onPlayingChange?.(false); };
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("seeked", onSeeked);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("seeked", onSeeked);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
  }, [fps, onTime, onPlayingChange]);

  const move = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    let x = compact ? position.x : clamp((e.clientX - r.left) / r.width);
    let y = clamp((e.clientY - r.top) / r.height);
    if (Math.abs(x - 0.5) < 0.02) x = 0.5; // snap to the centre line
    onMovePosition({ x, y });
  };

  const style = useMemo<React.CSSProperties>(() => ({ width: "100%", height: "100%" }), []);
  return (
    <div className={`flex h-full w-full items-center justify-center ${compact ? "flex-col gap-2 px-3 pb-2 pt-3" : "p-3"}`}>
      <div className={compact ? "flex min-h-0 w-full flex-1 items-center justify-center" : "contents"}>
      <div ref={boxRef} className="group relative overflow-hidden rounded-xl bg-[#0B0B0A] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] ring-1 ring-st-ink/10" style={{ aspectRatio: `${width} / ${height}`, height: "100%", maxWidth: "100%" }}>
        <Player
          key={attempt}
          ref={setRef}
          component={CaptionedVideo as unknown as React.ComponentType<Record<string, unknown>>}
          inputProps={input as unknown as Record<string, unknown>}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          style={style}
          controls={!compact}
          clickToPlay
          acknowledgeRemotionLicense
          numberOfSharedAudioTags={0}
          errorFallback={() => (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0B0B0A] p-4 text-center">
              <p className="text-sm text-white/85">Unable to play this video in the preview.</p>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black"
              >
                Try again
              </button>
            </div>
          )}
        />
        {dragging ? <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-st-em/50" /> : null}
        {showSafeZone ? (
          <div data-safe-zone-guide="true" className="pointer-events-none absolute inset-0 z-10" aria-hidden>
            {/* the edges platform UI covers, shaded; the clear rectangle in the middle is the safe area */}
            <div className="absolute inset-x-0 top-0 bg-black/45" style={{ height: `${zone.safe.topPct}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-black/45" style={{ height: `${100 - zone.safe.topPct - zone.safe.heightPct}%` }} />
            <div className="absolute left-0 bg-black/45" style={{ top: `${zone.safe.topPct}%`, height: `${zone.safe.heightPct}%`, width: `${zone.safe.leftPct}%` }} />
            <div className="absolute right-0 bg-black/45" style={{ top: `${zone.safe.topPct}%`, height: `${zone.safe.heightPct}%`, width: `${100 - zone.safe.leftPct - zone.safe.widthPct}%` }} />
            <div className="absolute border-2 border-dashed border-white/85" style={safeZoneStyle(zone)} />
            <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {zone.label} safe zone — guide only, not in your export
            </span>
          </div>
        ) : null}
        <button
          type="button"
          aria-pressed={showSafeZone}
          aria-label="Toggle platform safe-zone guide"
          title="Show the area the platform's own buttons and text cover. Preview guide only — it is never in an export."
          onClick={() => setShowSafeZone((v) => !v)}
          className={`absolute left-2 top-2 z-20 rounded-md px-2 py-1 text-[11px] font-semibold shadow ${showSafeZone ? "bg-st-ink text-st-panel" : "bg-black/55 text-white hover:bg-black/75"}`}
        >
          Safe zone
        </button>
        <div
          role="slider"
          aria-label="Caption position (drag)"
          aria-valuenow={Math.round(position.y * 100)}
          tabIndex={0}
          title={compact ? "Drag up or down to move captions" : "Drag to move captions"}
          className={compact
            ? `absolute right-0 z-10 flex h-11 w-7 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-l-lg bg-st-panel/85 text-st-ink shadow-md ${dragging ? "cursor-grabbing bg-st-lav" : ""}`
            : `absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-st-lav bg-transparent shadow-[0_0_0_3px_rgba(0,0,0,0.25)] transition ${dragging ? "scale-125 cursor-grabbing opacity-100" : "opacity-0 group-hover:opacity-90 focus:opacity-100"}`}
          style={compact ? { top: `${position.y * 100}%` } : { left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); }}
          onPointerMove={(e) => dragging && move(e)}
          onPointerUp={() => setDragging(false)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.05 : 0.01;
            if (e.key === "ArrowUp") onMovePosition({ ...position, y: clamp(position.y - step) });
            if (e.key === "ArrowDown") onMovePosition({ ...position, y: clamp(position.y + step) });
            if (e.key === "ArrowLeft") onMovePosition({ ...position, x: clamp(position.x - step) });
            if (e.key === "ArrowRight") onMovePosition({ ...position, x: clamp(position.x + step) });
          }}
        >
          {compact ? <span aria-hidden className="text-xs leading-none tracking-tighter">⇕</span> : null}
        </div>
      </div>
      </div>
      {compact ? <Transport player={innerRef} fps={fps} durationMs={durationMs} durationInFrames={durationInFrames} isPlaying={isPlaying} fallbackMs={nowMs} /> : null}
    </div>
  );
});

/**
 * Phone transport. The seek bar follows the player every animation frame (not the throttled time feed) and moves with
 * the finger at once; seeks are batched to one per frame, so scrubbing is continuous instead of stepping.
 */
const Transport: React.FC<{ player: React.RefObject<PlayerRef | null>; fps: number; durationMs: number; durationInFrames: number; isPlaying: boolean; fallbackMs: number }> = ({
  player, fps, durationMs, durationInFrames, isPlaying, fallbackMs,
}) => {
  const [frame, setFrame] = useState(() => Math.round((fallbackMs / 1000) * fps));
  const scrubbing = useRef(false);
  const pending = useRef<number | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    if (!scrubbing.current) setFrame(Math.round((fallbackMs / 1000) * fps));
  }, [fallbackMs, fps]);
  useEffect(() => {
    if (!isPlaying) return;
    let id = 0;
    const tick = () => {
      const f = player.current?.getCurrentFrame();
      if (f != null && !scrubbing.current) setFrame(f);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [isPlaying, player]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const seek = (f: number) => {
    setFrame(f);
    pending.current = f;
    if (!raf.current) raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (pending.current !== null) player.current?.seekTo(pending.current);
      pending.current = null;
    });
  };
  const ms = (frame / fps) * 1000;
  return (
    <div className="flex w-full shrink-0 items-center gap-2.5">
      <button
        type="button"
        onClick={() => player.current?.toggle()}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-st-ink text-st-panel active:scale-95"
      >
        {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
      </button>
      <input
        type="range"
        min={0}
        max={durationInFrames - 1}
        step={1}
        value={frame}
        onPointerDown={() => { scrubbing.current = true; }}
        onPointerUp={() => { scrubbing.current = false; }}
        onPointerCancel={() => { scrubbing.current = false; }}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Seek"
        className="h-11 min-w-0 flex-1"
      />
      <span className="shrink-0 font-mono text-xs tabular-nums text-st-muted">{fmtTime(ms)} / {fmtTime(durationMs)}</span>
    </div>
  );
};
