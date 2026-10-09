import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  atlanticISODate,
  atlanticMonth,
  atlanticNoon,
  atlanticWallClock,
  atlanticYear,
  localISODate,
} from "../local-date";

// Pinned instants. Vercel and Supabase Edge run in UTC, where all three of
// these already read as the next day / month / year.
const DEC31_10PM_AST = new Date("2027-01-01T02:00:00Z"); // Thu Dec 31 2026, 22:00 AST (UTC-4)
const SEP30_1030PM_ADT = new Date("2026-10-01T01:30:00Z"); // Wed Sep 30 2026, 22:30 ADT (UTC-3)
const OCT9_9PM_ADT = new Date("2026-10-10T00:00:00Z"); // Fri Oct 9 2026, 21:00 ADT

describe("atlanticISODate", () => {
  it("is still today in Atlantic time after 8 pm, when UTC has rolled over (ADT, UTC-3)", () => {
    // 2026-10-09 21:30 ADT
    expect(atlanticISODate(new Date("2026-10-10T00:30:00Z"))).toBe("2026-10-09");
    // 2026-10-09 23:59 ADT
    expect(atlanticISODate(new Date("2026-10-10T02:59:00Z"))).toBe("2026-10-09");
    // 2026-10-10 00:00 ADT
    expect(atlanticISODate(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-10");
  });

  it("follows standard time in winter (AST, UTC-4), including the year boundary", () => {
    expect(atlanticISODate(new Date("2027-01-01T03:59:00Z"))).toBe("2026-12-31");
    expect(atlanticISODate(new Date("2027-01-01T04:00:00Z"))).toBe("2027-01-01");
  });

  it("matches the UTC day during the Atlantic daytime", () => {
    expect(atlanticISODate(new Date("2026-07-19T12:00:00Z"))).toBe("2026-07-19");
  });
});

describe("localISODate", () => {
  it("agrees with the local getters on the same Date, whatever the host zone", () => {
    for (const iso of ["2026-10-10T00:30:00Z", "2027-01-01T03:59:00Z", "2026-03-08T06:30:00Z"]) {
      const d = new Date(iso);
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      expect(localISODate(d)).toBe(expected);
    }
  });

  it("round-trips a noon-anchored date-only value", () => {
    expect(localISODate(new Date("2026-03-01T12:00:00"))).toBe("2026-03-01");
  });
});

describe("addDaysISO", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDaysISO("2026-10-09", 14)).toBe("2026-10-23");
    expect(addDaysISO("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDaysISO("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysISO("2026-01-05", -14)).toBe("2025-12-22");
  });

  it("is unaffected by DST transitions", () => {
    // Atlantic DST ends 2026-11-01 and starts 2027-03-14.
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysISO("2027-03-13", 1)).toBe("2027-03-14");
  });
});

describe("atlanticYear / atlanticMonth (the server's \"this year / this month\")", () => {
  it("is still Dec 31 of this year from 8 pm Atlantic, when UTC is already next year", () => {
    expect(atlanticYear(DEC31_10PM_AST)).toBe(2026);
    expect(atlanticMonth(DEC31_10PM_AST)).toBe(11);
    expect(atlanticYear(new Date("2027-01-01T03:59:59Z"))).toBe(2026);
    expect(atlanticYear(new Date("2027-01-01T04:00:00Z"))).toBe(2027);
    expect(atlanticMonth(new Date("2027-01-01T04:00:00Z"))).toBe(0);
  });

  it("is still last month on a month-end evening (ADT, UTC-3)", () => {
    expect(atlanticMonth(SEP30_1030PM_ADT)).toBe(8); // September, 0-based
    expect(atlanticMonth(new Date("2026-10-01T03:00:00Z"))).toBe(9);
  });
});

describe("atlanticNoon (calendar anchor for engines that read local getters)", () => {
  it("reads the Atlantic day through local getters, whatever the host zone", () => {
    const d = atlanticNoon(DEC31_10PM_AST);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getDay()]).toEqual([2026, 11, 31, 4]); // Thursday
    expect(d.getHours()).toBe(12);
    expect(localISODate(d)).toBe("2026-12-31");
  });

  it("agrees with atlanticISODate across a sweep of evening and DST instants", () => {
    for (const iso of [
      "2026-10-10T00:00:00Z", "2026-10-10T02:59:00Z", "2026-10-10T03:00:00Z",
      "2026-11-01T05:30:00Z", "2027-03-14T06:30:00Z", "2026-07-19T12:00:00Z",
    ]) {
      const d = new Date(iso);
      expect(localISODate(atlanticNoon(d))).toBe(atlanticISODate(d));
    }
  });
});

describe("atlanticWallClock", () => {
  it("carries the Atlantic wall clock in its UTC fields (standard time)", () => {
    expect(atlanticWallClock(DEC31_10PM_AST).toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });

  it("follows daylight time and keeps milliseconds", () => {
    expect(atlanticWallClock(new Date("2026-10-10T00:00:00.250Z")).toISOString()).toBe("2026-10-09T21:00:00.250Z");
    expect(atlanticWallClock(OCT9_9PM_ADT).getUTCDate()).toBe(9);
  });

  it("reads midnight as hour 0, not 24", () => {
    expect(atlanticWallClock(new Date("2027-01-01T04:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
