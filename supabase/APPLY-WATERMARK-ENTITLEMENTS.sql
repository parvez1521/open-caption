-- APPLY-WATERMARK-ENTITLEMENTS.sql — ₹69 watermark-removal entitlements + payments product discriminator
-- (owner decision 2026-11-14; Builder 3, Captionit Monetization Programme)
--
-- How to apply: open the Supabase dashboard for the OPEN CAPTION project
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: creates public.watermark_entitlements (one row per ₹69
-- purchase: project, owner, payment, Cashfree order, amount, status) and
-- adds a product discriminator + project_id to public.payments, so a
-- watermark purchase can be told apart from a plan purchase.
--
-- The model (coordinator decisions 2026-11-14):
-- - One payment = one project. A second project needs a second ₹69 payment.
-- - Re-exports of the same project never re-charge. The entitlement is
--   permanent for that project (until a refund).
-- - A refund flips the entitlement to 'refunded' and the project is
--   watermarked again. The row is kept as history, never deleted.
-- - The entitlement ONLY suppresses the watermark. It buys no minutes, no
--   premium looks, no MOV export. Nothing else reads this table.
-- - Watermark applies to MP4 only. Text exports have no picture; transparent
--   overlays stay clean.
-- - Idempotency: project_id UNIQUE + cf_order_id UNIQUE — a duplicate
--   webhook delivery creates exactly ONE entitlement.
--
-- The table is service-role-only (RLS on, no policies — same shape as
-- video_quota_events and the minutes ledger). There is deliberately NO
-- authenticated policy: the app reads and writes it only through the
-- server (service role). A client-written row would let anyone remove
-- the watermark for free.
--
-- Idempotent: safe to run more than once.

-- ---------- STEP 1: RECORD THE BEFORE STATE (run first, keep the output) ----------
select count(*) as watermark_entitlements_before from public.watermark_entitlements;
--    expect: 0 rows on first run (or "relation does not exist" — that is fine,
--    it just means the table is not there yet)

select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'payments' and column_name in ('product', 'project_id');
--    expect: 0 rows on first run (neither column exists yet)

select count(*) as existing_projects from public.projects;
--    expect: a number — STEP 3 must show the same number

-- ---------- STEP 2: DDL ----------
-- One row per ₹69 purchase: the project it cleans, the payment behind it.
-- project_id is UNIQUE (one entitlement per project, ever) and
-- cf_order_id is UNIQUE (a duplicate webhook can never mint a second row).
-- A refund flips status to 'refunded' — the row is kept as history, never
-- deleted — so the project is watermarked again.
create table if not exists public.watermark_entitlements (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references public.projects (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  payment_id  uuid references public.payments (id) on delete set null,
  cf_order_id text not null unique,
  amount      numeric(12,2) not null,
  currency    text not null,
  status      text not null check (status in ('paid', 'refunded')),
  paid_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists watermark_entitlements_owner_idx
  on public.watermark_entitlements (owner_id, created_at desc);

alter table public.watermark_entitlements enable row level security;

-- No policies on purpose: the server (service role) is the only writer and
-- reader. Do NOT add an authenticated policy — the entitlement is money and
-- a client-written row would let anyone remove the watermark for free.
grant all on public.watermark_entitlements to service_role;

-- payments product discriminator: "plan" for plan purchases, "watermark"
-- for a ₹69 removal. Existing rows are all plan purchases, so the default
-- is correct for them. project_id names the project a watermark purchase
-- cleans; it is null on plan purchases.
alter table public.payments add column if not exists product text not null default 'plan';
alter table public.payments add column if not exists project_id uuid references public.projects (id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_product_check') then
    alter table public.payments add constraint payments_product_check check (product in ('plan', 'watermark'));
  end if;
end $$;
create index if not exists payments_project_idx on public.payments (project_id);

-- ---------- STEP 3: VERIFY (run after STEP 2, keep the output) ----------
-- RLS is on, with NO policies (service role only):
select relname as table_name, relrowsecurity as rls_on
  from pg_class
 where relname in ('watermark_entitlements');
--    expect: 1 row, rls_on = t

select tablename, policyname from pg_policies
 where schemaname = 'public' and tablename = 'watermark_entitlements';
--    expect: 0 rows

-- Columns are as designed (10):
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'watermark_entitlements'
 order by ordinal_position;
--    expect: id, project_id, owner_id, payment_id, cf_order_id, amount,
--    currency, status, paid_at, created_at

-- Unique keys (one entitlement per project, one per order):
select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'watermark_entitlements'
   and indexdef ilike '%unique%';
--    expect: 2 rows (the unique constraints on project_id and cf_order_id)

-- payments gained the discriminator, and every existing row reads as a plan purchase:
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'payments'
   and column_name in ('product', 'project_id')
 order by column_name;
--    expect: product text, default 'plan'; project_id uuid, no default

select distinct product from public.payments;
--    expect: only 'plan' (every row written before this apply was a plan purchase)

-- No rows were granted by the apply itself, and no project was touched:
select count(*) as watermark_entitlements_after from public.watermark_entitlements;
--    expect: 0
select count(*) as existing_projects from public.projects;
--    expect: the same number as STEP 1
