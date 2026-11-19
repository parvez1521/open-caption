import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";

/** The caller's paired computers. "online" is derived from a recent heartbeat, not a stale status flag. */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "workers_read", 600, 3600);
  const { data, error } = await user.db
    .from("workers")
    .select("id, name, status, last_seen_at, last_error, platform, version, capabilities, current_job_id, revoked_at")
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false });
  if (error) throw new ApiFailure("INTERNAL", "Failed to fetch computers", error.message);
  const fresh = Date.now() - 45_000;
  return ok(
    (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      status: w.last_seen_at && new Date(w.last_seen_at).getTime() > fresh ? "online" : "offline",
      lastSeenAt: w.last_seen_at,
      lastError: w.last_error,
      platform: w.platform,
      version: w.version,
      capabilities: w.capabilities,
      busy: Boolean(w.current_job_id),
    })),
  );
});
