-- Caption translations (2026-11-10, Phase 5 slice 5.1): translated caption
-- tracks get their own table, public.caption_translations.
--
-- BEFORE: public.caption_documents holds ONE editable document per project
-- (project_id is UNIQUE — it is the upsert target of save_caption_doc()).
-- A translated track is a second, real CaptionDoc (same jsonb shape, same
-- CaptionDocSchema) and cannot live in that table without breaking the
-- primary document's one-row invariant.
--
-- AFTER (this migration): public.caption_translations mirrors
-- caption_documents' shape, keyed by (project_id, language):
--
--   id          uuid pk
--   project_id  uuid -> projects (cascade), part of the unique key
--   language    text — the target language (a verified OPUS-MT pair code;
--               the API validates it against the app registry, the column
--               itself stays a plain text code)
--   owner_id    uuid -> auth.users (cascade)
--   doc         jsonb — the translated CaptionDoc
--   revision    int — bumped on every save by the API route (plain upsert;
--               translations have a single writer, the translating client,
--               so no save_caption_doc()-style optimistic RPC is needed)
--   created_at / updated_at
--
--   unique (project_id, language) — one track per language per project;
--   it is the upsert target of PUT /projects/:id/translations.
--
-- RLS + grants mirror caption_documents exactly: owner-all policy for the
-- authenticated role, full Data API grant to authenticated + service_role.
--
-- ROLLBACK: purely additive — no existing table, column or policy changes.
--   drop table if exists public.caption_translations;
-- Without this migration applied, the translations API route errors on the
-- missing table and the Translate panel reports that honestly; every other
-- surface (primary captions, exports, renders) is untouched.

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

create policy caption_translations_owner_all on public.caption_translations
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.caption_translations
to authenticated, service_role;
