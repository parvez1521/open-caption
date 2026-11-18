-- =====================================================================
-- APPLY-EMAIL-CAPTURE.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: email capture (owner order 2026-11-18) — adds ONE new
-- table, public.marketing_subscribers, holding every account's email so
-- the owner can send product updates and offers later. Promo mail goes
-- ONLY to people who opted in; every row starts opted OUT (consent was
-- never given — never default anyone to true). RLS mirrors the own-row
-- pattern: a user can SELECT / INSERT / UPDATE only their own row.
-- Full rationale lives in
-- supabase/migrations/20261118000000_email_capture.sql.
--
-- Applying this file alone changes NO live behaviour for existing users:
-- until the app code that calls POST /api/v1/marketing/capture ships, the
-- table only holds the backfilled rows (all opted out). WITHOUT it, the
-- capture + preference + admin-export API routes error on the missing
-- table and report that honestly; every other surface is untouched.
-- The whole file is idempotent: it can be re-run safely.
--
-- APPLY LESSONS (do not skip):
-- (1) The SQL Editor runs a whole paste as ONE batch and aborts on the
--     first error — run STEP 1 FIRST, alone, and keep its output.
-- (2) The editor displays only the LAST result set — re-run each STEP 3
--     verification select individually.
-- (3) No functions are created here, so no EXECUTE grants to revoke.
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- 1) Is the new table there yet?
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name = 'marketing_subscribers';
--    expect BEFORE: 0 rows (the migration has not been applied yet).
--    If it returns 1 row, the migration is already applied — STEP 2 is
--    still safe to re-run, and STEP 3 shows the state that should hold.

-- 2) How many accounts will the backfill cover?
select count(*) as auth_users_with_email
  from auth.users
 where email is not null
   and coalesce(is_anonymous, false) = false;
--    expect: any number >= 0; record it — STEP 3 check 4 must match it
--    (unless someone signs up between the two steps).

-- 3) Reference count — a table this migration does NOT touch:
select count(*) as existing_projects from public.projects;
--    expect: any number >= 0; STEP 3 check 5 must show the same number.

-- ---------- STEP 2: THE MIGRATION (identical to the migration file) ----------
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

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) The table exists with the expected columns:
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'marketing_subscribers'
 order by ordinal_position;
--    expect: 8 rows — id uuid, user_id uuid, email citext,
--    marketing_opt_in boolean, marketing_opt_in_at timestamptz,
--    source text, created_at timestamptz, updated_at timestamptz.

-- 2) RLS is enabled and the three own-row policies exist:
select relname, relrowsecurity
  from pg_class
 where relname = 'marketing_subscribers';
--    expect: 1 row, relrowsecurity = true.

select policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename = 'marketing_subscribers'
 order by policyname;
--    expect: 3 rows — marketing_subscribers_insert_own | INSERT |
--    {authenticated}, marketing_subscribers_select_own | SELECT |
--    {authenticated}, marketing_subscribers_update_own | UPDATE |
--    {authenticated}.

-- 3) The unique targets exist (upsert key + case-insensitive email):
select indexname
  from pg_indexes
 where schemaname = 'public'
   and tablename = 'marketing_subscribers'
   and indexdef like '%UNIQUE%';
--    expect: 3 rows — the primary-key index on (id) plus one on
--    (user_id) and one on (email).

-- 4) The backfill covered every account (compare with STEP 1 check 2):
select count(*) as marketing_subscribers_rows from public.marketing_subscribers;

-- 5) The reference table is untouched (count identical to STEP 1 check 3):
select count(*) as existing_projects from public.projects;

-- 6) Every backfilled row is opted out (consent was never given):
select marketing_opt_in, count(*) as rows
  from public.marketing_subscribers
 group by 1;
--    expect: 1 row — false | <the STEP 1 check 2 number>.
