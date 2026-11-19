-- ============================================================================
-- PROPOSED — not applied; apply via SQL Editor with owner sign-in.
-- Master A-Z audit 2026-11-19, MA-A7-001. Do NOT apply to any database
-- from this repo; the owner applies it by hand after the validation
-- queries in the header below. No database was touched by this change.
-- ============================================================================
-- ============================================================================
-- DRAFT — DO NOT APPLY without owner approval. Master A-Z audit 2026-11-19.
-- Fixes MA-A7-001: the daily cleanup (old_storage_objects, FILE_DAYS default
-- 1) deletes live cloud-sync video copies (media/<owner>/<project>/cloud/…)
-- and paid exports whose exports.expires_at is still in the future.
-- Also repairs stale videos.cloud_storage_path pointers (object already
-- gone) so sync stops short-circuiting with synced:true on a dead path.
--
-- VALIDATION (run first, read-only):
--   select count(*) from storage.objects o where o.bucket_id in ('media','videos')
--     and (storage.foldername(o.name))[3] = 'cloud' and o.created_at < now() - interval '1 day';
--   select count(*) from public.exports e where e.expires_at > now()
--     and not exists (select 1 from storage.objects o where o.bucket_id='media' and o.name=e.storage_path);
--   select count(*) from public.videos v where v.cloud_storage_path is not null
--     and not exists (select 1 from storage.objects o where o.bucket_id='media' and o.name=v.cloud_storage_path);
-- ROLLBACK: re-run the previous definition of old_storage_objects from
--   supabase/migrations/20261002130000_old_storage_objects.sql. The repair
--   UPDATE is not reversible (cleared pointers cannot be re-derived) — back
--   up videos.cloud_storage_path first:
--   create table _backup_videos_cloud_path_20261119 as
--     select id, cloud_storage_path, cloud_synced_at from public.videos
--     where cloud_storage_path is not null;
-- ============================================================================

-- 1) Cloud copies are persistent (second-device access, no expiry): never
--    list them for deletion. Exports are deleted only once their own
--    exports.expires_at has passed (plan retention 7/30/60d), not after a
--    blanket 1 day. Everything else (source/preview/thumbs/orphans) keeps
--    the old age sweep.
create or replace function public.old_storage_objects(p_days int default 7, p_limit int default 1000)
returns table(bucket text, name text)
language sql security definer set search_path = '' stable as $$
  select o.bucket_id::text, o.name::text from storage.objects o
   where o.bucket_id in ('media', 'videos')
     and (storage.foldername(o.name))[3] is distinct from 'cloud'
     and (
       -- export outputs: only once the owning row has expired (or is orphaned)
       coalesce((storage.foldername(o.name))[3], '') <> 'exports'
       or not exists (
         select 1 from public.exports e
          where e.storage_path = o.name and e.expires_at is not null and e.expires_at > now()
       )
     )
     and o.created_at < now() - make_interval(days => p_days)
   order by o.created_at
   limit p_limit
$$;
revoke all on function public.old_storage_objects(int, int) from public, anon, authenticated;

-- 2) Repair: clear cloud pointers whose object is already gone (e.g. swept
--    before this fix), so the sync routes offer a fresh upload instead of
--    answering synced:true for a dead path.
update public.videos v
   set cloud_storage_path = null, cloud_synced_at = null
 where v.cloud_storage_path is not null
   and not exists (
     select 1 from storage.objects o
      where o.bucket_id = 'media' and o.name = v.cloud_storage_path
   );
