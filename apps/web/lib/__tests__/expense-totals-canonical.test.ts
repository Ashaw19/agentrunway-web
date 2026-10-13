/**
 * REGRESSION TRIPWIRE — expense totals come from expense-totals-engine
 * (2026-10-13).
 *
 * `receipt_expenses.total_amount` and `recurring_expenses.amount` are what was
 * PAID, GST/HST included. Until this date a dozen surfaces summed them
 * directly, so a GST/HST registrant's expenses carried tax the GST34 summary
 * also claims as an input tax credit: counted twice, on the Expenses KPI, the
 * expense ratio, the T2125 lines and the income-tax estimate.
 *
 * The fix is `@agent-runway/core/engines/expense-totals-engine`:
 *
 *   aggregateReceiptTotals(rows, ctx)        receipt totals, net of ITCs
 *   expenseNetOfItc(total, tax, key, ctx)    one expense
 *   recurringExpensesNetOfItc(list, ctx)     recurring, before any total
 *
 * Three shapes are scanned for, in web and mobile source:
 *   1. arithmetic on `x.total_amount` (a hand-rolled sum)
 *   2. a recurring total (totalRecurringMonthly / totalRecurringYTD /
 *      projectedAnnualRecurring) in a file that never nets the list
 *   3. a `receipt_expenses` select that reads `total_amount` without
 *      `tax_amount` (the engine then has no tax to take off)
 *
 * A regex can't prove a total is right, only that it didn't bypass the
 * engine. The numbers are tested in
 * packages/core/engines/__tests__/expense-totals-engine.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** `sum + Number(r.total_amount`, `total += exp.total_amount`, `s + (r.total_amount ?? 0)`. */
const SUMS_TOTAL_AMOUNT = /(?:\+=|\+)\s*(?:Number\(\s*)?\(?\s*[A-Za-z_$][\w$]*\.total_amount\b/g;

/** A recurring-expense total from recurring-expense-engine. */
const RECURRING_TOTAL = /\b(?:totalRecurringMonthly|totalRecurringYTD|projectedAnnualRecurring)\s*\(/;

/** `.from("receipt_expenses").select("…")` with the column list captured. */
const RECEIPT_SELECT = /\.from\(\s*["']receipt_expenses["']\s*\)\s*\.select\(\s*["'`]([^"'`]*)["'`]/g;

/**
 * Known matches left in place, counted per file so a new one still fails and
 * a fixed one forces this list to shrink.
 */
const ALLOWED_SUMS: Record<string, { count: number; why: string }> = {
  "apps/web/components/pdf/expense-export-pdf.tsx": {
    count: 1,
    why: "Footer of the receipt LOG: the amounts paid, beside a Tax/HST column. Not an expense total.",
  },
};

const ALLOWED_SELECTS: Record<string, { count: number; why: string }> = {
  "apps/web/lib/ai/tools.ts": {
    count: 2,
    why: "Per-receipt reads (search results, edit diff) that show one receipt's amount paid. No total.",
  },
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(REPO_ROOT, dir);
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
  walk(abs);
  return out;
}

const rel = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join("/");
const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

describe("REGRESSION — expense totals are net of ITCs through expense-totals-engine", () => {
  const files = ROOTS.flatMap(sourceFiles);

  it("finds the files that total expenses (guards against a broken walker)", () => {
    expect(files.length).toBeGreaterThan(300);
    for (const must of [
      "apps/web/app/(app)/dashboard/page.tsx",
      "apps/web/app/(app)/expenses/expenses-content.tsx",
      "apps/web/app/api/chat/route.ts",
      "apps/web/lib/ai/tools.ts",
      "apps/mobile/app/(app)/profile/expenses.tsx",
    ]) {
      expect(files.map(rel)).toContain(must);
    }
  });

  it("nothing sums total_amount by hand outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const r = rel(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(SUMS_TOTAL_AMOUNT)) {
        if (ALLOWED_SUMS[r]) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED_SUMS)) {
      expect({ file: r, matches: allowedSeen[r] ?? 0 }).toEqual({ file: r, matches: count });
    }
  });

  it("every file that totals recurring expenses nets them first", () => {
    const offenders = files
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        return RECURRING_TOTAL.test(src) && !src.includes("recurringExpensesNetOfItc");
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("every receipt_expenses read of total_amount also reads tax_amount", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const r = rel(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(RECEIPT_SELECT)) {
        const cols = m[1];
        if (cols.trim() === "*" || !/\btotal_amount\b/.test(cols) || /\btax_amount\b/.test(cols)) continue;
        if (ALLOWED_SELECTS[r]) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)} select("${cols}")`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED_SELECTS)) {
      expect({ file: r, matches: allowedSeen[r] ?? 0 }).toEqual({ file: r, matches: count });
    }
  });

  it("the regexes catch the hand-rolled shapes and spare the canonical ones", () => {
    const badSums = [
      `rows.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)`,
      `byCategory[key].total += Number(exp.total_amount);`,
      `grandTotal += exp.total_amount;`,
      `receipts.reduce((s, r) => s + (r.total_amount ?? 0), 0)`,
    ];
    const goodSums = [
      `const receiptYTD = aggregateReceiptTotals(rows, taxCtx).total;`,
      `const amt = expenseNetOfItc(r.total_amount, r.tax_amount, r.category_key, ctx).net;`,
      `{r.total_amount != null ? fmtCurrency(r.total_amount) : "—"}`,
      `total_amount: amount,`,
    ];
    for (const s of badSums) expect([...s.matchAll(SUMS_TOTAL_AMOUNT)], s).toHaveLength(1);
    for (const s of goodSums) expect([...s.matchAll(SUMS_TOTAL_AMOUNT)], s).toHaveLength(0);

    const select = (s: string) => [...s.matchAll(RECEIPT_SELECT)].map((m) => m[1]);
    expect(select(`supabase.from("receipt_expenses").select("total_amount").eq("user_id", id)`)).toEqual(["total_amount"]);
    expect(select(`supabase\n  .from("receipt_expenses")\n  .select("category_key, total_amount, tax_amount")`)).toEqual([
      "category_key, total_amount, tax_amount",
    ]);
  });
});
