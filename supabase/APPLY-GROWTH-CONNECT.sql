-- =====================================================================
-- APPLY-GROWTH-CONNECT.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: adds the Growth Studio connected-accounts storage —
-- public.growth_connections (OAuth tokens for the creator's OWN YouTube /
-- Instagram account; RLS enabled with NO policies and a service-role-only
-- grant, so tokens can never be read through the Data API by a browser —
-- only the server connect routes touch this table, after sign-in, with an
-- owner filter) and an external_id column on public.growth_posts so synced
-- posts update in place instead of duplicating. Full rationale lives in
-- supabase/migrations/20261111010000_growth_connect.sql.
-- Until this is applied the app degrades honestly: the connect section
-- shows its not-set-up state and everything else in Growth Studio keeps
-- working exactly as before (no 500s).
-- NOTE: applying this file alone does not switch connections on — the
-- YOUTUBE_CLIENT_ID/SECRET (or META_APP_ID/SECRET) environment variables
-- must also be set; see the handover notes.
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- Does the connections table / external_id column already exist?
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'growth_connections') as connections_table,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'growth_posts' and column_name = 'external_id') as external_id_column;
--    expect BEFORE first apply: 0, 0
--    expect if re-running:       1, 1 (STEP 2 is then a no-op)

-- A reference count that must NOT change when STEP 2 runs (existing user
-- data is untouched — this file adds one table and one nullable column):
select count(*) as existing_growth_posts from public.growth_posts;
--    expect: note the number; STEP 3 repeats this check and it must match.

-- ---------- STEP 2: THE DDL (identical to the migration file) ----------
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
-- deliberately NO policies: tokens are service-role-only (see header).

grant select, insert, update, delete on public.growth_connections to service_role;

alter table public.growth_posts add column if not exists external_id text;
create unique index if not exists growth_posts_owner_source_external_idx
  on public.growth_posts (owner_id, source, external_id)
  where external_id is not null;

-- ---------- STEP 3: VERIFY (run after STEP 2) ----------
-- 1) The table + column now exist, with the unique guard for synced rows:
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'growth_connections') as connections_table,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'growth_posts' and column_name = 'external_id') as external_id_column,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'growth_posts_owner_source_external_idx') as external_id_index;
--    expect: 1, 1, 1

-- 2) RLS is on for the connections table (tokens unreachable via Data API):
select relname, relrowsecurity from pg_class where relname = 'growth_connections';
--    expect: relrowsecurity = true

-- 3) Existing data untouched — must equal the STEP 1 count:
select count(*) as existing_growth_posts from public.growth_posts;
