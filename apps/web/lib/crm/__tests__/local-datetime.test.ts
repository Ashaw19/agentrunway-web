/**
 * The CRM "Log activity" form saves the moment the agent picked (2026-10-13).
 *
 * A datetime-local input gives `2026-10-09T21:30`: the agent's wall clock,
 * no offset. Sent as is, the database (UTC) stored it as 21:30 UTC, which is
 * 6:30 pm Atlantic: every activity logged in the web app sat three or four
 * hours early. first_contacted_at and last_contact_at are copied from it, so
 * speed-to-lead and the day an activity is filed under inherited the error.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { localDateTimeToInstant } from "../local-datetime";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("localDateTimeToInstant", () => {
  it("reads the value in the agent's own zone (Atlantic, daylight time)", () => {
    vi.stubEnv("TZ", "America/Halifax");
    expect(new Date("2026-10-09T21:30").getTimezoneOffset()).toBe(180); // guard: the stub took
    expect(localDateTimeToInstant("2026-10-09T21:30")).toBe("2026-10-10T00:30:00.000Z");
  });

  it("follows standard time: Dec 31 at 10 pm is 02:00 UTC on Jan 1", () => {
    vi.stubEnv("TZ", "America/Halifax");
    expect(localDateTimeToInstant("2026-12-31T22:00")).toBe("2027-01-01T02:00:00.000Z");
  });

  it("keeps seconds when the input has them", () => {
    vi.stubEnv("TZ", "America/Halifax");
    expect(localDateTimeToInstant("2026-10-09T21:30:15")).toBe("2026-10-10T00:30:15.000Z");
  });

  it("uses whatever zone the browser is in", () => {
    vi.stubEnv("TZ", "America/Vancouver");
    expect(localDateTimeToInstant("2026-10-09T21:30")).toBe("2026-10-10T04:30:00.000Z");
  });

  it("leaves a value that is already an instant alone", () => {
    vi.stubEnv("TZ", "America/Halifax");
    expect(localDateTimeToInstant("2026-10-10T00:30:00.000Z")).toBe("2026-10-10T00:30:00.000Z");
    expect(localDateTimeToInstant("2026-10-10T00:30:00+00:00")).toBe("2026-10-10T00:30:00.000Z");
  });

  it("falls back to now for an empty or unreadable value", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T01:00:00Z"));
    expect(localDateTimeToInstant("")).toBe("2026-10-10T01:00:00.000Z");
    expect(localDateTimeToInstant("not a date")).toBe("2026-10-10T01:00:00.000Z");
  });
});
