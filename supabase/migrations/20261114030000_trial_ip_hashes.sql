-- 20261114030000_trial_ip_hashes.sql — free-trial protection (Builder 5)
--
-- Mirrors supabase/APPLY-TRIAL-IP-HASHES.sql (STEP 2). That file is the
-- human-run record (STEP 1/2/3 + PENDING state); this migration is the
-- same DDL for environments that apply migrations from the repo.
--
-- NO raw IP is stored anywhere — ever. Only HMAC-SHA256 hashes of the
-- client IP (key TRIAL_IP_HASH_SECRET) live here. No foreign key to
-- auth.users on purpose: deleting an account must NOT delete its
-- IP-hash row, or recreating the account would re-grant the trial.
-- Retention: 12 months (expires_at), swept by expire_trial_ip_hashes.

create table if not exists public.trial_ip_hashes (
  ip_hash        text primary key,
  first_seen     timestamptz not null default now(),
  trial_granted_at timestamptz,
  account_count  integer not null default 0 check (account_count >= 0),
  expires_at     timestamptz not null default (now() + interval '12 months')
);
create index if not exists trial_ip_hashes_expires_idx
  on public.trial_ip_hashes (expires_at);

alter table public.trial_ip_hashes enable row level security;

grant all on public.trial_ip_hashes to service_role;

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
  return jsonb_build_object(
    'claimed', true,
    'already_claimed', v_count > 1,
    'account_count', v_count);
end;
$$;

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
