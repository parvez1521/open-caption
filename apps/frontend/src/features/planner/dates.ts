/**
 * Content Planner — local-date helpers (Phase 7), pure.
 *
 * All planner dates are local "YYYY-MM-DD" strings. Because the format is
 * zero-padded and ordered year → month → day, YYYY-MM-DD strings sort
 * lexicographically in chronological order — plain string comparison
 * (`<`, `>`, `===`) is a valid date comparison wherever both sides are
 * well-formed planner dates, and the model code relies on that.
 *
 * Week convention: weeks start on Monday. This matches the Phase-6
 * weekly-plan shape (features/growth/plan.ts), whose `weekStart` is a
 * Monday and whose days run Mon..Sun.
 */

/** Weeks start on Monday (see the module comment). */
export const WEEK_STARTS_ON_MONDAY = true;

const pad2 = (n: number): string => String(n).padStart(2, "0");

export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Strict parser: rejects malformed strings and impossible dates such as 2026-02-30. */
export function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (
    d.getFullYear() !== Number(m[1]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[3])
  ) {
    return null;
  }
  return d;
}

export function todayLocal(now: Date): string {
  return formatLocalDate(now);
}

export function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

export function daysInMonth(year: number, month0: number): number {
  // Day 0 of the next month is the last day of this month.
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * Exactly 42 dates (6 weeks × 7) covering the given month, starting on the
 * Monday on or before the 1st. Leading/trailing entries belong to the
 * neighbouring months so the grid is always a full rectangle.
 */
export function monthGrid(year: number, month0: number): string[] {
  const first = new Date(year, month0, 1);
  const day = first.getDay(); // 0 Sun .. 6 Sat
  const daysBackToMonday = (day + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - daysBackToMonday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatLocalDate(d);
  });
}

/** The 7 dates Mon..Sun of the week containing `dateStr`. */
export function weekDates(dateStr: string): string[] {
  const d = parseLocalDate(dateStr);
  if (!d) return [];
  const daysBackToMonday = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysBackToMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    return formatLocalDate(cur);
  });
}

export function shiftMonth(year: number, month0: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month0 + delta;
  const newYear = Math.floor(total / 12);
  return { year: newYear, month: total - newYear * 12 };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthLabel(year: number, month0: number): string {
  return `${MONTH_NAMES[month0] ?? ""} ${year}`;
}
