-- 20261114040000_subscriptions.sql — Cashfree subscription storage + webhook event log.
-- Mirrors supabase/APPLY-SUBSCRIPTIONS.sql STEP 2 exactly (same DDL).
-- The APPLY file is what the owner pastes into the Supabase SQL Editor;
-- this file is the repo record of the same change.
-- PENDING — not applied live yet. See supabase/MIGRATION-STATE.md.

-- ---------- STEP 2: DDL ----------
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users (id) on delete cascade,
  cf_subscription_id   text not null unique,
  cf_plan_id           text,
  plan                 text not null,
  amount               numeric(12,2) not null,
  currency             text not null default 'INR',
  status               text not null default 'initialized' check (status in ('initialized', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  period_start         timestamptz,
  period_end           timestamptz,
  next_charge_at       timestamptz,
  last_charge_id       text,
  last_charge_at       timestamptz,
  refunded_charge_ids  text[] not null default '{}',
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists subscriptions_owner_created_idx
  on public.subscriptions (owner_id, created_at desc);

create table if not exists public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  event_key       text not null unique,
  event_type      text not null,
  subscription_id text,
  received_at     timestamptz not null default now()
);
create index if not exists webhook_events_subscription_idx
  on public.webhook_events (subscription_id, received_at desc);

alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;
grant all on public.subscriptions to service_role;
grant all on public.webhook_events to service_role;

-- Widen the payments product discriminator so a subscription checkout
-- row (product 'subscription') passes the check. The old values stay.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'payments_product_check') then
    alter table public.payments drop constraint payments_product_check;
  end if;
  alter table public.payments add constraint payments_product_check check (product in ('plan', 'watermark', 'subscription'));
end $$;
