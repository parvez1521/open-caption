-- =====================================================================
-- APPLY-COMPOSITION-PRIMARY.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: CompositionDoc Stage C — adds ONE nullable column,
-- public.projects.composition_json (jsonb, no default; NULL = "not yet
-- promoted"), and backfills it from the Stage-B composition slice stored
-- inside settings_json (settings_json -> 'composition': video segments,
-- timeline markers, per-track state). settings_json itself is NOT
-- modified, and no other schema object changes. Full rationale lives in
-- supabase/migrations/20261110030000_composition_primary.sql.
--
-- Applying this file alone changes NO live behaviour: the app must not
-- read or write the column until the Stage-C activation patch + the
-- STAGE_C_ENABLED flag flip land (checklist in
-- apps/frontend/src/features/studio/stageC.ts). The whole file is
-- idempotent: it can be re-run safely.
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- 1) Is the new column there yet?
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'projects'
   and column_name = 'composition_json';
--    expect BEFORE: 0 rows (the migration has not been applied yet).
--    If it returns 1 row, the migration is already applied — STEP 2 is
--    still safe to re-run, and STEP 3 shows the state that should hold.

-- 2) Project counts — the promotion pool. (Runs either way; keep the
--    numbers, STEP 3 compares against them.)
select
  (select count(*) from public.projects) as total_projects,
  (select count(*) from public.projects
    where settings_json ? 'composition') as projects_with_settings_composition;
--    expect: projects_with_settings_composition <= total_projects.
--    Projects WITHOUT the settings key are Stage-A projects: they stay
--    composition_json = NULL after STEP 2 on purpose (the app derives
--    their composition from parts on first Stage-C read).

-- 3) How many projects already have a promoted composition?
--    BEFORE the migration this query ERRORS with "column composition_json
--    does not exist" — that error IS the expected before-state; just
--    continue to STEP 2. After STEP 2 the same count is verification
--    check 2 below.
select count(*) as projects_with_composition_json
  from public.projects
 where composition_json is not null;

-- ---------- STEP 2: THE MIGRATION (identical to the migration file) ----------
alter table public.projects add column if not exists composition_json jsonb;

update public.projects
   set composition_json = settings_json -> 'composition'
 where composition_json is null
   and settings_json ? 'composition';

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) The column exists, with the right type, no default, nullable:
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'projects'
   and column_name = 'composition_json';
--    expect: 1 row — composition_json | jsonb | (no default) | YES.

-- 2) Every project whose settings carry the composition slice was
--    promoted, and no other project was:
select
  (select count(*) from public.projects
    where composition_json is not null) as promoted,
  (select count(*) from public.projects
    where settings_json ? 'composition') as with_settings_composition;
--    expect: promoted = with_settings_composition, and
--    with_settings_composition is the SAME number STEP 1 check 2 showed
--    (the settings copy is untouched — the backfill only reads it).

-- 3) settings_json is unchanged: the count of projects whose settings
--    carry the 'composition' key is identical before and after (STEP 1
--    check 2 vs. the with_settings_composition value in check 2 above),
--    and no project's settings lost or gained any other shape — the
--    migration contains no statement that writes settings_json at all.

-- 4) Spot-check one promoted row: the column holds the Stage-B slice
--    with exactly the composition keys.
select id,
       jsonb_object_keys(composition_json) as composition_key
  from public.projects
 where composition_json is not null
   and id = (
         select id from public.projects
          where composition_json is not null
          order by created_at
          limit 1
       )
 order by composition_key;
--    expect: 4 rows — markers, tracks, version, videoSegments.
--    (On a database where no project has a settings composition yet this
--    returns 0 rows — also fine; promotion then happens lazily when the
--    Stage-C app first writes a project.)
