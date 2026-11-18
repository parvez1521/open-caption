-- 20261118000000_email_capture.sql — subscriber list for product emails
--
-- Every account's email is kept on a subscriber list so the owner can send
-- product updates and offers later. Promo mail goes ONLY to people who
-- opted in — storing the address is the account record, using it for promo
-- without consent is not (India DPDP Act + GDPR).
--
--   marketing_subscribers — one row per auth user (incl. backfilled rows
--   for every existing account). Rows start opted OUT; the flag flips only
--   through the Settings toggle or an explicit signup opt-in, never by a
--   re-login capture (see POST /api/v1/marketing/capture).
--
-- RLS: a signed-in user can SELECT / INSERT / UPDATE only their own row
-- (user_id = auth.uid()). No anon access, no DELETE policy (opting out is
-- the flag, not row deletion). The owner export reads through the service
-- role in GET /api/v1/admin/subscribers, gated on OWNER_EMAILS.
--
-- Backfill: every existing non-anonymous auth user gets a row, opted OUT
-- (consent was never given — never default anyone to true).

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
