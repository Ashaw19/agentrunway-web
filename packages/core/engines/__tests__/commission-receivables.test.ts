/**
 * Commission receivables (2026-11-02): closed deals with no paid date past
 * the brokerage's normal close-to-paid gap. Andrew's own statements: median
 * 14 days, never more than 21, so the 30-day grace is well past normal. His
 * 32 pre-2026 closings have no paid date because recording began with
 * migration 00178; they must never be listed.
 */
import { describe, expect, it } from "vitest";
import {
  commissionReceivables,
  receivablesSummaryLine,
  PAID_DATE_TRACKING_SINCE,
  RECEIVABLE_GRACE_DAYS,
} from "../commission-receivables";

const TODAY = "2026-11-02";
const deal = (over: Record<string, unknown>) => ({
  id: "d1", address: "12 Elm St", client_name: "Sam Lee", date: "2026-09-15", status: "closed", commission_paid_date: null, gci: 9_000, ...over,
});
const run = (deals: ReturnType<typeof deal>[], extra: Record<string, unknown> = {}) =>
  commissionReceivables({ deals, today: TODAY, trackingSince: PAID_DATE_TRACKING_SINCE, ...extra });

describe("what is listed", () => {
  it("a closed deal with no paid date, closed more than the grace period ago", () => {
    const out = run([deal({})]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ address: "12 Elm St", closedOn: "2026-09-15", daysSinceClose: 48, gci: 9_000 });
    expect(out.totalGci).toBe(9_000);
  });

  it("constants: tracking from 2026-01-01, 30 days grace", () => {
    expect(PAID_DATE_TRACKING_SINCE).toBe("2026-01-01");
    expect(RECEIVABLE_GRACE_DAYS).toBe(30);
  });
});

describe("what is not", () => {
  it("a deal with a paid date", () => {
    expect(run([deal({ commission_paid_date: "2026-09-29" })]).items).toEqual([]);
  });

  it("a deal closed before paid dates were recorded (Andrew's 32 pre-2026 closings)", () => {
    expect(run([deal({ date: "2025-12-17" })]).items).toEqual([]);
  });

  it("a deal still inside the grace period is waiting, not listed", () => {
    const out = run([deal({ date: "2026-10-20" })]);
    expect(out.items).toEqual([]);
    expect(out.waiting).toBe(1);
  });

  it("the day the grace ends it is listed", () => {
    expect(run([deal({ date: "2026-10-03" })]).items).toHaveLength(1); // 30 days
    expect(run([deal({ date: "2026-10-04" })]).items).toHaveLength(0); // 29 days
  });

  it("pending and fallen deals, and a deal with no readable date", () => {
    expect(run([deal({ status: "pending" }), deal({ status: "fallen" }), deal({ date: "" })]).items).toEqual([]);
  });
});

describe("the list and the line", () => {
  it("longest outstanding first", () => {
    const out = run([deal({ id: "a", date: "2026-09-30", address: "A" }), deal({ id: "b", date: "2026-08-01", address: "B" })]);
    expect(out.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("one deal: names it; several: counts them and names the oldest", () => {
    expect(receivablesSummaryLine(run([deal({})]))).toBe("12 Elm St closed 48 days ago with no paid date recorded ($9,000 commission).");
    const two = run([deal({ id: "a", date: "2026-09-30", address: "8 Oak Ave", gci: 4_000 }), deal({ id: "b", date: "2026-08-01", address: "3 Pine Rd", gci: 6_000 })]);
    expect(receivablesSummaryLine(two)).toBe("2 closed deals have no paid date recorded, $10,000 in commission; the oldest, 3 Pine Rd, closed 93 days ago.");
    expect(receivablesSummaryLine(run([]))).toBeNull();
  });

  it("the line is information, not advice", async () => {
    const { validateTaxCopy } = await import("../../tax-copy/validate");
    const line = receivablesSummaryLine(run([deal({})]))!;
    expect(validateTaxCopy(line).filter((d) => d.level === "error")).toEqual([]);
    expect(line).not.toMatch(/—/);
  });
});
