/**
 * The trial-welcome email states the day the trial ends on the Atlantic
 * calendar (2026-10-13). Stripe's trial_end is an instant; formatted in the
 * server's UTC zone, a trial ending at 10 pm Atlantic was announced as
 * ending the following day.
 *
 * Runs with TZ=UTC, the server's zone.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatTrialEndDate } from "../trial-welcome";

const unix = (iso: string) => Date.parse(iso) / 1000;

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("formatTrialEndDate", () => {
  it("runs in the server's zone", () => {
    expect(new Date("2026-10-10T01:00:00Z").getDate()).toBe(10);
  });

  it("an evening trial end is that Atlantic day", () => {
    expect(formatTrialEndDate(unix("2026-10-10T01:00:00Z"))).toBe("October 9, 2026"); // 22:00 ADT
  });

  it("a Dec 31 evening trial end stays in December", () => {
    expect(formatTrialEndDate(unix("2027-01-01T02:00:00Z"))).toBe("December 31, 2026"); // 22:00 AST
  });

  it("a midday trial end is unchanged", () => {
    expect(formatTrialEndDate(unix("2026-10-09T15:00:00Z"))).toBe("October 9, 2026");
  });
});
