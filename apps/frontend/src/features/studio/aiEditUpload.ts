import type { PreparedVideo } from "@/features/upload/prepareVideo";
import type { ImportError } from "./useMediaAssets";

export interface FirstAiEditUploadDeps {
  /** Check / shrink / convert the picked file on this device (prepareVideo). */
  prepare: (file: File) => Promise<PreparedVideo>;
  /**
   * Register + save the video WITHOUT starting a caption session: the
   * caller wires studioService.uploadVideo with { editorMode: true }. The
   * server opens the editor with an EMPTY document shell (zero words) so
   * the Studio can open at all — that shell is not a caption pipeline:
   * no transcription job starts and no words are ever written by the upload.
   */
  upload: (ready: PreparedVideo) => Promise<{ videoId: string }>;
  /** After a successful upload (refetch the Studio, start the cloud sync). */
  afterUpload: (videoId: string) => void;
}

/**
 * First video upload for a blank AI-Edit project, from the AI Edit panel.
 * A blank project has no video row yet, so the panel cannot attach bytes
 * under an existing id (the old code errored here: "upload one from the
 * start screen first"). This runs the same editor-mode first upload the
 * start screen uses — prepare, register, save on this device — so the
 * panel itself accepts the first video.
 */
export async function uploadFirstAiEditVideo(
  deps: FirstAiEditUploadDeps,
  file: File,
): Promise<ImportError[]> {
  try {
    const ready = await deps.prepare(file);
    const { videoId } = await deps.upload(ready);
    deps.afterUpload(videoId);
    return [];
  } catch (e) {
    return [{ name: file.name, error: e instanceof Error ? e.message : "The video could not be added." }];
  }
}
