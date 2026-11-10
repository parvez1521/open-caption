-- =====================================================================
-- APPLY-CAPTION-TRANSLATIONS.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: Phase 5 slice 5.1 (translation) — adds ONE new table,
-- public.caption_translations, holding translated caption tracks (a real
-- second CaptionDoc per project + target language). The primary
-- caption_documents table is NOT touched (its project_id is UNIQUE — one
-- editable document per project — so translations cannot live there).
-- RLS + grants mirror caption_documents exactly. Full rationale lives in
-- supabase/migrations/20261110040000_caption_translations.sql.
--
-- Applying this file alone changes NO live behaviour for existing
-- projects: until a user translates a project, the table stays empty.
-- WITHOUT it, the translations API errors on the missing table and the
-- Translate panel reports that honestly; every other surface (primary
-- captions, exports, renders) is untouched. The whole file is
-- idempotent: it can be re-run safely.
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- 1) Is the new table there yet?
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name = 'caption_translations';
--    expect BEFORE: 0 rows (the migration has not been applied yet).
--    If it returns 1 row, the migration is already applied — STEP 2 is
--    still safe to re-run, and STEP 3 shows the state that should hold.

-- 2) Reference counts — the table this mirrors (runs either way; the
--    new table's shape is compared against caption_documents in STEP 3).
select count(*) as caption_documents_rows from public.caption_documents;
--    expect: any number >= 0; this table is NOT modified by STEP 2.

-- ---------- STEP 2: THE MIGRATION (identical to the migration file) ----------
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

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) The table exists with the expected columns:
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'caption_translations'
 order by ordinal_position;
--    expect: 8 rows — id uuid, project_id uuid, language text,
--    owner_id uuid, doc jsonb, revision integer,
--    created_at timestamptz, updated_at timestamptz.

-- 2) RLS is enabled and the owner-all policy exists:
select relname, relrowsecurity
  from pg_class
 where relname = 'caption_translations';
--    expect: 1 row, relrowsecurity = true.

select policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename = 'caption_translations';
--    expect: 1 row — caption_translations_owner_all | ALL | {authenticated}.

-- 3) The unique (project_id, language) upsert target exists:
select indexname
  from pg_indexes
 where schemaname = 'public'
   and tablename = 'caption_translations'
   and indexdef like '%UNIQUE%project_id%language%';
--    expect: 1 row.

-- 4) The primary table is untouched (count identical to STEP 1 check 2):
select count(*) as caption_documents_rows from public.caption_documents;
