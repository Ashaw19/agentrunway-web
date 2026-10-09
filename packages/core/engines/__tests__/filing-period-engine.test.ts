/**
 * Filing period + deadline urgency — calendar anchor (2026-10-09).
 *
 * The chat route asks for "the current filing period" on the server, whose
 * clock is UTC: from 8 pm Atlantic on the last day of a period it already
 * returned the next one. Server callers pass atlanticNoon(). Instants are
 * pinned; expectations hold in any host zone.
 */
import { describe, expect, it } from "vitest";
import { deadlineUrgency, getCurrentFilingPeriod } from "../filing-period-engine";
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
