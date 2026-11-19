import { requireUser } from "@/lib/api/auth";
import { notFound, ok, route, type Ctx } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";

export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "look_save", 60, 3600);
  const { id } = await params;
  const { data } = await user.db.from("user_looks").delete().eq("id", id).select("id").maybeSingle();
  if (!data) throw notFound("Look");
  return ok({ deleted: true });
});
