"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/features/studio/mediaAssets";
import { saveAsset } from "@/features/studio/mediaStore";
import { PrepareError, prepareVideo } from "@/features/upload/prepareVideo";
import { projectsService } from "@/services/projects";
import { studioService } from "@/services/studio";
import { buildTakeAssetRecord, formatLabelForMime } from "./recording";
import { usePrompterRecorder } from "./usePrompterRecorder";

const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";
const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";
const sectionTitleCls = "font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600";
const cardCls = "rounded-xl border border-sand-200 bg-white p-5";

/** Same on-device limits the studio upload panel falls back to: a longer take is refused by prepareVideo, in plain words, and stays here to download. */
const PREPARE_LIMITS = { maxBytes: 2 * 1024 * 1024 * 1024, maxDurationSec: 5 * 60 };

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
}

/**
 * Record while you read (Phase 7, A13): the Teleprompter's optional record
 * mode. Self-contained section below the stage — it never touches the
 * prompter's scroll state; the user starts the prompter playing above and
 * records from here. Everything is on-device: the take is a Blob in this
 * browser until the user opens it as a project, downloads it, or discards
 * it.
 *
 * Mirror behaviour (labelled in the UI): the preview is ALWAYS the raw
 * camera stream, mirrored with CSS for framing. The "Mirror the saved
 * recording" toggle is read when the camera starts and selects the
 * recording stream for that camera session — off records the camera
 * directly (held-up text reads correctly), on records through a mirrored
 * canvas pipeline so the saved video looks like the preview.
 */
export default function PrompterRecorder() {
  const router = useRouter();
  const {
    status,
    error,
    take,
    elapsedMs,
    support,
    previewStream,
    startCamera,
    startRecording,
    stopRecording,
    stopCamera,
    discardTake,
  } = usePrompterRecorder();

  const [mirrorRecording, setMirrorRecording] = useState(false);
  const [opening, setOpening] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = previewStream;
  }, [previewStream, status]);

  // Object URL for the take's playback + download; revoked on replace /
  // discard / unmount by this effect's cleanup.
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!take) {
      setTakeUrl(null);
      return;
    }
    const url = URL.createObjectURL(take.blob);
    setTakeUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [take]);

  const cameraOn = status === "preview" || status === "recording";

  const handleDiscard = () => {
    setFlowError(null);
    discardTake();
  };

  /**
   * Open the take as a new project. Step order matters: prepare BEFORE
   * create, so a take the pipeline refuses never creates an empty project.
   *   prepare → create → uploadVideo → save to the media bin → navigate.
   * Any failure keeps the take here to retry or download.
   */
  const openAsProject = async () => {
    if (!take || opening) return;
    setOpening(true);
    setFlowError(null);
    const title = `Prompter take — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    let project: Awaited<ReturnType<typeof projectsService.createProject>> | null = null;
    try {
      // The recorder mime can carry codec parameters ("video/webm;codecs=…");
      // the upload pipeline's allow-list matches the bare type, so strip them.
      const baseMime = take.mime.split(";")[0]?.trim() || take.mime;
      const file = new File([take.blob], take.fileName, { type: baseMime });
      const prepared = await prepareVideo(file, PREPARE_LIMITS, () => undefined);
      project = await projectsService.createProject(title);
      await studioService.uploadVideo(project.id, prepared, () => undefined);
      await saveAsset(
        buildTakeAssetRecord(
          project.id,
          take,
          { durationMs: prepared.durationMs, width: prepared.width, height: prepared.height },
          crypto.randomUUID(),
          Date.now(),
        ),
      );
      router.push(`/projects/${project.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong while opening the take as a project.";
      if (e instanceof PrepareError && !project) {
        // Refused by the on-device check: no project was created, the take stays.
        setFlowError(`${message} Your take is still here to download.`);
      } else if (project) {
        setFlowError(
          `${message} The project “${title}” was created and can be opened from the Dashboard, and your take is still here to retry or download.`,
        );
      } else {
        setFlowError(`${message} Your take is still here to retry or download.`);
      }
      setOpening(false);
    }
  };

  return (
    <section className="pt-10" aria-label="Record while you read">
      <h2 className={sectionTitleCls}>Record while you read</h2>
      <div className={`${cardCls} mt-4 space-y-5`}>
        <p className="text-[13px] leading-relaxed text-sand-800">
          Recording happens entirely on this device — nothing is uploaded. The take is saved in
          this browser; open it as a project to transcribe and caption it. Start the prompter
          playing above, then record from here while the script scrolls.
        </p>

        {!support.supported ? (
          <p role="status" className="text-[13px] leading-relaxed text-sand-700">
            {support.reason}
          </p>
        ) : (
          <>
            {/* Mirror toggle: read when the camera starts (see the hook) — so it is disabled
                whenever the camera is on, not just while recording; a toggle that can be
                flipped with no effect is a dead control. */}
            <div>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={mirrorRecording}
                  disabled={cameraOn}
                  onChange={(e) => setMirrorRecording(e.target.checked)}
                />
                <span className={labelCls}>Mirror the saved recording</span>
              </label>
              <p className="mt-2 max-w-[68ch] text-[12px] leading-relaxed text-sand-600">
                Off by default, so text you hold up to the camera reads correctly in the saved
                video. On = the saved video looks exactly like the preview.
                {cameraOn ? " Set before you turn the camera on — it applies from the next camera start." : ""}
              </p>
            </div>

            {status === "error" && error ? (
              <div role="alert" className="rounded-lg border border-sand-200 bg-sand-100 px-4 py-3">
                <p className="text-[13px] leading-relaxed text-sand-800">{error}</p>
                <button type="button" className={`${ghostBtn} mt-3`} onClick={() => void startCamera(mirrorRecording)}>
                  Try again
                </button>
              </div>
            ) : null}

            {status === "idle" ? (
              <div>
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={() => void startCamera(mirrorRecording)}
                >
                  Turn on camera
                </button>
              </div>
            ) : null}

            {status === "requesting" ? (
              <p role="status" className="text-[13px] text-sand-700">
                Starting the camera…
              </p>
            ) : null}

            {cameraOn && previewStream ? (
              <div className="space-y-3">
                <video
                  ref={previewRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-video w-full max-w-2xl rounded-xl bg-[#0B0B0A] ring-1 ring-sand-200"
                  style={{ transform: "scaleX(-1)" }}
                />
                <p className="text-[12px] leading-relaxed text-sand-600">
                  Preview — mirrored, like a selfie view, so framing feels natural.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {status === "recording" ? (
                    <>
                      <span role="status" className="font-sora text-[12px] font-semibold text-ink">
                        Recording · <span className="tabular-nums">{formatClock(elapsedMs)}</span>
                      </span>
                      <button type="button" className={primaryBtn} onClick={stopRecording}>
                        Stop recording
                      </button>
                    </>
                  ) : (
                    <button type="button" className={primaryBtn} onClick={startRecording}>
                      Record
                    </button>
                  )}
                  <button type="button" className={ghostBtn} disabled={status === "recording"} onClick={stopCamera}>
                    Turn off camera
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {take ? (
          <div className="space-y-3 border-t border-sand-200 pt-5">
            <h3 className="font-sora text-[12px] font-semibold text-sand-800">Your take</h3>
            {takeUrl ? (
              <video controls src={takeUrl} className="aspect-video w-full max-w-2xl rounded-xl bg-[#0B0B0A] ring-1 ring-sand-200" />
            ) : null}
            <ul className="space-y-1 text-[13px] text-sand-800">
              <li>Duration: {(take.durationMs / 1000).toFixed(1)} seconds</li>
              <li>Size: {formatBytes(take.blob.size)}</li>
              <li>Format: {formatLabelForMime(take.mime)}</li>
              <li>Mirrored recording: {take.mirroredRecording ? "yes" : "no"}</li>
            </ul>
            {flowError ? (
              <p role="alert" className="rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
                {flowError}
              </p>
            ) : null}
            {opening ? (
              <p role="status" className="text-[13px] text-sand-700">
                Preparing the take and creating the project… keep this tab open.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={primaryBtn} disabled={opening} onClick={() => void openAsProject()}>
                {opening ? "Opening…" : "Open as new project"}
              </button>
              {takeUrl ? (
                <a href={takeUrl} download={take.fileName} className={`${ghostBtn} inline-block`} aria-disabled={opening}>
                  Download take
                </a>
              ) : null}
              <button type="button" className={ghostBtn} disabled={opening} onClick={handleDiscard}>
                Discard
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
