-- 20261116000000_video_cloud_sync.sql — cloud copy of on-device videos
--
-- Videos live in the browser's IndexedDB on the device they were uploaded
-- from, so opening a project on a second device shows the upload screen
-- (videoGone). This adds two columns to public.videos so a video can also
-- keep a cloud copy in the `media` storage bucket:
--   cloud_storage_path — object path of the synced copy (NULL = never synced)
--   cloud_synced_at    — when the copy was confirmed in storage
--
-- The cloud copy is capped at 50 MB per video (Supabase Free bounds a
-- single stored file at 50 MB; see STORAGE_PLATFORM_FILE_CAP_BYTES in
-- packages/shared/src/plans.ts). The app enforces the cap server-side in
-- POST /api/v1/videos/:id/sync; the columns carry no check constraint
-- because the cap is a platform limit, not a data invariant.
--
-- No RLS/policy change: videos already has its owner policies; the new
-- columns are read/written only through the server (service role) and the
-- RLS-scoped studio read.

alter table public.videos
  add column if not exists cloud_storage_path text,
  add column if not exists cloud_synced_at timestamptz;
