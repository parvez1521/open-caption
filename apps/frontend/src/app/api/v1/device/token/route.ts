import { randomBytes } from "node:crypto";
import { DeviceTokenBody } from "@capseasy/shared";
import { sha256, requireCompanionsEnabled } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { getAdmin } from "@/lib/supabase/admin";

/**
 * Companion step 2 (polled): exchange the device code for a long-lived token once the user approved it.
 * The token is shown exactly once and stored only as a SHA-256 hash.
 */
export const POST = route(async (req: Request) => {
  requireCompanionsEnabled();
  // Throttle the poll: the companion polls every ~3s while a pairing waits for approval and a device
  // code lives 10 minutes, so a real session costs at most ~200 hits. The caps sit far above that —
  // they only bite on floods (per IP across codes, and per code hash against replay hammering).
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  await rateLimit(ip, "device_token", 600, 3600);
  const { deviceCode, workerName, platform } = await parseBody(req, DeviceTokenBody);
  const admin = getAdmin();
  const hash = sha256(deviceCode);
  await rateLimit(hash, "device_token_code", 300, 3600);

  const { data: row } = await admin.from("device_codes").select("*").eq("device_code_hash", hash).maybeSingle();
  if (!row) throw new ApiFailure("NOT_FOUND", "Unknown pairing code");
  if (row.status === "denied") return ok({ status: "denied" as const });
  if (row.status === "consumed") return ok({ status: "expired" as const });
  if (new Date(row.expires_at).getTime() < Date.now()) return ok({ status: "expired" as const });
  if (row.status !== "approved" || !row.owner_id) return ok({ status: "pending" as const });

  // consume atomically so two polls can never mint two tokens
  const { data: claimed } = await admin.from("device_codes").update({ status: "consumed" }).eq("device_code_hash", hash).eq("status", "approved").select("user_code").maybeSingle();
  if (!claimed) return ok({ status: "expired" as const });

  const token = `cpe_${randomBytes(32).toString("base64url")}`;
  const { data: worker, error } = await admin.from("workers").insert({
    owner_id: row.owner_id,
    name: row.worker_name ?? workerName ?? "My Computer",
    platform: row.platform ?? platform ?? null,
    status: "online",
    last_seen_at: new Date().toISOString(),
    token_hash: sha256(token),
    token_prefix: token.slice(0, 8),
  }).select("id").single();
  if (error || !worker) throw new ApiFailure("INTERNAL", "Could not register this computer", error?.message);

  return ok({ status: "approved" as const, workerId: worker.id, token });
});
