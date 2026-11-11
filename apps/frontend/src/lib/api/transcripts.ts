import "server-only";
import { CaptionDocSchema, type Word } from "@capseasy/shared";
import { getAdmin } from "../supabase/admin";
import { ApiFailure } from "./http";
import { setProjectStatus } from "./jobs";

export interface TranscriptionResult {
  engine: "whisper_cpp" | "whisper_web";
  model: string;
  language: string;
  durationMs?: number;
  width?: number;
  height?: number;
  words: Word[];
}

interface JobRow { id: string; project_id: string; owner_id: string; payload: unknown }

/**
 * Stores a finished transcription (from the companion OR the cloud) and turns it into the editable caption
 * document. Never silently destroys hand edits: an edited document is snapshotted before being replaced.
 */
export async function saveTranscription(job: JobRow, r: TranscriptionResult) {
  const admin = getAdmin();
  const now = new Date().toISOString();
  const { videoId } = job.payload as { videoId: string };

  const { data: transcript, error: tErr } = await admin.from("transcripts").insert({
    project_id: job.project_id, owner_id: job.owner_id, language: r.language, provider: r.engine, engine: r.engine, model: r.model,
    version: 1,
    // int column; browsers measure fractions
    duration_ms: r.durationMs != null ? Math.round(r.durationMs) : null,
    words_json: r.words,
    // legacy shape (seconds), kept for older tooling
    transcript_json: { language: r.language, provider: r.engine, words: r.words.map((w) => ({ word: w.text, start: w.startMs / 1000, end: w.endMs / 1000, probability: w.confidence ?? null })) },
  }).select("id").single();
  if (tErr || !transcript) throw new ApiFailure("INTERNAL", "Could not store the transcript", tErr?.message);

  const doc = CaptionDocSchema.parse({ version: 2, language: r.language, words: r.words, meta: { userEdited: false, createdFromTranscriptId: transcript.id } });
  const { data: existing } = await admin.from("caption_documents").select("id, revision, doc").eq("project_id", job.project_id).maybeSingle();
  if (existing) {
    if ((existing.doc as { meta?: { userEdited?: boolean } })?.meta?.userEdited) {
      await admin.from("caption_document_versions").insert({ document_id: existing.id, owner_id: job.owner_id, revision: existing.revision, reason: "before-retranscribe", doc: existing.doc });
    }
    await admin.from("caption_documents").update({ doc, revision: existing.revision + 1, source_transcript_id: transcript.id, updated_at: now }).eq("id", existing.id);
  } else {
    await admin.from("caption_documents").insert({ project_id: job.project_id, owner_id: job.owner_id, doc, source_transcript_id: transcript.id });
  }

  // legacy uploads never recorded their metadata; fill it from whatever the engine measured
  const { data: v } = await admin.from("videos").select("duration_ms, width, height").eq("id", videoId).maybeSingle();
  await admin.from("videos").update({
    status: "ready", updated_at: now, has_audio: true,
    ...(v && !v.duration_ms && r.durationMs ? { duration_ms: Math.round(r.durationMs) } : {}),
    ...(v && !v.width && r.width && r.height ? { width: r.width, height: r.height } : {}),
  }).eq("id", videoId);
  await setProjectStatus(job.project_id, "ready");
  if (r.durationMs) {
    await admin.from("usage_events").insert({
      owner_id: job.owner_id, kind: "local_transcribe_s", amount: Math.round(r.durationMs / 1000), project_id: job.project_id, job_id: job.id,
    });
  }
}

/** A video with no sound: nothing to transcribe, so open the editor with an empty document to type captions in. */
export async function openSilentVideo(o: { projectId: string; ownerId: string; videoId: string }) {
  const admin = getAdmin();
  await admin.from("videos").update({ has_audio: false, status: "ready", updated_at: new Date().toISOString() }).eq("id", o.videoId);
  const doc = CaptionDocSchema.parse({ version: 2, language: "en", words: [], meta: { userEdited: false } });
  await admin.from("caption_documents").upsert({ project_id: o.projectId, owner_id: o.ownerId, doc }, { onConflict: "project_id", ignoreDuplicates: true });
  await setProjectStatus(o.projectId, "ready");
}

/**
 * Package 2 item G — "Normal Editor" door: the owner chose to edit WITHOUT captioning.
 * Same empty-document opening as a silent video (the editor, timeline and export all work
 * with zero words — the silent-video path proves it), but the video's audio facts are left
 * untouched: it HAS audio, and "Generate captions" in the Captions panel can transcribe it
 * later. ignoreDuplicates means this can never clobber real captions.
 */
export async function openWithoutCaptions(o: { projectId: string; ownerId: string }) {
  const admin = getAdmin();
  const doc = CaptionDocSchema.parse({ version: 2, language: "en", words: [], meta: { userEdited: false } });
  await admin.from("caption_documents").upsert({ project_id: o.projectId, owner_id: o.ownerId, doc }, { onConflict: "project_id", ignoreDuplicates: true });
  await setProjectStatus(o.projectId, "ready");
}
