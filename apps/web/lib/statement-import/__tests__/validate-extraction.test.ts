/**
 * What the model reads from a PDF statement is checked in code: dates inside
 * the period, signs, totals, line count, account numbers. Never adds a line.
 * Synthetic extractions only.
 */
import { describe, expect, it } from "vitest";
import { betterReading } from "../pdf-extract";
import { UNVERIFIED_WARNING, validatePdfExtraction, type ExtractedPdfStatement } from "../validate-extraction";

const TODAY = "2026-10-18";

function card(overrides: Partial<ExtractedPdfStatement> = {}): ExtractedPdfStatement {
  return {
    institution: "Example Bank",
    kind: "credit_card",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    currency: "CAD",
    opening_balance: 100,
    closing_balance: 184.2,
    total_out: 134.2,
    total_in: 50,
    lines: [
      { date: "2026-08-29", posted_date: "2026-09-01", description: "FUEL MART 22", amount: 54.2, direction: "out" },
      { date: "2026-09-10", posted_date: null, description: "PAYMENT THANK YOU", amount: 50, direction: "in" },
      { date: "2026-09-15", posted_date: null, description: "PHOTO STUDIO 4510123412341234", amount: 80, direction: "out" },
    ],
    ...overrides,
  };
}

describe("validatePdfExtraction", () => {
  it("accepts lines that fit the period (a week's grace before it) and reconcile with the printed totals and balances", () => {
    const v = validatePdfExtraction(card(), TODAY);
    expect(v.ok).toBe(true);
    expect(v.reconciled).toBe(true);
    expect(v.verification).toBe("reconciled");
    expect(v.lines.map((l) => [l.date, l.amount, l.direction])).toEqual([
      ["2026-08-29", 54.2, "out"],
      ["2026-09-10", 50, "in"],
      ["2026-09-15", 80, "out"],
    ]);
    expect(v.lines[2].description).toBe("PHOTO STUDIO");
    expect([v.periodStart, v.periodEnd]).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("swaps money in and out when only the swapped reading adds up", () => {
    const flipped = card({
      lines: card().lines.map((l) => ({ ...l, direction: l.direction === "out" ? "in" as const : "out" as const })),
    });
    const v = validatePdfExtraction(flipped, TODAY);
    expect(v.reconciled).toBe(true);
    expect(v.lines.map((l) => l.direction)).toEqual(["out", "in", "out"]);
    expect(v.warnings.join(" ")).toMatch(/swapped/);
  });

  it("says so when the lines don't add up to the printed totals (a missing line), and keeps what it read", () => {
    const v = validatePdfExtraction(card({ lines: card().lines.slice(0, 2) }), TODAY);
    expect(v.ok).toBe(true);
    expect(v.reconciled).toBe(false);
    expect(v.lines).toHaveLength(2);
    expect(v.warnings.join(" ")).toMatch(/don't add up/);
  });

  it("leaves out lines dated outside the period, and fails when many are", () => {
    const one = validatePdfExtraction(card({
      total_out: null, total_in: null, opening_balance: null, closing_balance: null,
      lines: [...card().lines, ...Array.from({ length: 9 }, (_, i) => ({ date: `2026-09-${String(i + 11).padStart(2, "0")}`, posted_date: null, description: `STORE ${i}`, amount: 5, direction: "out" as const })), { date: "2026-03-01", posted_date: null, description: "OLD", amount: 9, direction: "out" as const }],
    }), TODAY);
    expect(one.ok).toBe(true);
    expect(one.lines).toHaveLength(12);
    expect(one.warnings.join(" ")).toMatch(/outside the statement period/);

    const many = validatePdfExtraction(card({ lines: card().lines.map((l) => ({ ...l, date: "2025-09-10" })) }), TODAY);
    expect(many.ok).toBe(false);
  });

  it("leaves out a date still to come or unreadable, and a zero or missing amount", () => {
    const v = validatePdfExtraction(card({
      total_out: null, total_in: null, opening_balance: null, closing_balance: null, period_end: "2026-10-31",
      lines: [
        ...card().lines,
        { date: "2026-10-25", posted_date: null, description: "FUTURE", amount: 5, direction: "out" },
        { date: "Sept 31", posted_date: null, description: "BAD DATE", amount: 5, direction: "out" },
        { date: "2026-09-20", posted_date: null, description: "ZERO", amount: 0, direction: "out" },
      ],
    }), TODAY);
    expect(v.lines).toHaveLength(3);
    expect(v.warnings.join(" ")).toMatch(/no readable date/);
    expect(v.warnings.join(" ")).toMatch(/no readable amount/);
  });

  it("fails with no lines, too many, a foreign currency, or the same line over and over", () => {
    expect(validatePdfExtraction(card({ lines: [] }), TODAY).ok).toBe(false);
    expect(validatePdfExtraction(card({ currency: "USD" }), TODAY).ok).toBe(false);
    expect(validatePdfExtraction(card({ lines: Array.from({ length: 1501 }, () => card().lines[0]) }), TODAY).ok).toBe(false);
    const looped = validatePdfExtraction(card({ total_out: null, total_in: null, opening_balance: null, closing_balance: null, lines: Array.from({ length: 40 }, () => card().lines[2]) }), TODAY);
    expect(looped.ok).toBe(false);
  });

  it("the agent's account kind wins over the model's, and signs are never flipped on balances alone", () => {
    // The reviewer's case: a card statement imported as "bank", balances only,
    // with a $500 card payment. Read as a bank account, flipping every line
    // would "reconcile" and turn the payment into a charge. It must not.
    const lines = [
      { date: "2026-09-05", posted_date: null, description: "STORE A", amount: 200, direction: "out" as const },
      { date: "2026-09-10", posted_date: null, description: "PAYMENT THANK YOU", amount: 500, direction: "in" as const },
      { date: "2026-09-15", posted_date: null, description: "STORE B", amount: 100, direction: "out" as const },
    ];
    // Card: 1000 owed + 300 charges - 500 paid = 800 owed.
    const raw = card({ kind: "credit_card", total_out: null, total_in: null, opening_balance: 1000, closing_balance: 800, lines });
    const asBank = validatePdfExtraction(raw, TODAY, "bank");
    expect(asBank.kind).toBe("bank");
    expect(asBank.verification).toBe("mismatch");
    expect(asBank.lines.find((l) => l.description.startsWith("PAYMENT"))?.direction).toBe("in");
    expect(asBank.warnings.join(" ")).toMatch(/reads like a credit card statement, but it was imported as a bank account/);
    const asCard = validatePdfExtraction(raw, TODAY, "credit_card");
    expect(asCard.verification).toBe("reconciled");
  });

  it("with no totals or balances printed, the import is unverified and says so", () => {
    const v = validatePdfExtraction(card({ total_out: null, total_in: null, opening_balance: null, closing_balance: null }), TODAY);
    expect(v.ok).toBe(true);
    expect(v.verification).toBe("unverified");
    expect(v.reconciled).toBeNull();
    expect(v.warnings).toContain(UNVERIFIED_WARNING);
  });

  it("a bank statement's balance goes down with money out", () => {
    const v = validatePdfExtraction(card({ kind: "bank", opening_balance: 1000, closing_balance: 915.8, total_out: null, total_in: null }), TODAY);
    expect(v.reconciled).toBe(true);
  });
});

describe("betterReading", () => {
  it("prefers a reading that works, then one that reconciles, then fewer warnings", () => {
    const good = validatePdfExtraction(card(), TODAY);
    const short = validatePdfExtraction(card({ lines: card().lines.slice(0, 2) }), TODAY);
    const failed = validatePdfExtraction(card({ lines: [] }), TODAY);
    expect(betterReading(short, good)).toBe(good);
    expect(betterReading(failed, short)).toBe(short);
    expect(betterReading(null, good)).toBe(good);
  });

  it("never drops a mismatch: a reading that found no totals is marked a mismatch when the other found one", () => {
    const short = validatePdfExtraction(card({ lines: card().lines.slice(0, 2) }), TODAY);
    expect(short.verification).toBe("mismatch");
    const noTotals = validatePdfExtraction(card({ total_out: null, total_in: null, opening_balance: null, closing_balance: null }), TODAY);
    expect(noTotals.verification).toBe("unverified");
    const kept = betterReading(noTotals, short)!;
    expect(kept.verification).toBe("mismatch");
    expect(kept.warnings.some((w) => w.startsWith("The lines read don't add up"))).toBe(true);
    expect(kept.warnings).not.toContain(UNVERIFIED_WARNING);
    expect(kept.statedTotalOut).toBe(134.2);
  });
});
