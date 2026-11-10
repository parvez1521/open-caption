import { legacyTranscriptToDoc } from "@motion-ai/caption-engine/core";
import { requireUser } from "@/lib/api/auth";
import { notFound, ok, route, type Ctx } from "@/lib/api/http";
import { HOUR, signedGet } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";
import { effectivePlanId, planFor } from "@capseasy/shared";

/**
 * Everything the editor needs in one RLS-scoped call: project, playable video URL, caption document and the latest
 * job (for progress UI). Polled while a job runs: a poll that passes `?rev=<revision it already has>` gets the caption
 * document only when it changed (`document.unchanged` otherwise), so polling doesn't re-send the whole document.
 */
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const knownRev = Number(new URL(req.url).searchParams.get("rev") ?? NaN);

  // every independent read goes out together: the editor opens after ONE database round-trip, not five
  const [{ data: project }, { data: video }, { data: docHead }, { data: jobs }, { data: profile }] = await Promise.all([
    user.db
      .from("projects")
      .select("id, title, status, language, aspect_ratio, look_id, template_id, style_json, settings_json, composition_json, platform, updated_at")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    user.db.from("videos").select("id, storage_path, preview_path, status, width, height, fps, duration_ms, has_audio, original_filename, file_size, mime_type, probe_json").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    Number.isFinite(knownRev)
      ? user.db.from("caption_documents").select("revision").eq("project_id", id).maybeSingle()
      : user.db.from("caption_documents").select("revision, doc").eq("project_id", id).maybeSingle(),
    // only v2 jobs (legacy pipeline jobs have no `kind` and will never run again)
    user.db.from("jobs").select("id, kind, status, progress, stage, message, error_code, error_message, attempts, created_at").eq("project_id", id).not("kind", "is", null).order("created_at", { ascending: false }).limit(6),
    user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle(),
  ]);
  if (!project) throw notFound("Project");

  // the poller already has this revision: don't send the document again
  const unchanged = Number.isFinite(knownRev) && !!docHead && docHead.revision === knownRev;
  let docRow = docHead as { revision: number; doc?: unknown } | null;
  if (docHead && !unchanged && !("doc" in docHead)) {
    docRow = (await user.db.from("caption_documents").select("revision, doc").eq("project_id", id).maybeSingle()).data;
  }

  // Legacy projects: an old-pipeline transcript exists but no editable document yet -> convert once.
  let doc = docRow;
  if (!doc) {
    const { data: t } = await user.db.from("transcripts").select("id, transcript_json, words_json").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (t) {
      const migrated = t.words_json
        ? legacyTranscriptToDoc({ words: (t.words_json as { text: string; startMs: number; endMs: number }[]).map((w) => ({ text: w.text, start_ms: w.startMs, end_ms: w.endMs })) })
        : legacyTranscriptToDoc(t.transcript_json);
      if (migrated.words.length > 0) {
        migrated.meta.createdFromTranscriptId = t.id;
        const { data: inserted } = await getAdmin()
          .from("caption_documents")
          .upsert({ project_id: id, owner_id: user.id, doc: migrated, source_transcript_id: t.id }, { onConflict: "project_id", ignoreDuplicates: true })
          .select("revision, doc")
          .maybeSingle();
        doc = inserted ?? (await user.db.from("caption_documents").select("revision, doc").eq("project_id", id).maybeSingle()).data;
      }
    }
  }

  let videoOut: Record<string, unknown> | null = null;
  const videoUrl = video && !(video.preview_path ?? video.storage_path).startsWith("local:")
    ? await signedGet(video.preview_path ?? video.storage_path, 2 * HOUR).catch(() => null)
    : null;
  if (video) {
    videoOut = {
      id: video.id,
      status: video.status,
      // on-device videos: the browser plays its own copy (IndexedDB); old uploads may already be cleaned up
      local: video.storage_path.startsWith("local:"),
      url: videoUrl,
      width: video.width, height: video.height, fps: video.fps, durationMs: video.duration_ms,
      previewMode: (video.probe_json as { previewMode?: string } | null)?.previewMode ?? "native",
      needsCompat: Boolean((video.probe_json as { needsCompat?: boolean } | null)?.needsCompat),
      hasAudio: video.has_audio, filename: video.original_filename, size: video.file_size,
    };
  }

  const active = (jobs ?? []).find((j) => j.status === "queued" || j.status === "processing");
  const latestFailed = !active && !doc ? (jobs ?? []).find((j) => j.status === "failed" && j.kind === "transcribe") : undefined;

  return ok({
    project,
    video: videoOut,
    document: unchanged ? { revision: knownRev, doc: null, unchanged: true } : doc ?? { revision: 0, doc: null },
    job: active ?? latestFailed ?? null,
    // video uploaded but nothing is running and there are no captions: offer "Generate captions"
    canTranscribe: Boolean(video && video.status !== "uploading" && !doc && !active),
    limits: { maxBytes: planFor(effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at)).maxLocalBytes, maxDurationSec: planFor(effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at)).maxDurationSec },
    cloudAvailable: false,
  });
});
