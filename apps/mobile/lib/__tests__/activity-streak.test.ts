/**
 * The activity streak and the day's activity count (lib/activity-streak.ts),
 * which the dashboard reads from the last 60 days of activity dates.
 * Days are YYYY-MM-DD strings; activity timestamps are built from the phone's
 * own clock (new Date(y, m, d, h)) so every run reads the same local day.
 */
import { describe, expect, it } from "vitest";
import { activitiesOnDay, activityDays, activityStreak, localDayOf } from "../activity-streak";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe("activityStreak", () => {
  it("counts the run of days ending today", () => {
    expect(activityStreak(["2026-10-19", "2026-10-18", "2026-10-16"], "2026-10-19")).toBe(2);
  });

  it("still counts when the newest day is yesterday", () => {
    expect(activityStreak(["2026-10-18", "2026-10-17", "2026-10-16"], "2026-10-19")).toBe(3);
    expect(activityStreak(["2026-10-18"], "2026-10-19")).toBe(1);
  });

  it("is 0 when the newest day is the day before yesterday", () => {
    expect(activityStreak(["2026-10-17", "2026-10-16", "2026-10-15"], "2026-10-19")).toBe(0);
  });

  it("is 0 with no days", () => {
    expect(activityStreak([], "2026-10-19")).toBe(0);
  });

  it("ignores order and repeats", () => {
    expect(activityStreak(["2026-10-17", "2026-10-19", "2026-10-18", "2026-10-19", "2026-10-18"], "2026-10-19")).toBe(3);
  });

  it("runs across a month and a year", () => {
    expect(activityStreak(["2026-01-01", "2025-12-31", "2025-12-30", "2025-12-28"], "2026-01-01")).toBe(3);
    expect(activityStreak(["2026-03-01", "2026-02-28", "2026-02-27"], "2026-03-01")).toBe(3);
  });

  it("does not skip a day across the clocks changing", () => {
    // Atlantic DST ended 2026-11-01: that day is 25 hours long.
    expect(activityStreak(["2026-11-02", "2026-11-01", "2026-10-31"], "2026-11-02")).toBe(3);
  });
});

describe("localDayOf", () => {
  it("is the phone's calendar day of a timestamp, not the UTC date", () => {
    // 10 pm on the phone is already the next UTC day for any zone behind UTC.
    expect(localDayOf(at(2026, 10, 19, 22, 30))).toBe("2026-10-19");
    expect(localDayOf(at(2026, 10, 19, 0, 5))).toBe("2026-10-19");
  });

  it("is null for a value that is not a date", () => {
    expect(localDayOf("")).toBeNull();
    expect(localDayOf("not a date")).toBeNull();
  });
});

describe("activityDays", () => {
  it("lists each day once, newest first, and drops what is not a date", () => {
    const dates = [at(2026, 10, 17), at(2026, 10, 19, 9), at(2026, 10, 19, 22), "garbage", at(2026, 10, 18)];
    expect(activityDays(dates)).toEqual(["2026-10-19", "2026-10-18", "2026-10-17"]);
  });
});

describe("activitiesOnDay", () => {
  it("counts every activity on the phone's day, evenings included", () => {
    const dates = [
      at(2026, 10, 19, 8),
      at(2026, 10, 19, 13),
      at(2026, 10, 19, 22, 30), // the next UTC day
      at(2026, 10, 18, 22, 30),
      at(2026, 10, 20, 0, 10),
    ];
    expect(activitiesOnDay(dates, "2026-10-19")).toBe(3);
    expect(activitiesOnDay(dates, "2026-10-18")).toBe(1);
    expect(activitiesOnDay(dates, "2026-10-21")).toBe(0);
  });

  it("skips values that are not dates", () => {
    expect(activitiesOnDay(["", "nope", at(2026, 10, 19)], "2026-10-19")).toBe(1);
  });
});
