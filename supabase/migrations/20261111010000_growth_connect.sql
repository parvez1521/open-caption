-- =====================================================================
-- Growth Studio — connected accounts (2026-11-11, P1)
--
-- What this does:
--  1. public.growth_connections — one row per (owner, platform) holding the
--     OAuth tokens for the creator's OWN connected YouTube / Instagram
--     account, plus the account identity and last-sync stamp.
--  2. public.growth_posts.external_id — the platform-side post id for rows
--     that arrived via a connected-account sync, so re-syncs UPDATE the row
--     instead of duplicating it. A partial unique index enforces one row
--     per (owner, source, external_id); manual / CSV rows keep NULL and
--     are untouched by it.
--
-- TOKEN SAFETY (the reason this table looks different from the others):
--  - RLS is enabled with NO policies at all, and the only Data API grant is
--    to service_role. A browser client (authenticated role) can therefore
--    never read a token through PostgREST — not even its own.
--  - The only code path that touches this table is the server-side connect
--    routes, through the service-role client, AFTER requireUser, with an
--    explicit owner_id filter on every query.
--  - The status route the browser calls selects only non-token columns
--    (platform, account name, last sync) — token values never leave the
--    server in any response.
--
-- Until this is applied the app degrades honestly: the connect section
-- shows its not-set-up state and sync/disconnect answer a plain
-- pending-setup message (no 500s), and Growth keeps working exactly as
-- the manual/CSV feature it already is.
-- =====================================================================

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
-- deliberately NO policies: see the token-safety note above.

grant select, insert, update, delete on public.growth_connections to service_role;

alter table public.growth_posts add column if not exists external_id text;
create unique index if not exists growth_posts_owner_source_external_idx
  on public.growth_posts (owner_id, source, external_id)
  where external_id is not null;
