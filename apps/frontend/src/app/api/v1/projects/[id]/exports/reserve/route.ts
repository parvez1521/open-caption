import { z } from "zod";
import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";
import {
  VIDEO_QUOTA_KINDS,
  releaseVideoQuotaEvent,
  reserveVideoQuotaEvent,
} from "@/lib/billing/videoQuota";

const Body = z.object({
  exportId: z.string().uuid(),
  kind: z.enum(VIDEO_QUOTA_KINDS),
});

/**
 * Pre-flight quota reservation for browser-rendered videos (B-04).
 *
 * MP4s are rendered on the user's own device and never touch the server
 * exports route, so the Studio/Clipper reserves one of the month's videos
 * HERE before rendering starts — the server-side check the client cannot
 * skip — and the post-render record (same exportId) is then a no-op. A
 * render that fails or is cancelled releases the slot with DELETE below,
 * so a failed render never eats a video. Events stay with the caller's id
 * and do not carry over on claim.
 *
 * A missing quota table answers reserved:false instead of an error: the
 * render is allowed and simply not counted yet — the same soft-fail as
 * the record path, never a 500.
 *
 * PER-01-B: guests do NOT reach this route from the Studio — export is the
 * moment a guest creates their (free) account. StudioPage.openExport shows
 * the signup gate for every guest and every kind, the server exports route
 * 403s guests for every kind, and auth.ts states the rule outright
 * ("anonymous guest … may edit, may not export"). An earlier version of
 * this comment claimed the opposite ("browser MP4 has always been open to
 * guests"); that was false. This route itself takes any authenticated
 * caller (requireUser accepts an anonymous token), so a direct call from a
 * guest token would still reserve — that is only a quota pre-flight, never
 * an export, and must not be read as guest export being open.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  await rateLimit(user.id, "export", 120, 3600);
  const body = await parseBody(req, Body);

  const { data: project } = await user.db.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  const admin = getAdmin();
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const plan = effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at);
  const { reserved, usage } = await reserveVideoQuotaEvent(admin, {
    exportId: body.exportId,
    ownerId: user.id,
    projectId,
    kind: body.kind,
    plan,
    expiresAt: (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
  });
  if (!reserved) return ok({ reserved: false, usage: null });
  return ok({ reserved: true, usage }, 201);
});

/**
 * Give a reserved slot back: the render failed or was cancelled before
 * producing a video, so the reservation for this exportId is deleted.
 * Owner-scoped (export_id + owner_id) and best-effort — always answers ok.
 * The export id travels as a query param because apiClient.delete sends no body.
 */
export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  const parsed = z.string().uuid().safeParse(new URL(req.url).searchParams.get("exportId"));
  if (!parsed.success) throw new ApiFailure("VALIDATION", "Invalid request body");
  const exportId = parsed.data;

  const { data: project } = await user.db.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  await releaseVideoQuotaEvent(getAdmin(), { exportId, ownerId: user.id });
  return ok({ released: true });
});
