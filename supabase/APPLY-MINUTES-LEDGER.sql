-- APPLY-MINUTES-LEDGER.sql — minutes ledger + balances (owner decision 2026-11-14)
--
-- How to apply: open the Supabase dashboard for the OPEN CAPTION project
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: creates public.minute_ledger (append-only) and
-- public.minute_balances, plus four functions that are the ONLY writers:
-- grant_cycle_minutes, reserve_minutes, settle_reservation,
-- get_minutes_balance, and the stale-hold sweeper
-- expire_stale_reservations.
--
-- The model (coordinator decisions 2026-11-14):
-- - Billed minutes = exported video minutes, rounded UP to whole minutes
--   per export. Transcription is NOT charged. Text exports (SRT/VTT/ASS/
--   TXT/JSON) never count. No rollover.
-- - Free: 5 minutes ONE-TIME ever (key free-grant:<user_id> — a second
--   grant with that key is a no-op). Starter 40 / Creator 100 / Pro 250
--   per billing cycle (cycle ends at profiles.plan_expires_at).
-- - A reservation holds minutes BEFORE processing: reserve decrements the
--   balance at once, so parallel exports cannot overspend. The deduct row
--   on completion is a marker (the hold already left the balance at
--   reserve time) — it records the minutes actually charged and never
--   moves the balance again. A refund returns the unused hold.
-- - Grants ADD to the balance (an early renewal never eats paid minutes
--   left over from the old cycle); the remainder expires at cycle end.
-- - The old video_quota_events table stays in the DB as legacy history.
--   No new quota rows are written after the minutes cutover.
--
-- The tables are service-role-only (RLS on, no policies — same shape as
-- video_quota_events). There is deliberately NO authenticated policy: the
-- app reads and writes them only through the server (service role). A
-- client-written row would let anyone mint minutes or bypass the limit.
--
-- Atomicity: the check-and-hold is one Postgres function call
-- (reserve_minutes locks the balance row FOR UPDATE). No read-then-act
-- in TypeScript. Idempotency: minute_ledger.idempotency_key is UNIQUE —
-- a duplicate submission returns the existing reservation instead of
-- charging twice. A reservation that was already settled (deduct/refund
-- exists) never blocks a fresh attempt: reserve mints a suffixed key.
--
-- Idempotent: safe to run more than once.

-- ---------- STEP 1: RECORD THE BEFORE STATE (run first, keep the output) ----------
select count(*) as minute_ledger_before from public.minute_ledger;
--    expect: 0 rows on first run (or "relation does not exist" — that is fine,
--    it just means the table is not there yet)

select count(*) as minute_balances_before from public.minute_balances;
--    expect: 0 rows on first run (or "relation does not exist")

select count(*) as existing_projects from public.projects;
--    expect: a number — STEP 3 must show the same number

-- ---------- STEP 2: DDL ----------
create table if not exists public.minute_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete cascade,
  export_id       uuid,
  -- Which reservation a deduct/refund row settles (the reserve row's own
  -- idempotency key). Null on grant/expire rows, which settle nothing.
  reservation_key text,
  kind            text not null check (kind in ('grant', 'reserve', 'deduct', 'refund', 'expire')),
  -- Signed minutes. grant/refund positive; reserve/expire negative; a
  -- deduct row records the minutes actually charged (positive) but never
  -- moves the balance — the hold already left it at reserve time.
  minutes         integer not null,
  balance_after   integer not null check (balance_after >= 0),
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
create index if not exists minute_ledger_user_created_idx
  on public.minute_ledger (user_id, created_at desc);
create index if not exists minute_ledger_export_idx
  on public.minute_ledger (export_id);
create index if not exists minute_ledger_reservation_idx
  on public.minute_ledger (reservation_key);

create table if not exists public.minute_balances (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  -- Spendable minutes right now (holds already subtracted). Never negative.
  balance_minutes integer not null default 0 check (balance_minutes >= 0),
  cycle_start    timestamptz,
  -- Null on the Free one-time grant: those 5 minutes never expire.
  cycle_end      timestamptz,
  updated_at     timestamptz not null default now()
);

alter table public.minute_ledger enable row level security;
alter table public.minute_balances enable row level security;

-- No policies on purpose: the server (service role) is the only writer and
-- reader. Do NOT add an authenticated policy — the balance is money and a
-- client-written row would let anyone mint minutes or bypass the limit.
grant all on public.minute_ledger to service_role;
grant all on public.minute_balances to service_role;

-- ---------- Functions (the only writers) ----------
-- All four are SECURITY DEFINER with a pinned search_path, executable by
-- service_role only. The app calls them through supabase rpc() with the
-- service-role client; no other role can execute them.

-- Sweep stale holds for one user. A hold is stale after 24h when its job
-- is terminal (failed/cancelled → refund the hold), its job completed but
-- the settle never landed (→ deduct the hold: the render happened), or
-- there is no job at all (browser render → refund). Any hold older than
-- 7 days is refunded regardless — the backstop for a job queued forever
-- with no companion online. A hold whose job is still queued/processing
-- is left alone. Returns the number of holds settled.
create or replace function public.expire_stale_reservations(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  n integer := 0;
  v_job_status text;
  v_balance integer;
begin
  for r in
    select l.idempotency_key as rkey, l.export_id as export_id, abs(l.minutes) as held, l.created_at as created_at
    from public.minute_ledger l
    where l.user_id = p_user_id and l.kind = 'reserve'
      and l.created_at < now() - interval '24 hours'
      and not exists (
        select 1 from public.minute_ledger s
        where s.user_id = p_user_id and s.reservation_key = l.idempotency_key and s.kind in ('deduct', 'refund')
      )
    order by l.created_at
  loop
    select j.status into v_job_status
    from public.jobs j
    where (j.payload ->> 'exportId') = r.export_id::text
    order by j.created_at desc limit 1;
    select balance_minutes into v_balance from public.minute_balances where user_id = p_user_id for update;
    if v_job_status = 'completed' then
      insert into public.minute_ledger (user_id, export_id, reservation_key, kind, minutes, balance_after, idempotency_key)
      values (p_user_id, r.export_id, r.rkey, 'deduct', r.held, coalesce(v_balance, 0), 'deduct:' || r.rkey)
      on conflict (idempotency_key) do nothing;
      if found then n := n + 1; end if;
    elsif v_job_status in ('failed', 'cancelled') or v_job_status is null or r.created_at < now() - interval '7 days' then
      insert into public.minute_ledger (user_id, export_id, reservation_key, kind, minutes, balance_after, idempotency_key)
      values (p_user_id, r.export_id, r.rkey, 'refund', r.held, coalesce(v_balance, 0) + r.held, 'refund:' || r.rkey)
      on conflict (idempotency_key) do nothing;
      if found then
        update public.minute_balances set balance_minutes = balance_minutes + r.held, updated_at = now() where user_id = p_user_id;
        n := n + 1;
      end if;
    end if;
    -- else: the job is still queued/processing (or a retry is pending) — leave the hold alone.
  end loop;
  return n;
end;
$$;

-- Grant one billing cycle of minutes. Idempotent on p_idempotency_key
-- (use 'grant:payment:<payment_id>' for paid grants,
-- 'free-grant:<user_id>' for the Free one-time grant): a second call with
-- the same key returns the current balance and grants nothing. Grants ADD
-- to the balance — an early renewal never eats leftover minutes — but a
-- finished cycle's leftover is expired first, so nothing rolls over past
-- cycle end. A null p_cycle_end means "never expires" (Free one-time).
create or replace function public.grant_cycle_minutes(
  p_user_id uuid, p_minutes integer, p_cycle_start timestamptz, p_cycle_end timestamptz, p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_balance integer := 0;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_new integer;
begin
  if p_minutes < 0 then
    return jsonb_build_object('granted', false, 'balance', 0, 'reason', 'minutes must be >= 0');
  end if;
  if exists (select 1 from public.minute_ledger where idempotency_key = p_idempotency_key) then
    select balance_minutes, cycle_start, cycle_end into v_balance, v_cycle_start, v_cycle_end
    from public.minute_balances where user_id = p_user_id;
    return jsonb_build_object('granted', false, 'already_granted', true, 'balance', coalesce(v_balance, 0),
      'cycle_start', v_cycle_start, 'cycle_end', v_cycle_end);
  end if;
  insert into public.minute_balances (user_id, balance_minutes, cycle_start, cycle_end)
  values (p_user_id, 0, p_cycle_start, p_cycle_end)
  on conflict (user_id) do nothing;
  select balance_minutes, cycle_start, cycle_end into v_balance, v_cycle_start, v_cycle_end
  from public.minute_balances where user_id = p_user_id for update;
  -- A finished cycle's leftover is dead: expire it before adding the grant.
  if v_cycle_end is not null and v_cycle_end <= now() and v_balance > 0 then
    insert into public.minute_ledger (user_id, kind, minutes, balance_after, idempotency_key)
    values (p_user_id, 'expire', -v_balance, 0, 'expire:cycle:' || p_user_id::text || ':' || to_char(v_cycle_end, 'YYYYMMDDHH24MISS'))
    on conflict (idempotency_key) do nothing;
    if found then v_balance := 0; end if;
  end if;
  v_new := v_balance + p_minutes;
  insert into public.minute_ledger (user_id, kind, minutes, balance_after, idempotency_key)
  values (p_user_id, 'grant', p_minutes, v_new, p_idempotency_key)
  on conflict (idempotency_key) do nothing;
  if not found then
    select balance_minutes into v_balance from public.minute_balances where user_id = p_user_id;
    return jsonb_build_object('granted', false, 'already_granted', true, 'balance', coalesce(v_balance, 0));
  end if;
  if p_cycle_end is null then
    update public.minute_balances
    set balance_minutes = v_new, cycle_start = p_cycle_start, cycle_end = null, updated_at = now()
    where user_id = p_user_id;
  else
    update public.minute_balances
    set balance_minutes = v_new, cycle_start = p_cycle_start, cycle_end = p_cycle_end, updated_at = now()
    where user_id = p_user_id;
  end if;
  return jsonb_build_object('granted', true, 'already_granted', false, 'balance', v_new,
    'cycle_start', p_cycle_start, 'cycle_end', p_cycle_end);
end;
$$;

-- Reserve minutes for one export attempt, atomically. The balance row is
-- locked FOR UPDATE, so parallel reserves are serialised: two requests
-- can never both spend the same minutes. Returns
-- {ok, reservation_key, minutes, balance, already_reserved} or
-- {ok:false, code:'INSUFFICIENT'|'MINUTES_NOT_SET_UP', balance, minutes}.
-- A duplicate key returns the existing reservation (no double charge);
-- a key whose reservation was already settled mints a suffixed key, so a
-- retry after a failure or refund is never blocked by the old hold.
-- Free users get their one-time 5 minutes lazily here, once ever, when
-- they have no balance row yet and no free-grant row exists. Paid users
-- with no balance row fail closed (their grant comes from settlePaid).
create or replace function public.reserve_minutes(
  p_user_id uuid, p_project_id uuid, p_minutes integer, p_idempotency_key text, p_export_id uuid,
  p_plan text, p_free_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_key text := p_idempotency_key;
  v_has boolean;
  v_settled boolean;
  v_attempt integer := 2;
  v_balance integer := 0;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_new integer;
begin
  if p_minutes < 1 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'message', 'minutes must be at least 1');
  end if;
  perform public.expire_stale_reservations(p_user_id);
  loop
    select exists(select 1 from public.minute_ledger where idempotency_key = v_key and kind = 'reserve') into v_has;
    exit when not v_has;
    select exists(
      select 1 from public.minute_ledger s
      where s.user_id = p_user_id and s.reservation_key = v_key and s.kind in ('deduct', 'refund')
    ) into v_settled;
    if not v_settled then
      select balance_minutes into v_balance from public.minute_balances where user_id = p_user_id;
      return jsonb_build_object('ok', true, 'already_reserved', true, 'reservation_key', v_key,
        'minutes', p_minutes, 'balance', coalesce(v_balance, 0));
    end if;
    v_key := p_idempotency_key || '-r' || v_attempt;
    v_attempt := v_attempt + 1;
    if v_attempt > 12 then
      return jsonb_build_object('ok', false, 'code', 'INTERNAL', 'message', 'too many reservation attempts');
    end if;
  end loop;
  insert into public.minute_balances (user_id, balance_minutes)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select balance_minutes, cycle_start, cycle_end into v_balance, v_cycle_start, v_cycle_end
  from public.minute_balances where user_id = p_user_id for update;
  -- A finished paid cycle's leftover is dead.
  if v_cycle_end is not null and v_cycle_end <= now() then
    if v_balance > 0 then
      insert into public.minute_ledger (user_id, kind, minutes, balance_after, idempotency_key)
      values (p_user_id, 'expire', -v_balance, 0, 'expire:cycle:' || p_user_id::text || ':' || to_char(v_cycle_end, 'YYYYMMDDHH24MISS'))
      on conflict (idempotency_key) do nothing;
      if found then v_balance := 0; end if;
    end if;
    v_cycle_start := null;
    v_cycle_end := null;
  end if;
  -- Free one-time grant, lazily: once ever, keyed free-grant:<user_id>.
  if p_plan = 'free' and not exists (select 1 from public.minute_ledger where idempotency_key = 'free-grant:' || p_user_id::text) then
    v_balance := v_balance + p_free_minutes;
    insert into public.minute_ledger (user_id, kind, minutes, balance_after, idempotency_key)
    values (p_user_id, 'grant', p_free_minutes, v_balance, 'free-grant:' || p_user_id::text)
    on conflict (idempotency_key) do nothing;
    if not found then
      select balance_minutes into v_balance from public.minute_balances where user_id = p_user_id;
    end if;
    v_cycle_start := now();
    v_cycle_end := null;
  end if;
  if p_plan <> 'free' and v_balance = 0 and v_cycle_start is null and not exists (
    select 1 from public.minute_ledger where user_id = p_user_id and kind = 'grant'
  ) then
    return jsonb_build_object('ok', false, 'code', 'MINUTES_NOT_SET_UP', 'balance', 0,
      'message', 'Minutes are not set up yet — exports are paused until the setup finishes.');
  end if;
  if v_balance < p_minutes then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT', 'balance', v_balance, 'minutes', p_minutes);
  end if;
  v_new := v_balance - p_minutes;
  insert into public.minute_ledger (user_id, project_id, export_id, reservation_key, kind, minutes, balance_after, idempotency_key)
  values (p_user_id, p_project_id, p_export_id, v_key, 'reserve', -p_minutes, v_new, v_key)
  on conflict (idempotency_key) do nothing;
  if not found then
    select balance_minutes into v_balance from public.minute_balances where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'already_reserved', true, 'reservation_key', v_key,
      'minutes', p_minutes, 'balance', coalesce(v_balance, 0));
  end if;
  update public.minute_balances
  set balance_minutes = v_new, cycle_start = coalesce(v_cycle_start, minute_balances.cycle_start), cycle_end = v_cycle_end, updated_at = now()
  where user_id = p_user_id;
  return jsonb_build_object('ok', true, 'already_reserved', false, 'reservation_key', v_key,
    'minutes', p_minutes, 'balance', v_new);
end;
$$;

-- Settle one reservation: 'completed' converts the hold into a spend of
-- the actual rendered minutes (never more than reserved) and refunds the
-- unused hold; 'failed'/'cancelled' refunds the whole hold. Idempotent:
-- a second settle for the same reservation is a no-op
-- ({settled:false, reason:'already_settled'}), and a settle with no
-- reservation at all answers {settled:false, reason:'no_reservation'}
-- instead of charging anything.
create or replace function public.settle_reservation(
  p_user_id uuid, p_export_id uuid, p_outcome text, p_actual_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rkey text;
  v_reserved integer;
  v_balance integer;
  v_actual integer;
  v_refund integer := 0;
begin
  if p_outcome not in ('completed', 'failed', 'cancelled') then
    return jsonb_build_object('settled', false, 'reason', 'bad_outcome');
  end if;
  select l.idempotency_key, abs(l.minutes) into v_rkey, v_reserved
  from public.minute_ledger l
  where l.user_id = p_user_id and l.export_id = p_export_id and l.kind = 'reserve'
    and not exists (
      select 1 from public.minute_ledger s
      where s.user_id = p_user_id and s.reservation_key = l.idempotency_key and s.kind in ('deduct', 'refund')
    )
  order by l.created_at desc limit 1;
  if v_rkey is null then
    return jsonb_build_object('settled', false, 'reason', 'no_reservation');
  end if;
  insert into public.minute_balances (user_id, balance_minutes)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select balance_minutes into v_balance from public.minute_balances where user_id = p_user_id for update;
  if p_outcome = 'completed' then
    v_actual := least(coalesce(p_actual_minutes, v_reserved), v_reserved);
    v_refund := v_reserved - v_actual;
    insert into public.minute_ledger (user_id, export_id, reservation_key, kind, minutes, balance_after, idempotency_key)
    values (p_user_id, p_export_id, v_rkey, 'deduct', v_actual, v_balance, 'deduct:' || v_rkey)
    on conflict (idempotency_key) do nothing;
    if not found then
      return jsonb_build_object('settled', false, 'reason', 'already_settled');
    end if;
    if v_refund > 0 then
      insert into public.minute_ledger (user_id, export_id, reservation_key, kind, minutes, balance_after, idempotency_key)
      values (p_user_id, p_export_id, v_rkey, 'refund', v_refund, v_balance + v_refund, 'refund:' || v_rkey)
      on conflict (idempotency_key) do nothing;
      if found then v_balance := v_balance + v_refund; end if;
    end if;
    update public.minute_balances set balance_minutes = v_balance, updated_at = now() where user_id = p_user_id;
    return jsonb_build_object('settled', true, 'outcome', 'completed', 'minutes_charged', v_actual,
      'refunded', v_refund, 'balance', v_balance);
  else
    insert into public.minute_ledger (user_id, export_id, reservation_key, kind, minutes, balance_after, idempotency_key)
    values (p_user_id, p_export_id, v_rkey, 'refund', v_reserved, v_balance + v_reserved, 'refund:' || v_rkey)
    on conflict (idempotency_key) do nothing;
    if not found then
      return jsonb_build_object('settled', false, 'reason', 'already_settled');
    end if;
    v_balance := v_balance + v_reserved;
    update public.minute_balances set balance_minutes = v_balance, updated_at = now() where user_id = p_user_id;
    return jsonb_build_object('settled', true, 'outcome', p_outcome, 'minutes_charged', 0,
      'refunded', v_reserved, 'balance', v_balance);
  end if;
end;
$$;

-- Read one user's balance for display. An expired cycle reads as zero
-- remaining (no rollover); the leftover is expired lazily by the next
-- reserve/grant. granted_in_cycle is the sum of grant rows in the current
-- cycle window (or all grants when the window is open-ended, i.e. Free).
create or replace function public.get_minutes_balance(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_balance integer := 0;
  v_cs timestamptz;
  v_ce timestamptz;
  v_granted integer := 0;
  v_free boolean := false;
  v_has_row boolean := false;
begin
  select balance_minutes, cycle_start, cycle_end into v_balance, v_cs, v_ce
  from public.minute_balances where user_id = p_user_id;
  v_has_row := found;
  select exists(select 1 from public.minute_ledger where idempotency_key = 'free-grant:' || p_user_id::text) into v_free;
  select coalesce(sum(minutes), 0) into v_granted
  from public.minute_ledger
  where user_id = p_user_id and kind = 'grant'
    and (v_cs is null or created_at >= v_cs);
  if v_ce is not null and v_ce <= now() then v_balance := 0; end if;
  return jsonb_build_object('balance', coalesce(v_balance, 0), 'cycle_start', v_cs, 'cycle_end', v_ce,
    'granted_in_cycle', v_granted, 'free_granted', v_free, 'has_row', v_has_row);
end;
$$;

-- Only the service role may execute the ledger functions. Authenticated
-- users cannot call them directly (and RLS with 0 policies already blocks
-- direct table access); every balance change goes through the server.
revoke all on function public.expire_stale_reservations(uuid) from public;
revoke all on function public.grant_cycle_minutes(uuid, integer, timestamptz, timestamptz, text) from public;
revoke all on function public.reserve_minutes(uuid, uuid, integer, text, uuid, text, integer) from public;
revoke all on function public.settle_reservation(uuid, uuid, text, integer) from public;
revoke all on function public.get_minutes_balance(uuid) from public;
grant execute on function public.expire_stale_reservations(uuid) to service_role;
grant execute on function public.grant_cycle_minutes(uuid, integer, timestamptz, timestamptz, text) to service_role;
grant execute on function public.reserve_minutes(uuid, uuid, integer, text, uuid, text, integer) to service_role;
grant execute on function public.settle_reservation(uuid, uuid, text, integer) to service_role;
grant execute on function public.get_minutes_balance(uuid) to service_role;

-- ---------- STEP 3: VERIFY (run last, keep the output) ----------
-- RLS is on for both tables:
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('minute_ledger', 'minute_balances');
--    expect: 2 rows, rls_enabled = true for both

-- No policies on either table (service-role-only by design):
select tablename, count(*) as policy_count
  from pg_policies
 where schemaname = 'public' and tablename in ('minute_ledger', 'minute_balances')
 group by tablename;
--    expect: 0 rows

-- Columns:
select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name in ('minute_ledger', 'minute_balances')
 order by table_name, ordinal_position;
--    expect: minute_ledger 10 columns (id, user_id, project_id, export_id,
--    reservation_key, kind, minutes, balance_after, idempotency_key,
--    created_at); minute_balances 5 columns (user_id, balance_minutes,
--    cycle_start, cycle_end, updated_at)

-- Unique idempotency key on the ledger:
select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'minute_ledger'
   and indexdef ilike '%idempotency_key%';
--    expect: 1 row (the unique index on idempotency_key)

-- Functions exist, service_role-only:
select routine_name as function_name, grantee as execute_role
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('grant_cycle_minutes', 'reserve_minutes', 'settle_reservation', 'get_minutes_balance', 'expire_stale_reservations')
   and privilege_type = 'EXECUTE'
 order by routine_name, grantee;
--    expect: 5 rows, one per function, grantee service_role on each

-- No rows were granted by the apply itself, and no project was touched:
select count(*) as minute_ledger_after from public.minute_ledger;
--    expect: 0
select count(*) as minute_balances_after from public.minute_balances;
--    expect: 0
select count(*) as existing_projects from public.projects;
--    expect: the same number as STEP 1
