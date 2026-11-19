-- ============================================================================
-- PROPOSED — not applied; apply via SQL Editor with owner sign-in.
-- Master A-Z audit 2026-11-19, MA-A7-005 (part). Do NOT apply to any
-- database from this repo; the owner applies it by hand after the
-- validation queries in the header below. No database was touched by
-- this change. Re-runnable: each constraint is dropped first, then
-- re-added, so a second run is a no-op (it re-validates, then succeeds).
-- ============================================================================
-- DRAFT — DO NOT APPLY without owner approval. Master A-Z audit 2026-11-19.
-- Fixes MA-A7-005 (part): storage paths on a caller's own row must belong
-- to that caller. Without this, a direct-PostgREST insert can point an
-- own videos/exports row at another user's object and get a signed URL
-- for it (see MA-A7-002; the app-side read gates for that landed in
-- commit 18168db, and the app-side write guards in lib/api/storage.ts).
--
-- Scope is deliberately the draft's: videos.storage_path and
-- exports.storage_path only. preview_path / thumbnail_path /
-- cloud_storage_path are always owner-prefixed by construction and are
-- covered at runtime by the MA-A7-002 read gates; they can be added to
-- the CHECK in a follow-up if the owner wants the DB to enforce them too.
-- The fuller fix (composite FKs or an owner-consistency trigger on every
-- child table) is a larger change and is NOT this file.
--
-- VALIDATION (run first, read-only) — expect 0 rows except legacy paths:
--   select id, owner_id, storage_path from public.videos
--    where storage_path not like owner_id::text || '/%'
--      and storage_path not like 'local:%'
--      and storage_path not like 'projects/%';
--   select id, owner_id, storage_path from public.exports
--    where storage_path is not null
--      and storage_path not like owner_id::text || '/%';
-- If either returns rows, clean them up (or widen the grandfather clause)
-- BEFORE applying; otherwise the ALTER will fail.
-- ROLLBACK:
--   alter table public.videos drop constraint if exists videos_storage_path_owner_ck;
--   alter table public.exports drop constraint if exists exports_storage_path_owner_ck;
-- ============================================================================

alter table public.videos
  drop constraint if exists videos_storage_path_owner_ck;

alter table public.videos
  add constraint videos_storage_path_owner_ck
  check (
    storage_path like owner_id::text || '/%'
    or storage_path like 'local:%'
    or storage_path like 'projects/%'  -- legacy bucket paths, grandfathered
  );

alter table public.exports
  drop constraint if exists exports_storage_path_owner_ck;

alter table public.exports
  add constraint exports_storage_path_owner_ck
  check (
    storage_path is null
    or storage_path like owner_id::text || '/%'
  );
