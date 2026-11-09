import { rateLimit } from "@/lib/api/rateLimit";
import {
  CaptionDocSchema, CaptionStyleSchema, CreateExportBody, ProjectSettingsSchema, TEXT_EXPORT_KINDS, exportDimensions, planFor, type RenderJob,
} from "@capseasy/shared";
import { applyFillerFilter, applyProfanity, derivePages, toAss, toJson, toSrt, toTxt, toVtt } from "@motion-ai/caption-engine/core";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { enqueueJob, hasOnlineCompanion } from "@/lib/api/jobs";
import { putObject, signedGet } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";

const EXT: Record<string, string> = { mp4: "mp4", mov_alpha: "mov", webm_alpha: "webm", png: "png", srt: "srt", vtt: "vtt", ass: "ass", txt: "txt", json: "json" };
const MIME: Record<string, string> = { srt: "application/x-subrip", vtt: "text/vtt", ass: "text/plain", txt: "text/plain", json: "application/json" };
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data: project } = await user.db.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) throw notFound("Project");
  const { data, error } = await user.db.from("exports").select("*").eq("project_id", id).order("created_at", { ascending: false });
  if (error) throw new ApiFailure("INTERNAL", "Could not load exports", error.message);
  return ok(data);
});

export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  await rateLimit(user.id, "export", 120, 3600);
  const body = await parseBody(req, CreateExportBody);
  if (user.guest) throw new ApiFailure("FORBIDDEN", "Create a free account to export your video.", { signupRequired: true });
  if (body.kind === "png") throw new ApiFailure("VALIDATION", "PNG stills are not available yet.");

  const { data: project } = await user.db.from("projects").select("id, title, look_id, style_json, settings_json").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");
  const { data: docRow } = await user.db.from("caption_documents").select("revision, doc").eq("project_id", projectId).maybeSingle();
  if (!docRow) throw new ApiFailure("CONFLICT", "There are no captions to export yet.");
  if (!project.style_json) throw new ApiFailure("CONFLICT", "Choose a caption style before exporting.");

  const doc = CaptionDocSchema.parse(docRow.doc);
  const settings = ProjectSettingsSchema.parse(project.settings_json ?? {});
  const style = CaptionStyleSchema.parse(project.style_json);
  const { data: video } = await user.db.from("videos").select("id, width, height, fps, duration_ms").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const exportId = crypto.randomUUID();
  const safeTitle = String(project.title || "captions").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
  const admin = getAdmin();

  // ---- text formats: generated right now ----
  if ((TEXT_EXPORT_KINDS as readonly string[]).includes(body.kind)) {
    let d = doc;
    if (settings.removeFillers) d = applyFillerFilter(d, settings.fillerList.length ? settings.fillerList : undefined, true);
    if (settings.profanity !== "off") d = applyProfanity(d, settings.profanity);
    const pages = derivePages(d, settings);
    const w = video?.width ?? 1080;
    const h = video?.height ?? 1920;
    const text =
      body.kind === "srt" ? toSrt(pages)
      : body.kind === "vtt" ? toVtt(pages)
      : body.kind === "txt" ? toTxt(pages)
      : body.kind === "json" ? toJson(doc)
      : toAss(pages, style, { width: w, height: h });
    const path = `${user.id}/${projectId}/exports/${exportId}.${EXT[body.kind]}`;
    await putObject(path, text, MIME[body.kind] ?? "text/plain");
    const { error } = await admin.from("exports").insert({
      id: exportId, project_id: projectId, owner_id: user.id, kind: body.kind, status_v2: "ready", status: "completed",
      storage_path: path, file_size: new TextEncoder().encode(text).length, doc_revision: docRow.revision, style: project.look_id,
    });
    if (error) throw new ApiFailure("INTERNAL", "Could not record the export", error.message);
    return ok({ exportId, ready: true, downloadUrl: await signedGet(path, 600, `${safeTitle}.${EXT[body.kind]}`) }, 201);
  }

  // ---- video formats: queue a render for the companion ----
  if (!video?.duration_ms) throw new ApiFailure("CONFLICT", "The source video is still being prepared.");
  // Export resolution + frame rate: explicit body values (the Export UI sends the project's saved
  // export settings as absolute dims + fps) win; otherwise fall back to the project's persisted
  // exportSettings, resolved from the source's aspect by the shared short-edge rule. Never the
  // raw source fps alone any more — the saved choice is the default for every client.
  const savedDims = exportDimensions(video.width ?? 1080, video.height ?? 1920, settings.exportSettings.resolution);
  const width = even(body.width ?? savedDims.width);
  const height = even(body.height ?? savedDims.height);
  const fps = body.fps ?? settings.exportSettings.fps;
  const format = body.kind as RenderJob["format"];

  const { data: profile } = await user.db.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  const retentionDays = planFor(profile?.plan).exportRetentionDays;

  const { error: exErr } = await admin.from("exports").insert({
    id: exportId, project_id: projectId, owner_id: user.id, kind: body.kind, status_v2: "queued", status: "queued",
    resolution: `${width}x${height}`, quality: `crf${body.crf ?? 21}`, doc_revision: docRow.revision, style: project.look_id,
    settings: { width, height, fps, crf: body.crf ?? 21, range: body.range ?? null },
    expires_at: new Date(Date.now() + retentionDays * 86400_000).toISOString(),
  });
  if (exErr) throw new ApiFailure("INTERNAL", "Could not create the export", exErr.message);

  const job = await enqueueJob({
    ownerId: user.id,
    projectId,
    kind: "render",
    payload: {
      kind: "render", exportId, format, width, height, fps, crf: body.crf ?? 21, range: body.range,
      docSnapshot: doc, style, settings, fonts: [], sourceVideoId: video.id,
    },
    idempotencyKey: `render:${exportId}`,
  });
  await admin.from("exports").update({ job_id: job.id }).eq("id", exportId);
  return ok({ exportId, jobId: job.id, ready: false, companionOnline: await hasOnlineCompanion(user.id) }, 202);
});
