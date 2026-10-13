/**
 * CRM "Today / Yesterday / 3 days ago" labels follow the calendar (2026-10-13).
 *
 * relativeDate labelled an activity with
 * `Math.floor((now - then) / 86_400_000)`: elapsed 24-hour blocks, not days.
 * A call logged at 10 pm read "Today" at 9 the next morning (11 hours), and
 * one logged at 9 am read "Yesterday" only from 9 am the day after. The
 * pipeline tab's last-contact label did the same.
 *
 * Instants are pinned and the agent's zone is simulated: the labels are
 * browser code, so the day is the device's own.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { lastTouchLabel, relativeDate } from "../relative-date";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const halifax = () => {
  vi.stubEnv("TZ", "America/Halifax");
  expect(new Date("2026-10-13T12:00:00Z").getTimezoneOffset()).toBe(180); // guard: the stub took
};

const TUE_9AM = new Date("2026-10-13T12:00:00Z"); // Tue Oct 13 2026, 09:00 ADT

describe("relativeDate", () => {
  it("a call logged at 10 pm reads Yesterday the next morning, 11 hours on", () => {
    halifax();
    expect(relativeDate("2026-10-13T01:00:00Z", TUE_9AM)).toBe("Yesterday"); // Mon 22:00
  });

  it("a 9 am call reads Yesterday at 8 the next morning, 23 hours on", () => {
    halifax();
    expect(relativeDate("2026-10-12T12:00:00Z", new Date("2026-10-13T11:00:00Z"))).toBe("Yesterday");
  });

  it("reads Today from just after midnight to just before the next one", () => {
    halifax();
    const logged = "2026-10-13T03:05:00Z"; // Tue 00:05
    expect(relativeDate(logged, new Date("2026-10-13T03:06:00Z"))).toBe("Today");
    expect(relativeDate(logged, new Date("2026-10-14T02:55:00Z"))).toBe("Today"); // Tue 23:55
    expect(relativeDate(logged, new Date("2026-10-14T03:05:00Z"))).toBe("Yesterday"); // Wed 00:05
  });

  it("counts midnights, not 24-hour blocks: Sunday 11 pm is 2 days ago on Tuesday at 1 am", () => {
    halifax();
    expect(relativeDate("2026-10-12T02:00:00Z", new Date("2026-10-13T04:00:00Z"))).toBe("2 days ago");
  });

  it("runs to 6 days ago, then prints the date", () => {
    halifax();
    // Wed Oct 7, 15:00 ADT: 5 days 18 hours before Tuesday 9 am.
    expect(relativeDate("2026-10-07T18:00:00Z", TUE_9AM)).toBe("6 days ago");
    // Tue Oct 6, 08:00 ADT: 7 days 1 hour before.
    expect(relativeDate("2026-10-06T11:00:00Z", TUE_9AM)).toBe("Oct 6");
    // Tue Oct 6, 21:00 ADT: 6 days 12 hours before, still a week ago by the calendar.
    expect(relativeDate("2026-10-07T00:00:00Z", TUE_9AM)).toBe("Oct 6");
  });

  it("prints the agent's day for an older evening activity, not the UTC date", () => {
    halifax();
    expect(relativeDate("2026-10-04T01:00:00Z", TUE_9AM)).toBe("Oct 3"); // Sat Oct 3, 22:00 ADT
  });

  it("reads Today for a time later today and the date for a day still to come", () => {
    halifax();
    expect(relativeDate("2026-10-13T21:00:00Z", TUE_9AM)).toBe("Today"); // Tue 18:00
    expect(relativeDate("2026-10-14T13:00:00Z", TUE_9AM)).toBe("Oct 14");
  });

  it("counts whole days across a clock change", () => {
    halifax();
    // Sat Oct 31, 12:00 ADT -> Mon Nov 2, 00:30 AST. Clocks go back on Nov 1.
    expect(relativeDate("2026-10-31T15:00:00Z", new Date("2026-11-02T04:30:00Z"))).toBe("2 days ago");
  });

  it("uses whatever zone the browser is in", () => {
    vi.stubEnv("TZ", "America/Vancouver");
    // Mon Oct 12, 22:00 PDT -> Tue Oct 13, 09:00 PDT.
    expect(relativeDate("2026-10-13T05:00:00Z", new Date("2026-10-13T16:00:00Z"))).toBe("Yesterday");
    vi.stubEnv("TZ", "America/Halifax");
    // The same two instants in Halifax: Tue 02:00 -> Tue 13:00.
    expect(relativeDate("2026-10-13T05:00:00Z", new Date("2026-10-13T16:00:00Z"))).toBe("Today");
  });

  it("reads the clock when no `now` is passed", () => {
    halifax();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TUE_9AM);
    expect(relativeDate("2026-10-13T01:00:00Z")).toBe("Yesterday");
  });

  it("is a dash for an unreadable value", () => {
    expect(relativeDate("not a date", TUE_9AM)).toBe("—");
    expect(relativeDate("", TUE_9AM)).toBe("—");
  });
});

describe("lastTouchLabel (pipeline tab)", () => {
  it("an evening call reads Yesterday the next morning", () => {
    halifax();
    expect(lastTouchLabel("2026-10-13T01:00:00Z", TUE_9AM)).toBe("Yesterday");
  });

  it("reads Today for a call earlier today", () => {
    halifax();
    expect(lastTouchLabel("2026-10-13T03:05:00Z", TUE_9AM)).toBe("Today");
  });

  it("counts days by the calendar up to a week", () => {
    halifax();
    expect(lastTouchLabel("2026-10-12T02:00:00Z", new Date("2026-10-13T04:00:00Z"))).toBe("2d ago");
    expect(lastTouchLabel("2026-10-07T18:00:00Z", TUE_9AM)).toBe("6d ago");
  });

  it("switches to weeks at 7 days and months at 30", () => {
    halifax();
    expect(lastTouchLabel("2026-10-07T00:00:00Z", TUE_9AM)).toBe("1w ago"); // Tue Oct 6, 21:00
    expect(lastTouchLabel("2026-09-29T20:00:00Z", TUE_9AM)).toBe("2w ago"); // Sep 29, 17:00: 14 days
    expect(lastTouchLabel("2026-09-14T12:00:00Z", TUE_9AM)).toBe("4w ago"); // 29 days
    expect(lastTouchLabel("2026-09-13T22:00:00Z", TUE_9AM)).toBe("1mo ago"); // Sep 13, 19:00: 30 days
    expect(lastTouchLabel("2026-07-01T12:00:00Z", TUE_9AM)).toBe("3mo ago"); // 104 days
  });

  it("reads Today for a contact dated later than now", () => {
    halifax();
    expect(lastTouchLabel("2026-10-14T13:00:00Z", TUE_9AM)).toBe("Today");
  });

  it("says so when there is no contact on record", () => {
    expect(lastTouchLabel(null, TUE_9AM)).toBe("No contact on record");
    expect(lastTouchLabel(undefined, TUE_9AM)).toBe("No contact on record");
    expect(lastTouchLabel("not a date", TUE_9AM)).toBe("No contact on record");
  });
});
