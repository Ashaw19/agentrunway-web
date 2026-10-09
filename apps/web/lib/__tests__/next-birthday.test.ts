/**
 * nextBirthdayDate (lib/crm/next-birthday.ts) — shared by detect-opportunities
 * and the Flight Crew draft services, both server code.
 *
 * Two bugs, both from reading the server's UTC clock: the birthday rolled to
 * next year from noon UTC (8-9 am Atlantic) on the day itself, because noon
 * of the birthday was compared with the current instant; and a Dec 31
 * birthday rolled at 8 pm Atlantic on Dec 31, when the UTC year turns.
 * Instants are pinned; expectations hold in any host zone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { atlanticNoon, localISODate } from "@agent-runway/core/lib/local-date";
import { nextBirthdayDate } from "../crm/next-birthday";

const next = (birthdate: string, instant: string) =>
  localISODate(nextBirthdayDate(birthdate, atlanticNoon(new Date(instant))));

afterEach(() => {
  vi.useRealTimers();
});

describe("nextBirthdayDate", () => {
  it("keeps today's birthday all day, past noon UTC and into the evening", () => {
    expect(next("1990-10-09", "2026-10-09T15:00:00Z")).toBe("2026-10-09"); // 12:00 ADT
    expect(next("1990-10-09", "2026-10-10T01:00:00Z")).toBe("2026-10-09"); // 22:00 ADT
  });

  it("moves to next year the day after", () => {
    expect(next("1990-10-09", "2026-10-10T04:00:00Z")).toBe("2027-10-09"); // Oct 10, 01:00 ADT
  });

  it("a Dec 31 birthday is still today on Dec 31 evening (UTC is Jan 1)", () => {
    expect(next("1985-12-31", "2027-01-01T02:00:00Z")).toBe("2026-12-31");
  });

  it("a Jan 1 birthday is tomorrow on Dec 31 evening", () => {
    expect(next("1985-01-01", "2027-01-01T02:00:00Z")).toBe("2027-01-01");
  });

  it("defaults to the Atlantic day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T01:00:00Z")); // Oct 9, 22:00 ADT
    expect(localISODate(nextBirthdayDate("1990-10-09"))).toBe("2026-10-09");
  });

  it("reads only the anchor's calendar day", () => {
    const lateEvening = new Date(2026, 9, 9, 23, 59); // host-local Oct 9, 23:59
    expect(localISODate(nextBirthdayDate("1990-10-09", lateEvening))).toBe("2026-10-09");
  });

  it("returns an invalid Date for a malformed birthdate", () => {
    expect(isNaN(nextBirthdayDate("not-a-date").getTime())).toBe(true);
  });
});
