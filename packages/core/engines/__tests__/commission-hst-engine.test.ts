/**
 * The GST/HST on a commission, from the brokerage's statement (2026-10-19).
 *
 * The real statement behind this: a $7,000 commission (Royal LePage, plan
 * 75/25, NB). The brokerage paid the agent $777 of HST: 15% of $5,180, the
 * agent's share after the $1,750 split and the $70 franchise fee. Its
 * "To-Date" column also showed a January payment of $1,609.50 HST on a
 * $14,500 commission (15% of $10,730) for a deal that closed in December.
 * Agent Runway's GST/HST return card showed $7,000 and $1,050 for Q1 and left
 * the January payment in the previous year's Q4.
 */
import { describe, expect, it } from "vitest";
import {
  commissionHst,
  commissionHstInput,
  commissionHstTotals,
  commissionsInGstHstPeriod,
  gstHstCommissionDate,
  gstHstCommissionTiming,
  recordedCommissionHst,
  recordedCommissionHstShare,
} from "../commission-hst-engine";
import { computeGST34 } from "../gst34-engine";
import { computeHSTCollected } from "../hst-engine";
import { getFilingPeriods } from "../filing-period-engine";
import { toPlanDeals } from "../real-compensation-engine";

const NB = 0.15;
/** The two deals, as `transactions` rows. */
const DECEMBER = {
  date: "2025-12-17", commission_paid_date: "2026-01-15",
  sale_price: 580_000, commission_pct: 0.025, team_split_pct: null, gci_override: null,
  commission_hst: "1609.50", // numeric columns can arrive as strings
};
const MARCH = {
  date: "2026-03-27", commission_paid_date: "2026-03-30",
  sale_price: 0, commission_pct: 0, team_split_pct: null, gci_override: 7_000,
  commission_hst: 777,
};
const NO_STATEMENT = { ...MARCH, commission_hst: null };

describe("one commission", () => {
  it("uses the statement's HST, on the commission it was charged on", () => {
    expect(commissionHst(commissionHstInput(MARCH), NB)).toEqual({ base: 5_180, hst: 777, recorded: true });
    const dec = commissionHst(commissionHstInput(DECEMBER), NB);
    expect(dec.recorded).toBe(true);
    expect(dec.hst).toBe(1_609.5);
    expect(dec.base).toBeCloseTo(10_730, 6);
  });

  it("without a statement figure, estimates the rate × the full commission (as before)", () => {
    expect(commissionHst(commissionHstInput(NO_STATEMENT), NB)).toEqual({ base: 7_000, hst: 1_050, recorded: false });
  });

  it("$0 entered is a statement figure (a brokerage that paid no HST): no HST, the full commission still revenue; blank or junk is not", () => {
    expect(recordedCommissionHst({ commission_hst: 0 })).toBe(0);
    expect(commissionHst({ gci: 7_000, recordedHst: 0 }, NB)).toEqual({ base: 7_000, hst: 0, recorded: true });
    // Line 101 never exceeds the commission (15% entered in a 5% GST province).
    expect(commissionHst({ gci: 7_000, recordedHst: 1_050 }, 0.05)).toEqual({ base: 7_000, hst: 1_050, recorded: true });
    expect(recordedCommissionHst({ commission_hst: null })).toBeNull();
    expect(recordedCommissionHst({ commission_hst: "" })).toBeNull();
    expect(recordedCommissionHst({ commission_hst: "abc" })).toBeNull();
    expect(recordedCommissionHst({ commission_hst: -5 })).toBeNull();
    expect(recordedCommissionHst({})).toBeNull();
  });

  it("totals say which deals carry the statement's figure", () => {
    const t = commissionHstTotals([commissionHstInput(MARCH), commissionHstInput({ ...NO_STATEMENT, gci_override: 2_000 })], NB);
    expect(t).toMatchObject({ recordedCount: 1, recordedHst: 777, estimatedCount: 1 });
    expect(t.estimatedHst).toBeCloseTo(300, 10);
    expect(t.hst).toBeCloseTo(1_077, 10);
    expect(t.base).toBeCloseTo(7_180, 10);
  });
});

describe("which return a commission goes on", () => {
  it("closing date unless the setting says exactly 'paid'", () => {
    expect(gstHstCommissionTiming(null)).toBe("closing");
    expect(gstHstCommissionTiming({})).toBe("closing");
    expect(gstHstCommissionTiming({ gst_hst_commission_timing: "closing" })).toBe("closing");
    expect(gstHstCommissionTiming({ gst_hst_commission_timing: "PAID" })).toBe("closing");
    expect(gstHstCommissionTiming({ gst_hst_commission_timing: "paid" })).toBe("paid");
  });

  it("by date paid, the December deal paid in January is in Q1; by closing date it isn't", () => {
    expect(gstHstCommissionDate(DECEMBER, "closing")).toBe("2025-12-17");
    expect(gstHstCommissionDate(DECEMBER, "paid")).toBe("2026-01-15");
    expect(gstHstCommissionDate({ date: "2026-02-01", commission_paid_date: null }, "paid")).toBe("2026-02-01");
    const [Q1] = getFilingPeriods("quarterly", 2026);
    expect(commissionsInGstHstPeriod([DECEMBER, MARCH], Q1.startDate, Q1.endDate, "closing")).toEqual([MARCH]);
    expect(commissionsInGstHstPeriod([DECEMBER, MARCH], Q1.startDate, Q1.endDate, "paid")).toEqual([DECEMBER, MARCH]);
  });
});

describe("the Q1 2026 return", () => {
  const [Q1] = getFilingPeriods("quarterly", 2026);
  const gst34 = (deals: object[], timing: "closing" | "paid") =>
    computeGST34({
      province: "newBrunswick",
      period: Q1,
      frequency: "quarterly",
      periodTransactions: commissionsInGstHstPeriod(deals as (typeof MARCH)[], Q1.startDate, Q1.endDate, timing).map(commissionHstInput),
      periodReceipts: [],
      instalmentsPaid: 0,
      vehicleBusinessUsePct: 0.8,
      commissionTiming: timing,
    });

  it("with both statement figures and paid-date timing: $15,910 and $2,386.50, the statement's HST to date", () => {
    const r = gst34([DECEMBER, MARCH], "paid");
    expect(r.line101).toBeCloseTo(15_910, 6);
    expect(r.line103).toBeCloseTo(2_386.5, 6);
    const l101 = r.filingLines.find((l) => l.line === "101")!;
    const l103 = r.filingLines.find((l) => l.line === "103")!;
    expect(l101.amount).toBe(15_910);
    expect(l103.amount).toBe(2_386.5);
    expect(l101.note).toContain("placed by the date each commission was paid");
    expect(l103.note).toContain("HST your commission statements show for 2 deals: $2386.50");
  });

  it("by closing date, only the March deal: $5,180 and $777", () => {
    const r = gst34([DECEMBER, MARCH], "closing");
    expect(r.line101).toBeCloseTo(5_180, 6);
    expect(r.line103).toBe(777);
  });

  it("with nothing entered it is exactly the old figure: $7,000 and $1,050, 'Line 101 × 15%'", () => {
    const r = gst34([{ ...DECEMBER, commission_hst: null }, NO_STATEMENT], "closing");
    expect(r.line101).toBe(7_000);
    expect(r.line103).toBeCloseTo(1_050, 10);
    expect(r.filingLines.find((l) => l.line === "103")!.note).toBe("Line 101 × 15%");
    expect(r.filingLines.find((l) => l.line === "101")!.note).toBe("Commission income (GCI) from 1 closed deal in Q1 2026, before HST");
    expect(r.commissionHst).toMatchObject({ recordedCount: 0, estimatedCount: 1 });
  });

  it("a mix says which deal is estimated", () => {
    const r = gst34([{ ...DECEMBER, commission_hst: null }, MARCH], "paid");
    expect(r.line103).toBeCloseTo(777 + 14_500 * NB, 6);
    expect(r.filingLines.find((l) => l.line === "103")!.note).toBe(
      "HST your commission statements show for 1 deal: $777.00, plus 15% of the full commission on 1 deal with no statement figure entered: $2175.00",
    );
  });
});

describe("HST collected year to date (dashboard, cash position, Flight Crew, connector)", () => {
  it("the statement's HST replaces the estimate on its deals only", () => {
    const deals = toPlanDeals([], [MARCH, { ...NO_STATEMENT, gci_override: 2_000, date: "2026-05-01" }]);
    expect(deals.map((d) => d.recordedHst)).toEqual([777, null]);
    const ytdGCI = deals.reduce((s, d) => s + d.gci, 0);
    const collected = computeHSTCollected({
      ytdGCI, hstRate: NB, isRegistered: true, brokerageWithholdsHst: false,
      recorded: recordedCommissionHstShare(deals),
    });
    expect(collected).toBeCloseTo(777 + 2_000 * NB, 10);
  });

  it("without `recorded` (or with nothing entered) it is the old estimate", () => {
    expect(computeHSTCollected({ ytdGCI: 7_000, hstRate: NB, isRegistered: true, brokerageWithholdsHst: false })).toBeCloseTo(1_050, 10);
    expect(computeHSTCollected({
      ytdGCI: 7_000, hstRate: NB, isRegistered: true, brokerageWithholdsHst: false, recorded: { gci: 0, hst: 0 },
    })).toBeCloseTo(1_050, 10);
  });

  it("not registered, or the brokerage withholds: still $0", () => {
    const recorded = { gci: 7_000, hst: 777 };
    expect(computeHSTCollected({ ytdGCI: 7_000, hstRate: NB, isRegistered: false, brokerageWithholdsHst: false, recorded })).toBe(0);
    expect(computeHSTCollected({ ytdGCI: 7_000, hstRate: NB, isRegistered: true, brokerageWithholdsHst: true, recorded })).toBe(0);
  });
});
