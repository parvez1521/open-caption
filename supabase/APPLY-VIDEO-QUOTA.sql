-- APPLY-VIDEO-QUOTA.sql — monthly video quota events (owner decision 2026-11-14)
--
-- How to apply: open the Supabase dashboard for the OPEN CAPTION project
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: creates public.video_quota_events — one row per finished
-- video export (MP4, ProRes overlay, WebM overlay). Text caption files are
-- never recorded. The app counts a user's rows in the current 30-day window
-- (paid: the pass window ending at profiles.plan_expires_at; Free: the
-- rolling last 30 days) and blocks the export at the plan limit
-- (Free 3, Starter 10, Plus 20, Pro 40 videos a month). A failed or
-- cancelled render keeps its slot: the row is written only after the export
-- job exists (server) or the file is saved (browser MP4), and it is keyed by
-- export_id so a retry never writes a second row.
--
-- The table is service-role-only (RLS on, no policies — same shape as
-- growth_connections). There is deliberately NO authenticated policy: the
-- app reads and writes it only through the server (service role). The
-- export_id is NOT a foreign key to public.exports: browser MP4s are
-- rendered on the user's device and have no exports row.
--
-- Idempotent: safe to run more than once.

-- ---------- STEP 1: RECORD THE BEFORE STATE (run first, keep the output) ----------
select count(*) as video_quota_events_before from public.video_quota_events;
--    expect: 0 rows on first run (or "relation does not exist" — that is fine,
--    it just means the table is not there yet)

select count(*) as existing_projects from public.projects;
--    expect: a number — STEP 3 must show the same number

-- ---------- STEP 2: DDL ----------
create table if not exists public.video_quota_events (
  id          uuid primary key default gen_random_uuid(),
  export_id   uuid not null unique,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  kind        text not null check (kind in ('mp4', 'mov_alpha', 'webm_alpha')),
  created_at  timestamptz not null default now()
);
create index if not exists video_quota_events_owner_created_idx
  on public.video_quota_events (owner_id, created_at desc);
create index if not exists video_quota_events_export_idx
  on public.video_quota_events (export_id);

alter table public.video_quota_events enable row level security;

-- No policies on purpose: the server (service role) is the only writer and
-- reader. Do NOT add an authenticated policy — the quota is enforced
-- server-side and a client-written row would let anyone inflate or bypass it.
grant all on public.video_quota_events to service_role;

-- ---------- STEP 3: VERIFY (run last, keep the output) ----------
-- RLS is on for video_quota_events:
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname = 'video_quota_events';
--    expect: 1 row, rls_enabled = true

-- No policies (service role only):
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename = 'video_quota_events';
--    expect: 0 rows

-- The columns landed:
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'video_quota_events'
 order by ordinal_position;
--    expect: 6 rows (id, export_id, owner_id, project_id, kind, created_at)

-- Grants on video_quota_events:
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name = 'video_quota_events'
   and grantee in ('authenticated', 'service_role')
 order by grantee, privilege_type;
--    expect: service_role full set only, nothing for authenticated

-- Existing data untouched:
select count(*) as existing_projects from public.projects;
--    expect: the same number as STEP 1
