/**
 * Filing period + deadline urgency — calendar anchor (2026-10-09).
 *
 * The chat route asks for "the current filing period" on the server, whose
 * clock is UTC: from 8 pm Atlantic on the last day of a period it already
 * returned the next one. Server callers pass atlanticNoon(). Instants are
 * pinned; expectations hold in any host zone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { deadlineUrgency, filingPeriodForDate, filingPeriodMonths, getCurrentFilingPeriod, getFilingPeriods } from "../filing-period-engine";
import { atlanticNoon } from "../../lib/local-date";

const DEC31_10PM_AST = atlanticNoon(new Date("2027-01-01T02:00:00Z"));
const SEP30_1030PM_ADT = atlanticNoon(new Date("2026-10-01T01:30:00Z"));

describe("getCurrentFilingPeriod with a calendar anchor", () => {
  it("is still Q4 on Dec 31 evening", () => {
    expect(getCurrentFilingPeriod("quarterly", undefined, DEC31_10PM_AST).label).toBe("Q4 2026");
    expect(getCurrentFilingPeriod("annual", undefined, DEC31_10PM_AST).label).toBe("2026");
  });

  it("is still September on Sep 30 evening", () => {
    expect(getCurrentFilingPeriod("monthly", undefined, SEP30_1030PM_ADT).startDate).toBe("2026-09-01");
    expect(getCurrentFilingPeriod("quarterly", undefined, SEP30_1030PM_ADT).label).toBe("Q3 2026");
  });

  it("moves on at Atlantic midnight", () => {
    const oct1 = atlanticNoon(new Date("2026-10-01T03:30:00Z"));
    expect(getCurrentFilingPeriod("quarterly", undefined, oct1).label).toBe("Q4 2026");
  });
});

describe("deadlineUrgency with a calendar anchor", () => {
  it("counts whole days from the anchor's day", () => {
    expect(deadlineUrgency("2027-01-31", DEC31_10PM_AST).daysUntil).toBe(31);
  });

  it("is due today on the deadline evening, not overdue", () => {
    const deadlineEvening = atlanticNoon(new Date("2026-11-01T01:00:00Z")); // Oct 31, 22:00 ADT
    const dl = deadlineUrgency("2026-10-31", deadlineEvening);
    expect(dl.daysUntil).toBe(0);
    expect(dl.label).toBe("Due today");
  });
});

// In the browser both ends were local midnight and the gap was rounded up.
// Across the autumn clock change the gap is a whole number of days plus one
// hour, so every deadline after it read a day further off than it was.
describe("deadlineUrgency across a clock change (2026-10-13)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const halifax = () => {
    vi.stubEnv("TZ", "America/Halifax");
    expect(new Date("2026-10-13T12:00:00Z").getTimezoneOffset()).toBe(180); // guard: the stub took
    expect(new Date("2026-12-15T12:00:00Z").getTimezoneOffset()).toBe(240);
  };

  it("counts calendar days to a deadline after clocks go back (Nov 1)", () => {
    halifax();
    const oct20 = new Date("2026-10-20T12:00:00Z"); // Tue Oct 20, 09:00 ADT
    expect(deadlineUrgency("2026-12-15", oct20).daysUntil).toBe(56);
    expect(deadlineUrgency("2027-01-31", oct20).daysUntil).toBe(103);
  });

  it("is 2 days from Oct 31 to Nov 2, and urgent", () => {
    halifax();
    const dl = deadlineUrgency("2026-11-02", new Date("2026-10-31T21:00:00Z")); // Sat Oct 31, 18:00 ADT
    expect(dl.daysUntil).toBe(2);
    expect(dl.urgency).toBe("urgent");
  });

  it("counts calendar days across clocks going forward (Mar 14) and late in the evening", () => {
    halifax();
    const mar10 = new Date("2027-03-11T02:30:00Z"); // Wed Mar 10, 22:30 AST
    expect(deadlineUrgency("2027-03-31", mar10).daysUntil).toBe(21);
    expect(deadlineUrgency("2027-03-10", mar10).daysUntil).toBe(0);
    expect(deadlineUrgency("2027-03-09", mar10).daysUntil).toBe(-1);
  });
});

describe("filingPeriodForDate (2026-10-19)", () => {
  it("places a day in its quarter, both edges included", () => {
    expect(filingPeriodForDate("quarterly", "2026-03-31")?.label).toBe("Q1 2026");
    expect(filingPeriodForDate("quarterly", "2026-04-01")?.label).toBe("Q2 2026");
    expect(filingPeriodForDate("quarterly", "2025-12-31")?.label).toBe("Q4 2025");
    expect(filingPeriodForDate("quarterly", "2026-01-01")?.label).toBe("Q1 2026");
  });

  it("monthly and annual", () => {
    expect(filingPeriodForDate("monthly", "2026-02-28")?.label).toBe("Feb 2026");
    expect(filingPeriodForDate("monthly", "2026-03-01")?.label).toBe("Mar 2026");
    expect(filingPeriodForDate("annual", "2025-06-15")?.label).toBe("2025");
  });

  it("no day, no period", () => {
    expect(filingPeriodForDate("quarterly", null)).toBeNull();
    expect(filingPeriodForDate("quarterly", "")).toBeNull();
    expect(filingPeriodForDate("quarterly", "2026-10-19T12:00:00Z")).toBeNull();
    expect(filingPeriodForDate("quarterly", "2026-13-01")).toBeNull();
  });
});

describe("filingPeriodMonths", () => {
  it("names the first and last month", () => {
    const [q1, , , q4] = getFilingPeriods("quarterly", 2026);
    expect(filingPeriodMonths(q1)).toEqual({ from: "Jan", to: "Mar" });
    expect(filingPeriodMonths(q4)).toEqual({ from: "Oct", to: "Dec" });
    expect(filingPeriodMonths(getFilingPeriods("annual", 2026)[0])).toEqual({ from: "Jan", to: "Dec" });
    expect(filingPeriodMonths(getFilingPeriods("monthly", 2026)[8])).toEqual({ from: "Sep", to: "Sep" });
  });
});
