-- =====================================================================
-- APPLY-FIX-PROJECT-EXPIRY.sql
-- Paste into the Supabase SQL Editor for project nwqmmvqobjxguvfxeafs
-- (Open Caption, second account) and run STEP 1, then STEP 2, then STEP 3.
--
-- What this does: stops the pg_cron job 'capseasy-expire-projects' from
-- deleting EVERY project 24h after creation. After the fix, registered
-- users' projects never expire; only anonymous-guest projects untouched
-- for 30+ days can be removed (daily backstop). Full rationale lives in
-- supabase/migrations/20261110000000_project_persistence.sql.
-- =====================================================================

-- ---------- STEP 1: BEFORE state (run first, keep the output) ----------
select jobname, schedule, command from cron.job where jobname = 'capseasy-expire-projects';

-- How many projects the OLD rule (any owner, created > 24h ago) would delete:
select count(*) as old_rule_would_delete
  from projects where created_at < now() - interval '24 hours';

-- How many of those belong to REGISTERED (non-anonymous) users — the landmine:
select count(*) as registered_projects_at_risk
  from projects p join auth.users u on u.id = p.owner_id
 where coalesce(u.is_anonymous, false) = false
   and p.created_at < now() - interval '24 hours';

-- ---------- STEP 2: THE FIX (identical to the migration file) ----------
create or replace function public.delete_expired_projects(p_hours int default 720, p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare n int; floor_hours int := greatest(coalesce(p_hours, 720), 720);
begin
  with gone as (
    select p.id
      from projects p
      join auth.users u on u.id = p.owner_id
     where coalesce(u.is_anonymous, false) = true
       and p.created_at < now() - make_interval(hours => floor_hours)
       and p.updated_at < now() - make_interval(hours => floor_hours)
     order by p.created_at
     limit p_limit
  ), del as (
    delete from projects where id in (select id from gone) returning 1
  )
  select count(*) into n from del;
  return n;
end $$;
revoke all on function public.delete_expired_projects(int, int) from public, anon, authenticated;

select cron.unschedule('capseasy-expire-projects')
 where exists (select 1 from cron.job where jobname = 'capseasy-expire-projects');

select cron.schedule('capseasy-expire-projects', '15 3 * * *', $$select public.delete_expired_projects(720, 500)$$);

-- ---------- STEP 3: AFTER verification (all must hold) ----------
-- 1) Job exists exactly once, daily schedule, new arguments:
select jobname, schedule, command from cron.job where jobname = 'capseasy-expire-projects';
--    expect: schedule = '15 3 * * *', command contains delete_expired_projects(720, 500)

-- 2) Function body carries the guest-only predicate and the 720h floor:
select prosrc from pg_proc where proname = 'delete_expired_projects';
--    expect: contains 'is_anonymous' and '720'

-- 3) Safety probe — projects the NEW rule can delete right now
--    (anonymous-owned AND untouched for 30+ days). Registered-owned must be 0
--    by construction; this count should be 0 or a small guest-only number:
select count(*) as new_rule_can_delete
  from projects p join auth.users u on u.id = p.owner_id
 where coalesce(u.is_anonymous, false) = true
   and p.created_at < now() - interval '720 hours'
   and p.updated_at < now() - interval '720 hours';

-- 4) Dry behaviour check: calling with the OLD arguments must still be safe
--    (the internal floor clamps 24 -> 720). On a fresh database this deletes 0.
--    Only run if step 3 returned 0:
-- select public.delete_expired_projects(24, 500);
