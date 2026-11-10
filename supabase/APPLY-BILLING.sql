-- =====================================================================
-- APPLY-BILLING.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: creates the billing storage for the pricing plans —
-- public.payments (one row per Cashfree order the app created; written
-- ONLY by the server — the checkout route and the webhook, both via the
-- service role — and readable by its owner as their invoice list) — and
-- adds profiles.plan_expires_at, the moment the current paid period ends
-- (null on Free). profiles.plan itself is already server-written only
-- (lock_profile_plan); this file does not change that.
-- Full rationale lives in supabase/migrations/20261111000000_billing.sql.
-- Until this is applied the app degrades honestly: /api/billing/* answers
-- that billing is not switched on yet, and plan reads treat everyone as
-- Free (which is also today's behaviour — profiles.plan defaults 'free').
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
-- Does the payments table already exist, and does profiles already carry
-- plan_expires_at? (0 rows = fresh, 1 row each = already applied and
-- STEP 2 will be a no-op.)
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('payments')
 order by table_name;
--    expect BEFORE first apply: 0 rows
--    expect if re-running:       1 row (payments)

select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'profiles'
   and column_name = 'plan_expires_at';
--    expect BEFORE first apply: 0 rows
--    expect if re-running:       1 row (plan_expires_at)

-- A reference count that must NOT change when STEP 2 runs (existing user
-- data is untouched by this file — it only adds one table + one column):
select count(*) as existing_projects from public.projects;
--    expect: note the number; STEP 3 repeats this check and it must match.

-- ---------- STEP 2: THE DDL (identical to the migration file) ----------
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

-- The owner reads their own payments (the billing page's invoice list).
-- There is deliberately NO insert/update/delete policy for authenticated:
-- rows are created and settled only by the server (service role).
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (auth.uid() = owner_id);

grant select on public.payments to authenticated;
grant all on public.payments to service_role;
-- profiles has column-level grants (lock_profile_plan); make sure the new
-- column is readable by its owner like the rest of the row.
grant select (plan_expires_at) on public.profiles to authenticated;

-- ---------- STEP 3: VERIFY (run last, keep the output) ----------
-- RLS is on for payments:
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname = 'payments';
--    expect: 1 row, rls_enabled = true

-- The one policy:
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename = 'payments'
 order by policyname;
--    expect: 1 row (payments_select_own, SELECT)

-- The column landed on profiles:
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'profiles'
   and column_name = 'plan_expires_at';
--    expect: 1 row (plan_expires_at, timestamp with time zone)

-- Grants on payments:
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name = 'payments'
   and grantee in ('authenticated', 'service_role')
 order by grantee, privilege_type;
--    expect: authenticated SELECT (1 row) + service_role full set

-- Existing data untouched:
select count(*) as existing_projects from public.projects;
--    expect: the same number as STEP 1
