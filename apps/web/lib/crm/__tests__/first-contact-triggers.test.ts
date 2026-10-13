import { describe, expect, it } from "vitest";
import {
  contactAnniversaryCandidates,
  newClientWelcomeCandidates,
  recordedOccurrences,
} from "../first-contact-triggers";

const OCT9_10PM_ADT = "2026-10-10T01:00:00+00:00"; // Fri Oct 9 2026, 22:00 ADT
const OCT9_NOON_ADT = "2026-10-09T15:00:00+00:00";

const none: ReadonlySet<string> = new Set();
const client = (first_contacted_at: string | null, id = "c1") => ({ id, first_contacted_at });

const welcome = (
  firstContactedAt: string | null,
  today: string,
  opts: { suppressed?: ReadonlySet<string>; recorded?: ReadonlySet<string> } = {},
) =>
  newClientWelcomeCandidates([client(firstContactedAt)], {
    today, windowDays: 14, suppressed: opts.suppressed ?? none, recorded: opts.recorded ?? none,
  });

const anniversary = (
  firstContactedAt: string | null,
  today: string,
  opts: { suppressed?: ReadonlySet<string>; recorded?: ReadonlySet<string> } = {},
) =>
  contactAnniversaryCandidates([client(firstContactedAt)], {
    today, windowDays: 14, suppressed: opts.suppressed ?? none, recorded: opts.recorded ?? none,
  });

describe("newClientWelcomeCandidates", () => {
  it("dates the welcome seven days after the Atlantic day of the first contact", () => {
    expect(welcome(OCT9_10PM_ADT, "2026-10-12")).toEqual([{
      client_id: "c1",
      opportunity_type: "new_client_welcome",
      trigger_date: "2026-10-16",
      context: { first_contacted_at: OCT9_10PM_ADT },
    }]);
  });

  it("follows standard time: Dec 31 at 10 pm is still Dec 31", () => {
    expect(welcome("2027-01-01T02:00:00+00:00", "2027-01-02").map((c) => c.trigger_date)).toEqual(["2027-01-07"]);
  });

  it("stays open until 14 days after the date", () => {
    const dates = (today: string) => welcome(OCT9_NOON_ADT, today).map((c) => c.trigger_date);
    expect(dates("2026-10-09")).toEqual(["2026-10-16"]);
    expect(dates("2026-10-30")).toEqual(["2026-10-16"]);
    expect(dates("2026-10-31")).toEqual([]);
  });

  it("skips clients with no first contact and clients contacted recently", () => {
    expect(welcome(null, "2026-10-12")).toEqual([]);
    expect(welcome(OCT9_10PM_ADT, "2026-10-12", { suppressed: new Set(["c1"]) })).toEqual([]);
  });

  it("stays on the UTC-dated occurrence already on file", () => {
    const recorded = recordedOccurrences(
      [{ client_id: "c1", opportunity_type: "new_client_welcome", trigger_date: "2026-10-17" }],
      [],
    );
    expect(welcome(OCT9_10PM_ADT, "2026-10-25", { recorded }).map((c) => c.trigger_date)).toEqual(["2026-10-17"]);
  });

  it("counts a dismissal as an occurrence on file", () => {
    const recorded = recordedOccurrences(
      [],
      [{ client_id: "c1", opportunity_type: "new_client_welcome", trigger_date: "2026-10-17" }],
    );
    expect(welcome(OCT9_10PM_ADT, "2026-10-25", { recorded }).map((c) => c.trigger_date)).toEqual(["2026-10-17"]);
  });

  it("prefers the Atlantic date when both are on file", () => {
    const recorded = recordedOccurrences(
      [
        { client_id: "c1", opportunity_type: "new_client_welcome", trigger_date: "2026-10-16" },
        { client_id: "c1", opportunity_type: "new_client_welcome", trigger_date: "2026-10-17" },
      ],
      [],
    );
    expect(welcome(OCT9_10PM_ADT, "2026-10-25", { recorded }).map((c) => c.trigger_date)).toEqual(["2026-10-16"]);
  });

  it("ignores another client's or another trigger's occurrence", () => {
    const recorded = recordedOccurrences(
      [
        { client_id: "c2", opportunity_type: "new_client_welcome", trigger_date: "2026-10-17" },
        { client_id: "c1", opportunity_type: "contact_anniversary", trigger_date: "2026-10-17" },
      ],
      [],
    );
    expect(welcome(OCT9_10PM_ADT, "2026-10-25", { recorded }).map((c) => c.trigger_date)).toEqual(["2026-10-16"]);
  });
});

describe("contactAnniversaryCandidates", () => {
  const NOV1_2025_1030PM_ADT = "2025-11-02T01:30:00+00:00";

  it("dates the anniversary on the Atlantic day of the first contact", () => {
    expect(anniversary(NOV1_2025_1030PM_ADT, "2026-10-25")).toEqual([{
      client_id: "c1",
      opportunity_type: "contact_anniversary",
      trigger_date: "2026-11-01",
      context: { anniversary_year: 1, first_contacted_at: "2025-11-01" },
    }]);
  });

  it("finds a Dec 31 evening first contact in December, not next January", () => {
    // UTC date 2026-01-01: zero years in all through 2026.
    expect(anniversary("2026-01-01T02:00:00+00:00", "2026-12-20").map((c) => c.trigger_date)).toEqual(["2026-12-31"]);
  });

  it("is open from 14 days before the anniversary through the day itself", () => {
    const dates = (today: string) => anniversary("2025-11-01T15:00:00+00:00", today).map((c) => c.trigger_date);
    expect(dates("2026-10-17")).toEqual([]);
    expect(dates("2026-10-18")).toEqual(["2026-11-01"]);
    expect(dates("2026-11-01")).toEqual(["2026-11-01"]);
    expect(dates("2026-11-02")).toEqual([]);
  });

  it("marks years 1, 2, 3, 5 and 10 only", () => {
    const year = (today: string) => anniversary("2016-11-01T15:00:00+00:00", today).map((c) => c.context.anniversary_year);
    expect(year("2017-10-25")).toEqual([1]);
    expect(year("2020-10-25")).toEqual([]); // year 4
    expect(year("2021-10-25")).toEqual([5]);
    expect(year("2026-10-25")).toEqual([10]);
  });

  it("puts a Feb 29 first contact on Mar 1 in a common year, as before", () => {
    expect(anniversary("2024-02-29T15:00:00+00:00", "2025-02-20").map((c) => c.trigger_date)).toEqual(["2025-03-01"]);
  });

  it("stays on the UTC-dated occurrence already on file", () => {
    const recorded = recordedOccurrences(
      [{ client_id: "c1", opportunity_type: "contact_anniversary", trigger_date: "2026-11-02" }],
      [],
    );
    expect(anniversary(NOV1_2025_1030PM_ADT, "2026-10-25", { recorded })).toEqual([{
      client_id: "c1",
      opportunity_type: "contact_anniversary",
      trigger_date: "2026-11-02",
      context: { anniversary_year: 1, first_contacted_at: "2025-11-01" },
    }]);
  });

  it("skips clients with no first contact and clients contacted recently", () => {
    expect(anniversary(null, "2026-10-25")).toEqual([]);
    expect(anniversary(NOV1_2025_1030PM_ADT, "2026-10-25", { suppressed: new Set(["c1"]) })).toEqual([]);
  });
});
