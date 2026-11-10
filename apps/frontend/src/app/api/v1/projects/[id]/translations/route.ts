import { SaveTranslationBody } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, failResponse, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";

const MAX_DOC_BYTES = 8 * 1024 * 1024;

/**
 * Translated caption tracks (slice 5.1): a project can hold ONE translated CaptionDoc per target
 * language, in caption_translations — the same doc shape and owner-RLS pattern as the primary
 * caption_documents, keyed by (project_id, language) instead of project alone.
 *
 * GET  -> every track for the project: [{ language, revision, doc, updated_at }]
 * PUT  -> upsert one track (body: SaveTranslationBody). The doc's own `language` must match the
 *         body's language: a track filed under the wrong language would render as the wrong
 *         bilingual line and export under the wrong name.
 */
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data, error } = await user.db
    .from("caption_translations")
    .select("language, revision, doc, updated_at")
    .eq("project_id", id)
    .order("language", { ascending: true });
  if (error) throw new ApiFailure("INTERNAL", "Could not load translations", error.message);
  return ok({ translations: data ?? [] });
});

export const PUT = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const body = await parseBody(req, SaveTranslationBody);
  if (body.doc.language !== body.language) {
    return failResponse("VALIDATION", `This document is in "${body.doc.language}", not "${body.language}".`);
  }
  if (JSON.stringify(body.doc).length > MAX_DOC_BYTES) throw new ApiFailure("LIMIT_EXCEEDED", "Translated document is too large");

  const { data: project } = await user.db.from("projects").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  const { data: existing } = await user.db
    .from("caption_translations")
    .select("revision")
    .eq("project_id", id)
    .eq("language", body.language)
    .maybeSingle();
  const revision = (existing?.revision ?? 0) + 1;
  const { error } = await user.db.from("caption_translations").upsert(
    {
      project_id: id,
      owner_id: user.id,
      language: body.language,
      doc: body.doc,
      revision,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,language" },
  );
  if (error) throw new ApiFailure("INTERNAL", "Could not save the translation", error.message);
  return ok({ revision });
});
