/**
 * Studio data layer: everything the editor talks to the v2 API for. Kept apart from the legacy
 * projects service so the old dashboard keeps working while the studio moves to the new pipeline.
 */

import type { CaptionDoc, CaptionStyleV2, CompositionSettings, CreatableExportKind, ProjectSettings } from "@capseasy/shared";
import { apiClient, ApiError } from "./api-client";
import type { PreparedVideo } from "@/features/upload/prepareVideo";
import { saveLocalVideo } from "@/features/upload/localVideos";


export interface StudioJob {
  id: string;
  kind: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number | null;
  stage: string | null;
  message: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
}

export interface StudioData {
  project: {
    id: string;
    title: string;
    status: string | null;
    language: string | null;
    aspect_ratio: string | null;
    look_id: string | null;
    template_id: string | null;
    style_json: Partial<CaptionStyleV2> | null;
    settings_json: Partial<ProjectSettings> | null;
    /** Stage C primary column copy of the composition slice; the raw row value — useStudio resolves it through readCompositionSettings, which validates it. */
    composition_json?: unknown;
    platform: string | null;
  };
  video: {
    id: string;
    status: string;
    url: string | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    durationMs: number | null;
    hasAudio: boolean | null;
    filename: string | null;
    size: number | null;
    /** the file is kept on the user's device, not on our servers */
    local?: boolean;
    previewMode?: "native" | "converted" | "captions-only";
    needsCompat?: boolean;
  } | null;
  /** `unchanged`: the poll said which revision it had and the server didn't resend it */
  document: { revision: number; doc: CaptionDoc | null; unchanged?: boolean };
  job: StudioJob | null;
  canTranscribe: boolean;
  cloudAvailable: boolean;
  /** what this user may upload (videos are shrunk on the device to fit) */
  limits?: { maxBytes: number; maxDurationSec: number };
}

export interface ExportRow {
  id: string;
  kind: string | null;
  status_v2: "queued" | "rendering" | "ready" | "failed" | "expired" | "cancelled";
  file_size: number | null;
  created_at: string;
  job_id: string | null;
  expires_at: string | null;
  resolution: string | null;
  render_duration_ms: number | null;
}

/** The kinds a user can create: the shared API list itself, not a hand-kept copy (png is not creatable). */
export type ExportKind = CreatableExportKind;

/** Minutes balance as the billing routes return it (see lib/billing/minutes). */
export interface MinutesUsage {
  plan: string;
  granted: number;
  used: number;
  remaining: number;
  cycleStart: string | null;
  cycleEnd: string | null;
  freeGranted: boolean;
}

export class RevisionConflict extends Error {
  constructor(public server: { revision: number; doc: CaptionDoc }) {
    super("This project was changed somewhere else.");
  }
}

const ALLOWED = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];

export const studioService = {
  /** `knownRevision`: the caption document revision already held; it's only sent back when it changed */
  getStudio(projectId: string, knownRevision?: number) {
    return apiClient.get<StudioData>(`/projects/${projectId}/studio${knownRevision !== undefined ? `?rev=${knownRevision}` : ""}`);
  },

  /** Register, upload (with progress) and complete a video already checked/shrunk by prepareVideo(). */
  async uploadVideo(
    projectId: string,
    v: PreparedVideo,
    onProgress: (pct: number) => void,
    onAbortReady?: (abort: () => void) => void,
    /** called as soon as the video has an id, before it is saved: captioning starts right then, in parallel */
    onRegistered?: (videoId: string) => void,
    /** Package 2 item G: the Normal Editor door — the server opens the project with an
     *  empty caption document and starts NO transcription job */
    opts?: { editorMode?: boolean },
  ): Promise<{ jobId: string | null; videoId: string; noAudio?: boolean }> {
    const file = v.file;
    const mime = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : file.name.toLowerCase().endsWith(".mkv") ? "video/x-matroska" : "");
    if (!ALLOWED.includes(mime)) throw new Error("Unsupported file. Use MP4, MOV, WebM or MKV.");
    const reg = await apiClient.post<{ videoId: string }>(`/projects/${projectId}/videos`, {
      json: {
        local: true,
        filename: file.name,
        size: file.size,
        mime,
        probe: { durationMs: v.durationMs, width: v.width, height: v.height, rotation: v.rotation, videoCodec: v.videoCodec, audioCodec: v.audioCodec, hasAudio: v.hasAudio, previewMode: v.previewMode, needsCompat: v.needsCompat },
      },
    });
    // the video stays on this device: saved in the browser, never uploaded
    onAbortReady?.(() => undefined);
    onRegistered?.(reg.videoId);
    // saving the copy and creating the transcribe job don't depend on each other
    const [, done] = await Promise.all([
      saveLocalVideo(reg.videoId, file),
      apiClient.post<{ jobId: string | null; noAudio?: boolean }>(`/videos/${reg.videoId}/complete`, { json: { needsProxy: false, ...(opts?.editorMode ? { editorMode: true } : {}) } }),
    ]);
    onProgress(100);
    return { ...done, videoId: reg.videoId };
  },

  async saveDocument(projectId: string, expectedRevision: number, doc: CaptionDoc): Promise<number> {
    try {
      const r = await apiClient.put<{ revision: number }>(`/projects/${projectId}/document`, { json: { expectedRevision, doc } });
      return r.revision;
    } catch (e) {
      if (e instanceof ApiError && e.code === "REVISION_CONFLICT" && e.details) {
        throw new RevisionConflict(e.details as unknown as { revision: number; doc: CaptionDoc });
      }
      throw e;
    }
  },

  /** Translated caption tracks for a project (slice 5.1): one CaptionDoc per target language. */
  getTranslations(projectId: string) {
    return apiClient.get<{ translations: { language: string; revision: number; doc: CaptionDoc; updated_at: string }[] }>(`/projects/${projectId}/translations`);
  },

  saveTranslation(projectId: string, language: string, doc: CaptionDoc) {
    return apiClient.put<{ revision: number }>(`/projects/${projectId}/translations`, { json: { language, doc } });
  },

  savePatch(projectId: string, patch: Record<string, unknown> & { composition_json?: CompositionSettings }) {
    return apiClient.patch(`/projects/${projectId}`, { json: patch });
  },

  /**
   * Clipper: create a normal caption project from one segment of this project. The server copies
   * the project + video row and stores the (already segment-shifted) caption doc; it returns the
   * NEW video id so the caller can copy the on-device video bytes to it (see features/clipper).
   */
  async createClip(projectId: string, body: { title: string; startMs: number; endMs: number; doc: CaptionDoc; reframe?: { x: number; y: number; zoom: number }; aspect?: "9:16" | "1:1" | "16:9"; cropPath?: { scenes: { startMs: number; endMs: number; window: { x: number; y: number; zoom: number }; keyframes: { atMs: number; property: "offsetX" | "offsetY"; value: number }[] }[] } }): Promise<{ project: { id: string; title: string }; videoId: string | null }> {
    return apiClient.post(`/projects/${projectId}/clips`, { json: body });
  },

  listExports(projectId: string) {
    return apiClient.get<ExportRow[]>(`/projects/${projectId}/exports`);
  },

  createExport(projectId: string, body: { kind: ExportKind; crf?: number; width?: number; height?: number; fps?: number; range?: { startMs: number; endMs: number }; language?: string }) {
    return apiClient.post<{ exportId: string; ready: boolean; downloadUrl?: string; jobId?: string; companionOnline?: boolean; watermark?: { text: string } | null }>(`/projects/${projectId}/exports`, { json: body });
  },

  /**
   * Reserve minutes for a browser-rendered video BEFORE it renders.
   * The server computes the minutes from the video row and the project
   * settings — the client only sends the trim range. A failed reserve
   * (402 when the minutes are used up) must block the render. The
   * response also carries the server-side watermark decision for this
   * project, so the render carries exactly what the preview showed.
   */
  reserveBrowserExport(projectId: string, body: { exportId: string; kind: "mp4" | "mov_alpha" | "webm_alpha"; range?: { startMs: number; endMs: number } }) {
    return apiClient.post<{ reservationKey: string; exportId: string; minutes: number; balance: number; usage: MinutesUsage | null; watermark: { text: string } | null }>(`/projects/${projectId}/exports/reserve`, { json: body });
  },

  /**
   * Settle a browser-rendered video's minutes reservation after the file
   * is saved ('completed') or when the render fails ('failed'). A settle
   * with no reservation answers settled:false — the file is already saved.
   */
  settleBrowserExport(projectId: string, body: { exportId: string; kind: "mp4" | "mov_alpha" | "webm_alpha"; outcome: "completed" | "failed"; actualMinutes?: number }) {
    return apiClient.post<{ settled: boolean; reason: string | null; minutesCharged: number; refunded: number; usage: MinutesUsage | null }>(`/projects/${projectId}/exports/record`, { json: body });
  },

  /** Reserve minutes for a project-less browser render (Motion Studio). */
  reserveStandaloneExport(body: { exportId: string; kind: "mp4" | "webm" | "webm_alpha"; minutes: number; source: "motion" }) {
    return apiClient.post<{ reservationKey: string; exportId: string; minutes: number; balance: number; usage: MinutesUsage | null }>(`/billing/minutes/reserve`, { json: body });
  },

  /** Settle a project-less browser render's minutes reservation. */
  settleStandaloneExport(body: { exportId: string; outcome: "completed" | "failed"; actualMinutes?: number }) {
    return apiClient.post<{ settled: boolean; reason: string | null; minutesCharged: number; refunded: number; usage: MinutesUsage | null }>(`/billing/minutes/settle`, { json: body });
  },

  /** Minutes balance for the signed-in user (null when not set up yet). */
  minutesUsage() {
    return apiClient.get<{ minutes: MinutesUsage | null; minutesReady: boolean }>(`/billing/minutes`);
  },

  /**
   * Watermark state for one project — the server-side truth the preview
   * and the Export modal render from, so the preview shows exactly what
   * the export will carry. watermarkReady is false when the entitlement
   * table is not applied yet (removal checkout is not available then).
   */
  watermarkStatus(projectId: string) {
    return apiClient.get<{ watermark: { text: string } | null; entitled: boolean; plan: string; watermarkReady: boolean }>(`/projects/${projectId}/watermark`);
  },

  /**
   * Start a ₹69 watermark-removal purchase for one project. Returns the
   * Cashfree payment session when checkout can open, alreadyEntitled when
   * this project already exports clean, or configured:false when payments
   * (or the watermark setup) are not switched on yet.
   */
  buyWatermarkRemoval(projectId: string) {
    return apiClient.post<{ configured: boolean; alreadyEntitled?: boolean; orderId?: string; paymentSessionId?: string; env?: "sandbox" | "production"; amount?: number; currency?: string; projectId?: string; dbPending?: boolean }>("/billing/watermark/checkout", { json: { projectId } });
  },

  async exportDownloadUrl(exportId: string): Promise<string> {
    return (await apiClient.get<{ url: string }>(`/exports/${exportId}/download`)).url;
  },

  listLooks() {
    return apiClient.get<{ id: string; name: string; template_id: string; style_json: CaptionStyleV2; settings_json: Partial<ProjectSettings> }[]>("/looks");
  },
  saveLook(name: string, style: CaptionStyleV2, settings: Partial<ProjectSettings>) {
    return apiClient.post<{ id: string }>("/looks", { json: { name, style, settings } });
  },
  deleteLook(id: string) {
    return apiClient.delete(`/looks/${id}`);
  },
  getBrand() {
    return apiClient.get<{ colors: string[]; fontId: string | null }>("/brand");
  },
  saveBrand(colors: string[], fontId: string | null) {
    return apiClient.put<{ colors: string[]; fontId: string | null }>("/brand", { json: { colors, fontId } });
  },

  transcribe(projectId: string, engine: "auto" | "local" | "cloud" = "auto") {
    return apiClient.post<{ jobId: string; companionOnline: boolean }>(`/projects/${projectId}/transcribe`, { json: { engine } });
  },

  cancelJob(jobId: string) {
    return apiClient.post(`/jobs/${jobId}/cancel`);
  },
  retryJob(jobId: string) {
    return apiClient.post(`/jobs/${jobId}/retry`);
  },
};
