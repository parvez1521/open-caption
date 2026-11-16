-- APPLY-VIDEO-CLOUD-SYNC.sql — cloud copy of on-device videos (owner decision 2026-11-16)
--
-- How to apply: open the Supabase dashboard for the OPEN CAPTION project
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: adds public.videos.cloud_storage_path (object path of the
-- synced copy in the `media` bucket, NULL = never synced) and
-- public.videos.cloud_synced_at (when the copy was confirmed). The app
-- uploads a video's cloud copy in the background after the local save
-- (capped at 50 MB — Supabase Free bounds a single stored file at 50 MB)
-- and serves it to a second device through the studio read, so the project
-- opens there instead of showing the upload screen.
--
-- No RLS/policy change: videos already has its owner policies; the new
-- columns are written only through the server (service role) and read
-- through the RLS-scoped studio read.
--
-- Idempotent: safe to run more than once.

-- ---------- STEP 1: RECORD THE BEFORE STATE (run first, keep the output) ----------
-- NOTE: only the projects count here. Do NOT select the new columns yet —
-- the SQL Editor runs the whole paste as one batch and aborts on the first
-- error, and the columns do not exist until STEP 2.
select count(*) as existing_projects from public.projects;
--    expect: a number — STEP 3 must show the same number

-- ---------- STEP 2: DDL ----------
alter table public.videos
  add column if not exists cloud_storage_path text,
  add column if not exists cloud_synced_at timestamptz;

-- ---------- STEP 3: VERIFY (run last, keep the output) ----------
-- Both columns exist on public.videos:
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'videos'
   and column_name in ('cloud_storage_path', 'cloud_synced_at')
 order by column_name;
--    expect: 2 rows — cloud_storage_path (text), cloud_synced_at (timestamp with time zone)

select count(*) as existing_projects from public.projects;
--    expect: the same number as STEP 1
