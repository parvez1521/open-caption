import { getAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Guests who never signed up and haven't been back for this long are removed with everything they uploaded. */
const STALE_DAYS = Number(process.env.GUEST_STALE_DAYS ?? 7);
/** uploaded videos/exports older than this are removed: videos now live on users' devices */
const FILE_DAYS = Number(process.env.STORAGE_FILE_DAYS ?? 1);
/** per run, so one call always finishes inside the function time limit */
const MAX_PER_RUN = 300;
/** rows owned by a user, children first (job_events and document versions cascade) */
const OWNED_TABLES = ["exports", "caption_documents", "caption_translations", "jobs", "transcripts", "usage_events", "videos", "projects", "user_looks", "favorite_looks", "brand_kits", "user_fonts", "workers"];

/**
 * Daily (Vercel Cron, see vercel.json). 1) Delete stale anonymous guests. Their storage files go first (through the
 * Storage API), then their rows, then the auth user. Signed-up users are never touched: a user with an email,
 * or a pending email, is not a guest. 2) Delete stored videos and exports older than FILE_DAYS (projects and
 * captions stay; the user re-selects the video from their device).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const admin = getAdmin();
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  const stale: string[] = [];
  for (let page = 1; stale.length < MAX_PER_RUN; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    for (const u of data.users) {
      const lastSeen = Date.parse(u.last_sign_in_at ?? u.created_at);
      if (u.is_anonymous && !u.email && !u.new_email && lastSeen < cutoff) stale.push(u.id);
    }
    if (data.users.length < 1000) break;
  }

  let removed = 0, files = 0;
  const failures: string[] = [];
  for (const id of stale.slice(0, MAX_PER_RUN)) {
    try {
      const { data: objects, error: pathsErr } = await admin.rpc("user_storage_paths", { p_user: id });
      if (pathsErr) throw new Error(pathsErr.message);
      const byBucket = new Map<string, string[]>();
      for (const o of (objects ?? []) as { bucket: string; name: string }[]) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name]);
      for (const [bucket, names] of byBucket) {
        for (let i = 0; i < names.length; i += 100) {
          const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
          if (error) throw new Error(`storage ${bucket}: ${error.message}`);
        }
        files += names.length;
      }
      for (const t of OWNED_TABLES) {
        const { error } = await admin.from(t).delete().eq("owner_id", id);
        if (error) throw new Error(`${t}: ${error.message}`);
      }
      await admin.from("profiles").delete().eq("id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`auth: ${error.message}`);
      removed++;
    } catch (e) {
      failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. old files
  let oldFiles = 0;
  for (let round = 0; round < 5; round++) {
    const { data: old, error } = await admin.rpc("old_storage_objects", { p_days: FILE_DAYS, p_limit: 1000 });
    if (error) { failures.push(`old files: ${error.message}`); break; }
    const rows = (old ?? []) as { bucket: string; name: string }[];
    if (!rows.length) break;
    const byBucket = new Map<string, string[]>();
    for (const o of rows) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name]);
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { error: rmErr } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (rmErr) failures.push(`storage ${bucket}: ${rmErr.message}`);
      }
      // downloads of removed exports would 404: mark them expired
      await admin.from("exports").update({ status_v2: "expired" }).in("storage_path", names);
    }
    oldFiles += rows.length;
    if (rows.length < 1000) break;
  }

  const result = { ok: failures.length === 0, guestsFound: stale.length, guestsRemoved: removed, guestFiles: files, oldFilesRemoved: oldFiles, failures: failures.slice(0, 20) };
  console.log(JSON.stringify({ cron: "cleanup", ...result }));
  return Response.json(result);
}
