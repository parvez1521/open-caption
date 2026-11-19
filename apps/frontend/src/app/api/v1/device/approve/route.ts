import { DeviceApproveBody } from "@capseasy/shared";
import { requireUser, requireCompanionsEnabled } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";

const normalize = (c: string) => c.trim().toUpperCase();

/** Shows the pending device to the logged-in user (name/platform) before they approve. */
export const GET = route(async (req: Request) => {
  await requireUser(req);
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  await rateLimit(ip, "device_approve", 20, 3600);
  const code = normalize(new URL(req.url).searchParams.get("code") ?? "");
  if (!code) throw new ApiFailure("VALIDATION", "Missing code");
  const { data } = await getAdmin().from("device_codes").select("user_code, worker_name, platform, status, expires_at").eq("user_code", code).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw notFound("Pairing code");
  return ok({ userCode: data.user_code, workerName: data.worker_name, platform: data.platform, status: data.status });
});

export const POST = route(async (req: Request) => {
  requireCompanionsEnabled();
  const user = await requireUser(req);
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  await rateLimit(ip, "device_approve", 20, 3600);
  const body = await parseBody(req, DeviceApproveBody);
  const admin = getAdmin();
  const code = normalize(body.userCode);

  const { data, error } = await admin
    .from("device_codes")
    .update(body.approve ? { status: "approved", owner_id: user.id, approved_at: new Date().toISOString() } : { status: "denied", owner_id: user.id })
    .eq("user_code", code).eq("status", "pending").gt("expires_at", new Date().toISOString())
    .select("user_code").maybeSingle();
  if (error) throw new ApiFailure("INTERNAL", "Could not update pairing", error.message);
  if (!data) throw new ApiFailure("NOT_FOUND", "This code is invalid, expired, or already used.");
  return ok({ approved: body.approve });
});
