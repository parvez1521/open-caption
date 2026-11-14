-- APPLY-SUBSCRIPTIONS.sql — Cashfree subscription storage + webhook event log
-- (owner decision 2026-11-14; Builder 6, Captionit Monetization Programme)
--
-- How to apply: open the Supabase dashboard for the OPEN CAPTION project
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does:
-- - creates public.subscriptions (one row per Cashfree subscription: owner,
--   Cashfree subscription id, dashboard plan id, app plan, amount, status,
--   current period, last charge, refunded charge ids, cancel time).
-- - creates public.webhook_events (one row per handled Cashfree
--   subscription webhook delivery, keyed by event_key — the audit log and
--   the delivery dedupe).
-- - extends the payments product check from ('plan','watermark') to
--   ('plan','watermark','subscription'): a subscription checkout writes a
--   payments row with product 'subscription' and cf_order_id set to the
--   Cashfree subscription id (a subscription has no PG order).
--
-- The model (Builder 6):
-- - Cancel keeps access to the end of the paid period. The row flips to
--   'cancelled'; profiles.plan / plan_expires_at are never touched.
-- - Expiry reads as Free through the existing effectivePlanId rule
--   (plan_expires_at in the past). No revoke.
-- - A failed charge marks the row 'past_due' and grants nothing. A later
--   good charge re-activates the same row.
-- - A refunded charge id is appended to refunded_charge_ids, so a
--   re-sent success event for THAT charge grants nothing. Future cycles
--   still renew normally. A refunded one-time plan payment is marked
--   'refunded' on payments and can never settle again.
-- - Idempotency: cf_subscription_id UNIQUE; the first cycle grants under
--   one activation key per subscription, each renewal under its charge
--   id (see apps/frontend/src/lib/billing/subscriptions.ts).
--
-- Both tables are service-role-only (RLS on, no policies — same shape as
-- video_quota_events, the minutes ledger and watermark_entitlements).
-- There is deliberately NO authenticated policy: the app reads and writes
-- them only through the server (service role).
--
-- Idempotent: safe to run more than once.
-- NOT applied live by this change — the owner applies it in the SQL
-- Editor. Until it is applied, subscription checkout answers dbPending
-- and subscription webhooks are acknowledged without action.

-- ---------- STEP 1: RECORD THE BEFORE STATE (run first, keep the output) ----------
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('subscriptions', 'webhook_events')
 order by table_name;
--    expect: 0 rows on first run

select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.payments'::regclass
   and conname = 'payments_product_check';
--    expect: 1 row, check (product in ('plan', 'watermark')) — STEP 2 widens it

select count(*) as existing_projects from public.projects;
--    expect: a number — STEP 3 must show the same number

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

-- ---------- STEP 3: VERIFY (run last, keep the output) ----------
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('subscriptions', 'webhook_events');
--    expect: 2 rows, rls_enabled = true for both

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('subscriptions', 'webhook_events');
--    expect: 0 rows (service-role-only, no policies)

select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.payments'::regclass
   and conname = 'payments_product_check';
--    expect: 1 row, check (product in ('plan', 'watermark', 'subscription'))

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'subscriptions'
 order by ordinal_position;
--    expect: 15 columns (id, owner_id, cf_subscription_id, cf_plan_id, plan, amount, currency, status, period_start, period_end, next_charge_at, last_charge_id, last_charge_at, refunded_charge_ids, cancelled_at, created_at)

select count(*) as existing_projects from public.projects;
--    expect: the same number as STEP 1
