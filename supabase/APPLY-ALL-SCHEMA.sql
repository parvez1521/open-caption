-- OPEN CAPTION — full schema apply bundle (run in Supabase SQL Editor, in order)
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   python3 supabase/generate-apply-all.py
-- (run from the repo root). The bundle concatenates supabase/migrations/ in
-- timestamp order with re-run guards applied (see the generator). It is a
-- bootstrap for a FRESH project and is re-runnable against a database that
-- already has the schema: policies are dropped first, the one bare
-- add-constraint and the one bare cron.schedule are guarded.

-- ============================================================
-- FILE: app/supabase/migrations/20261001000000_base_schema_reconstructed.sql
-- ============================================================
-- ============================================================================
-- RECONSTRUCTED BASE SCHEMA (added 2026-11-09 for the Open Caption project)
-- ----------------------------------------------------------------------------
-- The upstream repo (Captions-Easy, MIT) ships only LATER migrations
-- (20261002… / 20261004…): they revoke grants on public.profiles, define
-- helper functions over storage.objects / public.jobs / public.workers /
-- public.exports / public.device_codes, and cast to a public.job_status
-- enum — but no migration ever creates those tables. This file reconstructs
-- the minimal base schema the application code actually uses, derived from:
--   * every .from(...) / .rpc(...) call in apps/frontend/src (select lists,
--     insert/update payloads, filters, orderings, upsert conflict targets)
--   * the later migrations' assumptions (columns, enum, cascade behaviour
--     described in apps' cron cleanup: "job_events and document versions
--     cascade", projects expire by created_at, children cascade)
--   * column-level grants in 20261002120000_lock_profile_plan.sql
--     (profiles: full_name, avatar_url, preferences, onboarding, updated_at)
-- It runs BEFORE those migrations (earlier timestamp) so they apply cleanly.
-- Types are deliberately permissive (text statuses, jsonb payloads) — the
-- app validates shapes in TypeScript (zod) before writing.
-- ============================================================================

-- pg_cron: the 20261004120000 migration calls cron.schedule(...) and the
-- queue reaper below is scheduled with it. Available on all Supabase projects.
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Enum used by jobs.status (cast to explicitly by 20261004140000 migration)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user (incl. anonymous guests), id = auth uid.
-- Created by the handle_new_user trigger below; `plan` is server-written
-- only (see the lock_profile_plan migration).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  preferences jsonb not null default '{}'::jsonb,
  onboarding  jsonb not null default '{}'::jsonb,
  plan        text not null default 'free',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects — PROJECT_COLUMNS in lib/api/projects.ts:
-- id, title, description, status, style, look_id, template_id, thumbnail_url,
-- language, aspect_ratio, platform, created_at, updated_at, archived_at
-- plus style_json / settings_json (studio + duplicate routes), deleted_at
-- (soft-delete filter everywhere), owner_id.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  title         text not null default 'Untitled',
  description   text,
  status        text not null default 'CREATED',
  style         text,
  look_id       text,
  template_id   text,
  thumbnail_url text,
  language      text,
  aspect_ratio  text,
  platform      text,
  style_json    jsonb,
  settings_json jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  deleted_at    timestamptz
);
create index if not exists projects_owner_idx on public.projects (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- videos — columns from projects/[id]/videos insert + studio select:
-- storage_path, preview_path, status, width, height, fps, duration_ms,
-- has_audio, original_filename, mime_type, file_size, rotation, probe_json,
-- plus thumbnail_path (worker complete), video_codec / audio_codec (insert),
-- uploaded_at (complete route).
-- ---------------------------------------------------------------------------
create table if not exists public.videos (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  storage_path      text not null,
  preview_path      text,
  thumbnail_path    text,
  status            text not null default 'uploading',
  width             int,
  height            int,
  fps               int,
  duration_ms       bigint,
  has_audio         boolean,
  original_filename text,
  mime_type         text,
  file_size         bigint,
  rotation          int not null default 0,
  video_codec       text,
  audio_codec       text,
  probe_json        jsonb,
  uploaded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists videos_project_idx on public.videos (project_id, created_at desc);
create index if not exists videos_owner_idx on public.videos (owner_id);

-- ---------------------------------------------------------------------------
-- transcripts — lib/api/transcripts.ts insert: project_id, owner_id,
-- language, provider, engine, model, version (int), duration_ms (int),
-- words_json, transcript_json. Studio reads id, transcript_json, words_json.
-- ---------------------------------------------------------------------------
create table if not exists public.transcripts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  language        text,
  provider        text,
  engine          text,
  model           text,
  version         int not null default 1,
  duration_ms     int,
  words_json      jsonb,
  transcript_json jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists transcripts_project_idx on public.transcripts (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- caption_documents — one editable document per project (upsert target is
-- project_id, so it is UNIQUE). revision is bumped by save_caption_doc().
-- ---------------------------------------------------------------------------
create table if not exists public.caption_documents (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null unique references public.projects (id) on delete cascade,
  owner_id            uuid not null references auth.users (id) on delete cascade,
  doc                 jsonb not null default '{}'::jsonb,
  revision            int not null default 0,
  source_transcript_id uuid references public.transcripts (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- caption_document_versions — history snapshots; cascade with the document
-- (per the cron cleanup comment).
create table if not exists public.caption_document_versions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.caption_documents (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  revision    int not null,
  reason      text,
  doc         jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists caption_document_versions_doc_idx
  on public.caption_document_versions (document_id, revision desc);

-- ---------------------------------------------------------------------------
-- workers (desktop companions) — created before jobs: jobs.worker_id points
-- here, workers.current_job_id points back (FK added after jobs exists).
-- token_hash is looked up on every companion call (unique).
-- ---------------------------------------------------------------------------
create table if not exists public.workers (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  name           text,
  platform       text,
  status         text not null default 'offline',
  version        text,
  capabilities   jsonb,
  last_seen_at   timestamptz,
  last_error     text,
  token_hash     text unique,
  token_prefix   text,
  current_job_id uuid,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists workers_owner_idx on public.workers (owner_id, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- jobs — the Postgres job queue. Insert (lib/api/jobs.ts enqueueJob):
-- project_id, owner_id, job_type, kind, status, engine, payload, priority,
-- idempotency_key. Lifecycle columns from browser/worker routes + reaper:
-- progress, stage, message, error_code, error_message, attempts,
-- max_attempts, cancel_requested, worker_id, lease_expires_at, run_after,
-- result, started_at, finished_at, created_at, updated_at.
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  owner_id         uuid not null references auth.users (id) on delete cascade,
  job_type         text,
  kind             text,
  status           public.job_status not null default 'queued',
  engine           text not null default 'local',
  payload          jsonb not null default '{}'::jsonb,
  result           jsonb,
  priority         int not null default 0,
  idempotency_key  text,
  progress         int not null default 0,
  stage            text,
  message          text,
  error_code       text,
  error_message    text,
  attempts         int not null default 0,
  max_attempts     int not null default 3,
  cancel_requested boolean not null default false,
  worker_id        uuid references public.workers (id) on delete set null,
  lease_expires_at timestamptz,
  run_after        timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists jobs_idempotency_idx
  on public.jobs (project_id, idempotency_key) where idempotency_key is not null;
create index if not exists jobs_claim_idx
  on public.jobs (status, run_after, priority desc, created_at);
create index if not exists jobs_project_idx on public.jobs (project_id, created_at desc);
create index if not exists jobs_owner_idx on public.jobs (owner_id, status);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workers_current_job_fk') then
    alter table public.workers
      add constraint workers_current_job_fk
      foreign key (current_job_id) references public.jobs (id) on delete set null;
  end if;
end $$;

-- job_events — append-only log per job (lib/api/jobs.ts logJobEvent);
-- cascades with the job (per the cron cleanup comment).
create table if not exists public.job_events (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  stage      text,
  progress   int,
  message    text,
  level      text not null default 'info',
  data       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists job_events_job_idx on public.job_events (job_id, created_at);

-- ---------------------------------------------------------------------------
-- exports — text exports are inserted ready; renders are queued then updated
-- by the worker. Columns: kind, status_v2 (+ legacy status), storage_path,
-- file_size, resolution, quality, style, settings, doc_revision,
-- render_duration_ms, duration_ms, expires_at, job_id.
-- ---------------------------------------------------------------------------
create table if not exists public.exports (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  owner_id           uuid not null references auth.users (id) on delete cascade,
  job_id             uuid references public.jobs (id) on delete set null,
  kind               text not null,
  status             text,
  status_v2          text,
  storage_path       text,
  file_size          bigint,
  resolution         text,
  quality            text,
  style              text,
  settings           jsonb,
  doc_revision       int,
  render_duration_ms int,
  duration_ms        int,
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists exports_project_idx on public.exports (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- device_codes — companion pairing (device/start, approve, setup, token).
-- user_code is the short code a human types; device_code_hash the secret.
-- ---------------------------------------------------------------------------
create table if not exists public.device_codes (
  user_code       text primary key,
  device_code_hash text not null unique,
  status          text not null default 'pending',
  owner_id        uuid references auth.users (id) on delete cascade,
  approved_at     timestamptz,
  worker_name     text,
  platform        text,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- brand_kits / user_looks / favorite_looks / user_fonts — per-user saves.
-- favorite_looks upserts with ignoreDuplicates and no explicit conflict
-- target, so its primary key must be (owner_id, look_id).
-- user_fonts is only ever touched by owner_id (cron cleanup / guest claim);
-- kept minimal on purpose.
-- ---------------------------------------------------------------------------
create table if not exists public.brand_kits (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text,
  colors     jsonb not null default '[]'::jsonb,
  font_ids   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_looks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  template_id   text,
  style_json    jsonb,
  settings_json jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.favorite_looks (
  owner_id   uuid not null references auth.users (id) on delete cascade,
  look_id    text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, look_id)
);

create table if not exists public.user_fonts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  name         text,
  storage_path text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- usage_events — metering inserts from worker/transcribe completion:
-- owner_id, kind, amount, project_id, job_id.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  amount     bigint not null default 0,
  project_id uuid references public.projects (id) on delete cascade,
  job_id     uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_owner_idx on public.usage_events (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- rate_limits — backing store for rate_limit_hit() (fixed window).
-- Service-role only (RLS on, no policies, no grants below).
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key         text not null,
  window_start bigint not null,
  hits        int not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Storage buckets — `media` holds everything new; `videos` is the legacy
-- bucket for paths starting with projects/ (lib/api/storage.ts bucketFor).
-- Both private: all access is via service-role signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', false), ('videos', 'videos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RPC: claim_next_job — atomically claim the oldest queued job for the
-- worker's owner (FOR UPDATE SKIP LOCKED), as the claim route expects.
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_job(p_worker uuid, p_kinds text[], p_lease_s int)
returns setof public.jobs
language plpgsql
as $$
declare
  v_owner uuid;
begin
  select w.owner_id into v_owner from public.workers w where w.id = p_worker;
  if v_owner is null then
    return;
  end if;
  return query
  update public.jobs j
     set status = 'processing',
         worker_id = p_worker,
         attempts = j.attempts + 1,
         lease_expires_at = now() + make_interval(secs => p_lease_s),
         started_at = coalesce(j.started_at, now()),
         updated_at = now()
   where j.id = (
     select id from public.jobs
      where status = 'queued'
        and cancel_requested = false
        and run_after <= now()
        and owner_id = v_owner
        and (p_kinds is null or kind = any (p_kinds))
      order by priority desc, created_at asc
      for update skip locked
      limit 1
   )
  returning j.*;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: save_caption_doc — optimistic-concurrency autosave. Bumps revision
-- and returns the NEW revision (the route treats the result as a number);
-- a stale writer gets an error whose message contains REVISION_CONFLICT.
-- ---------------------------------------------------------------------------
create or replace function public.save_caption_doc(p_project uuid, p_expected int, p_doc jsonb)
returns int
language plpgsql
as $$
declare
  v_revision int;
begin
  select revision into v_revision
    from public.caption_documents
   where project_id = p_project
   for update;
  if not found then
    raise exception 'REVISION_CONFLICT: no caption document for project %', p_project;
  end if;
  if v_revision <> p_expected then
    raise exception 'REVISION_CONFLICT: expected revision %, server has %', p_expected, v_revision;
  end if;
  update public.caption_documents
     set doc = p_doc,
         revision = v_revision + 1,
         updated_at = now()
   where project_id = p_project;
  return v_revision + 1;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: rate_limit_hit — fixed-window counter; returns the hit count in the
-- current window AFTER this hit (route throws when count > max).
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_window_s int)
returns int
language plpgsql
as $$
declare
  v_window bigint := (floor(extract(epoch from now()) / p_window_s)::bigint) * p_window_s;
  v_hits int;
begin
  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: queue_health — /health/ready expects { claim_fn, reaper_ok } where
-- reaper_ok means the pg_cron reaper ran successfully in the last 5 minutes
-- (see the route's own comment).
-- ---------------------------------------------------------------------------
create or replace function public.queue_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim boolean;
  v_reaper boolean := false;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_next_job'
  ) into v_claim;
  begin
    select exists (
      select 1 from cron.job j
      join cron.job_run_details d on d.jobid = j.jobid
      where j.command ilike '%reap_jobs_and_workers%'
        and d.status = 'succeeded'
        and d.end_time > now() - interval '5 minutes'
    ) into v_reaper;
  exception when others then
    v_reaper := false;
  end;
  return jsonb_build_object('claim_fn', v_claim, 'reaper_ok', v_reaper);
end $$;

-- Schedule the queue reaper every minute. reap_jobs_and_workers() itself is
-- defined by the later 20261004140000 migration; cron only stores the command
-- text, and runs simply fail until that migration lands (minutes later).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'capseasy-reap-jobs') then
    perform cron.schedule('capseasy-reap-jobs', '* * * * *', 'select public.reap_jobs_and_workers()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-scoped. The API acts either as the user (JWT
-- forwarded, RLS enforced) or as the service role (bypasses RLS). Anonymous
-- guests are real auth users with the `authenticated` role, so policies only
-- need that role. device_codes / rate_limits get RLS with NO user policies:
-- service role only.
-- ---------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.projects                enable row level security;
alter table public.videos                  enable row level security;
alter table public.transcripts             enable row level security;
alter table public.caption_documents       enable row level security;
alter table public.caption_document_versions enable row level security;
alter table public.workers                 enable row level security;
alter table public.jobs                    enable row level security;
alter table public.job_events              enable row level security;
alter table public.exports                 enable row level security;
alter table public.device_codes            enable row level security;
alter table public.brand_kits              enable row level security;
alter table public.user_looks              enable row level security;
alter table public.favorite_looks          enable row level security;
alter table public.user_fonts              enable row level security;
alter table public.usage_events            enable row level security;
alter table public.rate_limits             enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (id = auth.uid());

drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_all on public.projects
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists videos_owner_all on public.videos;
create policy videos_owner_all on public.videos
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists transcripts_owner_all on public.transcripts;
create policy transcripts_owner_all on public.transcripts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists caption_documents_owner_all on public.caption_documents;
create policy caption_documents_owner_all on public.caption_documents
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists caption_document_versions_owner_all on public.caption_document_versions;
create policy caption_document_versions_owner_all on public.caption_document_versions
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists workers_owner_all on public.workers;
create policy workers_owner_all on public.workers
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists jobs_owner_all on public.jobs;
create policy jobs_owner_all on public.jobs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists exports_owner_all on public.exports;
create policy exports_owner_all on public.exports
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists brand_kits_owner_all on public.brand_kits;
create policy brand_kits_owner_all on public.brand_kits
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists user_looks_owner_all on public.user_looks;
create policy user_looks_owner_all on public.user_looks
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists favorite_looks_owner_all on public.favorite_looks;
create policy favorite_looks_owner_all on public.favorite_looks
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists user_fonts_owner_all on public.user_fonts;
create policy user_fonts_owner_all on public.user_fonts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists usage_events_owner_all on public.usage_events;
create policy usage_events_owner_all on public.usage_events
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists job_events_owner_select on public.job_events;
create policy job_events_owner_select on public.job_events
  for select to authenticated
  using (job_id in (select id from public.jobs where owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Data API grants (Supabase requires explicit grants for PostgREST access).
-- The lock_profile_plan migration later narrows profiles writes again.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.profiles, public.projects, public.videos, public.transcripts,
  public.caption_documents, public.caption_document_versions, public.workers,
  public.jobs, public.job_events, public.exports, public.brand_kits,
  public.user_looks, public.favorite_looks, public.user_fonts, public.usage_events
to authenticated, service_role;

grant select, insert, update, delete on public.device_codes, public.rate_limits
to service_role;

grant execute on function public.claim_next_job(uuid, text[], int),
                 public.save_caption_doc(uuid, int, jsonb),
                 public.rate_limit_hit(text, int),
                 public.queue_health()
to authenticated, service_role;

-- ============================================================
-- FILE: app/supabase/migrations/20261002120000_lock_profile_plan.sql
-- ============================================================
-- Users (including anonymous guests) may edit only harmless profile fields from the browser.
-- `plan` and ids are written by the server (service role) only; before this, anyone could set plan = 'pro'.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, preferences, onboarding, updated_at) on public.profiles to authenticated;

-- ============================================================
-- FILE: app/supabase/migrations/20261002121000_guest_storage_paths.sql
-- ============================================================
-- Lists every stored file of one user, so the guest cleanup can delete them through the Storage API
-- (rows in storage.objects must not be deleted directly). Service role only.
create or replace function public.user_storage_paths(p_user uuid)
returns table(bucket text, name text)
language sql security definer set search_path = '' stable as $$
  select o.bucket_id::text, o.name::text from storage.objects o
   where (storage.foldername(o.name))[1] = p_user::text
$$;
revoke all on function public.user_storage_paths(uuid) from public, anon, authenticated;

-- ============================================================
-- FILE: app/supabase/migrations/20261002130000_old_storage_objects.sql
-- ============================================================
-- Videos and exports now live on users' devices; anything still in storage older than N days is cleaned up daily.
-- Service role only.
create or replace function public.old_storage_objects(p_days int default 7, p_limit int default 1000)
returns table(bucket text, name text)
language sql security definer set search_path = '' stable as $$
  select o.bucket_id::text, o.name::text from storage.objects o
   where o.bucket_id in ('media', 'videos') and o.created_at < now() - make_interval(days => p_days)
   order by o.created_at
   limit p_limit
$$;
revoke all on function public.old_storage_objects(int, int) from public, anon, authenticated;

-- ============================================================
-- FILE: app/supabase/migrations/20261004120000_expire_projects_24h.sql
-- ============================================================
-- Projects are deleted 24 hours after creation (owner decision, 2026-10-04). Child tables cascade.
create or replace function public.delete_expired_projects(p_hours int default 24, p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with gone as (
    select id from projects where created_at < now() - make_interval(hours => p_hours) order by created_at limit p_limit
  ), del as (
    delete from projects where id in (select id from gone) returning 1
  )
  select count(*) into n from del;
  return n;
end $$;
revoke all on function public.delete_expired_projects(int, int) from public, anon, authenticated;

do $guard$ begin
  if not exists (select 1 from cron.job where jobname = 'capseasy-expire-projects') then
    perform cron.schedule('capseasy-expire-projects', '5 * * * *', $$select public.delete_expired_projects(24, 500)$$);
  end if;
end $guard$;

-- ============================================================
-- FILE: app/supabase/migrations/20261004140000_worker_offline_3min.sql
-- ============================================================
-- Companions now write their liveness at most once a minute (and poll every 1-2 minutes when there is no work),
-- so a helper counts as offline only after 3 minutes of silence instead of 45 seconds.
create or replace function public.reap_jobs_and_workers()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- cloud jobs run inside a single serverless invocation: if its lease ran out, it died; fail it (retryable from the UI)
  update public.jobs set status = 'failed', error_code = 'CLOUD_TIMEOUT',
     error_message = 'Cloud transcription took too long. Try again, or use your computer for long videos.',
     lease_expires_at = null, finished_at = now(), updated_at = now()
   where status = 'processing' and engine = 'cloud' and lease_expires_at < now();
  update public.jobs set
     status = case when attempts >= max_attempts then 'failed'::public.job_status else 'queued'::public.job_status end,
     error_code = 'LEASE_EXPIRED',
     error_message = case when attempts >= max_attempts then 'Your computer stopped responding while working on this job.' else error_message end,
     worker_id = null, lease_expires_at = null,
     run_after = now() + (least(attempts, 5) * interval '20 seconds'),
     finished_at = case when attempts >= max_attempts then now() else finished_at end,
     updated_at = now()
   where status = 'processing' and engine = 'local' and lease_expires_at < now();
  update public.jobs set status = 'cancelled', finished_at = now(), updated_at = now()
   where status = 'queued' and cancel_requested;
  update public.workers set status = 'offline', current_job_id = null
   where status = 'online' and last_seen_at < now() - interval '3 minutes';
  update public.exports set status_v2 = 'expired'
   where status_v2 = 'ready' and expires_at is not null and expires_at < now();
  delete from public.device_codes where expires_at < now() - interval '1 day';
end $function$;

-- ============================================================
-- FILE: app/supabase/migrations/20261110000000_project_persistence.sql
-- ============================================================
-- Project persistence fix (2026-11-10, Phase 2 of the Creator Studio programme).
--
-- BEFORE: migration 20261004120000_expire_projects_24h.sql deleted EVERY project
-- (any owner, registered or guest) 24 hours after creation, hourly via the
-- pg_cron job 'capseasy-expire-projects'. That made any saved-library /
-- workspace promise impossible: a signed-up user's work vanished after a day.
--
-- AFTER (this migration):
--   * Registered (non-anonymous) users' projects NEVER expire.
--   * Anonymous-guest projects are the only ones eligible, and only when BOTH
--     created_at and updated_at are older than a generous 30-day window
--     (i.e. created long ago and never opened/edited since). A hard floor is
--     enforced inside the function: no caller can shrink the window below
--     720 hours, so the old (24, 500) call shape can never come back.
--   * Guest-account cleanup proper (deleting the stale guest user and all
--     their rows after 7 days away) remains the job of the app-level Vercel
--     cron /api/cron/cleanup, which is already guest-scoped. This DB job is
--     now just a backstop for orphaned guest projects.
--   * The cron job is rescheduled from hourly to daily.

-- Replace the function body with the safe predicate. Signature is kept so any
-- existing caller keeps working; p_hours is clamped to >= 720 inside.
create or replace function public.delete_expired_projects(p_hours int default 720, p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare n int; floor_hours int := greatest(coalesce(p_hours, 720), 720);
begin
  with gone as (
    select p.id
      from projects p
      join auth.users u on u.id = p.owner_id
     where coalesce(u.is_anonymous, false) = true
       and p.created_at < now() - make_interval(hours => floor_hours)
       and p.updated_at < now() - make_interval(hours => floor_hours)
     order by p.created_at
     limit p_limit
  ), del as (
    delete from projects where id in (select id from gone) returning 1
  )
  select count(*) into n from del;
  return n;
end $$;
revoke all on function public.delete_expired_projects(int, int) from public, anon, authenticated;

-- Reschedule: drop the old hourly job, run the safe version daily.
select cron.unschedule('capseasy-expire-projects')
 where exists (select 1 from cron.job where jobname = 'capseasy-expire-projects');

select cron.schedule('capseasy-expire-projects', '15 3 * * *', $$select public.delete_expired_projects(720, 500)$$);

-- ============================================================
-- FILE: app/supabase/migrations/20261110010000_brand_voice_profiles.sql
-- ============================================================
-- Brand Voice profiles (2026-11-10, Phase 3 of the Creator Studio transformation).
--
-- BEFORE: public.brand_kits held exactly one kit per user in practice — a colour
-- palette plus a preferred font (font_ids[0]) — read and written by the single-kit
-- route /api/v1/brand (first row by created_at). There was nowhere to store how a
-- creator writes, so the Creator Studio generators could not sound like the user.
--
-- AFTER (this migration): brand_kits doubles as the Brand Voice profile table.
-- Each row is now one named profile:
--   * voice     — the Brand Voice itself (niche, audience, language, tone, writing
--                 style, words to use / avoid, sample captions, preferred CTAs),
--                 stored as one jsonb object and normalised in the app layer
--                 (features/create/brandProfile.ts: normalizeVoice).
--   * is_active — which one profile is the active one; the generators read only
--                 the active profile. The backfill below gives every existing
--                 owner exactly one active profile (their oldest kit) so nobody
--                 loses the kit they already had.
--
-- brand_kits already has row-level security (policy brand_kits_owner_all,
-- owner_id = auth.uid()) and the Data API grants to authenticated + service_role
-- from the base schema, and both cover the new columns automatically — so this
-- migration adds no policies and no grants on purpose.
--
-- Everything here is idempotent: the file can be re-run safely.

alter table public.brand_kits add column if not exists voice jsonb not null default '{}'::jsonb;
alter table public.brand_kits add column if not exists is_active boolean not null default false;

create index if not exists brand_kits_owner_active_idx on public.brand_kits (owner_id, is_active);

-- Backfill: mark the OLDEST row per owner active, but only for owners who have
-- no active row yet. On a re-run every owner already has one, the NOT EXISTS
-- guard matches nothing, and the update is a no-op. The id tie-break keeps the
-- choice deterministic when two rows share a created_at.
update public.brand_kits bk
   set is_active = true
 where bk.id in (
         select distinct on (cand.owner_id) cand.id
           from public.brand_kits cand
          order by cand.owner_id, cand.created_at asc, cand.id asc
       )
   and not exists (
         select 1
           from public.brand_kits cur
          where cur.owner_id = bk.owner_id
            and cur.is_active = true
       );

-- ============================================================
-- FILE: app/supabase/migrations/20261110020000_content_library.sql
-- ============================================================
-- Content library + chat storage (2026-11-10, Phase 3 of the Creator Studio transformation).
--
-- Replaces the localStorage-only Creator Studio drafts (features/create/drafts.ts,
-- key ce:create-drafts, capped at 50, this device only) with a server-side library
-- the signed-in user can reach from anywhere, and adds the storage the AI Studio
-- chat needs: threads owned by a user, each holding ordered messages, optionally
-- anchored to one library item (the piece of content the chat is about).
--
-- Shapes follow the base schema (20261001000000): uuid ids defaulting to
-- gen_random_uuid(), owner_id -> auth.users on delete cascade, timestamptz
-- defaults, RLS owner_all + explicit Data API grants. `body` / `content` are
-- jsonb on purpose: the TypeScript side (zod in the content routes, the typed
-- helpers in features/create/library.ts) validates the per-kind shapes, so a
-- new generator kind does not need a migration.
--
-- Idempotent: safe to re-run (create table/index if not exists, policies are
-- dropped-if-exists then recreated). The paste-ready copy for the SQL Editor
-- is supabase/APPLY-CONTENT-LIBRARY.sql — keep the two in sync.

-- ---------------------------------------------------------------------------
-- content_items — one saved piece of generated / written content.
-- kind is one of the ContentKind values in features/create/library.ts
-- (idea | hook | caption | script | repurpose | shot-list | calendar |
-- carousel | hashtag-group | chat-output); the route validates it, the DB
-- stays permissive like the rest of the base schema. source records how the
-- item was made (template | cloud | model | manual | chat — free text, the
-- route caps its length). folder is a single optional label, not a tree.
-- ---------------------------------------------------------------------------
create table if not exists public.content_items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  title      text not null default '',
  body       jsonb not null default '{}'::jsonb,
  source     text not null default 'template',
  folder     text,
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_items_owner_kind_idx
  on public.content_items (owner_id, kind, created_at desc);
create index if not exists content_items_owner_folder_idx
  on public.content_items (owner_id, folder);

-- ---------------------------------------------------------------------------
-- chat_threads — one AI Studio conversation. context_item_id optionally
-- points at the library item the chat is working on; deleting that item
-- keeps the thread (set null), deleting the user removes everything.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_threads (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  title           text not null default 'Untitled chat',
  context_item_id uuid references public.content_items (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists chat_threads_owner_idx
  on public.chat_threads (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- chat_messages — append-only log per thread. owner_id is denormalised from
-- the thread so RLS can scope rows directly (the base schema does the same
-- for job_events' siblings: every user-owned table carries owner_id).
-- content is jsonb: { text: string, ... } today, richer blocks later.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.chat_threads (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  role       text not null,
  content    jsonb not null default '{}'::jsonb,
  source     text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-scoped, same shape as the base schema.
-- ---------------------------------------------------------------------------
alter table public.content_items enable row level security;
alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists content_items_owner_all on public.content_items;
create policy content_items_owner_all on public.content_items
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_threads_owner_all on public.chat_threads;
create policy chat_threads_owner_all on public.chat_threads
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_messages_owner_all on public.chat_messages;
create policy chat_messages_owner_all on public.chat_messages
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Data API grants (Supabase requires explicit grants for PostgREST access).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.content_items, public.chat_threads, public.chat_messages
to authenticated, service_role;

-- ============================================================
-- FILE: app/supabase/migrations/20261110030000_composition_primary.sql
-- ============================================================
-- CompositionDoc Stage C (2026-11-10, Phase 4 of the Creator Studio
-- transformation; STUDIO-ARCHITECTURE.md §1.2, Stage C): promote the
-- composition slice to a PRIMARY column, public.projects.composition_json.
--
-- BEFORE: the timeline slice of the composition — the video segmentation,
-- the timeline markers, and the per-track state — lives ONLY inside the
-- settings blob, at settings_json -> 'composition' (Stage B,
-- 20261110000000…-era app schema:
-- packages/shared/src/settings.ts → CompositionSettingsSchema:
-- { version: 1, videoSegments: [{id, sourceInMs, sourceOutMs}],
--   markers: [{id, atMs, label}],
--   tracks: {video|captions|text|graphics: {locked, visible, muted}} }).
-- It rides settings_json through the project PATCH route, whose allow-list
-- is ProjectSettingsSchema.partial().
--
-- AFTER (this migration): public.projects gains ONE nullable column,
--
--   composition_json jsonb
--
-- with NO default. NULL means "not yet promoted": the project was created
-- before Stage B (a Stage-A project, whose composition is fully derivable
-- from its parts) or simply has not been opened since activation, and the
-- app synthesises the slice lazily on its first Stage-C read. The backfill
-- below promotes the Stage-B slice into the column wherever one already
-- exists inside settings_json.
--
-- ROLLBACK: this change is purely ADDITIVE. settings_json and every other
-- column are untouched, the settings copy of the slice stays in place, and
-- no other object (table, index, policy, function) depends on the new
-- column during the transition cycle. Reverting is therefore complete and
-- trivial: drop the column —
--   alter table public.projects drop column if exists composition_json;
-- — or simply never activate the app-side switch (see below), in which case
-- the column sits unused forever and harms nothing.
--
-- WARNING: app code must NOT read or write composition_json until the
-- Stage-C activation patch lands together with the STAGE_C_ENABLED flag
-- flip (apps/frontend/src/features/studio/stageC.ts carries the checklist:
-- PATCH-route allow-list + PROJECT_COLUMNS + toApiProject, then wiring
-- readCompositionSettings / buildStageCWritePatch into useStudio). Applying
-- this migration alone changes NO live behaviour: today's code selects an
-- explicit column list that does not include composition_json and its
-- PATCH allow-list rejects the key, so the column is invisible to the app
-- until activation.
--
-- No RLS changes: composition_json is a column on public.projects, which
-- already has row-level security and owner policies; a new column is
-- covered by the existing table-level policies and grants automatically.
--
-- Everything here is idempotent: the file can be re-run safely. The
-- backfill only touches rows whose column is still NULL, so a re-run after
-- activation never overwrites a value the Stage-C app has since written.

alter table public.projects add column if not exists composition_json jsonb;

-- Backfill: promote the Stage-B slice out of settings_json wherever one is
-- stored. Projects whose settings carry no 'composition' key keep NULL —
-- the app derives their composition from parts on first Stage-C read.
update public.projects
   set composition_json = settings_json -> 'composition'
 where composition_json is null
   and settings_json ? 'composition';

-- ============================================================
-- FILE: app/supabase/migrations/20261110040000_caption_translations.sql
-- ============================================================
-- Caption translations (2026-11-10, Phase 5 slice 5.1): translated caption
-- tracks get their own table, public.caption_translations.
--
-- BEFORE: public.caption_documents holds ONE editable document per project
-- (project_id is UNIQUE — it is the upsert target of save_caption_doc()).
-- A translated track is a second, real CaptionDoc (same jsonb shape, same
-- CaptionDocSchema) and cannot live in that table without breaking the
-- primary document's one-row invariant.
--
-- AFTER (this migration): public.caption_translations mirrors
-- caption_documents' shape, keyed by (project_id, language):
--
--   id          uuid pk
--   project_id  uuid -> projects (cascade), part of the unique key
--   language    text — the target language (a verified OPUS-MT pair code;
--               the API validates it against the app registry, the column
--               itself stays a plain text code)
--   owner_id    uuid -> auth.users (cascade)
--   doc         jsonb — the translated CaptionDoc
--   revision    int — bumped on every save by the API route (plain upsert;
--               translations have a single writer, the translating client,
--               so no save_caption_doc()-style optimistic RPC is needed)
--   created_at / updated_at
--
--   unique (project_id, language) — one track per language per project;
--   it is the upsert target of PUT /projects/:id/translations.
--
-- RLS + grants mirror caption_documents exactly: owner-all policy for the
-- authenticated role, full Data API grant to authenticated + service_role.
--
-- ROLLBACK: purely additive — no existing table, column or policy changes.
--   drop table if exists public.caption_translations;
-- Without this migration applied, the translations API route errors on the
-- missing table and the Translate panel reports that honestly; every other
-- surface (primary captions, exports, renders) is untouched.

create table if not exists public.caption_translations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  language    text not null,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  doc         jsonb not null default '{}'::jsonb,
  revision    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, language)
);

alter table public.caption_translations enable row level security;

drop policy if exists caption_translations_owner_all on public.caption_translations;
create policy caption_translations_owner_all on public.caption_translations
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.caption_translations
to authenticated, service_role;

-- ============================================================
-- FILE: app/supabase/migrations/20261110050000_growth_studio.sql
-- ============================================================
-- Growth Studio storage (2026-11-10, Phase 6 slice 6.2 of the Creator Studio transformation).
--
-- Growth Studio is manual / CSV-first by design (transformation brief §11):
-- the creator enters their own post metrics by hand or imports a CSV export
-- they downloaded themselves. There is NO scraping, NO platform-API sync and
-- NO invented analytics anywhere in this feature — every number in these
-- tables is a number the owner typed or imported, and `source` labels how it
-- got here ('manual' | 'csv', validated by the routes; the DB stays
-- permissive like the rest of the base schema).
--
-- Metric columns (views / reach / likes / comments / shares / saves) are ALL
-- NULLABLE on purpose: a metric the user did not enter is missing data, not
-- zero. Storing 0 for "not reported" would silently invent engagement the
-- creator never claimed; aggregates on the read side track how many posts
-- actually reported each metric alongside the totals.
--
-- Shapes follow the base schema (20261001000000): uuid ids defaulting to
-- gen_random_uuid(), owner_id -> auth.users on delete cascade, timestamptz
-- defaults, RLS owner_all + explicit Data API grants.
--
-- Idempotent: safe to re-run (create table/index if not exists, policies are
-- dropped-if-exists then recreated). The paste-ready copy for the SQL Editor
-- is supabase/APPLY-GROWTH-STUDIO.sql — keep the two in sync.

-- ---------------------------------------------------------------------------
-- growth_posts — one published post the creator is tracking, with the
-- metrics they reported for it. platform is free text (the UI suggests the
-- common ones); posted_at is when the post went out, entered by the user.
-- ---------------------------------------------------------------------------
create table if not exists public.growth_posts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  platform   text not null,
  title      text not null default '',
  post_url   text,
  posted_at  timestamptz not null,
  views      bigint,
  reach      bigint,
  likes      bigint,
  comments   bigint,
  shares     bigint,
  saves      bigint,
  source     text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists growth_posts_owner_posted_idx
  on public.growth_posts (owner_id, posted_at desc);

-- ---------------------------------------------------------------------------
-- competitor_profiles — creators / accounts the owner wants to keep an eye
-- on. Just the owner's own notes (name, platform, handle, free notes): no
-- metrics are fetched or stored for other people's accounts, ever.
-- ---------------------------------------------------------------------------
create table if not exists public.competitor_profiles (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  platform   text not null default '',
  handle     text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists competitor_profiles_owner_idx
  on public.competitor_profiles (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-scoped, same shape as the base schema.
-- ---------------------------------------------------------------------------
alter table public.growth_posts        enable row level security;
alter table public.competitor_profiles enable row level security;

drop policy if exists growth_posts_owner_all on public.growth_posts;
create policy growth_posts_owner_all on public.growth_posts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists competitor_profiles_owner_all on public.competitor_profiles;
create policy competitor_profiles_owner_all on public.competitor_profiles
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Data API grants (Supabase requires explicit grants for PostgREST access).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.growth_posts, public.competitor_profiles
to authenticated, service_role;

-- ============================================================
-- FILE: app/supabase/migrations/20261110060000_project_folders_tags.sql
-- ============================================================
-- A15 project folders + tags (2026-11-10, Phase 8 slice 8.3 of the Creator
-- Studio transformation).
--
-- Projects gain user organisation: a folder label and tags, so a growing
-- library can be grouped and filtered in the projects list.
--
-- Shapes follow the codebase's own precedents:
--   * `folder text` — a single optional label, not a tree: the exact shape
--     content_items.folder took in 20261110020000_content_library.sql.
--   * `tags text[] not null default '{}'` — everywhere else in the codebase
--     a tag set is a plain string array (hashtag-group bodies in
--     features/create/captionStudio.ts store `tags: string[]`); a text[]
--     column is that shape in Postgres. A join table was rejected: tags
--     have no identity of their own, are always read and written with
--     their project, and a second table would need its own RLS policy and
--     grants for no extra capability.
--
-- RLS: no policy changes. Both columns live on public.projects and ride
-- the existing owner-scoped projects policies; no new table is created,
-- so no new grants are needed either (column-level privileges are not
-- used in this schema — the table grants already cover new columns).
--
-- Persistence/expiry rules are untouched: this file adds two columns and
-- two indexes, nothing else. The guest-only 720h-floor expiry function
-- and its daily cron (20261110000000_project_persistence.sql) do not
-- reference these columns and are not modified.
--
-- Idempotent: safe to re-run (add column / create index if not exists).
-- The paste-ready copy for the SQL Editor is
-- supabase/APPLY-PROJECT-FOLDERS-TAGS.sql — keep the two in sync.
--
-- Until this is applied the app degrades honestly (the Phase-6 pattern):
-- the projects routes detect the PostgREST missing-column error, keep
-- listing projects exactly as before with org_ready:false, and answer
-- folder/tag writes with a plain "database update is pending" message.

alter table public.projects
  add column if not exists folder text,
  add column if not exists tags text[] not null default '{}';

create index if not exists projects_owner_folder_idx
  on public.projects (owner_id, folder);
create index if not exists projects_owner_tags_idx
  on public.projects using gin (tags);

-- ============================================================
-- FILE: app/supabase/migrations/20261111000000_billing.sql
-- ============================================================
-- Billing storage (Completion programme, Phase B, 2026-11-11).
-- Identical DDL to supabase/APPLY-BILLING.sql — see that file for the
-- step-by-step apply + verification queries. Adds public.payments
-- (server-written Cashfree order records; owner reads their own as the
-- invoice list) and profiles.plan_expires_at (end of the current paid
-- period; null on Free). profiles.plan stays server-written only.

alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  cf_order_id   text not null unique,
  cf_payment_id text,
  plan          text not null,
  amount        numeric(12,2) not null,
  currency      text not null,
  status        text not null default 'created',
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  period_start  timestamptz,
  period_end    timestamptz
);
create index if not exists payments_owner_created_idx
  on public.payments (owner_id, created_at desc);

alter table public.payments enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (auth.uid() = owner_id);

grant select on public.payments to authenticated;
grant all on public.payments to service_role;
grant select (plan_expires_at) on public.profiles to authenticated;

-- ============================================================
-- FILE: app/supabase/migrations/20261111010000_growth_connect.sql
-- ============================================================
-- =====================================================================
-- Growth Studio — connected accounts (2026-11-11, P1)
--
-- What this does:
--  1. public.growth_connections — one row per (owner, platform) holding the
--     OAuth tokens for the creator's OWN connected YouTube / Instagram
--     account, plus the account identity and last-sync stamp.
--  2. public.growth_posts.external_id — the platform-side post id for rows
--     that arrived via a connected-account sync, so re-syncs UPDATE the row
--     instead of duplicating it. A partial unique index enforces one row
--     per (owner, source, external_id); manual / CSV rows keep NULL and
--     are untouched by it.
--
-- TOKEN SAFETY (the reason this table looks different from the others):
--  - RLS is enabled with NO policies at all, and the only Data API grant is
--    to service_role. A browser client (authenticated role) can therefore
--    never read a token through PostgREST — not even its own.
--  - The only code path that touches this table is the server-side connect
--    routes, through the service-role client, AFTER requireUser, with an
--    explicit owner_id filter on every query.
--  - The status route the browser calls selects only non-token columns
--    (platform, account name, last sync) — token values never leave the
--    server in any response.
--
-- Until this is applied the app degrades honestly: the connect section
-- shows its not-set-up state and sync/disconnect answer a plain
-- pending-setup message (no 500s), and Growth keeps working exactly as
-- the manual/CSV feature it already is.
-- =====================================================================

create table if not exists public.growth_connections (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  platform      text not null,
  account_id    text not null,
  account_name  text,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, platform)
);
create index if not exists growth_connections_owner_idx
  on public.growth_connections (owner_id);

alter table public.growth_connections enable row level security;
-- deliberately NO policies: see the token-safety note above.

grant select, insert, update, delete on public.growth_connections to service_role;

alter table public.growth_posts add column if not exists external_id text;
create unique index if not exists growth_posts_owner_source_external_idx
  on public.growth_posts (owner_id, source, external_id)
  where external_id is not null;

-- ============================================================
-- FILE: app/supabase/migrations/20261114000000_video_quota.sql
-- ============================================================
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

-- ============================================================
-- FILE: app/supabase/migrations/20261116000000_video_cloud_sync.sql
-- ============================================================
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

-- ============================================================
-- FILE: app/supabase/migrations/20261118000000_email_capture.sql
-- ============================================================
-- 20261118000000_email_capture.sql — subscriber list for product emails
--
-- Every account's email is kept on a subscriber list so the owner can send
-- product updates and offers later. Promo mail goes ONLY to people who
-- opted in — storing the address is the account record, using it for promo
-- without consent is not (India DPDP Act + GDPR).
--
--   marketing_subscribers — one row per auth user (incl. backfilled rows
--   for every existing account). Rows start opted OUT; the flag flips only
--   through the Settings toggle or an explicit signup opt-in, never by a
--   re-login capture (see POST /api/v1/marketing/capture).
--
-- RLS: a signed-in user can SELECT / INSERT / UPDATE only their own row
-- (user_id = auth.uid()). No anon access, no DELETE policy (opting out is
-- the flag, not row deletion). The owner export reads through the service
-- role in GET /api/v1/admin/subscribers, gated on OWNER_EMAILS.
--
-- Backfill: every existing non-anonymous auth user gets a row, opted OUT
-- (consent was never given — never default anyone to true).

create extension if not exists citext;

create table if not exists public.marketing_subscribers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  email             citext not null,
  marketing_opt_in  boolean not null default false,
  marketing_opt_in_at timestamptz,
  source            text not null default 'email' check (source in ('email', 'google')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id),
  unique (email)
);

alter table public.marketing_subscribers enable row level security;

drop policy if exists marketing_subscribers_select_own on public.marketing_subscribers;
create policy marketing_subscribers_select_own on public.marketing_subscribers
  for select to authenticated using (user_id = auth.uid());

drop policy if exists marketing_subscribers_insert_own on public.marketing_subscribers;
create policy marketing_subscribers_insert_own on public.marketing_subscribers
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists marketing_subscribers_update_own on public.marketing_subscribers;
create policy marketing_subscribers_update_own on public.marketing_subscribers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.marketing_subscribers
to authenticated, service_role;

-- Backfill (idempotent): every existing account, opted out.
insert into public.marketing_subscribers (user_id, email, source)
select
  u.id,
  u.email,
  case when coalesce(u.raw_app_meta_data ->> 'provider', 'email') = 'google' then 'google' else 'email' end
from auth.users u
where u.email is not null
  and coalesce(u.is_anonymous, false) = false
on conflict do nothing;
