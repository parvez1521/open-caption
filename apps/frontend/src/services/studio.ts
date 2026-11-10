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
      apiClient.post<{ jobId: string | null; noAudio?: boolean }>(`/videos/${reg.videoId}/complete`, { json: { needsProxy: false } }),
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

  savePatch(projectId: string, patch: Record<string, unknown> & { composition_json?: CompositionSettings }) {
    return apiClient.patch(`/projects/${projectId}`, { json: patch });
  },

  /**
   * Clipper: create a normal caption project from one segment of this project. The server copies
   * the project + video row and stores the (already segment-shifted) caption doc; it returns the
   * NEW video id so the caller can copy the on-device video bytes to it (see features/clipper).
   */
  async createClip(projectId: string, body: { title: string; startMs: number; endMs: number; doc: CaptionDoc }): Promise<{ project: { id: string; title: string }; videoId: string | null }> {
    return apiClient.post(`/projects/${projectId}/clips`, { json: body });
  },

  listExports(projectId: string) {
    return apiClient.get<ExportRow[]>(`/projects/${projectId}/exports`);
  },

  createExport(projectId: string, body: { kind: ExportKind; crf?: number; width?: number; height?: number; fps?: number; range?: { startMs: number; endMs: number } }) {
    return apiClient.post<{ exportId: string; ready: boolean; downloadUrl?: string; jobId?: string; companionOnline?: boolean }>(`/projects/${projectId}/exports`, { json: body });
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
