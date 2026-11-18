import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { isOwnerEmail, toSubscriberCsv, type SubscriberRow } from "@/lib/marketing/subscribers";
import { getAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/subscribers — the owner's subscriber list.
 * Owner-only: the caller's email must be in OWNER_EMAILS (comma-separated,
 * Vercel env). Anything else — ordinary user, guest, missing allowlist —
 * gets 403. Fail closed: with OWNER_EMAILS unset, nobody can export.
 *
 * No ?format → JSON { total, subscribers } (the Settings page uses this to
 * decide whether to show the export button at all).
 * ?format=csv → the full list as a CSV download (email, opt-in flag,
 * opt-in time, source, created at). The flag travels with every row so
 * the owner filters to opted-in addresses before sending promo mail.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  if (!isOwnerEmail(user.email)) throw new ApiFailure("FORBIDDEN", "Only the site owner can export subscribers");
  await rateLimit(user.id, "admin_subscribers", 10, 3600);

  const { data, error } = await getAdmin()
    .from("marketing_subscribers")
    .select("email, marketing_opt_in, marketing_opt_in_at, source, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new ApiFailure("INTERNAL", "Could not load subscribers", error.message);

  const rows: SubscriberRow[] = (data ?? []).map((r) => ({
    email: String((r as { email: unknown }).email ?? ""),
    marketing_opt_in: (r as { marketing_opt_in: unknown }).marketing_opt_in === true,
    marketing_opt_in_at: ((r as { marketing_opt_in_at: unknown }).marketing_opt_in_at as string | null) ?? null,
    source: String((r as { source: unknown }).source ?? "email"),
    created_at: String((r as { created_at: unknown }).created_at ?? ""),
  }));

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "csv") {
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(toSubscriberCsv(rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="captionit-subscribers-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return ok({ total: rows.length, subscribers: rows });
});
