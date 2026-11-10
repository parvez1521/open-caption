"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildTakeFileName,
  gatherRecorderCaps,
  pickRecorderMime,
  recorderErrorMessage,
  recorderSupport,
  type PrompterTake,
} from "./recording";

export type RecorderStatus = "idle" | "requesting" | "preview" | "recording" | "error";

export interface UsePrompterRecorder {
  status: RecorderStatus;
  error: string | null;
  take: PrompterTake | null;
  /** Milliseconds since the current recording started (interval-updated); 0 when not recording. */
  elapsedMs: number;
  support: { supported: boolean; reason: string | null };
  /**
   * The RAW camera stream, always — the component mirrors it with CSS for
   * framing. The recording stream (below, internal) is a different thing
   * when mirroring is on: it comes from the canvas pipeline instead.
   */
  previewStream: MediaStream | null;
  /**
   * Turn the camera on. `mirrorRecording` is read HERE, at camera start:
   * it selects the recording stream for the whole camera session (direct
   * camera stream when off; mirrored canvas pipeline when on). Changing
   * the toggle afterwards applies from the next camera start.
   */
  startCamera: (mirrorRecording: boolean) => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;
  /** Stop the camera and every pipeline track. The take (if any) is kept. */
  stopCamera: () => void;
  discardTake: () => void;
}

/**
 * Teleprompter record mode (Phase 7, A13): getUserMedia preview +
 * MediaRecorder capture while the script scrolls. On-device only — the
 * take is a Blob in memory until the section saves / downloads / discards
 * it. Self-contained: nothing here touches the prompter page's state.
 */
export function usePrompterRecorder(): UsePrompterRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<PrompterTake | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  // Capability check is read once, lazily, on first render (client only —
  // this hook only runs inside a "use client" component).
  const [support] = useState(() => recorderSupport(gatherRecorderCaps()));

  const cameraStreamRef = useRef<MediaStream | null>(null);
  /** What the MediaRecorder records: the camera stream directly, or the combined canvas stream when mirroring. */
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const canvasVideoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pickedMimeRef = useRef<string | null>(null);
  const mirrorRef = useRef(false);
  const startedAtRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Set during teardown so a recorder stopped by stopCamera/unmount doesn't assemble a take. */
  const suppressTakeRef = useRef(false);

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  /** Stop every track and loop this hook owns. Refs only — safe from cleanup effects. */
  const teardownStreams = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current = null;
    if (canvasVideoRef.current) {
      canvasVideoRef.current.pause();
      canvasVideoRef.current.srcObject = null;
      canvasVideoRef.current = null;
    }
    // When mirroring is off the recording stream IS the camera stream;
    // stopping the camera tracks covers both, so only the camera is stopped.
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    recordingStreamRef.current = null;
  };

  const failWith = (err: unknown) => {
    teardownStreams();
    setPreviewStream(null);
    setError(recorderErrorMessage(err));
    setStatus("error");
  };

  const startCamera = async (mirrorRecording: boolean): Promise<void> => {
    if (status === "requesting" || status === "preview" || status === "recording") return;
    if (!support.supported) {
      setError(support.reason);
      setStatus("error");
      return;
    }
    setStatus("requesting");
    setError(null);
    mirrorRef.current = mirrorRecording;
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      cameraStreamRef.current = cameraStream;

      if (mirrorRecording) {
        // Mirror pipeline: draw the camera through a flipped canvas and
        // record the canvas video track + the camera's own audio tracks.
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.srcObject = cameraStream;
        canvasVideoRef.current = video;
        await video.play();

        const trackSettings = cameraStream.getVideoTracks()[0]?.getSettings();
        const width = video.videoWidth || trackSettings?.width || 1280;
        const height = video.videoHeight || trackSettings?.height || 720;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available in this browser.");

        const draw = () => {
          ctx.setTransform(-1, 0, 0, 1, width, 0);
          ctx.drawImage(video, 0, 0, width, height);
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();

        const canvasStream = canvas.captureStream(30);
        canvasStreamRef.current = canvasStream;
        recordingStreamRef.current = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...cameraStream.getAudioTracks(),
        ]);
      } else {
        recordingStreamRef.current = cameraStream;
      }

      // The preview is ALWAYS the raw camera stream; the component mirrors
      // it with CSS so framing feels natural either way.
      setPreviewStream(cameraStream);
      setStatus("preview");
    } catch (err) {
      failWith(err);
    }
  };

  const startRecording = () => {
    const stream = recordingStreamRef.current;
    if (!stream || status !== "preview") return;
    const picked = pickRecorderMime(
      (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    if (!picked) {
      setError("Recording couldn't start: no recording format this browser supports was found.");
      teardownStreams();
      setPreviewStream(null);
      setStatus("error");
      return;
    }
    try {
      const recorder = new MediaRecorder(stream, { mimeType: picked });
      pickedMimeRef.current = picked;
      chunksRef.current = [];
      suppressTakeRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopElapsedTimer();
        recorderRef.current = null;
        if (suppressTakeRef.current) {
          chunksRef.current = [];
          return;
        }
        const mime = recorder.mimeType || pickedMimeRef.current || picked;
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        setTake({
          blob,
          mime,
          mirroredRecording: mirrorRef.current,
          durationMs,
          fileName: buildTakeFileName(new Date(), mime),
        });
        setElapsedMs(0);
        // The camera preview keeps running so another take is one click away.
        setStatus(cameraStreamRef.current ? "preview" : "idle");
      };
      recorder.onerror = () => failWith(new Error("MediaRecorder error"));
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setError(null);
      recorder.start(1000);
      stopElapsedTimer();
      elapsedTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      setStatus("recording");
    } catch (err) {
      failWith(err);
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // assembly happens in onstop
    }
  };

  const stopCamera = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      suppressTakeRef.current = true;
      try {
        recorder.stop();
      } catch {
        // already stopping/stopped — teardown below covers the rest
      }
      recorderRef.current = null;
    }
    stopElapsedTimer();
    teardownStreams();
    setPreviewStream(null);
    setElapsedMs(0);
    setError(null);
    setStatus("idle");
    // The take is deliberately kept — discarding is explicit (discardTake).
  };

  const discardTake = () => setTake(null);

  // Teardown on unmount: no dangling tracks, loops or timers.
  useEffect(() => {
    return () => {
      suppressTakeRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore — the component is going away
        }
      }
      stopElapsedTimer();
      teardownStreams();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
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
  };
}
