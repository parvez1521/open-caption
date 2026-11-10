-- =====================================================================
-- APPLY-GROWTH-STUDIO.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: creates the Phase 6 Growth Studio storage —
-- public.growth_posts (the creator's own posts + the metrics they entered
-- by hand or imported from a CSV they exported themselves; source labels
-- 'manual' | 'csv'; every metric column is nullable because "not entered"
-- is missing data, not zero) and public.competitor_profiles (the owner's
-- own notes about accounts they follow — no scraping, nothing fetched) —
-- with owner-scoped RLS and Data API grants. Full rationale lives in
-- supabase/migrations/20261110050000_growth_studio.sql.
-- Until this is applied the app degrades honestly: list routes answer
-- ready:false with an empty list and writes explain that a database
-- update is pending (no 500s).
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- Which of the two tables already exist? (0 rows = fresh database,
-- 2 rows = this file was already applied and STEP 2 will be a no-op.)
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('growth_posts', 'competitor_profiles')
 order by table_name;
--    expect BEFORE first apply: 0 rows
--    expect if re-running:       2 rows (competitor_profiles, growth_posts)

-- A reference count that must NOT change when STEP 2 runs (existing user
-- data is untouched by this file — it only adds two new tables):
select count(*) as existing_projects from public.projects;
--    expect: note the number; STEP 3 repeats this check and it must match.

-- Row counts if the tables are already there (skip if STEP 1 showed 0 rows):
-- select (select count(*) from public.growth_posts)        as growth_posts,
--        (select count(*) from public.competitor_profiles) as competitor_profiles;

-- ---------- STEP 2: THE DDL (identical to the migration file) ----------
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

alter table public.growth_posts        enable row level security;
alter table public.competitor_profiles enable row level security;

drop policy if exists growth_posts_owner_all on public.growth_posts;
create policy growth_posts_owner_all on public.growth_posts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists competitor_profiles_owner_all on public.competitor_profiles;
create policy competitor_profiles_owner_all on public.competitor_profiles
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on
  public.growth_posts, public.competitor_profiles
to authenticated, service_role;

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) Both tables exist:
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('growth_posts', 'competitor_profiles')
 order by table_name;
--    expect: 2 rows (competitor_profiles, growth_posts)

-- 2) The reference count from STEP 1 is unchanged:
select count(*) as existing_projects from public.projects;
--    expect: exactly the STEP 1 number

-- 3) RLS is on for both, with exactly the owner_all policies:
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relname in ('growth_posts', 'competitor_profiles')
 order by relname;
--    expect: 2 rows, rls_enabled = true for every row

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('growth_posts', 'competitor_profiles')
 order by tablename;
--    expect: 2 rows — growth_posts_owner_all, competitor_profiles_owner_all,
--            each cmd = ALL

-- 4) Key columns are in place — note every metric column IS nullable
--    (missing data, not zero) while identity columns are not:
select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('growth_posts', 'competitor_profiles')
   and column_name in ('owner_id', 'platform', 'title', 'post_url', 'posted_at',
                       'views', 'reach', 'likes', 'comments', 'shares', 'saves',
                       'source', 'name', 'handle', 'notes')
 order by table_name, column_name;
--    expect: growth_posts:        comments bigint YES, likes bigint YES,
--            owner_id uuid NO, platform text NO, post_url text YES,
--            posted_at timestamptz NO, reach bigint YES, saves bigint YES,
--            shares bigint YES, source text NO, title text NO, views bigint YES
--            competitor_profiles: handle text YES, name text NO, notes text YES,
--            owner_id uuid NO, platform text NO

-- 5) Indexes exist:
select indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('growth_posts_owner_posted_idx', 'competitor_profiles_owner_idx')
 order by indexname;
--    expect: 2 rows

-- 6) Grants are in place for PostgREST:
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('growth_posts', 'competitor_profiles')
   and grantee in ('authenticated', 'service_role')
 order by table_name, grantee, privilege_type;
--    expect: 16 rows (2 tables x 2 grantees x SELECT/INSERT/UPDATE/DELETE)
