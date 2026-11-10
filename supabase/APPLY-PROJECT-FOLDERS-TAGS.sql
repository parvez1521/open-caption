-- =====================================================================
-- APPLY-PROJECT-FOLDERS-TAGS.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: adds A15 project organisation to public.projects —
-- `folder text` (a single optional label, the content_items.folder
-- precedent) and `tags text[] not null default '{}'` (the codebase's
-- string-array tag shape as a Postgres column) — plus two owner-scoped
-- indexes. No new table, no policy or grant changes: the columns ride
-- the existing owner-scoped projects RLS policies. Project persistence /
-- expiry rules are NOT touched by this file.
-- Full rationale lives in
-- supabase/migrations/20261110060000_project_folders_tags.sql.
-- Until this is applied the app degrades honestly: the projects list
-- keeps working with org features reported as "pending database update"
-- (org_ready:false), and folder/tag writes explain that a database
-- update is pending (no 500s).
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- Which of the two columns already exist? (0 rows = fresh database,
-- 2 rows = this file was already applied and STEP 2 will be a no-op.)
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'projects'
   and column_name in ('folder', 'tags')
 order by column_name;
--    expect BEFORE first apply: 0 rows
--    expect if re-running:       2 rows (folder, tags)

-- A reference count that must NOT change when STEP 2 runs (existing user
-- data is untouched by this file — it only adds two columns):
select count(*) as existing_projects from public.projects;
--    expect: note the number; STEP 3 repeats this check and it must match.

-- ---------- STEP 2: THE DDL (identical to the migration file) ----------
alter table public.projects
  add column if not exists folder text,
  add column if not exists tags text[] not null default '{}';

create index if not exists projects_owner_folder_idx
  on public.projects (owner_id, folder);
create index if not exists projects_owner_tags_idx
  on public.projects using gin (tags);

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) Both columns exist, with the right types and nullability:
select column_name, data_type, udt_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'projects'
   and column_name in ('folder', 'tags')
 order by column_name;
--    expect: folder | text | text  | YES | (null)
--            tags   | ARRAY | _text | NO  | '{}'::text[]

-- 2) The reference count from STEP 1 is unchanged:
select count(*) as existing_projects from public.projects;
--    expect: exactly the STEP 1 number

-- 3) Every existing project starts unfiled with no tags:
select count(*) as projects_with_folder_or_tags
  from public.projects
 where folder is not null or tags <> '{}';
--    expect: 0 (unless someone already organised projects after applying)

-- 4) Indexes exist:
select indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('projects_owner_folder_idx', 'projects_owner_tags_idx')
 order by indexname;
--    expect: 2 rows

-- 5) RLS is still on for projects, with its owner policies unchanged
--    (this file adds no policy — the columns ride the existing ones):
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relname = 'projects';
--    expect: 1 row, rls_enabled = true

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename = 'projects'
 order by policyname;
--    expect: the same policies as before this file ran (owner-scoped);
--            no new policy was added by STEP 2
