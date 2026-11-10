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
