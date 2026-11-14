-- 20261114020000_watermark_entitlements.sql — watermark-removal entitlements + payments product discriminator.
-- Mirrors supabase/APPLY-WATERMARK-ENTITLEMENTS.sql STEP 2 exactly (same DDL).
-- The APPLY file is what the owner pastes into the Supabase SQL Editor;
-- this file is the repo record of the same change.
-- PENDING — not applied live yet. See supabase/MIGRATION-STATE.md.

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
