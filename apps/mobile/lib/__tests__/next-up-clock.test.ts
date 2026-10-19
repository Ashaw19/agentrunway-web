/**
 * The dashboard's clock (lib/next-up-clock.ts). Atlantic day and hour when
 * the phone can read America/Halifax; the phone's own day and hour when
 * Intl gives no hour (formatToParts without an hour part reads NaN), an
 * unreadable day, or throws (Hermes without the zone).
 */
import { describe, expect, it } from "vitest";
import { localISODate } from "@agent-runway/core/lib/local-date";
import { nextUpClock, type AtlanticReaders } from "../next-up-clock";

const deviceClock = (now: Date) => {
  const hour = now.getHours();
  return { today: localISODate(now), hour, atlantic: false };
};

describe("nextUpClock with Atlantic time", () => {
  it("reads the Atlantic day and hour (ADT is UTC-3 in October)", () => {
    expect(nextUpClock(new Date("2026-10-19T15:30:00Z"))).toEqual({
      today: "2026-10-19", hour: 12, band: "midday", atlantic: true,
    });
  });

  it("keeps the Atlantic day after UTC midnight", () => {
    expect(nextUpClock(new Date("2026-10-20T02:30:00Z"))).toEqual({
      today: "2026-10-19", hour: 23, band: "evening", atlantic: true,
    });
  });

  it("puts 11:59 in the morning and 17:00 in the evening", () => {
    expect(nextUpClock(new Date("2026-10-19T14:59:00Z")).band).toBe("morning");
    expect(nextUpClock(new Date("2026-10-19T20:00:00Z")).band).toBe("evening");
  });
});

describe("nextUpClock falls back to the phone's clock", () => {
  const now = new Date("2026-10-19T15:30:00Z");

  const cases: [string, AtlanticReaders][] = [
    ["no hour part (NaN)", { hour: () => NaN, day: () => "2026-10-19" }],
    ["an hour out of range", { hour: () => 24, day: () => "2026-10-19" }],
    ["an unreadable day", { hour: () => 12, day: () => "NaN-NaN-NaN" }],
    ["a throwing formatter", { hour: () => { throw new RangeError("Invalid time zone specified: America/Halifax"); }, day: () => "2026-10-19" }],
    ["a throwing day reader", { hour: () => 12, day: () => { throw new RangeError("Incorrect locale information provided"); } }],
  ];

  for (const [what, read] of cases) {
    it(`on ${what}`, () => {
      const clock = nextUpClock(now, read);
      const device = deviceClock(now);
      expect(clock.atlantic).toBe(false);
      expect(clock.today).toBe(device.today);
      expect(clock.hour).toBe(device.hour);
      expect(clock.band).toBe(device.hour < 12 ? "morning" : device.hour < 17 ? "midday" : "evening");
    });
  }
});
