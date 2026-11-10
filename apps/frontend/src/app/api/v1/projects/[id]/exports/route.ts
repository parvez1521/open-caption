import { rateLimit } from "@/lib/api/rateLimit";
import {
  CaptionDocSchema, CaptionStyleSchema, CreateExportBody, EXPORT_EXTENSIONS, ProjectSettingsSchema, TEXT_EXPORT_KINDS, TEXT_EXPORT_MIME, effectivePlanId, planFor, translationModelFor, type CaptionDoc, type RenderJob, type TextExportKind,
} from "@capseasy/shared";
import { exportDimsWithCanvas } from "@/features/studio/exportOptions";
import { canvasOf } from "@/features/studio/canvas";
import { applyFillerFilter, applyProfanity, derivePages, toAss, toJson, toSrt, toTxt, toVtt } from "@motion-ai/caption-engine/core";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { enqueueJob, hasOnlineCompanion } from "@/lib/api/jobs";
import { putObject, signedGet } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";

// Extension / MIME naming comes from @capseasy/shared (EXPORT_EXTENSIONS / TEXT_EXPORT_MIME),
// keyed by the same CREATABLE_EXPORT_KINDS that CreateExportBody validates and the UI offers.
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
  // Guest gating first, exactly as before: a guest gets the signup response for every kind.
  // (It runs before body parsing now only so that narrowing CreateExportBody to the creatable
  // kinds — png included — cannot change what a guest sees.)
  if (user.guest) throw new ApiFailure("FORBIDDEN", "Create a free account to export your video.", { signupRequired: true });
  // Kind validation IS the creatable list: CreateExportBody only accepts CREATABLE_EXPORT_KINDS,
  // so png (in EXPORT_KINDS but not creatable — no PNG stills yet) is rejected here as VALIDATION.
  const body = await parseBody(req, CreateExportBody);

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

  // ---- translated tracks (slice 5.1) ----
  // Loaded once, used by both branches below: text exports with `language` export THAT track;
  // render jobs carry it as translatedDocSnapshot so a bilingual MP4 shows the same secondary
  // line as the preview. A missing table (migration not applied yet) or missing track simply
  // means "no translation" for renders — but an explicitly requested translated TEXT export
  // fails honestly instead of silently exporting the primary doc under a foreign name.
  const loadTranslation = async (language: string): Promise<{ doc: CaptionDoc; revision: number } | null> => {
    const { data } = await user.db.from("caption_translations").select("revision, doc").eq("project_id", projectId).eq("language", language).maybeSingle();
    if (!data) return null;
    const parsed = CaptionDocSchema.safeParse(data.doc);
    return parsed.success ? { doc: parsed.data, revision: data.revision } : null;
  };
  let requestedTranslation: { doc: CaptionDoc; revision: number } | null = null;
  if (body.language) {
    const model = translationModelFor(body.language);
    if (!model) throw new ApiFailure("VALIDATION", `"${body.language}" is not a translation language this app offers.`);
    requestedTranslation = await loadTranslation(body.language);
    if (!requestedTranslation && (TEXT_EXPORT_KINDS as readonly string[]).includes(body.kind)) {
      throw new ApiFailure("CONFLICT", `There is no ${model.targetLabel} translation for this project yet — translate it from the Translate panel first.`);
    }
  }

  // ---- text formats: generated right now ----
  if ((TEXT_EXPORT_KINDS as readonly string[]).includes(body.kind)) {
    let d = requestedTranslation?.doc ?? doc;
    if (settings.removeFillers) d = applyFillerFilter(d, settings.fillerList.length ? settings.fillerList : undefined, true);
    if (settings.profanity !== "off") d = applyProfanity(d, settings.profanity);
    const pages = derivePages(d, settings);
    const w = video?.width ?? 1080;
    const h = video?.height ?? 1920;
    const text =
      body.kind === "srt" ? toSrt(pages)
      : body.kind === "vtt" ? toVtt(pages)
      : body.kind === "txt" ? toTxt(pages)
      : body.kind === "json" ? toJson(d)
      : toAss(pages, style, { width: w, height: h });
    const path = `${user.id}/${projectId}/exports/${exportId}.${EXPORT_EXTENSIONS[body.kind]}`;
    await putObject(path, text, TEXT_EXPORT_MIME[body.kind as TextExportKind] ?? "text/plain");
    const { error } = await admin.from("exports").insert({
      id: exportId, project_id: projectId, owner_id: user.id, kind: body.kind, status_v2: "ready", status: "completed",
      storage_path: path, file_size: new TextEncoder().encode(text).length, doc_revision: requestedTranslation?.revision ?? docRow.revision, style: project.look_id,
    });
    if (error) throw new ApiFailure("INTERNAL", "Could not record the export", error.message);
    const downloadName = `${safeTitle}${body.language ? `-${body.language}` : ""}.${EXPORT_EXTENSIONS[body.kind]}`;
    return ok({ exportId, ready: true, downloadUrl: await signedGet(path, 600, downloadName) }, 201);
  }

  // ---- video formats: queue a render for the companion ----
  if (!video?.duration_ms) throw new ApiFailure("CONFLICT", "The source video is still being prepared.");
  // Export resolution + frame rate: explicit body values (the Export UI sends the project's saved
  // export settings as absolute dims + fps) win; otherwise fall back to the project's persisted
  // exportSettings, resolved from the source's aspect by the shared short-edge rule. Never the
  // raw source fps alone any more — the saved choice is the default for every client.
  // …resolved from the EFFECTIVE aspect (the project's canvas aspect when chosen, else the
  // source's own) by the same helper the Export modal uses, so the fallback can never drift
  // from what the client would have sent.
  const savedDims = exportDimsWithCanvas({ width: video.width ?? 1080, height: video.height ?? 1920 }, canvasOf(settings), settings.exportSettings.resolution);
  const width = even(body.width ?? savedDims.width);
  const height = even(body.height ?? savedDims.height);
  const fps = body.fps ?? settings.exportSettings.fps;
  const format = body.kind as RenderJob["format"];

  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const retentionDays = planFor(effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at)).exportRetentionDays;

  const { error: exErr } = await admin.from("exports").insert({
    id: exportId, project_id: projectId, owner_id: user.id, kind: body.kind, status_v2: "queued", status: "queued",
    resolution: `${width}x${height}`, quality: `crf${body.crf ?? 21}`, doc_revision: docRow.revision, style: project.look_id,
    settings: { width, height, fps, crf: body.crf ?? 21, range: body.range ?? null },
    expires_at: new Date(Date.now() + retentionDays * 86400_000).toISOString(),
  });
  if (exErr) throw new ApiFailure("INTERNAL", "Could not create the export", exErr.message);

  // bilingual renders carry the translated track for the project's chosen target (slice 5.1);
  // the composition decides whether to draw it (settings.bilingual), same as the preview
  const renderTranslation = settings.translateTo
    ? requestedTranslation?.doc ?? (await loadTranslation(settings.translateTo))?.doc ?? undefined
    : undefined;

  const job = await enqueueJob({
    ownerId: user.id,
    projectId,
    kind: "render",
    payload: {
      kind: "render", exportId, format, width, height, fps, crf: body.crf ?? 21, range: body.range,
      docSnapshot: doc,
      ...(renderTranslation ? { translatedDocSnapshot: renderTranslation } : {}),
      style, settings, fonts: [], sourceVideoId: video.id,
    },
    idempotencyKey: `render:${exportId}`,
  });
  await admin.from("exports").update({ job_id: job.id }).eq("id", exportId);
  return ok({ exportId, jobId: job.id, ready: false, companionOnline: await hasOnlineCompanion(user.id) }, 202);
});
