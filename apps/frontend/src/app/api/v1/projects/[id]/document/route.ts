import { SaveDocumentBody } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, failResponse, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";

const MAX_DOC_BYTES = 8 * 1024 * 1024;

export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "project_read", 600, 3600);
  const { id } = await params;
  const { data } = await user.db.from("caption_documents").select("revision, doc, updated_at").eq("project_id", id).maybeSingle();
  // no document yet (still transcribing) is a normal state, not an error
  return ok(data ?? { revision: 0, doc: null, updated_at: null });
});

/** Autosave with optimistic concurrency: a stale revision gets 409 plus the server copy so the UI can resolve it. */
export const PUT = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "project_doc", 1200, 3600);
  const { id } = await params;
  const body = await parseBody(req, SaveDocumentBody);
  if (JSON.stringify(body.doc).length > MAX_DOC_BYTES) throw new ApiFailure("LIMIT_EXCEEDED", "Caption document is too large");

  const { data: exists } = await user.db.from("caption_documents").select("id").eq("project_id", id).maybeSingle();
  if (!exists) throw notFound("Caption document");

  const doc = { ...body.doc, meta: { ...body.doc.meta, userEdited: true } };
  const { data: revision, error } = await user.db.rpc("save_caption_doc", { p_project: id, p_expected: body.expectedRevision, p_doc: doc });
  if (error) {
    if (error.message?.includes("REVISION_CONFLICT")) {
      const { data: server } = await user.db.from("caption_documents").select("revision, doc").eq("project_id", id).maybeSingle();
      return failResponse("REVISION_CONFLICT", "This project was changed somewhere else.", server ?? undefined);
    }
    throw new ApiFailure("INTERNAL", "Could not save", error.message);
  }

  // periodic history snapshot (every 25th revision) so users can roll back
  if (typeof revision === "number" && revision % 25 === 0) {
    await getAdmin().from("caption_document_versions").insert({
      document_id: exists.id, owner_id: user.id, revision, reason: "autosnapshot", doc,
    });
  }
  return ok({ revision });
});
