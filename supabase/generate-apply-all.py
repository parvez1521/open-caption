#!/usr/bin/env python3
"""Regenerate supabase/APPLY-ALL-SCHEMA.sql from supabase/migrations/.

MA-A7-003: the bundle was stale (7 of 18 migrations) and not re-runnable
(bare `create policy`, one bare `add constraint`, one bare `cron.schedule`
all fail on a second run). This script concatenates the migrations in
timestamp order and applies the guards that make the bundle re-runnable:

  * every `create policy X on T` gets a preceding
    `drop policy if exists X on T;` (unless the migration already drops it)
  * `alter table public.workers add constraint workers_current_job_fk ...`
    becomes a DO block guarded on pg_constraint
  * the bare `select cron.schedule('capseasy-expire-projects', ...)` in
    20261004120000 becomes a DO block guarded on cron.job (outer block uses
    $guard$ quoting because the scheduled command itself uses $$...$$)

Everything else in the migrations is already idempotent (create table /
index / column `if not exists`, `create or replace function`, `drop ...
if exists` first, guarded enum/trigger/cron in the base schema, `on conflict
do nothing` inserts).

Usage:  python3 supabase/generate-apply-all.py
        (run from the repo root; deterministic output, no timestamps)
CI:     .github/workflows/ci.yml regenerates and fails on any diff, so the
        bundle can never go stale again.

The output is a bootstrap for a FRESH project (paste into the Supabase SQL
Editor). It is never applied to the live database by this repo.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
OUTPUT = ROOT / "supabase" / "APPLY-ALL-SCHEMA.sql"

HEADER = """-- OPEN CAPTION — full schema apply bundle (run in Supabase SQL Editor, in order)
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   python3 supabase/generate-apply-all.py
-- (run from the repo root). The bundle concatenates supabase/migrations/ in
-- timestamp order with re-run guards applied (see the generator). It is a
-- bootstrap for a FRESH project and is re-runnable against a database that
-- already has the schema: policies are dropped first, the one bare
-- add-constraint and the one bare cron.schedule are guarded.
"""

# -- transforms ---------------------------------------------------------------

POLICY_RE = re.compile(r"^create policy\s+(\S+)\s+on\s+(\S+)", re.IGNORECASE)
DROP_RE = re.compile(r"^drop policy if exists\s+(\S+)\s+on\s+(\S+)", re.IGNORECASE)

CONSTRAINT_RE = re.compile(
    r"alter table public\.workers\n"
    r"  add constraint workers_current_job_fk\n"
    r"  foreign key \(current_job_id\) references public\.jobs \(id\) on delete set null;",
    re.IGNORECASE,
)
CONSTRAINT_GUARDED = """do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workers_current_job_fk') then
    alter table public.workers
      add constraint workers_current_job_fk
      foreign key (current_job_id) references public.jobs (id) on delete set null;
  end if;
end $$;"""

CRON_RE = re.compile(
    r"select cron\.schedule\('capseasy-expire-projects', '5 \* \* \* \*', "
    r"\$\$select public\.delete_expired_projects\(24, 500\)\$\$\);",
    re.IGNORECASE,
)
CRON_GUARDED = """do $guard$ begin
  if not exists (select 1 from cron.job where jobname = 'capseasy-expire-projects') then
    perform cron.schedule('capseasy-expire-projects', '5 * * * *', $$select public.delete_expired_projects(24, 500)$$);
  end if;
end $guard$;"""


def is_blank_or_comment(line: str) -> bool:
    stripped = line.strip()
    return stripped == "" or stripped.startswith("--")


def _same_policy(a_name: str, a_table: str, b_name: str, b_table: str) -> bool:
    # the drop line ends in ';' (drop policy ... on public.t;), the create
    # line does not — compare with the semicolon stripped.
    return a_name.lower() == b_name.lower() and a_table.rstrip(";").lower() == b_table.rstrip(";").lower()


def guard_policies(text: str) -> tuple[str, int]:
    """Prepend `drop policy if exists` before bare `create policy` lines."""
    lines = text.split("\n")
    out: list[str] = []
    added = 0
    for line in lines:
        m = POLICY_RE.match(line.strip())
        if m:
            name, table = m.group(1), m.group(2)
            # already guarded if the previous statement is the matching drop
            guarded = False
            for prev in reversed(out):
                if is_blank_or_comment(prev):
                    continue
                dm = DROP_RE.match(prev.strip())
                if dm and _same_policy(dm.group(1), dm.group(2), name, table):
                    guarded = True
                break
            if not guarded:
                out.append(f"drop policy if exists {name} on {table};")
                added += 1
        out.append(line)
    return "\n".join(out), added


def transform(name: str, text: str, stats: dict[str, int]) -> str:
    text, n = guard_policies(text)
    stats["policies_guarded"] += n

    text, n = CONSTRAINT_RE.subn(CONSTRAINT_GUARDED, text)
    if n:
        stats["constraints_guarded"] += n
        if n != 1:
            raise SystemExit(f"{name}: expected 1 workers_current_job_fk, found {n}")

    text, n = CRON_RE.subn(CRON_GUARDED, text)
    if n:
        stats["crons_guarded"] += n
        if n != 1:
            raise SystemExit(f"{name}: expected 1 bare capseasy-expire-projects schedule, found {n}")
    return text


def verify(output: str, migration_count: int) -> None:
    """Fail loudly if any known non-idempotent statement survived."""
    problems: list[str] = []
    lines = output.split("\n")
    for i, line in enumerate(lines):
        m = POLICY_RE.match(line.strip())
        if m:
            name, table = m.group(1), m.group(2)
            guarded = False
            for prev in reversed(lines[:i]):
                if is_blank_or_comment(prev):
                    continue
                dm = DROP_RE.match(prev.strip())
                if dm and _same_policy(dm.group(1), dm.group(2), name, table):
                    guarded = True
                break
            if not guarded:
                problems.append(f"line {i + 1}: unguarded create policy {name}")
        if re.match(r"^\s*alter table\s+\S+\s+add constraint\b", line, re.IGNORECASE):
            problems.append(f"line {i + 1}: bare add constraint: {line.strip()[:80]}")
        cm = re.match(r"^\s*select cron\.schedule\('([^']+)'", line, re.IGNORECASE)
        if cm:
            # a reschedule is safe when the same job was just unscheduled
            # (project_persistence does exactly that); a lone schedule is not.
            jobname = cm.group(1)
            rescheduled = any(
                re.search(rf"cron\.unschedule\('{re.escape(jobname)}'\)", prev, re.IGNORECASE)
                for prev in lines[max(0, i - 10) : i]
            )
            if not rescheduled:
                problems.append(f"line {i + 1}: bare cron.schedule: {line.strip()[:80]}")
    markers = len(re.findall(r"^-- FILE: ", output, re.MULTILINE))
    if markers != migration_count:
        problems.append(f"expected {migration_count} FILE markers, found {markers}")
    if problems:
        print("generate-apply-all: NOT re-runnable:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migrations:
        raise SystemExit(f"no migrations found in {MIGRATIONS_DIR}")
    stats = {"policies_guarded": 0, "constraints_guarded": 0, "crons_guarded": 0}
    parts = [HEADER]
    for path in migrations:
        text = path.read_text()
        text = transform(path.name, text, stats)
        parts.append(
            "-- ============================================================\n"
            f"-- FILE: app/supabase/migrations/{path.name}\n"
            "-- ============================================================\n"
            + text.rstrip("\n")
            + "\n"
        )
    output = "\n".join(parts)
    verify(output, len(migrations))
    OUTPUT.write_text(output)
    print(
        f"generate-apply-all: {len(migrations)} migrations -> {OUTPUT.relative_to(ROOT)} "
        f"({len(output.splitlines())} lines; policies guarded: {stats['policies_guarded']}, "
        f"constraints guarded: {stats['constraints_guarded']}, crons guarded: {stats['crons_guarded']})"
    )


if __name__ == "__main__":
    main()
