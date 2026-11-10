import { z } from "zod";
import { CaptionDocSchema, ProjectSettingsSchema } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { PROJECT_COLUMNS, toApiProject } from "@/lib/api/projects";
import { rateLimit } from "@/lib/api/rateLimit";
import { MAX_CROP_ZOOM, reframedClipSettings } from "@/features/clipper/reframe";

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

  const reframed = body.reframe
    ? reframedClipSettings({
        settings: baseSettings,
        window: body.reframe,
        sourceWidth: video?.width,
        sourceHeight: video?.height,
        startMs: body.startMs,
        endMs: body.endMs,
      })
    : null;
  const settings = reframed?.settings ?? baseSettings;

  const { data: copy, error } = await user.db
    .from("projects")
    .insert({
      ...src,
      settings_json: settings,
      owner_id: user.id,
      title: body.title,
      // a reframed clip IS a 9:16 project: its canvas says so (settings) and its row agrees
      ...(reframed ? { aspect_ratio: "9:16" as const, composition_json: reframed.composition } : {}),
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
