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
