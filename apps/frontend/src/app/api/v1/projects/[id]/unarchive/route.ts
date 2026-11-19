import { requireUser } from "@/lib/api/auth";
import { notFound, ok, route, type Ctx } from "@/lib/api/http";
import { PROJECT_COLUMNS, toApiProject } from "@/lib/api/projects";
import { rateLimit } from "@/lib/api/rateLimit";

export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "project_write", 60, 3600);
  const { id } = await params;
  const { data } = await user.db.from("projects").update({ archived_at: null, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select(PROJECT_COLUMNS).maybeSingle();
  if (!data) throw notFound("Project");
  return ok(toApiProject(data));
});
