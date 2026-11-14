-- APPLY-TRIAL-IP-HASHES.sql — free-trial protection: one trial per eligible IP
-- (owner decision 2026-11-14; Builder 5, Captionit Monetization Programme)
--
-- STATE: PENDING — NOT APPLIED. Do NOT run this against production until
-- the owner confirms the retention period (12 months, below) and the
-- TRIAL_IP_HASH_SECRET env var is set in Vercel. Until STEP 2 runs, the
-- trial gate fails CLOSED for Free grants (paid plans unaffected).
--
-- How to apply: open the Supabase dashboard for the OPEN CAPTION project
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: creates public.trial_ip_hashes (one row per IP hash
-- that has had a trial: the HMAC-SHA256 hash, first seen, when the trial
-- was granted, how many accounts claimed from it, expiry) plus two
-- functions that are the ONLY readers/writers: trial_ip_status (read)
-- and trial_ip_claim (atomic insert-or-bump), plus the retention
-- sweeper expire_trial_ip_hashes.
--
-- The model (Builder 5, 2026-11-14):
-- - NO raw IP is stored anywhere — ever. The app hashes the client IP
--   with HMAC-SHA256 and TRIAL_IP_HASH_SECRET in memory, in the request
--   handler, and drops the address. The table holds hashes only. A
--   plain SHA-256 of an IP is reversible by brute force (the IPv4
--   space is small); the keyed hash is not. Rotating the secret
--   orphans old rows by design.
-- - One trial per eligible IP, NOT one account per IP. The first
--   account from an IP gets the trial. A later account on the same IP
--   is not blocked from signing up or buying — it is only denied the
--   trial, unless it passes Turnstile with a verified email
--   (households, offices, colleges, carrier NAT, VPNs). Paid plans
--   never touch this table.
-- - The row is keyed by IP hash, NOT by user id: there is deliberately
--   NO foreign key to auth.users. Deleting an account does not delete
--   its IP-hash row, so recreating an account from the same IP does
--   not re-grant the trial. A user on a NEW IP could re-grant — that
--   is the accepted residual risk, stated in the code and the report.
-- - Retention: 12 months from first_seen (owner to confirm). The
--   sweeper deletes expired rows; the daily cleanup cron should call
--   it (owner step — not wired yet). Deletion on request: an account
--   deletion removes account data; the fraud-prevention hash stays
--   until its expiry (privacy-page wording is an owner step).
-- - The table is never joined to the user table for marketing or
--   analytics. Fraud prevention only.
--
-- The table is service-role-only (RLS on, no policies — same shape as
-- video_quota_events and the minutes ledger). There is deliberately NO
-- authenticated policy: the app reads and writes it only through the
-- server (service role). A client-written row would let anyone mint
-- trials.
--
-- Idempotent: safe to run more than once.

-- ---------- STEP 1: RECORD THE BEFORE STATE (run first, keep the output) ----------
select count(*) as trial_ip_hashes_before from public.trial_ip_hashes;
--    expect: 0 rows on first run (or "relation does not exist" — that is fine,
--    it just means the table is not there yet)

select count(*) as existing_projects from public.projects;
--    expect: a number — STEP 3 must show the same number

-- ---------- STEP 2: DDL ----------
create table if not exists public.trial_ip_hashes (
  -- HMAC-SHA256 of the client IP with TRIAL_IP_HASH_SECRET. Never a raw IP.
  ip_hash        text primary key,
  first_seen     timestamptz not null default now(),
  -- When the first trial was granted for this hash. Null until granted.
  trial_granted_at timestamptz,
  -- Accounts that claimed (or tried to claim) a trial from this hash.
  account_count  integer not null default 0 check (account_count >= 0),
  -- Retention: 12 months from first_seen. The sweeper deletes expired rows.
  expires_at     timestamptz not null default (now() + interval '12 months')
);
create index if not exists trial_ip_hashes_expires_idx
  on public.trial_ip_hashes (expires_at);

alter table public.trial_ip_hashes enable row level security;

-- No policies on purpose: the server (service role) is the only writer and
-- reader. Do NOT add an authenticated policy — a client-written row would
-- let anyone mint trials.
grant all on public.trial_ip_hashes to service_role;

-- ---------- Functions (the only readers/writers) ----------
-- All three are SECURITY DEFINER with a pinned search_path, executable by
-- service_role only. The app calls them through supabase rpc() with the
-- service-role client; no other role can execute them.

-- Read-only status: has this IP hash already had a trial?
create or replace function public.trial_ip_status(p_ip_hash text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.trial_ip_hashes%rowtype;
begin
  select * into v_row from public.trial_ip_hashes where ip_hash = p_ip_hash;
  if not found then
    return jsonb_build_object('claimed', false, 'account_count', 0, 'trial_granted_at', null);
  end if;
  return jsonb_build_object(
    'claimed', v_row.trial_granted_at is not null,
    'account_count', v_row.account_count,
    'trial_granted_at', v_row.trial_granted_at);
end;
$$;

-- Atomic claim: insert the hash, or bump account_count on conflict.
-- One statement, so two signups from the same IP at the same moment
-- cannot both read "unclaimed" and both grant: the second call sees
-- already_claimed = true and the app re-decides (Turnstile or refuse).
create or replace function public.trial_ip_claim(p_ip_hash text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.trial_ip_hashes (ip_hash, trial_granted_at, account_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
    set account_count = public.trial_ip_hashes.account_count + 1,
        trial_granted_at = coalesce(public.trial_ip_hashes.trial_granted_at, now())
  returning account_count into v_count;
  -- The insert path returns account_count = 1, so already_claimed is
  -- false; the conflict path returns account_count >= 2, so it is true.
  -- (trial_granted_at is always set by this statement, so the count is
  -- the discriminator, not the timestamp.)
  return jsonb_build_object(
    'claimed', true,
    'already_claimed', v_count > 1,
    'account_count', v_count);
end;
$$;

-- Retention sweeper: delete expired rows. Call it from the daily
-- cleanup cron (owner step — not wired yet). Returns rows deleted.
create or replace function public.expire_trial_ip_hashes()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  n integer;
begin
  delete from public.trial_ip_hashes where expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.trial_ip_status(text) from public;
revoke all on function public.trial_ip_claim(text) from public;
revoke all on function public.expire_trial_ip_hashes() from public;
grant execute on function public.trial_ip_status(text) to service_role;
grant execute on function public.trial_ip_claim(text) to service_role;
grant execute on function public.expire_trial_ip_hashes() to service_role;

-- ---------- STEP 3: VERIFY (run after STEP 2, keep the output) ----------
-- Table exists, with the right columns:
select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'trial_ip_hashes'
 order by ordinal_position;
--    expect: 5 columns (ip_hash, first_seen, trial_granted_at,
--    account_count, expires_at)

-- No policies on the table (service-role-only by design):
select tablename, count(*) as policy_count
  from pg_policies
 where schemaname = 'public' and tablename = 'trial_ip_hashes'
 group by tablename;
--    expect: 0 rows

-- Functions exist, service_role-only:
select routine_name as function_name, grantee as execute_role
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('trial_ip_status', 'trial_ip_claim', 'expire_trial_ip_hashes')
   and privilege_type = 'EXECUTE'
 order by routine_name, grantee;
--    expect: 3 rows, one per function, grantee service_role on each

-- No rows were granted by the apply itself, and no project was touched:
select count(*) as trial_ip_hashes_after from public.trial_ip_hashes;
--    expect: 0
select count(*) as existing_projects from public.projects;
--    expect: the same number as STEP 1
