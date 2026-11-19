import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const BrandBody = z.object({ colors: z.array(Hex).max(12), fontId: z.string().max(60).nullable().default(null) });

/** One brand kit per user: a palette + preferred font, offered as quick picks in the Style panel. */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "brand_read", 600, 3600);
  const { data } = await user.db.from("brand_kits").select("id, colors, font_ids").order("created_at").limit(1).maybeSingle();
  return ok({ colors: (data?.colors as string[] | null) ?? [], fontId: ((data?.font_ids as string[] | null) ?? [])[0] ?? null });
});

export const PUT = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "brand_write", 60, 3600);
  const body = await parseBody(req, BrandBody);
  const colors = [...new Set(body.colors.map((c) => c.toUpperCase()))];
  const { data: existing } = await user.db.from("brand_kits").select("id").order("created_at").limit(1).maybeSingle();
  const row = { colors, font_ids: body.fontId ? [body.fontId] : [] };
  const { error } = existing
    ? await user.db.from("brand_kits").update(row).eq("id", existing.id)
    : await user.db.from("brand_kits").insert({ ...row, owner_id: user.id, name: "My brand" });
  if (error) throw new ApiFailure("INTERNAL", "Could not save your brand kit", error.message);
  return ok({ colors, fontId: body.fontId });
});
