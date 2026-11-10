import { NextResponse } from "next/server";
import { z } from "zod";
import { planFor } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import {
  PROJECT_COLUMNS,
  PROJECT_COLUMNS_WITH_ORG,
  PROJECT_ORG_PENDING_MESSAGE,
  isMissingOrgColumnError,
  normalizeProjectFolder,
  normalizeProjectTags,
  toApiProject,
  withOrgDefaults,
} from "@/lib/api/projects";
import { rateLimit } from "@/lib/api/rateLimit";

/** Query-param sentinel for "projects with no folder". */
export const UNFILED_FOLDER = "__unfiled__";

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const includeArchived = url.searchParams.get("include_archived") === "true";
  const folderParam = url.searchParams.get("folder");
  const tagParam = url.searchParams.get("tag")?.trim() || null;

  const runQuery = (columns: string, withOrg: boolean) => {
    let q = user.db.from("projects").select(columns, { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (!includeArchived) q = q.is("archived_at", null);
    if (withOrg && folderParam !== null) {
      q = folderParam === UNFILED_FOLDER ? q.is("folder", null) : q.eq("folder", folderParam);
    }
    if (withOrg && tagParam) q = q.contains("tags", [tagParam]);
    return q;
  };

  // A15: try the org columns first; until APPLY-PROJECT-FOLDERS-TAGS.sql is
  // run they do not exist, so fall back to the base columns — the list keeps
  // working exactly as before and reports org_ready:false (filters are then
  // simply not applied server-side; the client disables them on this flag).
  const orgAttempt = await runQuery(PROJECT_COLUMNS_WITH_ORG, true);
  if (!orgAttempt.error) {
    const data = orgAttempt.data ?? [];
    return NextResponse.json({
      success: true,
      data: data.map((p) => toApiProject(withOrgDefaults(p as { status?: string | null; folder?: unknown; tags?: unknown }))),
      meta: { total: orgAttempt.count ?? 0, limit, offset, org_ready: true },
    });
  }
  if (!isMissingOrgColumnError(orgAttempt.error)) {
    throw new ApiFailure("INTERNAL", "Could not load projects", orgAttempt.error.message);
  }
  const { data, count, error } = await runQuery(PROJECT_COLUMNS, false);
  if (error) throw new ApiFailure("INTERNAL", "Could not load projects", error.message);
  return NextResponse.json({
    success: true,
    data: (data ?? []).map((p) => toApiProject(withOrgDefaults(p as { status?: string | null; folder?: unknown; tags?: unknown }))),
    meta: { total: count ?? 0, limit, offset, org_ready: false },
  });
});

const CreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  folder: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().max(80)).max(24).optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "project_create", 30, 3600);
  const body = await parseBody(req, CreateBody);
  const wantsOrg = body.folder !== undefined || body.tags !== undefined;

  const [{ data: profile }, { count }] = await Promise.all([
    user.db.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    user.db.from("projects").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  const limits = planFor(profile?.plan);
  if ((count ?? 0) >= limits.maxProjects) {
    throw new ApiFailure("LIMIT_EXCEEDED", `Your plan allows ${limits.maxProjects} projects. Delete an old one to create a new one.`);
  }

  const row: Record<string, unknown> = { owner_id: user.id, title: body.title, status: "CREATED" };
  if (wantsOrg) {
    row.folder = normalizeProjectFolder(body.folder);
    row.tags = normalizeProjectTags(body.tags ?? []);
  }
  const { data, error } = await user.db
    .from("projects")
    .insert(row)
    .select(wantsOrg ? PROJECT_COLUMNS_WITH_ORG : PROJECT_COLUMNS)
    .single();
  if (error || !data) {
    // A create that named folder/tags before the APPLY file ran: plain
    // pending message, never a raw PostgREST error (Phase-6 pattern).
    if (wantsOrg && isMissingOrgColumnError(error)) throw new ApiFailure("INTERNAL", PROJECT_ORG_PENDING_MESSAGE);
    throw new ApiFailure("INTERNAL", "Could not create the project", error?.message);
  }
  return ok(toApiProject(withOrgDefaults(data as { status?: string | null; folder?: unknown; tags?: unknown })), 201);
});
