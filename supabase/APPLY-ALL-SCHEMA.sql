-- OPEN CAPTION — full schema apply bundle (run in Supabase SQL Editor, in order)

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

alter table public.workers
  add constraint workers_current_job_fk
  foreign key (current_job_id) references public.jobs (id) on delete set null;

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

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (id = auth.uid());

create policy projects_owner_all on public.projects
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy videos_owner_all on public.videos
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy transcripts_owner_all on public.transcripts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy caption_documents_owner_all on public.caption_documents
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy caption_document_versions_owner_all on public.caption_document_versions
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy workers_owner_all on public.workers
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy jobs_owner_all on public.jobs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy exports_owner_all on public.exports
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy brand_kits_owner_all on public.brand_kits
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy user_looks_owner_all on public.user_looks
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy favorite_looks_owner_all on public.favorite_looks
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy user_fonts_owner_all on public.user_fonts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy usage_events_owner_all on public.usage_events
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
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

select cron.schedule('capseasy-expire-projects', '5 * * * *', $$select public.delete_expired_projects(24, 500)$$);

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
