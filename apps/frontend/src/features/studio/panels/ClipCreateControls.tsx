"use client";

import React, { useEffect, useRef, useState } from "react";
import { SourceBadge } from "@/features/create/SourceBadge";
import { sourceNote, type Source } from "@/features/create/model";
import { fetchCloudAiStatus, runCloudModel } from "@/features/create/cloudAi";
import { onModelState, runLocalModel } from "@/features/create/localModel";
import type { GenerationDeps } from "@/features/create/service";
import {
  cropWindowFractions,
  DEFAULT_CROP_WINDOW,
  MAX_CROP_ZOOM,
  type CropWindow,
} from "@/features/clipper/reframe";
import { generateClipTitle, type ClipTitleResult } from "@/features/clipper/clipTitle";
import { useFaceReframe } from "@/features/clipper/useFaceReframe";
import { Button } from "../controls";

/**
 * The Phase-5 clip-creation controls (slice 5.4), kept out of ClipperPanel so the
 * panel itself only wires state through:
 *
 * - `useClipTitleDeps` assembles the Phase-3 generation deps EXACTLY as the Creator
 *   Studio page does (cloud runner only when the site reports its free AI
 *   configured; the on-device model only when the user opted in and it is ready).
 * - `ClipTitleControl` runs the title generation as an explicit step: the generated
 *   title appears with its `SourceBadge` (template-engine titles are badged as the
 *   template engine, never as AI) and stays editable before the clip is created.
 * - `ReframeControl` is the draggable 9:16 crop window over the landscape frame.
 *   The window itself is static — it never follows a subject. An optional,
 *   explicitly-invoked assist (G5 Level 1) can CENTRE the window on a face
 *   detected on-device in the clip's frames; the suggestion lands in the same
 *   window state the drag control shows, so the user sees and can override it.
 */

export function useClipTitleDeps(): GenerationDeps {
  const [cloudOn, setCloudOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchCloudAiStatus().then((status) => {
      if (alive) setCloudOn(!!status?.configured);
    });
    const off = onModelState((s) => setModelReady(s.status === "ready"));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return { runCloud: cloudOn ? runCloudModel : undefined, modelEnabled: modelReady, runModel: runLocalModel };
}

export interface ClipTitleState extends ClipTitleResult {
  /** the title text as the user last edited it (starts as the generated title) */
  text: string;
}

export const ClipTitleControl: React.FC<{
  sourceTitle: string;
  segmentText: string;
  startMs: number;
  endMs: number;
  deps: GenerationDeps;
  state: ClipTitleState | null;
  onState: (next: ClipTitleState | null) => void;
}> = ({ sourceTitle, segmentText, startMs, endMs, deps, state, onState }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await generateClipTitle({ sourceTitle, segmentText, startMs, endMs }, deps);
      onState({ ...result, text: result.title });
    } catch {
      setError("The title could not be generated. You can still create the clip — it will use the plain range title.");
      onState(null);
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="mt-3">
        <Button disabled={busy} onClick={() => void generate()} className="w-full">
          {busy ? "Writing title…" : "Generate a title for this clip"}
        </Button>
        <p className="mt-1.5 text-[11px] leading-snug text-st-faint">
          Uses the same generation as Creator Studio — the free AI when it is on, the on-device model when enabled,
          otherwise the template engine. The title shows its source before you create the clip.
        </p>
        {error ? <p role="alert" className="mt-2 text-xs text-st-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={state.source} />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="text-[11px] font-medium text-st-muted underline decoration-st-line underline-offset-2 transition hover:text-st-text disabled:opacity-50"
        >
          {busy ? "Writing…" : "Regenerate"}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-st-faint">{sourceNote(state.source)}</p>
      {state.note ? <p className="text-[11px] leading-snug text-st-muted">{state.note}</p> : null}
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-st-faint">Clip title (editable)</span>
        <input
          type="text"
          value={state.text}
          maxLength={120}
          onChange={(e) => onState({ ...state, text: e.target.value })}
          className="w-full rounded-lg border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40"
        />
      </label>
    </div>
  );
};

/**
 * The draggable crop window. The stage shows the source frame (the project video,
 * paused at the clip's first frame); the bright rectangle is the 9:16 window and
 * everything outside it is dimmed. Drag the window (or use the sliders) to choose
 * the framing — the window's position/zoom are what land in the clip project's
 * composition as its segment crop (reframe.ts). Zooming in also frees the
 * vertical position.
 */
export const ReframeControl: React.FC<{
  sourceUrl: string | null;
  sourceWidth: number;
  sourceHeight: number;
  startMs: number;
  endMs: number;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  window: CropWindow;
  onWindowChange: (win: CropWindow) => void;
}> = ({ sourceUrl, sourceWidth, sourceHeight, startMs, endMs, enabled, onEnabledChange, window: win, onWindowChange }) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const fractions = cropWindowFractions(win, sourceWidth, sourceHeight);
  const face = useFaceReframe({ sourceUrl, startMs, endMs, sourceWidth, sourceHeight, currentWindow: win, onSuggest: onWindowChange });

  // park the preview on the clip's first frame so the framing is judged on the clip, not the poster
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !sourceUrl) return;
    const seek = () => {
      try {
        v.currentTime = Math.max(0, startMs / 1000);
      } catch { /* metadata not ready yet; the poster frame still shows the source */ }
    };
    if (v.readyState >= 1) seek();
    v.addEventListener("loadedmetadata", seek);
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [sourceUrl, startMs]);

  if (!fractions) return null;
  const { fw, fh } = fractions;

  const moveTo = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const grab = dragRef.current ?? { dx: fw / 2, dy: fh / 2 };
    // pointer position in source fractions, minus where inside the window the grab happened
    const leftFrac = (clientX - rect.left) / rect.width - grab.dx;
    const topFrac = (clientY - rect.top) / rect.height - grab.dy;
    onWindowChange({
      ...win,
      x: 1 - fw > 0 ? Math.min(1, Math.max(0, leftFrac / (1 - fw))) : 0.5,
      y: 1 - fh > 0 ? Math.min(1, Math.max(0, topFrac / (1 - fh))) : 0.5,
    });
  };

  // One drag surface: the stage itself. A press inside the window keeps the grab
  // offset (the window does not jump); a press elsewhere centres the window on it.
  const beginDrag = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const left = win.x * (1 - fw);
    const top = win.y * (1 - fh);
    const inside = px >= left && px <= left + fw && py >= top && py <= top + fh;
    dragRef.current = inside ? { dx: px - left, dy: py - top } : null;
    stage.setPointerCapture?.(e.pointerId);
    moveTo(e.clientX, e.clientY);
  };
  const dragMove = (e: React.PointerEvent) => {
    if (e.buttons > 0) moveTo(e.clientX, e.clientY);
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const sliderCls = "w-full";
  const labelCls = "mb-1 block text-[11px] font-medium text-st-faint";

  return (
    <div className="mt-3 rounded-lg border border-st-line bg-st-panel/60 p-2.5">
      <label className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-st-text">Vertical 9:16 crop window</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          aria-label="Reframe this clip to vertical 9:16"
          className="h-4 w-4 shrink-0 accent-[#FFA946]"
        />
      </label>
      <p className="mt-1 text-[11px] leading-snug text-st-faint">
        This clip becomes a vertical project: the frame is cropped to the window you choose — nothing is
        stretched, and you can still adjust the crop later in the studio. The window stays where you put
        it; it never follows movement. You can position it yourself, or ask the face check below to centre
        it on the speaker.
      </p>
      {enabled ? (
        <>
          <div
            ref={stageRef}
            data-testid="reframe-stage"
            onPointerDown={beginDrag}
            onPointerMove={dragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative mt-2 w-full cursor-grab touch-none select-none overflow-hidden rounded-md bg-black active:cursor-grabbing"
            style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}`, maxHeight: 220 }}
          >
            {sourceUrl ? (
              <video ref={videoRef} src={sourceUrl} muted playsInline preload="metadata" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
            ) : null}
            {/* dimmed surroundings: four panes around the window, so the kept region is the bright one */}
            <div className="pointer-events-none absolute bg-black/60" style={{ left: 0, top: 0, width: `${win.x * (1 - fw) * 100}%`, height: "100%" }} />
            <div className="pointer-events-none absolute bg-black/60" style={{ right: 0, top: 0, width: `${(1 - win.x) * (1 - fw) * 100}%`, height: "100%" }} />
            <div className="pointer-events-none absolute bg-black/60" style={{ left: `${win.x * (1 - fw) * 100}%`, top: 0, width: `${fw * 100}%`, height: `${win.y * (1 - fh) * 100}%` }} />
            <div className="pointer-events-none absolute bg-black/60" style={{ left: `${win.x * (1 - fw) * 100}%`, bottom: 0, width: `${fw * 100}%`, height: `${(1 - win.y) * (1 - fh) * 100}%` }} />
            <div
              role="slider"
              aria-label="Crop window position"
              aria-valuetext={`horizontal ${Math.round(win.x * 100)}%, vertical ${Math.round(win.y * 100)}%, zoom ${win.zoom.toFixed(2)}`}
              tabIndex={0}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.02;
                if (e.key === "ArrowLeft") { e.preventDefault(); onWindowChange({ ...win, x: Math.max(0, win.x - step) }); }
                if (e.key === "ArrowRight") { e.preventDefault(); onWindowChange({ ...win, x: Math.min(1, win.x + step) }); }
                if (e.key === "ArrowUp") { e.preventDefault(); onWindowChange({ ...win, y: Math.max(0, win.y - step) }); }
                if (e.key === "ArrowDown") { e.preventDefault(); onWindowChange({ ...win, y: Math.min(1, win.y + step) }); }
              }}
              className="pointer-events-none absolute border-2 border-[#FFA946]"
              style={{
                left: `${win.x * (1 - fw) * 100}%`,
                top: `${win.y * (1 - fh) * 100}%`,
                width: `${fw * 100}%`,
                height: `${fh * 100}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-st-faint">Drag on the frame to move the window, or use the sliders below.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelCls}>Horizontal position</span>
              <input
                type="range" min={0} max={100} step={1} value={Math.round(win.x * 100)}
                aria-label="Crop window horizontal position"
                onChange={(e) => onWindowChange({ ...win, x: Number(e.target.value) / 100 })}
                className={sliderCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Zoom</span>
              <input
                type="range" min={100} max={Math.round(MAX_CROP_ZOOM * 100)} step={5} value={Math.round(win.zoom * 100)}
                aria-label="Crop window zoom"
                onChange={(e) => onWindowChange({ ...win, zoom: Number(e.target.value) / 100 })}
                className={sliderCls}
              />
            </label>
          </div>
          {win.zoom > 1 ? (
            <label className="mt-2 block">
              <span className={labelCls}>Vertical position</span>
              <input
                type="range" min={0} max={100} step={1} value={Math.round(win.y * 100)}
                aria-label="Crop window vertical position"
                onChange={(e) => onWindowChange({ ...win, y: Number(e.target.value) / 100 })}
                className={sliderCls}
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => onWindowChange({ ...DEFAULT_CROP_WINDOW })}
            className="mt-2 text-[11px] font-medium text-st-muted underline decoration-st-line underline-offset-2 transition hover:text-st-text"
          >
            Reset to centre
          </button>

          {/* Face centring (G5 Level 1): opt-in, on-device, suggestion only. */}
          <div className="mt-3 border-t border-st-line pt-2.5">
            {face.state.kind === "consent" ? (
              <>
                <p className="text-[11px] leading-snug text-st-faint">
                  Face centring uses a small face-detection model — YuNet, about 0.25 MB — loaded
                  from this site. It runs entirely on your device: frames from this clip are checked here and
                  nothing is uploaded. It centres the window once, on the largest face it finds; the window
                  does not follow movement afterwards.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={face.confirm}
                    className="rounded-full bg-[#FFA946] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#141412]"
                  >
                    Use face centring
                  </button>
                  <button
                    type="button"
                    onClick={face.dismiss}
                    className="rounded-full border border-st-line px-3.5 py-1.5 text-[11.5px] font-medium text-st-muted"
                  >
                    Not now
                  </button>
                </div>
              </>
            ) : face.state.kind === "working" ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-st-faint" role="status">
                  Checking frames for a face… {face.state.done}/{face.state.total}
                </p>
                <button
                  type="button"
                  onClick={face.cancel}
                  className="shrink-0 text-[11px] font-medium text-st-muted underline decoration-st-line underline-offset-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={face.begin}
                  className="rounded-full border border-st-line px-3.5 py-1.5 text-[11.5px] font-medium text-st-text transition hover:border-st-faint"
                >
                  Centre window on face
                </button>
                {face.state.kind === "applied" ? (
                  <p className="mt-1.5 text-[11px] leading-snug text-st-faint" role="status">
                    Centred on the face found in this clip — drag or use the sliders to adjust.
                  </p>
                ) : face.state.kind === "noface" ? (
                  <p className="mt-1.5 text-[11px] leading-snug text-st-faint" role="status">
                    No face found in this clip — the window is unchanged.
                  </p>
                ) : face.state.kind === "error" ? (
                  <p className="mt-1.5 text-[11px] leading-snug text-st-faint" role="alert">
                    {face.state.message} The window is unchanged.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
