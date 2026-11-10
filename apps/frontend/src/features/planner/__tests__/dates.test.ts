import { describe, expect, it } from "vitest";
import {
  WEEK_STARTS_ON_MONDAY,
  addDays,
  daysInMonth,
  formatLocalDate,
  monthGrid,
  monthLabel,
  parseLocalDate,
  shiftMonth,
  todayLocal,
  weekDates,
} from "../dates";

describe("week convention", () => {
  it("states that weeks start on Monday", () => {
    expect(WEEK_STARTS_ON_MONDAY).toBe(true);
  });
});

describe("formatLocalDate / parseLocalDate / todayLocal", () => {
  it("formats with zero padding", () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatLocalDate(new Date(2026, 10, 30))).toBe("2026-11-30");
  });
  it("parses a well-formed date and round-trips", () => {
    const d = parseLocalDate("2026-11-10");
    expect(d).not.toBeNull();
    expect(formatLocalDate(d!)).toBe("2026-11-10");
  });
  it("rejects the impossible date 2026-02-30", () => {
    expect(parseLocalDate("2026-02-30")).toBeNull();
  });
  it("rejects garbage and non-strict shapes", () => {
    expect(parseLocalDate("garbage")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate("2026-2-3")).toBeNull();
    expect(parseLocalDate("10/11/2026")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate("2026-00-10")).toBeNull();
  });
  it("todayLocal formats the given moment as a local date", () => {
    expect(todayLocal(new Date(2026, 10, 10, 23, 59))).toBe("2026-11-10");
  });
});

describe("addDays", () => {
  it("crosses a year boundary forwards and backwards", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
  it("crosses a month boundary and handles leap February", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-11-10", 0)).toBe("2026-11-10");
  });
});

describe("daysInMonth", () => {
  it("knows month lengths, including leap-year February", () => {
    expect(daysInMonth(2026, 10)).toBe(30); // November
    expect(daysInMonth(2026, 11)).toBe(31); // December
    expect(daysInMonth(2028, 1)).toBe(29); // February, leap year
    expect(daysInMonth(2026, 1)).toBe(28); // February, non-leap
  });
});

describe("monthGrid", () => {
  it("returns exactly 42 dates starting on the Monday on or before the 1st (November 2026 starts on a Sunday)", () => {
    const grid = monthGrid(2026, 10);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26"); // Monday before Sunday 1 Nov 2026
    for (let day = 1; day <= 30; day++) {
      expect(grid).toContain(`2026-11-${String(day).padStart(2, "0")}`);
    }
    // Consecutive entries are consecutive days.
    expect(grid[1]).toBe("2026-10-27");
    expect(grid[41]).toBe(addDays(grid[0]!, 41));
  });
  it("covers leap-year February 2028 including the 29th", () => {
    const grid = monthGrid(2028, 1);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2028-01-31"); // Monday before Tuesday 1 Feb 2028
    expect(grid).toContain("2028-02-29");
    for (let day = 1; day <= 29; day++) {
      expect(grid).toContain(`2028-02-${String(day).padStart(2, "0")}`);
    }
  });
  it("starts on the 1st itself when the 1st is a Monday", () => {
    // 1 Feb 2027 is a Monday.
    expect(monthGrid(2027, 1)[0]).toBe("2027-02-01");
  });
});

describe("weekDates", () => {
  it("returns the Mon..Sun week ending on a Sunday input", () => {
    expect(weekDates("2026-11-01")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });
  it("returns the same week for the Monday of that week", () => {
    expect(weekDates("2026-10-26")).toEqual(weekDates("2026-11-01"));
  });
  it("returns [] for a malformed date", () => {
    expect(weekDates("nope")).toEqual([]);
  });
});

describe("shiftMonth", () => {
  it("shifts December into January of the next year", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });
  it("shifts January back into December of the previous year", () => {
    expect(shiftMonth(2027, 0, -1)).toEqual({ year: 2026, month: 11 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
  it("shifts within a year and by more than a year", () => {
    expect(shiftMonth(2026, 10, 1)).toEqual({ year: 2026, month: 11 });
    expect(shiftMonth(2026, 10, 14)).toEqual({ year: 2028, month: 0 });
  });
});

describe("monthLabel", () => {
  it("formats 'Month YYYY'", () => {
    expect(monthLabel(2026, 10)).toBe("November 2026");
    expect(monthLabel(2027, 0)).toBe("January 2027");
  });
});
