import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { PROJECT_COLUMNS, toApiProject } from "@/lib/api/projects";
import { rateLimit } from "@/lib/api/rateLimit";

/** Copies the project, its style and its captions. The new project reuses the same source video file (read-only). */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "project_create", 30, 3600);
  const { id } = await params;
  const { data: src } = await user.db
    .from("projects")
    .select("title, description, language, aspect_ratio, platform, look_id, template_id, style_json, settings_json, status")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!src) throw notFound("Project");

  const { data: copy, error } = await user.db
    .from("projects")
    .insert({ ...src, owner_id: user.id, title: `${src.title} (copy)`.slice(0, 120) })
    .select(PROJECT_COLUMNS).single();
  if (error || !copy) throw new ApiFailure("INTERNAL", "Could not duplicate", error?.message);

  const [{ data: video }, { data: doc }] = await Promise.all([
    user.db.from("videos").select("id, storage_path, preview_path, cloud_storage_path, status, width, height, fps, duration_ms, has_audio, original_filename, mime_type, file_size, rotation").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    user.db.from("caption_documents").select("doc").eq("project_id", id).maybeSingle(),
  ]);
  // PER-05-A: the video copy must resolve on its own. The old code copied
  // storage_path verbatim as `local:<SOURCE video id>` while the insert minted a
  // NEW video id, and it dropped cloud_storage_path — so the copy opened
  // videoGone on every device, and re-uploading destroyed the copied captions.
  // Now: the cloud path carries over (a synced copy plays anywhere), and a local
  // path is re-keyed to the copy's own id (the browser copies the on-device
  // bytes to that id, exactly like the clipper flow).
  let videoId: string | null = null;
  let sourceVideoId: string | null = null;
  if (video) {
    sourceVideoId = (video as { id: string }).id;
    const { id: _sourceId, ...videoFields } = video as { id: string } & Record<string, unknown>;
    const { data: videoCopy } = await user.db
      .from("videos")
      .insert({ ...videoFields, project_id: copy.id, owner_id: user.id })
      .select("id")
      .single();
    videoId = (videoCopy as { id?: string } | null)?.id ?? null;
    if (videoId && typeof videoFields.storage_path === "string" && videoFields.storage_path === `local:${sourceVideoId}`) {
      await user.db.from("videos").update({ storage_path: `local:${videoId}` }).eq("id", videoId);
    }
  }
  if (doc) await user.db.from("caption_documents").insert({ project_id: copy.id, owner_id: user.id, doc: doc.doc });
  return ok({ ...toApiProject(copy), videoId, sourceVideoId }, 201);
});
