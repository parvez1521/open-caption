-- =====================================================================
-- APPLY-CONTENT-LIBRARY.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: creates the Phase 3 content library + chat storage —
-- public.content_items (the server-side library that replaces the
-- localStorage-only Creator Studio drafts), public.chat_threads and
-- public.chat_messages (AI Studio chat storage) — with owner-scoped RLS
-- and Data API grants. Full rationale lives in
-- supabase/migrations/20261110020000_content_library.sql.
-- Until this is applied the app degrades honestly: list routes answer
-- ready:false with an empty list and writes explain that a database
-- update is pending (no 500s).
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- Which of the three tables already exist? (0 rows = fresh database,
-- 3 rows = this file was already applied and STEP 2 will be a no-op.)
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('content_items', 'chat_threads', 'chat_messages')
 order by table_name;
--    expect BEFORE first apply: 0 rows
--    expect if re-running:       3 rows (content_items, chat_messages, chat_threads)

-- Row counts if the tables are already there (skip if STEP 1 showed 0 rows):
-- select (select count(*) from public.content_items) as content_items,
--        (select count(*) from public.chat_threads)  as chat_threads,
--        (select count(*) from public.chat_messages) as chat_messages;

-- ---------- STEP 2: THE DDL (identical to the migration file) ----------
create table if not exists public.content_items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  title      text not null default '',
  body       jsonb not null default '{}'::jsonb,
  source     text not null default 'template',
  folder     text,
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_items_owner_kind_idx
  on public.content_items (owner_id, kind, created_at desc);
create index if not exists content_items_owner_folder_idx
  on public.content_items (owner_id, folder);

create table if not exists public.chat_threads (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  title           text not null default 'Untitled chat',
  context_item_id uuid references public.content_items (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists chat_threads_owner_idx
  on public.chat_threads (owner_id, created_at desc);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.chat_threads (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  role       text not null,
  content    jsonb not null default '{}'::jsonb,
  source     text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

alter table public.content_items enable row level security;
alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists content_items_owner_all on public.content_items;
create policy content_items_owner_all on public.content_items
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_threads_owner_all on public.chat_threads;
create policy chat_threads_owner_all on public.chat_threads
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_messages_owner_all on public.chat_messages;
create policy chat_messages_owner_all on public.chat_messages
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on
  public.content_items, public.chat_threads, public.chat_messages
to authenticated, service_role;

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) All three tables exist:
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('content_items', 'chat_threads', 'chat_messages')
 order by table_name;
--    expect: 3 rows (chat_messages, chat_threads, content_items)

-- 2) RLS is on for all three, with exactly the owner_all policies:
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relname in ('content_items', 'chat_threads', 'chat_messages')
 order by relname;
--    expect: 3 rows, rls_enabled = true for every row

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('content_items', 'chat_threads', 'chat_messages')
 order by tablename;
--    expect: 3 rows — content_items_owner_all, chat_threads_owner_all,
--            chat_messages_owner_all, each cmd = ALL

-- 3) Key columns + the set-null / cascade foreign keys are in place:
select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('content_items', 'chat_threads', 'chat_messages')
   and column_name in ('owner_id', 'kind', 'body', 'project_id', 'context_item_id', 'thread_id', 'role', 'content')
 order by table_name, column_name;
--    expect: content_items: body jsonb NO, kind text NO, owner_id uuid NO, project_id uuid YES
--            chat_threads:  context_item_id uuid YES, owner_id uuid NO
--            chat_messages: content jsonb NO, owner_id uuid NO, role text NO, thread_id uuid NO

-- 4) Indexes exist:
select indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('content_items_owner_kind_idx', 'content_items_owner_folder_idx',
                     'chat_threads_owner_idx', 'chat_messages_thread_idx')
 order by indexname;
--    expect: 4 rows

-- 5) Grants are in place for PostgREST:
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('content_items', 'chat_threads', 'chat_messages')
   and grantee in ('authenticated', 'service_role')
 order by table_name, grantee, privilege_type;
--    expect: 24 rows (3 tables x 2 grantees x SELECT/INSERT/UPDATE/DELETE)
