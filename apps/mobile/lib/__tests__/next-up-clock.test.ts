/**
 * The dashboard's clock (lib/next-up-clock.ts). Atlantic day and hour when
 * the phone can read America/Halifax; the phone's own day and hour when
 * Intl gives no hour (formatToParts without an hour part reads NaN), an
 * unreadable day, or throws (Hermes without the zone).
 */
import { describe, expect, it } from "vitest";
import { localISODate } from "@agent-runway/core/lib/local-date";
import { laterUntil, stopUntil } from "@agent-runway/core/lib/suggestion-dismissals";
import { laterChoicesAt, laterUntilAt, nextUpClock, stopUntilAt, type AtlanticReaders } from "../next-up-clock";

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

// ── Later and Stop on the phone (R6 guard) ───────────────────────────────────
//
// Core's laterChoices / laterUntil / stopUntil read the Atlantic hour and day.
// On a phone that can't read America/Halifax they fall back to the phone's
// own clock: tonight is 19:00 today, tomorrow 08:00 the next day, a Stop ends
// at midnight starting the same day N months on.

describe("laterChoicesAt / laterUntilAt / stopUntilAt on Atlantic time", () => {
  it("offers tonight before 19:00 Atlantic and not from 19:00 (Review focus 1)", () => {
    expect(laterChoicesAt(new Date("2026-10-19T21:59:00Z"))).toEqual(["in_an_hour", "tonight", "tomorrow"]); // 18:59 ADT
    expect(laterChoicesAt(new Date("2026-10-19T22:30:00Z"))).toEqual(["in_an_hour", "tomorrow"]); // 19:30 ADT
  });

  it("gives core's times", () => {
    const now = new Date("2026-10-19T15:30:00Z");
    for (const choice of ["in_an_hour", "tonight", "tomorrow"] as const) {
      expect(laterUntilAt(choice, now).toISOString()).toBe(laterUntil(choice, now).toISOString());
    }
    expect(laterUntilAt("tonight", now).toISOString()).toBe("2026-10-19T22:00:00.000Z");
    // Chosen on 2026-10-31: tomorrow is 08:00 AST on 2026-11-01, after the clock change.
    expect(laterUntilAt("tomorrow", new Date("2026-10-31T23:00:00Z")).toISOString()).toBe("2026-11-01T12:00:00.000Z");
    expect(stopUntilAt("3_months", now).toISOString()).toBe(stopUntil("3_months", now).toISOString());
    expect(stopUntilAt("6_months", now).toISOString()).toBe(stopUntil("6_months", now).toISOString());
  });
});

describe("laterChoicesAt / laterUntilAt / stopUntilAt fall back to the phone's clock", () => {
  const blind: AtlanticReaders = { hour: () => NaN, day: () => "NaN-NaN-NaN" };
  const throwing: AtlanticReaders = { hour: () => { throw new RangeError("Invalid time zone"); }, day: () => "2026-10-19" };
  // Noon on the phone's clock, whatever zone the test runs in.
  const now = new Date(2026, 9, 19, 12, 0, 0);
  const evening = new Date(2026, 9, 19, 19, 30, 0);

  for (const [what, read] of [["no Atlantic hour", blind], ["a throwing formatter", throwing]] as const) {
    it(`on ${what}`, () => {
      expect(laterChoicesAt(now, read)).toEqual(["in_an_hour", "tonight", "tomorrow"]);
      expect(laterChoicesAt(evening, read)).toEqual(["in_an_hour", "tomorrow"]);
      expect(laterUntilAt("in_an_hour", now, read).getTime()).toBe(now.getTime() + 3_600_000);
      expect(laterUntilAt("tonight", now, read).getTime()).toBe(new Date(2026, 9, 19, 19, 0, 0).getTime());
      expect(laterUntilAt("tomorrow", now, read).getTime()).toBe(new Date(2026, 9, 20, 8, 0, 0).getTime());
      expect(stopUntilAt("3_months", now, read).getTime()).toBe(new Date(2027, 0, 19).getTime());
      expect(stopUntilAt("6_months", now, read).getTime()).toBe(new Date(2027, 3, 19).getTime());
    });
  }

  it("clamps a Stop to the end of a shorter month", () => {
    expect(stopUntilAt("3_months", new Date(2026, 10, 30, 12), blind).getTime()).toBe(new Date(2027, 1, 28).getTime());
  });

  it("never hands back a time that can't be read", () => {
    for (const choice of ["in_an_hour", "tonight", "tomorrow"] as const) {
      expect(Number.isFinite(laterUntilAt(choice, now, blind).getTime())).toBe(true);
    }
  });
});
