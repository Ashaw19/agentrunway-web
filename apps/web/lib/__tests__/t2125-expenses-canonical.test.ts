/**
 * REGRESSION TRIPWIRE — what an expense counts for on the T2125 comes from
 * t2125-expenses-engine (2026-10-13).
 *
 * The Reports page used to build the T2125 input itself and the Expenses page
 * worked out deductible amounts row by row, each with its own
 * `EXPENSE_KEY_TO_T2125[item.key]` lookup over receipts and the legacy
 * per-item monthly figure. Neither read the Recurring Expenses list, so a
 * lease or board dues kept there reached no T2125 line and no "Est. Tax
 * Deductible" figure, and the two screens could disagree with each other.
 *
 * The fix is `@agent-runway/core/engines/t2125-expenses-engine`:
 *
 *   buildT2125Expenses({ receiptTotals, expenseItems, recurringExpenses, ctx })
 *     .entries / .homeOfficeCosts   → computeT2125 (Reports page)
 *     .lines / .byRule / totals     → Expenses page
 *
 * Three shapes are scanned for, in web and mobile source:
 *   1. a read of the per-key map (`EXPENSE_KEY_TO_T2125`) or of a line's
 *      limits (`.deductiblePct`, `.applyVehicleUse`): deductible arithmetic
 *      done outside the engine
 *   2. `t2125EntriesFromAmounts(`: T2125 entries assembled from a key → amount
 *      map, which is how the recurring list was left out
 *   3. a `computeT2125(` call in a tree where nothing calls
 *      `buildT2125Expenses(`
 *
 * A regex can't prove a figure is right, only that it didn't bypass the
 * engine. The numbers are tested in
 * packages/core/engines/__tests__/t2125-expenses-engine.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { T2125_OTHER_EXPENSES, t2125LineForExpenseKey } from "@agent-runway/core/engines/t2125-engine";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const ROOTS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/stores",
  "apps/mobile/lib",
] as const;

const HAND_ROLLED = /\bEXPENSE_KEY_TO_T2125\b|\.deductiblePct\b|\.applyVehicleUse\b|\bt2125EntriesFromAmounts\s*\(/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return; // an optional root (apps/mobile/lib) that doesn't exist
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__" || entry.startsWith(".")) continue;
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(path.join(REPO_ROOT, dir));
  return out;
}

const rel = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join("/");
const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

describe("REGRESSION — T2125 expense treatment comes from t2125-expenses-engine", () => {
  const files = ROOTS.flatMap(sourceFiles);
  const sources = new Map(files.map((file) => [rel(file), readFileSync(file, "utf8")]));

  it("finds the two screens (guards against a broken walker)", () => {
    expect(files.length).toBeGreaterThan(300);
    expect([...sources.keys()]).toEqual(
      expect.arrayContaining([
        "apps/web/app/(app)/reports/page.tsx",
        "apps/web/app/(app)/reports/reports-t2125-tab.tsx",
        "apps/web/app/(app)/expenses/expenses-content.tsx",
        "apps/web/components/pdf/expense-export-pdf.tsx",
      ]),
    );
  });

  it("the Reports page and the Expenses page both call buildT2125Expenses", () => {
    for (const file of ["apps/web/app/(app)/reports/page.tsx", "apps/web/app/(app)/expenses/expenses-content.tsx"]) {
      expect(sources.get(file), file).toMatch(/\bbuildT2125Expenses\s*\(/);
    }
  });

  it("nothing outside the engine reads the per-key map or works out a deductible amount", () => {
    const offenders: string[] = [];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(HAND_ROLLED)) offenders.push(`${file}:${lineOf(src, m.index ?? 0)} ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("computeT2125 is only called where the entries come from buildT2125Expenses", () => {
    const callers = [...sources].filter(([, src]) => /\bcomputeT2125\s*\(/.test(src)).map(([file]) => file);
    // The T2125 tab: its `expenses` prop is the Reports page's
    // buildT2125Expenses(...).entries, passed through reports-content.
    expect(callers).toEqual(["apps/web/app/(app)/reports/reports-t2125-tab.tsx"]);
    expect(sources.get("apps/web/app/(app)/reports/page.tsx")).toMatch(/t2125Expenses=\{t2125Expenses\.entries\}/);
    expect(sources.get("apps/web/app/(app)/reports/reports-content.tsx")).toMatch(/expenses=\{t2125Expenses\}/);
  });

  it("a category-level key is treated as the item migration 00175 moved such rows to", () => {
    const sql = readFileSync(
      path.join(REPO_ROOT, "apps/web/supabase/migrations/00175_expense_category_keys_to_item_keys.sql"),
      "utf8",
    );
    const pairs = [...sql.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)].map((m) => [m[1], m[2]] as const);
    expect(pairs.length).toBe(12);
    for (const [categoryKey, itemKey] of pairs) {
      expect(t2125LineForExpenseKey(itemKey), itemKey).not.toBe(T2125_OTHER_EXPENSES);
      expect(t2125LineForExpenseKey(categoryKey), categoryKey).toBe(t2125LineForExpenseKey(itemKey));
    }
  });

  it("the regex catches the hand-rolled shapes and spares the canonical ones", () => {
    const bad = [
      `const map = EXPENSE_KEY_TO_T2125[item.key];`,
      `acc.meals += ytd * map.deductiblePct;`,
      `if (map.applyVehicleUse) return s + ytd * vehiclePct;`,
      `expenses: t2125EntriesFromAmounts(receiptTotals.byKey),`,
    ];
    const good = [
      `const tracked = buildT2125Expenses({ receiptTotals, expenseItems, recurringExpenses, ctx });`,
      `const deductAmt = line?.deductibleAmount ?? 0;`,
      `acc[line.rule] += line.deductibleAmount;`,
      `t2125LineForExpenseKey(l.key) === T2125_OTHER_EXPENSES`,
    ];
    for (const s of bad) expect([...s.matchAll(HAND_ROLLED)].length, s).toBeGreaterThan(0);
    for (const s of good) expect([...s.matchAll(HAND_ROLLED)], s).toHaveLength(0);
  });
});
