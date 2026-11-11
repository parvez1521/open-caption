import { z } from "zod";
import { CaptionDocSchema, ProjectSettingsSchema } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { PROJECT_COLUMNS, toApiProject } from "@/lib/api/projects";
import { rateLimit } from "@/lib/api/rateLimit";
import { cropPathClipSettings } from "@/features/clipper/cropPath";
import { MAX_CROP_ZOOM, reframedClipSettingsAspect, type ClipAspectId } from "@/features/clipper/reframe";

const AspectEnum = z.enum(["9:16", "1:1", "16:9"]);

const CreateClipBody = z.object({
  title: z.string().trim().min(1).max(120),
  startMs: z.number().min(0),
  endMs: z.number().min(1),
  /** the segment's caption document, already shifted so the segment start is 0 (client-side, caption-engine) */
  doc: CaptionDocSchema,
  /**
   * Phase 5 (5.4): the 9:16 crop window the user chose for this clip, when reframing
   * vertical. Only the window travels — the stored transform is derived here from the
   * source video row's own dimensions, never from client-supplied sizes.
   */
  reframe: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      zoom: z.number().min(1).max(MAX_CROP_ZOOM),
    })
    .optional(),
  /**
   * AI Clipping Studio: the target canvas aspect for this clip. Absent = the
   * pre-Studio behaviour exactly (9:16 window semantics, no canvas change
   * without a window). With `cropPath` it selects the path's target shape;
   * with `reframe` the window's shape; on its own it is a canvas-only change
   * (the renderer letterboxes — the "contain" case).
   */
  aspect: AspectEnum.optional(),
  /**
   * AI Clipping Studio (reframe v2): a per-scene crop PATH — each scene's base
   * window + offset keyframes, planned on-device from face tracks. Only the
   * plan travels; the stored segments are re-derived here from the video
   * row's real dimensions, exactly like the single-window path.
   */
  cropPath: z
    .object({
      scenes: z
        .array(
          z.object({
            startMs: z.number().int().min(0),
            endMs: z.number().int().min(1),
            window: z.object({
              x: z.number().min(0).max(1),
              y: z.number().min(0).max(1),
              zoom: z.number().min(1).max(MAX_CROP_ZOOM),
            }),
            keyframes: z
              .array(
                z.object({
                  atMs: z.number().int().min(0),
                  property: z.enum(["offsetX", "offsetY"]),
                  value: z.number().min(-1).max(1),
                }),
              )
              .max(48),
          }),
        )
        .min(1)
        .max(24),
    })
    .optional(),
}).refine((b) => b.endMs > b.startMs, { message: "endMs must be after startMs", path: ["endMs"] });

/**
 * Clipper: create a NORMAL caption project for one segment of the source project.
 * Mirrors the duplicate route: the new project copies the source's style/settings/language and
 * gets its own video row pointing at the same source file (the browser copies its on-device
 * bytes to the new video id — the file itself is never re-encoded or cut). Two things differ
 * from a plain duplicate: settings gain `clipRange` (so every renderer shows only the segment)
 * with overlays dropped (their timings belong to the source timeline), and the stored caption
 * document is the segment's shifted doc from the request, not a copy of the source's.
 *
 * Reframing (5.4): when the request carries a crop window AND the source video is wider
 * than 9:16, settings additionally gain a 9:16 canvas and a composition slice whose single
 * segment carries the window as its Phase-4.4 crop transform (reframe.ts) — the same ONE
 * composition preview and export already render, dual-written to `composition_json`
 * exactly as the studio's Stage-C save path writes it. In every other case (no window,
 * portrait/9:16 source, unknown dimensions) the settings are exactly what they were
 * before this slice: no canvas change, no segment stored.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "project_create", 30, 3600);
  const { id } = await params;
  const body = await parseBody(req, CreateClipBody);

  const { data: src } = await user.db
    .from("projects")
    .select("title, description, language, aspect_ratio, platform, look_id, template_id, style_json, settings_json, status")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!src) throw notFound("Project");

  // The source's video row is read BEFORE the insert (it used to be read after, only to
  // copy it): reframing needs its real dimensions, and the copy below reuses this row.
  const { data: video } = await user.db
    .from("videos")
    .select("storage_path, preview_path, status, width, height, fps, duration_ms, has_audio, original_filename, mime_type, file_size, rotation, probe_json")
    .eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const baseSettings = ProjectSettingsSchema.parse({
    ...((src.settings_json as Record<string, unknown> | null) ?? {}),
    clipRange: { startMs: Math.round(body.startMs), endMs: Math.round(body.endMs) },
    overlays: [],
  });

  const aspect: ClipAspectId = body.aspect ?? "9:16";
  // Framing resolution, in order: a crop PATH (v2) beats a single window; a
  // window beats a canvas-only aspect; nothing requested = today's shape.
  const pathed = body.cropPath
    ? cropPathClipSettings({
        settings: baseSettings,
        scenes: body.cropPath.scenes,
        aspect,
        sourceWidth: video?.width,
        sourceHeight: video?.height,
      })
    : null;
  const reframed =
    pathed ??
    (body.reframe
      ? reframedClipSettingsAspect({
          settings: baseSettings,
          window: body.reframe,
          aspect,
          sourceWidth: video?.width,
          sourceHeight: video?.height,
          startMs: body.startMs,
          endMs: body.endMs,
        })
      : null);
  const canvasOnly = !reframed && body.aspect !== undefined;
  const settings = reframed?.settings ??
    (canvasOnly
      ? { ...baseSettings, canvas: { aspect, background: baseSettings.canvas?.background ?? "blur" } }
      : baseSettings);
  const aspectApplied = reframed !== null || canvasOnly;

  const { data: copy, error } = await user.db
    .from("projects")
    .insert({
      ...src,
      settings_json: settings,
      owner_id: user.id,
      title: body.title,
      // a framed clip IS a project of its target aspect: its canvas says so (settings) and its row agrees
      ...(aspectApplied ? { aspect_ratio: aspect } : {}),
      ...(reframed ? { composition_json: reframed.composition } : {}),
    })
    .select(PROJECT_COLUMNS).single();
  if (error || !copy) throw new ApiFailure("INTERNAL", "Could not create the clip project", error?.message);

  let videoId: string | null = null;
  if (video) {
    const { data: videoCopy } = await user.db
      .from("videos")
      .insert({ ...video, project_id: copy.id, owner_id: user.id })
      .select("id").single();
    videoId = videoCopy?.id ?? null;
  }
  await user.db.from("caption_documents").insert({ project_id: copy.id, owner_id: user.id, doc: body.doc });

  return ok({ project: toApiProject(copy), videoId }, 201);
});
