/**
 * Staging: fingerprints make a re-import idempotent, and the duplicate check
 * runs on every money-out line. Synthetic fixtures.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import { parseStatementCsv } from "@/lib/import/bank-csv/parse";
import { classifyByRules, unclassified } from "../classify";
import { buildLineRows, fileHash, fingerprintLines } from "../stage";

const RBC = readFileSync(path.join(__dirname, "../../import/bank-csv/__tests__/fixtures/rbc.csv"), "utf8");

function classify(lines: ReturnType<typeof parseStatementCsv>["lines"]) {
  return lines.map((l) => classifyByRules({
    description: l.description, merchant: l.merchant, amount: l.amount, direction: l.direction,
    sourceCategory: l.sourceCategory, sourceBusiness: l.sourceBusiness,
  }) ?? unclassified());
}

describe("fingerprintLines", () => {
  it("is the same for the same file read twice, and for an overlapping export of the same account", () => {
    const first = parseStatementCsv(RBC, { kind: "credit_card" }).lines;
    const again = parseStatementCsv(RBC, { kind: "credit_card" }).lines;
    expect(fingerprintLines(first, "RBC Visa")).toEqual(fingerprintLines(again, "RBC Visa"));
    // The second half of the month exported on its own: those lines match.
    const overlap = first.slice(2);
    expect(fingerprintLines(overlap, "rbc visa")).toEqual(fingerprintLines(first, "RBC Visa").slice(2));
  });

  it("two identical charges in one file are two lines; another account's identical charge is a third", () => {
    const line = { date: "2026-09-10", postedDate: null, description: "COFFEE CO", merchant: "Coffee Co", amount: 2.15, direction: "out" as const, sourceCategory: null, sourceBusiness: null, balance: null, row: 0 };
    const fps = fingerprintLines([line, { ...line, row: 1 }], "RBC Visa");
    expect(new Set(fps).size).toBe(2);
    expect(fingerprintLines([line], "TD Visa")[0]).not.toBe(fps[0]);
    expect(fps.every((f) => /^[0-9a-f]{64}$/.test(f))).toBe(true);
  });

  it("file hashes are SHA-256 hex", () => {
    expect(fileHash(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("buildLineRows", () => {
  const lease: RecurringExpense = {
    id: "lease", user_id: "u1", name: "Car lease", amount: 32.18, category_key: "vehicle_payment", frequency: "monthly",
    day_of_month: 4, month_of_year: null, hst_included: false, hst_amount: 0, vehicle_pct_applicable: true, notes: "",
    start_date: "2026-01-01", end_date: null, is_active: true, created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-01T12:00:00Z",
  };

  it("flags lines already on file, and keeps estimates and amounts as parsed", () => {
    const lines = parseStatementCsv(RBC, { kind: "credit_card" }).lines;
    let n = 0;
    const rows = buildLineRows({
      userId: "u1",
      statementId: "s1",
      lines,
      fingerprints: fingerprintLines(lines, "RBC Visa"),
      classifications: classify(lines),
      receipts: [{ id: "r-shell", expense_date: "2026-09-03", total_amount: 54.2, vendor: "Shell", statement_line_id: null }],
      recurring: [lease],
      newId: () => `line-${n++}`,
    });
    const byDesc = (d: string) => rows.find((r) => r.description.startsWith(d))!;
    expect(byDesc("SHELL")).toMatchObject({ match_receipt_id: "r-shell", match_method: "exact", duplicate_candidate_count: 1, status: "pending", amount: 54.2, direction: "out" });
    // Staples on the 4th for 32.18 is the recurring charge on the 4th.
    expect(byDesc("STAPLES")).toMatchObject({ recurring_expense_id: "lease", recurring_charge_date: "2026-09-04" });
    expect(byDesc("PAYMENT")).toMatchObject({ status: "skipped", skip_reason: "payment", direction: "in", match_receipt_id: null });
    expect(rows.every((r) => r.user_id === "u1" && r.statement_id === "s1")).toBe(true);
  });

  it("a personal-looking line with a receipt on file goes to review instead of being skipped", () => {
    const line = { date: "2026-09-12", postedDate: null, description: "SOBEYS #432", merchant: "Sobeys", amount: 61.4, direction: "out" as const, sourceCategory: null, sourceBusiness: null, balance: null, row: 0 };
    const [row] = buildLineRows({
      userId: "u1", statementId: "s1", lines: [line], fingerprints: fingerprintLines([line], "Card"),
      classifications: classify([line]),
      receipts: [{ id: "r1", expense_date: "2026-09-12", total_amount: 61.4, vendor: "Sobeys", statement_line_id: null }],
      recurring: [],
      newId: () => "l1",
    });
    expect(row).toMatchObject({ status: "pending", skip_reason: null, match_receipt_id: "r1" });
  });
});
