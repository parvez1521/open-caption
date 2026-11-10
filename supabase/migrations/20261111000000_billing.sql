-- Billing storage (Completion programme, Phase B, 2026-11-11).
-- Identical DDL to supabase/APPLY-BILLING.sql — see that file for the
-- step-by-step apply + verification queries. Adds public.payments
-- (server-written Cashfree order records; owner reads their own as the
-- invoice list) and profiles.plan_expires_at (end of the current paid
-- period; null on Free). profiles.plan stays server-written only.

alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  cf_order_id   text not null unique,
  cf_payment_id text,
  plan          text not null,
  amount        numeric(12,2) not null,
  currency      text not null,
  status        text not null default 'created',
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  period_start  timestamptz,
  period_end    timestamptz
);
create index if not exists payments_owner_created_idx
  on public.payments (owner_id, created_at desc);

alter table public.payments enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (auth.uid() = owner_id);

grant select on public.payments to authenticated;
grant all on public.payments to service_role;
grant select (plan_expires_at) on public.profiles to authenticated;
