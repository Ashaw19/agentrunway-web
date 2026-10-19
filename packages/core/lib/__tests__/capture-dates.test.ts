/**
 * Spoken dates resolve on the Atlantic calendar day passed in (capture/dates.ts).
 * Sunday 2026-10-18 and Thursday 2026-10-22 anchor most cases.
 */
import { describe, expect, it } from "vitest";
import { isIsoDay, pickDate, resolveSpokenDate, shortDayLabel, weekdayOf } from "../capture/dates";

const SUN = "2026-10-18";
const MON = "2026-10-19";
const THU = "2026-10-22";

const ahead = (s: string, today = SUN) => resolveSpokenDate(s, today, "future");
const back = (s: string, today = SUN) => resolveSpokenDate(s, today, "past");

describe("resolveSpokenDate", () => {
  it("anchors the fixtures on the right weekdays", () => {
    expect(weekdayOf(SUN)).toBe(0);
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(THU)).toBe(4);
  });

  it("reads today, tomorrow and yesterday", () => {
    expect(ahead("today")).toBe(SUN);
    expect(ahead("this morning")).toBe(SUN);
    expect(back("tonight")).toBe(SUN);
    expect(ahead("Tomorrow morning")).toBe("2026-10-19");
    expect(back("yesterday")).toBe("2026-10-17");
    expect(back("last night")).toBe("2026-10-17");
    expect(ahead("the day after tomorrow")).toBe("2026-10-20");
  });

  it("a weekday ahead is the next one, never today", () => {
    expect(ahead("Thursday")).toBe("2026-10-22");
    expect(ahead("on Thursday")).toBe("2026-10-22");
    expect(ahead("thurs")).toBe("2026-10-22");
    expect(ahead("Thursday", THU)).toBe("2026-10-29");
    expect(ahead("Friday", THU)).toBe("2026-10-23");
    expect(ahead("Monday at 3pm", THU)).toBe("2026-10-26");
  });

  it("a weekday looking back is the last one", () => {
    expect(back("Thursday")).toBe("2026-10-15");
    expect(back("last Thursday", THU)).toBe("2026-10-15");
    expect(back("Wednesday", THU)).toBe("2026-10-21");
    expect(back("Thursday", THU)).toBe("2026-10-15");
  });

  it("next <weekday> is in next week, Monday to Sunday", () => {
    // Said on Monday: this week's Thursday is the 22nd, next week's the 29th.
    expect(ahead("next Thursday", MON)).toBe("2026-10-29");
    expect(ahead("this Thursday", MON)).toBe("2026-10-22");
    // Said on Sunday the 18th, the last day of its week: next week is the 19th to the 25th.
    expect(ahead("next Thursday", SUN)).toBe("2026-10-22");
    // "this Thursday" once it has passed is the coming one.
    expect(ahead("this Monday", THU)).toBe("2026-10-26");
  });

  it("reads week and month phrases", () => {
    expect(ahead("next week", THU)).toBe("2026-10-26");
    expect(ahead("next week", SUN)).toBe("2026-10-19");
    expect(ahead("end of the week", THU)).toBe("2026-10-23");
    expect(ahead("end of week", SUN)).toBe("2026-10-23");
    expect(ahead("this weekend", THU)).toBe("2026-10-24");
    expect(ahead("end of the month", THU)).toBe("2026-10-31");
    expect(ahead("next month", "2026-01-31")).toBe("2026-02-28");
  });

  it("reads counts of days and weeks", () => {
    expect(ahead("in 3 days")).toBe("2026-10-21");
    expect(ahead("in two weeks")).toBe("2026-11-01");
    expect(ahead("a week from today")).toBe("2026-10-25");
    expect(ahead("in a week")).toBe("2026-10-25");
    expect(back("2 days ago")).toBe("2026-10-16");
  });

  it("reads month and day in the direction's year", () => {
    expect(ahead("October 24th")).toBe("2026-10-24");
    expect(ahead("Oct 2")).toBe("2027-10-02");
    expect(back("Oct 2")).toBe("2026-10-02");
    expect(back("December 3")).toBe("2025-12-03");
    expect(ahead("24 October")).toBe("2026-10-24");
    expect(ahead("the 24th of October")).toBe("2026-10-24");
    expect(ahead("Nov 5, 2027")).toBe("2027-11-05");
    expect(ahead("February 30")).toBeNull();
  });

  it("reads a bare day of the month", () => {
    expect(ahead("the 24th")).toBe("2026-10-24");
    expect(ahead("the 2nd")).toBe("2026-11-02");
    expect(back("the 2nd")).toBe("2026-10-02");
    expect(back("the 24th")).toBe("2026-09-24");
    expect(ahead("the 2nd", "2026-12-20")).toBe("2027-01-02");
  });

  it("crosses the year boundary on calendar days", () => {
    expect(ahead("tomorrow", "2026-12-31")).toBe("2027-01-01");
    expect(ahead("Friday", "2026-12-31")).toBe("2027-01-01");
    expect(back("yesterday", "2027-01-01")).toBe("2026-12-31");
  });

  it("returns null for what it can't read", () => {
    expect(ahead("soon")).toBeNull();
    expect(ahead("after the inspection")).toBeNull();
    expect(ahead("")).toBeNull();
    expect(ahead(null as unknown as string)).toBeNull();
    expect(resolveSpokenDate("tomorrow", "not-a-day", "future")).toBeNull();
  });
});

describe("pickDate", () => {
  it("prefers the words said over the model's reading", () => {
    // The model read "Thursday" as the 23rd: the words win.
    expect(pickDate({ spoken: "Thursday", iso: "2026-10-23" }, SUN, "future", null)).toEqual({ date: "2026-10-22", source: "spoken" });
  });

  it("falls back to the model's day, then the default", () => {
    expect(pickDate({ spoken: "after the long weekend", iso: "2026-10-27" }, SUN, "future", null)).toEqual({ date: "2026-10-27", source: "model" });
    expect(pickDate({ spoken: null, iso: "2026-02-30" }, SUN, "future", SUN)).toEqual({ date: SUN, source: "default" });
    expect(pickDate({ spoken: null, iso: null }, SUN, "future", null)).toEqual({ date: null, source: "none" });
  });
});

describe("helpers", () => {
  it("isIsoDay accepts only real calendar days", () => {
    expect(isIsoDay("2026-10-18")).toBe(true);
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2028-02-29")).toBe(true);
    expect(isIsoDay("2026-10-18T12:00:00Z")).toBe(false);
  });

  it("labels a day without the runtime's zone", () => {
    expect(shortDayLabel("2026-10-22")).toBe("Thu, Oct 22");
  });
});
