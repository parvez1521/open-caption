import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, route } from "@/lib/api/http";

/**
 * Global exports list for the signed-in user (newest first), across all projects.
 * Ownership is enforced by RLS through the user-scoped client; project titles are
 * resolved in a second RLS-scoped query. Effective status mirrors the cleanup cron:
 * a ready export past its expires_at is reported as expired.
 * MA-A4-001: paginated (limit/offset + meta.total) — the history used to cap
 * silently at 100 rows with no way to reach older exports.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

  const { data, count, error } = await user.db
    .from("exports")
    .select("id, project_id, kind, status_v2, status, file_size, resolution, created_at, expires_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new ApiFailure("INTERNAL", "Could not load exports", error.message);

  const rows = data ?? [];
  const projectIds = [...new Set(rows.map((r) => r.project_id as string))];
  const titles = new Map<string, string>();
  if (projectIds.length) {
    const { data: projects } = await user.db.from("projects").select("id, title").in("id", projectIds);
    for (const p of projects ?? []) titles.set(p.id as string, p.title as string);
  }

  const now = Date.now();
  const mapped = rows.map((r) => {
    let status = (r.status_v2 as string | null) ?? (r.status as string | null) ?? "queued";
    if (status === "ready" && r.expires_at && new Date(r.expires_at as string).getTime() <= now) status = "expired";
    return {
      id: r.id, project_id: r.project_id, project_title: titles.get(r.project_id as string) ?? null,
      kind: r.kind, status, file_size: r.file_size, resolution: r.resolution,
      created_at: r.created_at, expires_at: r.expires_at,
    };
  });
  return NextResponse.json({ success: true, data: mapped, meta: { total: count ?? mapped.length, limit, offset } });
});
