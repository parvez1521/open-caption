-- Project persistence fix (2026-11-10, Phase 2 of the Creator Studio programme).
--
-- BEFORE: migration 20261004120000_expire_projects_24h.sql deleted EVERY project
-- (any owner, registered or guest) 24 hours after creation, hourly via the
-- pg_cron job 'capseasy-expire-projects'. That made any saved-library /
-- workspace promise impossible: a signed-up user's work vanished after a day.
--
-- AFTER (this migration):
--   * Registered (non-anonymous) users' projects NEVER expire.
--   * Anonymous-guest projects are the only ones eligible, and only when BOTH
--     created_at and updated_at are older than a generous 30-day window
--     (i.e. created long ago and never opened/edited since). A hard floor is
--     enforced inside the function: no caller can shrink the window below
--     720 hours, so the old (24, 500) call shape can never come back.
--   * Guest-account cleanup proper (deleting the stale guest user and all
--     their rows after 7 days away) remains the job of the app-level Vercel
--     cron /api/cron/cleanup, which is already guest-scoped. This DB job is
--     now just a backstop for orphaned guest projects.
--   * The cron job is rescheduled from hourly to daily.

-- Replace the function body with the safe predicate. Signature is kept so any
-- existing caller keeps working; p_hours is clamped to >= 720 inside.
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

-- Reschedule: drop the old hourly job, run the safe version daily.
select cron.unschedule('capseasy-expire-projects')
 where exists (select 1 from cron.job where jobname = 'capseasy-expire-projects');

select cron.schedule('capseasy-expire-projects', '15 3 * * *', $$select public.delete_expired_projects(720, 500)$$);
