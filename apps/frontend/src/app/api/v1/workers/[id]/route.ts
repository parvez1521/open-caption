import { z } from "zod";
import { forgetWorker, requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";

/** Removing a computer revokes its token (the companion gets 401 within a minute: tokens are cached that long). */
export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "workers_write", 60, 3600);
  const { id } = await params;
  const { data: w } = await user.db.from("workers").select("id").eq("id", id).maybeSingle();
  if (!w) throw notFound("Computer");
  const admin = getAdmin();
  const { error } = await admin.from("workers").update({ revoked_at: new Date().toISOString(), status: "offline", current_job_id: null }).eq("id", id);
  if (error) throw new ApiFailure("INTERNAL", "Could not remove this computer", error.message);
  forgetWorker(id);
  // give any job it was holding back to the queue
  await admin.from("jobs").update({ status: "queued", worker_id: null, lease_expires_at: null }).eq("worker_id", id).eq("status", "processing");
  return ok({ revoked: true });
});

export const PATCH = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "workers_write", 60, 3600);
  const { id } = await params;
  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80) }));
  const { data, error } = await user.db.from("workers").update({ name }).eq("id", id).select("id, name").maybeSingle();
  if (error || !data) throw notFound("Computer");
  return ok(data);
});
