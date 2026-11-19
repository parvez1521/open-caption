-- ============================================================================
-- DRAFT — DO NOT APPLY without owner approval. Master A-Z audit 2026-11-19.
-- Fixes MA-A7-006: rate_limits rows are never reaped (one row per
-- (key, window) forever). Purge windows older than 7 days; wire the
-- function into the daily cleanup (app change) or a pg_cron job
-- (owner decision — not scheduled here).
--
-- VALIDATION (run first, read-only):
--   select count(*) from public.rate_limits;
--   select min(to_timestamp(window_start)) as oldest_window from public.rate_limits;
-- ROLLBACK: rows deleted here cannot be restored; the table is a cache
-- (losing old windows only resets stale counters). No schema rollback
-- needed — drop the function to revert:
--   drop function if exists public.purge_old_rate_limits(int);
-- ============================================================================

create or replace function public.purge_old_rate_limits(p_days int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.rate_limits
   where to_timestamp(window_start) < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_old_rate_limits(int) from public, anon, authenticated;

-- One-time purge of everything older than 7 days.
select public.purge_old_rate_limits(7);
