import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDaysISO,
  atlanticDayStart,
  atlanticHour,
  atlanticISODate,
  atlanticMonth,
  atlanticNoon,
  atlanticWallClock,
  atlanticYear,
  daysBetweenISO,
  localDaysSince,
  localISODate,
  nextYearlyDate,
} from "../local-date";

afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe("atlanticDayStart (bounds for a timestamptz filter on a calendar day)", () => {
  // Postgres reads a bare `2026-10-09T00:00:00` as UTC, which is 9 pm Atlantic
  // the evening before. A day's filter needs the instant the Atlantic day
  // begins, and the next day's start as the exclusive end.
  it("is 03:00 UTC in daylight time and 04:00 UTC in standard time", () => {
    expect(atlanticDayStart("2026-10-09").toISOString()).toBe("2026-10-09T03:00:00.000Z");
    expect(atlanticDayStart("2027-01-15").toISOString()).toBe("2027-01-15T04:00:00.000Z");
  });

  it("puts an evening activity inside its own Atlantic day", () => {
    const oct9at10pm = new Date("2026-10-10T01:00:00Z").getTime();
    expect(oct9at10pm).toBeGreaterThanOrEqual(atlanticDayStart("2026-10-09").getTime());
    expect(oct9at10pm).toBeLessThan(atlanticDayStart("2026-10-10").getTime());

    const dec31at10pm = new Date("2027-01-01T02:00:00Z").getTime();
    expect(dec31at10pm).toBeGreaterThanOrEqual(atlanticDayStart("2026-12-31").getTime());
    expect(dec31at10pm).toBeLessThan(atlanticDayStart("2027-01-01").getTime());
  });

  it("makes the spring-forward day 23 hours long and the fall-back day 25", () => {
    const hours = (day: string) =>
      (atlanticDayStart(addDaysISO(day, 1)).getTime() - atlanticDayStart(day).getTime()) / 3_600_000;
    // Clocks go forward at 2 am on Sun Mar 8 2026 and back at 2 am on Sun Nov 1 2026.
    expect(atlanticDayStart("2026-03-08").toISOString()).toBe("2026-03-08T04:00:00.000Z");
    expect(hours("2026-03-08")).toBe(23);
    expect(atlanticDayStart("2026-11-01").toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(hours("2026-11-01")).toBe(25);
    expect(hours("2026-10-09")).toBe(24);
  });

  it("round-trips with atlanticISODate for every day of two years", () => {
    for (let day = "2026-01-01"; day <= "2027-12-31"; day = addDaysISO(day, 1)) {
      const start = atlanticDayStart(day);
      expect(atlanticISODate(start), day).toBe(day);
      expect(atlanticISODate(new Date(start.getTime() - 1)), day).toBe(addDaysISO(day, -1));
    }
  });

  it("is an invalid date for anything that is not YYYY-MM-DD", () => {
    for (const bad of ["", "last week", "2026-10-09T12:00:00", "2026-13-01", "2026-02-30"]) {
      expect(Number.isNaN(atlanticDayStart(bad).getTime()), bad).toBe(true);
    }
  });
});

describe("nextYearlyDate (birthday countdowns on the user's own calendar)", () => {
  // The mobile offline briefing parsed a birthdate with `new Date("1990-10-09")`
  // (UTC midnight: the evening of Oct 8 in Atlantic time) and floored the
  // hours left until it. A birthday today came out at -1 and was dropped;
  // tomorrow's came out at 0 and read "Birthday today!".
  const oct9 = (hour: number, minute = 0) => new Date(2026, 9, 9, hour, minute);

  it("is 0 on the day itself, from just after midnight to late evening", () => {
    for (const today of [oct9(0, 5), oct9(12), oct9(22, 30)]) {
      expect(nextYearlyDate("1990-10-09", today)?.daysUntil, today.toString()).toBe(0);
    }
  });

  it("is 1 for tomorrow and 7 for a week out, at any hour", () => {
    for (const today of [oct9(0, 5), oct9(12), oct9(22, 30)]) {
      expect(nextYearlyDate("1990-10-10", today)?.daysUntil, today.toString()).toBe(1);
      expect(nextYearlyDate("1985-10-16", today)?.daysUntil, today.toString()).toBe(7);
    }
  });

  it("moves to next year once the day has passed", () => {
    const next = nextYearlyDate("1990-10-08", oct9(9));
    expect(next?.daysUntil).toBe(364);
    expect(next?.date.getFullYear()).toBe(2027);
  });

  it("counts across the year end", () => {
    const next = nextYearlyDate("1990-01-02", new Date(2026, 11, 30, 21));
    expect(next?.daysUntil).toBe(3);
    expect(localISODate(next!.date)).toBe("2027-01-02");
  });

  it("counts whole days across a clock change", () => {
    // Clocks go back on Sun Nov 1 2026 where DST is observed: 25 hours apart.
    expect(nextYearlyDate("1990-11-02", new Date(2026, 9, 31, 12))?.daysUntil).toBe(2);
    expect(nextYearlyDate("1990-03-09", new Date(2026, 2, 7, 12))?.daysUntil).toBe(2);
  });

  it("puts a Feb 29 birthday on Mar 1 in a common year", () => {
    const next = nextYearlyDate("1992-02-29", new Date(2027, 1, 20, 12));
    expect(localISODate(next!.date)).toBe("2027-03-01");
    expect(next?.daysUntil).toBe(9);
  });

  it("is null for a value that is not a date", () => {
    for (const bad of ["", "1990", "1990-13-01", "1990-00-10", "1990-05-00", "1990-05-40", "abc-de-fg"]) {
      expect(nextYearlyDate(bad, oct9(12)), bad).toBeNull();
    }
  });

  it("the date is local noon on the day", () => {
    const next = nextYearlyDate("1990-10-10", oct9(22, 30));
    expect(localISODate(next!.date)).toBe("2026-10-10");
    expect(next?.date.getHours()).toBe(12);
  });
});

describe("daysBetweenISO", () => {
  it("is 0 for the same day, positive forward, negative back", () => {
    expect(daysBetweenISO("2026-10-13", "2026-10-13")).toBe(0);
    expect(daysBetweenISO("2026-10-12", "2026-10-13")).toBe(1);
    expect(daysBetweenISO("2026-10-13", "2026-10-12")).toBe(-1);
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(daysBetweenISO("2026-09-29", "2026-10-13")).toBe(14);
    expect(daysBetweenISO("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetweenISO("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("is unaffected by DST transitions", () => {
    // Atlantic DST ends 2026-11-01 and starts 2027-03-14.
    expect(daysBetweenISO("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetweenISO("2027-03-13", "2027-03-15")).toBe(2);
    expect(daysBetweenISO("2026-10-20", "2026-12-15")).toBe(56);
  });

  it("is the inverse of addDaysISO", () => {
    for (const n of [-400, -1, 0, 1, 45, 366]) {
      expect(daysBetweenISO("2026-10-13", addDaysISO("2026-10-13", n))).toBe(n);
    }
  });
});

describe("localDaysSince (what \"Today / Yesterday / 3 days ago\" counts)", () => {
  // `Math.floor((now - then) / 86_400_000)` counts elapsed 24-hour blocks: a
  // call logged at 10 pm read "Today" at 9 the next morning (11 hours), and
  // one logged at 9 am read "Yesterday" only from 9 am the following day.
  const halifax = () => {
    vi.stubEnv("TZ", "America/Halifax");
    expect(new Date("2026-10-13T12:00:00Z").getTimezoneOffset()).toBe(180); // guard: the stub took
  };

  it("is 1 the morning after a late-evening call, 11 hours on", () => {
    halifax();
    const logged = "2026-10-13T01:00:00Z"; // Mon Oct 12, 22:00 ADT
    const now = new Date("2026-10-13T12:00:00Z"); // Tue Oct 13, 09:00 ADT
    expect(localDaysSince(logged, now)).toBe(1);
  });

  it("is 1 for a 9 am call at 8 the next morning, 23 hours on", () => {
    halifax();
    expect(localDaysSince("2026-10-12T12:00:00Z", new Date("2026-10-13T11:00:00Z"))).toBe(1);
  });

  it("is 2 across two midnights, 26 hours on", () => {
    halifax();
    const logged = "2026-10-12T02:00:00Z"; // Sun Oct 11, 23:00 ADT
    const now = new Date("2026-10-13T04:00:00Z"); // Tue Oct 13, 01:00 ADT
    expect(localDaysSince(logged, now)).toBe(2);
  });

  it("is 0 from just after midnight to just before the next one", () => {
    halifax();
    const logged = "2026-10-13T03:05:00Z"; // Tue Oct 13, 00:05 ADT
    expect(localDaysSince(logged, new Date("2026-10-14T02:55:00Z"))).toBe(0); // 23:55 ADT
    expect(localDaysSince(logged, new Date("2026-10-14T03:05:00Z"))).toBe(1); // Wed 00:05 ADT
  });

  it("reads a date-only value as its own day, not as UTC midnight", () => {
    halifax();
    // new Date("2026-10-09") is Oct 8, 21:00 ADT.
    expect(localDaysSince("2026-10-09", new Date("2026-10-09T12:00:00Z"))).toBe(0); // Oct 9, 09:00
    expect(localDaysSince("2026-10-09", new Date("2026-10-10T00:30:00Z"))).toBe(0); // Oct 9, 21:30
    expect(localDaysSince("2026-10-09", new Date("2026-10-10T12:00:00Z"))).toBe(1);
  });

  it("is negative for a day still to come", () => {
    halifax();
    const now = new Date("2026-10-13T18:00:00Z"); // Tue Oct 13, 15:00 ADT
    expect(localDaysSince("2026-10-14", now)).toBe(-1);
    expect(localDaysSince("2026-10-15T12:00:00Z", now)).toBe(-2);
  });

  it("counts whole days across a clock change", () => {
    halifax();
    const logged = "2026-10-31T15:00:00Z"; // Sat Oct 31, 12:00 ADT
    const now = new Date("2026-11-02T04:30:00Z"); // Mon Nov 2, 00:30 AST
    expect(now.getTimezoneOffset()).toBe(240);
    expect(localDaysSince(logged, now)).toBe(2);
  });

  it("takes a Date as well as a string", () => {
    halifax();
    expect(localDaysSince(new Date("2026-10-13T01:00:00Z"), new Date("2026-10-13T12:00:00Z"))).toBe(1);
  });

  it("uses whatever zone the device is in", () => {
    const logged = "2026-10-13T05:00:00Z";
    const now = new Date("2026-10-13T16:00:00Z");
    vi.stubEnv("TZ", "America/Vancouver"); // Oct 12, 22:00 PDT -> Oct 13, 09:00 PDT
    expect(localDaysSince(logged, now)).toBe(1);
    vi.stubEnv("TZ", "America/Halifax"); // Oct 13, 02:00 ADT -> Oct 13, 13:00 ADT
    expect(localDaysSince(logged, now)).toBe(0);
  });

  it("is null for a missing or unreadable value", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    for (const bad of [null, undefined, "", "not a date", "2026-13-45T00:00:00Z"]) {
      expect(localDaysSince(bad, now), String(bad)).toBeNull();
    }
    expect(localDaysSince(new Date(NaN), now)).toBeNull();
  });
});

describe("atlanticHour", () => {
  it("reads the Halifax wall clock", () => {
    expect(atlanticHour(new Date("2026-10-19T15:30:00Z"))).toBe(12); // ADT, UTC-3
    expect(atlanticHour(new Date("2026-11-02T15:30:00Z"))).toBe(11); // AST, UTC-4
  });

  it("is 0-23, with midnight 0 and the last hour 23", () => {
    expect(atlanticHour(new Date("2026-10-19T03:00:00Z"))).toBe(0); // 00:00 ADT
    expect(atlanticHour(new Date("2026-10-19T02:59:00Z"))).toBe(23); // 23:59 ADT the day before
    expect(atlanticHour(new Date("2026-11-02T04:00:00Z"))).toBe(0); // 00:00 AST
  });

  it("reads the Atlantic hour whatever zone the server runs in", () => {
    vi.stubEnv("TZ", "America/Vancouver");
    expect(atlanticHour(new Date("2026-10-19T22:00:00Z"))).toBe(19); // 15:00 PDT is 19:00 ADT
    vi.stubEnv("TZ", "UTC");
    expect(atlanticHour(new Date("2026-10-19T22:00:00Z"))).toBe(19);
  });

  it("marks the band edges: 12:00 and 17:00 sharp", () => {
    expect(atlanticHour(new Date("2026-10-19T15:00:00Z"))).toBe(12); // 12:00 ADT
    expect(atlanticHour(new Date("2026-10-19T14:59:59Z"))).toBe(11);
    expect(atlanticHour(new Date("2026-10-19T20:00:00Z"))).toBe(17); // 17:00 ADT
    expect(atlanticHour(new Date("2026-10-19T19:59:59Z"))).toBe(16);
  });
});
