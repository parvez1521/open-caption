import { z } from "zod";
import { CaptionStyleSchema, CompositionSettingsSchema, PlatformSchema, ProjectSettingsSchema } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { PROJECT_COLUMNS, toApiProject } from "@/lib/api/projects";
import { getAdmin } from "@/lib/supabase/admin";

export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data } = await user.db.from("projects").select(PROJECT_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) throw notFound("Project");
  return ok(toApiProject(data));
});

/** Allow-list: unknown keys are stripped, so owner_id/status/deleted_at can never be set by a client. */
const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().max(2000).nullable(),
    language: z.string().max(20).nullable(),
    aspect_ratio: z.enum(["9:16", "16:9", "1:1", "4:5"]).nullable(),
    platform: PlatformSchema.nullable(),
    look_id: z.string().max(80).nullable(),
    template_id: z.string().max(80).nullable(),
    style_json: CaptionStyleSchema.partial().passthrough(),
    settings_json: ProjectSettingsSchema.partial(),
    /** Stage C: the composition slice as a primary column value, validated/canonicalised by the same schema that defines the settings-embedded copy. */
    composition_json: CompositionSettingsSchema,
  })
  .partial();

export const PATCH = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const patch = await parseBody(req, PatchBody);
  if (Object.keys(patch).length === 0) throw new ApiFailure("VALIDATION", "No editable fields provided");
  if (patch.style_json && JSON.stringify(patch.style_json).length > 64_000) throw new ApiFailure("LIMIT_EXCEEDED", "Style is too large");
  const { data, error } = await user.db
    .from("projects")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select(PROJECT_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiFailure("INTERNAL", "Could not save", error.message);
  if (!data) throw notFound("Project");
  return ok(toApiProject(data));
});

/**
 * Permanent delete: running jobs are cancelled (a desktop helper drops its work), every stored file of the project
 * is removed, then its rows. Returns the video ids so the browser can also drop its on-device copies.
 */
export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data: project } = await user.db.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) throw notFound("Project");
  const admin = getAdmin();
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("jobs").update({ status: "cancelled", finished_at: now }).eq("project_id", id).eq("status", "queued"),
    admin.from("jobs").update({ cancel_requested: true }).eq("project_id", id).eq("status", "processing"),
  ]);

  const [{ data: videos }, { data: exportsRows }] = await Promise.all([
    admin.from("videos").select("id, storage_path, preview_path").eq("project_id", id),
    admin.from("exports").select("storage_path").eq("project_id", id),
  ]);
  const byBucket = new Map<string, Set<string>>();
  const add = (bucket: string, name: string | null | undefined) => {
    if (!name || name.startsWith("local:")) return;
    byBucket.set(bucket, (byBucket.get(bucket) ?? new Set()).add(name));
  };
  for (const v of videos ?? []) {
    add(v.storage_path?.startsWith(`${user.id}/`) ? "media" : "videos", v.storage_path);
    add("media", v.preview_path);
  }
  for (const e of (exportsRows ?? []) as { storage_path?: string | null }[]) add("media", e.storage_path);
  // listing every object the user owns is slow: only do it when this project can have stored files (videos live on the device now)
  if (byBucket.size > 0 || (exportsRows ?? []).length > 0) {
    const { data: objects } = await admin.rpc("user_storage_paths", { p_user: user.id });
    for (const o of (objects ?? []) as { bucket: string; name: string }[]) if (o.name.split("/")[1] === id) add(o.bucket, o.name);
  }
  const removeFiles = (async () => {
    for (const [bucket, names] of byBucket) {
      const list = [...names];
      for (let i = 0; i < list.length; i += 100) await admin.storage.from(bucket).remove(list.slice(i, i + 100));
    }
  })();

  // exports reference jobs, so they go first; the rest are independent and go together
  const ex = await admin.from("exports").delete().eq("project_id", id);
  if (ex.error) throw new ApiFailure("INTERNAL", "Could not delete the project", `exports: ${ex.error.message}`);
  const rest = await Promise.all(["caption_documents", "jobs", "transcripts", "usage_events", "videos"].map(async (t) => ({ t, ...(await admin.from(t).delete().eq("project_id", id)) })));
  for (const r of rest) if (r.error) throw new ApiFailure("INTERNAL", "Could not delete the project", `${r.t}: ${r.error.message}`);
  await removeFiles.catch(() => undefined);
  const { error } = await admin.from("projects").delete().eq("id", id);
  if (error) throw new ApiFailure("INTERNAL", "Could not delete the project", error.message);
  return ok({ deleted: true, videoIds: (videos ?? []).map((v) => v.id) });
});
