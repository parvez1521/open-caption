import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { signedGet } from "@/lib/api/storage";
import { rateLimit } from "@/lib/api/rateLimit";

/** Fresh short-lived download link for an export the caller owns. */
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "export", 120, 3600);
  const { id } = await params;
  const { data: exp } = await user.db.from("exports").select("id, storage_path, status_v2, kind, project_id").eq("id", id).maybeSingle();
  if (!exp) throw notFound("Export");
  if (exp.status_v2 === "expired") throw new ApiFailure("NOT_FOUND", "This export expired. Export again to get a new file.");
  if (exp.status_v2 !== "ready" || !exp.storage_path) throw new ApiFailure("CONFLICT", "This export is not ready yet.");
  // MA-A7-002: storage_path lives on the caller's own row and is
  // owner-writable via direct PostgREST — never sign a path outside this
  // caller's storage (exports always live under <owner>/<project>/exports/).
  if (!(exp.storage_path as string).startsWith(`${user.id}/`)) throw notFound("Export");
  const ext = exp.storage_path.split(".").pop() ?? "mp4";
  return ok({ url: await signedGet(exp.storage_path, 600, `captions-${exp.id.slice(0, 8)}.${ext}`) });
});
