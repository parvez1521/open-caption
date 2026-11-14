-- Monthly video quota events (owner decision 2026-11-14).
-- One row per finished video export (MP4, ProRes overlay, WebM overlay).
-- Text caption files are never recorded. The app counts a user's rows in
-- the current 30-day window (paid: the pass window ending at
-- profiles.plan_expires_at; Free: the rolling last 30 days) and blocks the
-- export at the plan limit (Free 3, Starter 10, Plus 20, Pro 40 / month).
-- A failed or cancelled render keeps its slot: the row is written only
-- after the export job exists (server) or the file is saved (browser MP4),
-- and it is keyed by export_id so a retry never writes a second row.
-- Service-role-only (RLS on, no policies — same shape as
-- growth_connections). export_id is NOT a foreign key to public.exports:
-- browser MP4s are rendered on the user's device and have no exports row.

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
