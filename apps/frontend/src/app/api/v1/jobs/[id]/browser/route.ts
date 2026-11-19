import { z } from "zod";
import { WordSchema } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { logJobEvent } from "@/lib/api/jobs";
import { saveTranscription } from "@/lib/api/transcripts";
import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";

/** A browser tab holding a transcribe job: long enough for a model download + a slow CPU, reaped if the tab vanishes. */
const BROWSER_LEASE_S = 15 * 60;
const lease = () => new Date(Date.now() + BROWSER_LEASE_S * 1000).toISOString();

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("progress"), stage: z.string().max(80), progress: z.number().min(0).max(100) }),
  z.object({ action: z.literal("release"), reason: z.string().max(300).optional() }),
  z.object({
    action: z.literal("complete"),
    language: z.string().min(2).max(16),
    model: z.string().max(80),
    durationMs: z.number().nonnegative().optional(),
    words: z.array(WordSchema).max(200_000),
  }),
]);

/**
 * In-browser transcription (Whisper via WebGPU/WASM in the user's tab): the tab claims the queued transcribe job
 * so no Companion picks it up, reports progress, then posts the words, which go through the SAME saveTranscription
 * as the Companion and cloud engines. Only the job's owner can drive it (RLS read + owner check).
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "jobs_write", 60, 3600);
  const { id } = await params;
  const body = await parseBody(req, Body);
  const { data: job } = await user.db.from("jobs").select("id, kind, status, worker_id, project_id, owner_id, payload, stage").eq("id", id).maybeSingle();
  if (!job) throw notFound("Job");
  if (job.kind !== "transcribe") throw new ApiFailure("VALIDATION", "Only transcription jobs can run in the browser.");
  const admin = getAdmin();
  const now = new Date().toISOString();
  const heldByBrowser = job.status === "processing" && !job.worker_id && job.stage?.startsWith("browser");

  if (body.action === "claim") {
    if (job.status === "completed") return ok({ status: "completed" });
    if (job.status === "processing" && job.worker_id) throw new ApiFailure("CONFLICT", "Your computer is already working on this.");
    const { data: claimed } = await admin.from("jobs")
      .update({ status: "processing", worker_id: null, stage: "browser: starting", progress: 1, started_at: now, lease_expires_at: lease(), updated_at: now })
      .eq("id", id).in("status", ["queued", "processing"]).is("worker_id", null).select("id").maybeSingle();
    if (!claimed) throw new ApiFailure("CONFLICT", "This job was just picked up somewhere else.");
    await logJobEvent(id, "browser", 1, "Transcribing in the browser");
    return ok({ status: "processing" });
  }

  if (!heldByBrowser) throw new ApiFailure("CONFLICT", "This transcription is no longer running in this browser.");

  if (body.action === "progress") {
    await admin.from("jobs").update({ stage: `browser: ${body.stage}`, progress: Math.round(body.progress), lease_expires_at: lease(), updated_at: now }).eq("id", id);
    return ok({ status: "processing" });
  }

  if (body.action === "release") {
    // hand it back to the queue (a Companion or another tab can take it)
    await admin.from("jobs").update({ status: "queued", stage: null, progress: 0, lease_expires_at: null, updated_at: now }).eq("id", id);
    await logJobEvent(id, "browser", null, `Browser gave up: ${body.reason ?? "stopped"}`, "warn");
    return ok({ status: "queued" });
  }

  await saveTranscription(job, { engine: "whisper_web", model: body.model, language: body.language, durationMs: body.durationMs, words: body.words });
  await admin.from("jobs").update({ status: "completed", progress: 100, stage: "browser: done", finished_at: now, lease_expires_at: null, result: { engine: "whisper_web", model: body.model, words: body.words.length } }).eq("id", id);
  await logJobEvent(id, "completed", 100, `Transcribed in the browser (${body.words.length} words)`);
  return ok({ status: "completed" });
});
