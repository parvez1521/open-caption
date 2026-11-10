-- =====================================================================
-- APPLY-BRAND-VOICE-PROFILES.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: turns public.brand_kits into the Brand Voice profile
-- table — adds a `voice` jsonb column (niche, audience, language, tone,
-- writing style, words to use / avoid, sample captions, preferred CTAs)
-- and an `is_active` flag marking each owner's one active profile, then
-- backfills every existing owner's oldest kit as their active profile.
-- Full rationale lives in
-- supabase/migrations/20261110010000_brand_voice_profiles.sql.
-- The whole file is idempotent: it can be re-run safely.
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- 1) Are the new columns there yet?
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'brand_kits'
   and column_name in ('voice', 'is_active')
 order by column_name;
--    expect BEFORE: 0 rows (the migration has not been applied yet).
--    If it returns 2 rows, the migration is already applied — STEP 2 is
--    still safe to re-run, and STEP 3 shows the state that should hold.

-- 2) How many kits does each owner have right now? (Runs either way.)
select owner_id, count(*) as total_profiles
  from public.brand_kits
 group by owner_id
 order by owner_id;

-- 3) Active-profile count per owner.
--    BEFORE the fix this query ERRORS with "column is_active does not
--    exist" — that error IS the expected before-state; just continue to
--    STEP 2. After STEP 2 the same query is verification check 3 below.
select owner_id,
       count(*) as total_profiles,
       count(*) filter (where is_active) as active_profiles
  from public.brand_kits
 group by owner_id
 order by owner_id;

-- ---------- STEP 2: THE FIX (identical to the migration file) ----------
alter table public.brand_kits add column if not exists voice jsonb not null default '{}'::jsonb;
alter table public.brand_kits add column if not exists is_active boolean not null default false;

create index if not exists brand_kits_owner_active_idx on public.brand_kits (owner_id, is_active);

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

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) Both columns exist with the right types and defaults:
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'brand_kits'
   and column_name in ('voice', 'is_active')
 order by column_name;
--    expect: 2 rows — is_active | boolean | false, voice | jsonb | '{}'::jsonb,
--    both is_nullable = NO.

-- 2) The lookup index exists:
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename = 'brand_kits'
   and indexname = 'brand_kits_owner_active_idx';
--    expect: 1 row, indexdef mentions (owner_id, is_active).

-- 3) Every owner with at least one profile has exactly one active profile:
select owner_id,
       count(*) as total_profiles,
       count(*) filter (where is_active) as active_profiles
  from public.brand_kits
 group by owner_id
 order by owner_id;
--    expect: active_profiles = 1 on every row (no rows at all on a fresh
--    database with no brand kits yet — also fine).

-- 4) No owner is left without an active profile:
select owner_id
  from public.brand_kits
 group by owner_id
having count(*) filter (where is_active) = 0;
--    expect: 0 rows.

-- 5) Spot-check the rows themselves (oldest per owner should be active):
select id, owner_id, name, is_active, voice, created_at
  from public.brand_kits
 order by owner_id, created_at
 limit 20;
--    expect: voice is '{}' for kits saved before this change (they had no
--    voice yet), and the first row per owner has is_active = true.
