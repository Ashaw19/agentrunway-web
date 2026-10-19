import { describe, expect, it } from "vitest";
import {
  DEAL_DEADLINE_DAYS,
  EVENING_START_HOUR,
  HANDFUL_TARGET,
  MORNING_END_HOUR,
  NEW_LEAD_HOURS,
  conditionDeadlineDays,
  dealDeadlineDays,
  isDueToday,
  isNewLead,
  isOverdueTask,
  isPastCloseDate,
  isUncontactedLead,
  textPurposeFor,
  timeBand,
} from "../next-up/rules";

/**
 * The phone dashboard's Next up rules, shared by the server route
 * (/api/next-up's urgent counts) and the phone's builder, so both count the
 * same leads, tasks and deadlines. Pure: callers pass `now` and `today`
 * (an Atlantic YYYY-MM-DD on the server).
 */

type LeadInput = Parameters<typeof isNewLead>[0];
const lead = (over: Partial<LeadInput> = {}): LeadInput => ({
  status: "boarding",
  last_contact_at: null,
  created_at: "2026-10-19T08:00:00Z",
  archived_at: null,
  ...over,
});

describe("constants", () => {
  it("are the plan's values", () => {
    expect(HANDFUL_TARGET).toBe(5);
    expect(NEW_LEAD_HOURS).toBe(48);
    expect(DEAL_DEADLINE_DAYS).toBe(7);
    expect(MORNING_END_HOUR).toBe(12);
    expect(EVENING_START_HOUR).toBe(17);
  });
});

describe("timeBand", () => {
  it("bands", () => {
    expect([11, 12, 16, 17].map(timeBand)).toEqual(["morning", "midday", "midday", "evening"]);
  });

  it("the small hours are morning and late night is evening", () => {
    expect([0, 5, 23].map(timeBand)).toEqual(["morning", "morning", "evening"]);
  });
});

describe("isNewLead", () => {
  it("a new lead is under 48 hours", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(isNewLead(lead({ created_at: "2026-10-17T12:00:01Z" }), now)).toBe(true);
    expect(isNewLead(lead({ created_at: "2026-10-17T11:59:59Z" }), now)).toBe(false);
    expect(isNewLead(lead({ last_contact_at: "2026-10-19T10:00:00Z" }), now)).toBe(false);
  });

  it("exactly 48 hours is no longer new (elapsed, not calendar days)", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(isNewLead(lead({ created_at: "2026-10-17T12:00:00Z" }), now)).toBe(false);
    // Across an Atlantic midnight: 47 hours is still new.
    expect(isNewLead(lead({ created_at: "2026-10-17T13:00:00Z" }), now)).toBe(true);
  });

  it("only an uncontacted Boarding client in the CRM counts", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(isNewLead(lead({ status: "in_flight" }), now)).toBe(false);
    expect(isNewLead(lead({ status: "cruising" }), now)).toBe(false);
    expect(isNewLead(lead({ archived_at: "2026-10-19T09:00:00Z" }), now)).toBe(false);
    expect(isNewLead(lead({ archived_at: undefined }), now)).toBe(true);
  });

  it("an unreadable created_at is not new", () => {
    expect(isNewLead(lead({ created_at: "not a date" }), new Date("2026-10-19T12:00:00Z"))).toBe(false);
  });
});

describe("isUncontactedLead", () => {
  it("is the same rule with no age limit", () => {
    expect(isUncontactedLead(lead({ created_at: "2025-01-01T12:00:00Z" }))).toBe(true);
    expect(isUncontactedLead(lead({ last_contact_at: "2026-10-01T12:00:00Z" }))).toBe(false);
    expect(isUncontactedLead(lead({ status: "scheduled" }))).toBe(false);
    expect(isUncontactedLead(lead({ archived_at: "2026-10-01T12:00:00Z" }))).toBe(false);
  });
});

describe("tasks", () => {
  const today = "2026-10-19";

  it("overdue is an open task due before today", () => {
    expect(isOverdueTask({ due_date: "2026-10-18", completed_at: null }, today)).toBe(true);
    expect(isOverdueTask({ due_date: "2026-10-19", completed_at: null }, today)).toBe(false);
    expect(isOverdueTask({ due_date: "2026-10-18", completed_at: "2026-10-19T12:00:00Z" }, today)).toBe(false);
  });

  it("due today is an open task due today", () => {
    expect(isDueToday({ due_date: "2026-10-19", completed_at: null }, today)).toBe(true);
    expect(isDueToday({ due_date: "2026-10-18", completed_at: null }, today)).toBe(false);
    expect(isDueToday({ due_date: "2026-10-20", completed_at: null }, today)).toBe(false);
    expect(isDueToday({ due_date: "2026-10-19", completed_at: "2026-10-19T12:00:00Z" }, today)).toBe(false);
  });
});

describe("deal deadlines", () => {
  it("deal deadline window is today..+7", () => {
    expect(dealDeadlineDays({ expected_close_date: "2026-10-26" }, "2026-10-19")).toBe(7);
    expect(dealDeadlineDays({ expected_close_date: "2026-10-27" }, "2026-10-19")).toBeNull();
    expect(dealDeadlineDays({ expected_close_date: "2026-10-18" }, "2026-10-19")).toBeNull(); // past: isPastCloseDate
  });

  it("closing today is 0 days; no date is null", () => {
    expect(dealDeadlineDays({ expected_close_date: "2026-10-19" }, "2026-10-19")).toBe(0);
    expect(dealDeadlineDays({ expected_close_date: null }, "2026-10-19")).toBeNull();
  });

  it("counts calendar days across the end of daylight time", () => {
    // Atlantic DST ends 2026-11-01: still 7 calendar days.
    expect(dealDeadlineDays({ expected_close_date: "2026-11-04" }, "2026-10-28")).toBe(7);
  });

  it("a passed close date is past; today and later are not", () => {
    expect(isPastCloseDate({ expected_close_date: "2026-10-18" }, "2026-10-19")).toBe(true);
    expect(isPastCloseDate({ expected_close_date: "2026-10-19" }, "2026-10-19")).toBe(false);
    expect(isPastCloseDate({ expected_close_date: null }, "2026-10-19")).toBe(false);
  });

  it("a condition date in the window counts until the deal is firmed, waived or collapsed", () => {
    const today = "2026-10-19";
    expect(conditionDeadlineDays({ condition_date: "2026-10-22", condition_status: "pending" }, today)).toBe(3);
    expect(conditionDeadlineDays({ condition_date: "2026-10-22", condition_status: null }, today)).toBe(3);
    expect(conditionDeadlineDays({ condition_date: "2026-10-19", condition_status: "pending" }, today)).toBe(0);
    for (const status of ["firmed", "waived", "collapsed"]) {
      expect(conditionDeadlineDays({ condition_date: "2026-10-22", condition_status: status }, today)).toBeNull();
    }
    expect(conditionDeadlineDays({ condition_date: "2026-10-27", condition_status: "pending" }, today)).toBeNull();
    expect(conditionDeadlineDays({ condition_date: "2026-10-18", condition_status: "pending" }, today)).toBeNull();
    expect(conditionDeadlineDays({ condition_date: null, condition_status: "pending" }, today)).toBeNull();
  });
});

describe("textPurposeFor", () => {
  it("a consent-lapsing card asks for consent; everything else checks in", () => {
    expect(textPurposeFor("consent_lapsing")).toBe("consent_request");
    for (const t of ["idle_client", "birthday", "closing_anniversary", "lead_going_quiet", "sphere_check_in"]) {
      expect(textPurposeFor(t)).toBe("check_in");
    }
  });
});
