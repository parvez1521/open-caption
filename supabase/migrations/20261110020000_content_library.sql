-- Content library + chat storage (2026-11-10, Phase 3 of the Creator Studio transformation).
--
-- Replaces the localStorage-only Creator Studio drafts (features/create/drafts.ts,
-- key ce:create-drafts, capped at 50, this device only) with a server-side library
-- the signed-in user can reach from anywhere, and adds the storage the AI Studio
-- chat needs: threads owned by a user, each holding ordered messages, optionally
-- anchored to one library item (the piece of content the chat is about).
--
-- Shapes follow the base schema (20261001000000): uuid ids defaulting to
-- gen_random_uuid(), owner_id -> auth.users on delete cascade, timestamptz
-- defaults, RLS owner_all + explicit Data API grants. `body` / `content` are
-- jsonb on purpose: the TypeScript side (zod in the content routes, the typed
-- helpers in features/create/library.ts) validates the per-kind shapes, so a
-- new generator kind does not need a migration.
--
-- Idempotent: safe to re-run (create table/index if not exists, policies are
-- dropped-if-exists then recreated). The paste-ready copy for the SQL Editor
-- is supabase/APPLY-CONTENT-LIBRARY.sql — keep the two in sync.

-- ---------------------------------------------------------------------------
-- content_items — one saved piece of generated / written content.
-- kind is one of the ContentKind values in features/create/library.ts
-- (idea | hook | caption | script | repurpose | shot-list | calendar |
-- carousel | hashtag-group | chat-output); the route validates it, the DB
-- stays permissive like the rest of the base schema. source records how the
-- item was made (template | cloud | model | manual | chat — free text, the
-- route caps its length). folder is a single optional label, not a tree.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- chat_threads — one AI Studio conversation. context_item_id optionally
-- points at the library item the chat is working on; deleting that item
-- keeps the thread (set null), deleting the user removes everything.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- chat_messages — append-only log per thread. owner_id is denormalised from
-- the thread so RLS can scope rows directly (the base schema does the same
-- for job_events' siblings: every user-owned table carries owner_id).
-- content is jsonb: { text: string, ... } today, richer blocks later.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-scoped, same shape as the base schema.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Data API grants (Supabase requires explicit grants for PostgREST access).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.content_items, public.chat_threads, public.chat_messages
to authenticated, service_role;
