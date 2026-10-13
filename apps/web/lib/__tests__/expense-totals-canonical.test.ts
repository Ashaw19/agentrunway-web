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
 *   4. (Home Office bills, same day) a `receipt_expenses` select that reads
 *      `total_amount` without `category_key`: the engine can't tell a home
 *      bill from any other expense, so a $300 power bill counts as $300
 *      instead of the home office share
 *   5. a `user_settings` select that reads `vehicle_business_use_pct` (the
 *      slice an expense context is built from) without
 *      `home_office_business_use_pct`: home bills then count for $0 on that
 *      surface and at the share on every other
 *   6. a `receipt_expenses` query capped at a small `.limit(N)`. The web
 *      Expenses page and the mobile store both loaded "the last 50" and then
 *      totalled or filtered that list, so past 50 receipts a year the GST34
 *      summary, the exports and the mobile totals went short without an
 *      error. A list for display pages on screen; it is not capped in the
 *      query
 *   7. (recurring charge dates, same day) the year's expenses projected as a
 *      monthly figure × months left. Year to date counts a recurring expense
 *      by its charge dates, so what is still to come has to be counted the
 *      same way (`remainingYearExpenses`, `totals.expensesRemaining`):
 *      otherwise a charge due later this month is in neither, and an annual
 *      fee is a twelfth per month left whether it has been charged or not.
 *      Eight surfaces carried their own copy of that multiplication
 *   8. a YEAR-TO-DATE total combined by hand. Receipts, the per-item monthly
 *      figure (`expense_items.monthly_recurring`) and the Recurring Expenses
 *      list are combined in one place, `ytdExpenseTotals`
 *      (t2125-expenses-engine), whose total is the sum of the Expenses
 *      page's lines. Until 2026-10-13 ten surfaces did it themselves with
 *      `Math.max(receiptTotal, legacyMonthlyRecurring * months) + recurring`,
 *      which compared the two totals and dropped the smaller side whole: an
 *      account with monthly figures on some items and receipts on others read
 *      lower on its dashboard than on its Expenses page
 *   9. a category table built from receipts alone (`receiptTotalsByKey`)
 *      under a Total that holds all three sources, so the rows come short of
 *      it. Category rows come from `expenseCategoryRows`
 *      (lib/expenses/category-lines)
 *  10. a card that reads as the year's expenses ("YTD Total", "YTD
 *      Expenses") on a screen that never loads all three sources. The mobile
 *      Expenses screen showed this year's receipts under "YTD Total": the
 *      phone's store holds receipts only, so an account with recurring
 *      expenses or monthly figures read lower there than on the web. The
 *      card is "Receipts YTD" (`receiptTotalsToDate`); a mobile file may
 *      carry a year-to-date expenses label only if it calls
 *      `ytdExpenseTotals`
 *  11. a year's recurring expenses worked out as a monthly figure × 12. The
 *      dashboard's next-year plan did that until 2026-10-13, so a lease with
 *      an end date of Dec 31 was counted for all twelve months of the next
 *      year until Jan 1, and a row starting in July for the whole year. A
 *      recurring expense has dates: a year costs the charge dates that fall
 *      in it (`totalRecurringInYear`). Next year's figure is
 *      `ytdExpenseTotals(...).expensesNextYear`, and the plan
 *      (year-plan-engine `planTakeHome`) is handed it
 *
 * A regex can't prove a total is right, only that it didn't bypass the
 * engine. The numbers are tested in
 * packages/core/engines/__tests__/expense-totals-engine.test.ts,
 * t2125-expenses-engine.test.ts and cross-surface-parity.test.ts.
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
  // The MCP server (Deno). Its totals come from the same engine through
  // mcp-server/lib/expense-inputs.ts.
  "apps/web/supabase/functions",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/stores",
  "apps/mobile/lib",
] as const;

/** `sum + Number(r.total_amount`, `total += exp.total_amount`, `s + (r.total_amount ?? 0)`. */
const SUMS_TOTAL_AMOUNT = /(?:\+=|\+)\s*(?:Number\(\s*)?\(?\s*[A-Za-z_$][\w$]*\.total_amount\b/g;

/** A recurring-expense total from recurring-expense-engine. */
const RECURRING_TOTAL = /\b(?:totalRecurringMonthly|totalRecurringYTD|totalRecurringInYear|projectedAnnualRecurring)\s*\(/;

/**
 * `monthlyRecurring * expRemainingMonths`, `input.monthlyRecurringExpenses * remainingMonths`:
 * a monthly recurring figure times the months left in the year.
 */
const MONTHLY_TIMES_MONTHS_LEFT =
  /\b(?:monthlyRecurring|monthlyRecurringExpenses|recurringExpMonthly|recurringMonthly)\s*\*\s*(?:\w+\.)?(?:expRemainingMonths|remainingMonths|monthsRemaining|monthsLeft)\b/g;

/**
 * `monthlyRecurring * 12`, `Math.max(0, monthlyRecurring) * 12`,
 * `totals.monthlyRecurring * 12`, `totalRecurringMonthly(list, now) * 12`: a
 * monthly recurring figure multiplied out into a year.
 */
const MONTHLY_TIMES_TWELVE =
  /\b(?:monthlyRecurring|monthlyRecurringExpenses|recurringExpMonthly|recurringMonthly|recurringListMonthly|monthlyTotal)\)?\s*\*\s*12\b|\b(?:totalRecurringMonthly|recurringMonthlyRunRate|recurringMonthlyEquivalent|recurringMonthlyForCategory)\s*\((?:[^()]|\([^()]*\))*\)\s*\*\s*12\b/g;

const ALLOWED_MONTHLY_TIMES_TWELVE: Record<string, { count: number; why: string }> = {
  "apps/web/app/(app)/expenses/expenses-content.tsx": {
    count: 1,
    why: "Footer of the Recurring Expenses list: \"Annual total\" beside \"Monthly avg\", the list's monthly figure as charged, annualised. It names no year and feeds no other figure.",
  },
};

/** Engines that project the year too (effective-cash, advisor-engine). */
const CORE_ENGINES = "packages/core/engines";

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

/** `.from("user_settings").select("…")` with the column list captured. */
const SETTINGS_SELECT = /\.from\(\s*["']user_settings["']\s*\)\s*\.select\(\s*(?:\/\/[^\n]*\n\s*)*["'`]([^"'`]*)["'`]/g;

/** A `receipt_expenses` query and the `.limit(N)` on it (same statement, before the next `.from(`). */
const RECEIPT_LIMIT = /\.from\(\s*["']receipt_expenses["']\s*\)(?:(?!\.from\(|;)[\s\S]){0,600}?\.limit\(\s*(\d+)\s*\)/g;
const SMALL_LIMIT = 1000;

const ALLOWED_SMALL_LIMITS: Record<string, { count: number; why: string }> = {
  "apps/web/lib/ai/tools.ts": {
    count: 1,
    why: "searchExpenses: the 10 best vendor matches for Flight Crew to pick from. Nothing is totalled.",
  },
};

const ALLOWED_SELECTS: Record<string, { count: number; why: string }> = {
  "apps/web/lib/ai/tools.ts": {
    count: 1,
    why: "Per-receipt read (search results) that shows one receipt's amount paid. No total.",
  },
};

/**
 * A year-to-date estimate from the monthly figure, or the larger-of-the-totals
 * rule: `i.monthly_recurring * months`, `legacyMonthlyRecurring * monthsElapsed`,
 * `legacyRecurringYTDEstimate`, `Math.max(receiptTotal, …`.
 * `monthlyRecurring * expRemainingMonths` (the months still to come, added to
 * the year-to-date total for a full-year projection) is not one.
 */
const HAND_ROLLED_YTD =
  /\bmonthly_recurring\b[^;\n]{0,40}\*\s*\(?\s*\w*[mM]onths?\w*|\blegacy\w*\s*\*\s*\w*[mM]onths?\w*|\b(?:legacy)?[rR]ecurringYTDEstimate\b|Math\.max\(\s*receipt\w*(?:\.\w+)?\s*,/g;

const ALLOWED_HAND_ROLLED_YTD: Record<string, { count: number; why: string }> = {
  "apps/web/app/accountant/[token]/page.tsx": {
    count: 2,
    why: "Accountant share page. The feature is switched off (api/accountant-share returns 503), so this never renders with data. Rebuild it on ytdExpenseTotals + expenseCategoryRows before switching it back on.",
  },
};

/** Per-category receipts read off the per-key map: rows that leave out the other two sources. */
const RECEIPTS_BY_KEY_PROP = /\breceiptTotalsByKey\b/g;

const ALLOWED_RECEIPTS_BY_KEY: Record<string, { count: number; why: string }> = {
  "apps/web/app/accountant/[token]/page.tsx": {
    count: 3,
    why: "Accountant share page, switched off (see above).",
  },
};

/**
 * A label that reads as ALL of the year's expenses: "YTD Total", "YTD
 * Expenses", "Year-to-date expenses", "Total Expenses".
 */
const YTD_EXPENSES_LABEL = /\b(?:YTD|Year[- ]to[- ][Dd]ate) (?:Total|Expenses|expenses)\b|\bTotal Expenses\b/g;

/** The phone's Expenses screen: receipts only, and labelled as receipts. */
const MOBILE_EXPENSES_SCREEN = "apps/mobile/app/(app)/profile/expenses.tsx";

/** Allowed only where the match opens `phrase`, so the label on a figure is never excused. */
const ALLOWED_YTD_EXPENSES_LABELS: Record<string, { count: number; phrase: string; why: string }> = {
  [MOBILE_EXPENSES_SCREEN]: {
    count: 1,
    phrase: "YTD Expenses on the web",
    why: "The caption under the cards, which says the web's YTD Expenses also counts recurring expenses and monthly figures. It names the web's card; it is not a label on a figure.",
  },
};

/**
 * Source with its comments blanked, so a rule's own explanation can't trip or
 * satisfy it. Line breaks are kept: a match's line number is the file's.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, "")).replace(/^[ \t]*\/\/.*$/gm, "");

/** Every surface that shows or uses year-to-date expenses. Each makes the one engine call. */
const YTD_EXPENSE_SURFACES = [
  "apps/web/app/(app)/dashboard/page.tsx",
  "apps/web/app/(app)/expenses/expenses-content.tsx",
  "apps/web/app/(app)/reports/page.tsx",
  "apps/web/app/(app)/forecast/page.tsx",
  "apps/web/app/(app)/overhead/page.tsx",
  "apps/web/app/(app)/altimeter/page.tsx",
  "apps/web/app/(app)/scenarios/page.tsx",
  "apps/web/app/demo/dashboard/page.tsx",
  "apps/web/app/api/chat/route.ts",
  "apps/web/app/api/cron/weekly-digest/route.ts",
  "apps/web/lib/chat-diagnostics.ts",
  "apps/web/supabase/functions/mcp-server/lib/expense-inputs.ts",
] as const;

/** Client components that are handed the total by their page. They work nothing out. */
const YTD_EXPENSE_RECEIVERS = [
  "apps/web/app/(app)/dashboard/dashboard-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/app/(app)/forecast/forecast-content.tsx",
  "apps/web/app/(app)/overhead/overhead-content.tsx",
] as const;

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
      // _shared/core is a generated copy of packages/core (pnpm build:mcp-shared).
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__" || entry === "_shared" || entry.startsWith(".")) continue;
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
      "apps/web/supabase/functions/mcp-server/lib/expense-inputs.ts",
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

  it("every receipt_expenses read of total_amount also reads category_key (home bills count at a share)", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const r = rel(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(RECEIPT_SELECT)) {
        const cols = m[1];
        if (cols.trim() === "*" || !/\btotal_amount\b/.test(cols) || /\bcategory_key\b/.test(cols)) continue;
        // The per-receipt reads allowed above show one receipt's amount paid.
        if (ALLOWED_SELECTS[r] && !/\btax_amount\b/.test(cols)) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)} select("${cols}")`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every user_settings slice an expense context is built from includes the home office %", () => {
    const offenders: string[] = [];
    let slices = 0;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(SETTINGS_SELECT)) {
        const cols = m[1];
        if (cols.trim() === "*" || !/\bvehicle_business_use_pct\b/.test(cols)) continue;
        slices += 1;
        if (!/\bhome_office_business_use_pct\b/.test(cols)) {
          offenders.push(`${rel(file)}:${lineOf(src, m.index ?? 0)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Flight Crew's tool set and the mobile store: guards against a regex that matches nothing.
    expect(slices).toBeGreaterThanOrEqual(2);
  });

  it("no receipt_expenses query is capped at a small limit outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const r = rel(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(RECEIPT_LIMIT)) {
        if (Number(m[1]) >= SMALL_LIMIT) continue;
        if (ALLOWED_SMALL_LIMITS[r]) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)} .limit(${m[1]})`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED_SMALL_LIMITS)) {
      expect({ file: r, matches: allowedSeen[r] ?? 0 }).toEqual({ file: r, matches: count });
    }
  });

  it("no year-to-date expense total is combined by hand outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const r = rel(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(HAND_ROLLED_YTD)) {
        if (ALLOWED_HAND_ROLLED_YTD[r]) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED_HAND_ROLLED_YTD)) {
      expect({ file: r, matches: allowedSeen[r] ?? 0 }).toEqual({ file: r, matches: count });
    }
  });

  it("every surface with year-to-date expenses takes them from ytdExpenseTotals", () => {
    const byRel = new Map(files.map((file) => [rel(file), file]));
    for (const surface of YTD_EXPENSE_SURFACES) {
      const file = byRel.get(surface);
      expect(file, `${surface} not found`).toBeDefined();
      expect(readFileSync(file!, "utf8"), surface).toMatch(/\bytdExpenseTotals\s*\(/);
    }
    // The line builder is called through ytdExpenseTotals, so a surface can't
    // total its own subset of the three sources.
    const callsBuilder = files.filter((file) => /\bbuildT2125Expenses\s*\(/.test(codeOnly(readFileSync(file, "utf8")))).map(rel);
    expect(callsBuilder).toEqual([]);
    for (const receiver of YTD_EXPENSE_RECEIVERS) {
      const file = byRel.get(receiver);
      expect(file, `${receiver} not found`).toBeDefined();
      const src = readFileSync(file!, "utf8");
      expect(src, receiver).toMatch(/\bexpensesYTD = 0,/);
      // Overhead shows no monthly figure of its own (the scenario seed carries it).
      if (!receiver.endsWith("overhead-content.tsx")) expect(src, receiver).toMatch(/\bmonthlyRecurring = 0,/);
      expect(src, receiver).not.toMatch(/\bconst (?:expensesYTD|monthlyRecurring)\b/);
    }
  });

  it("no category table is built from the per-key receipt map outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const r = rel(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(RECEIPTS_BY_KEY_PROP)) {
        if (ALLOWED_RECEIPTS_BY_KEY[r]) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED_RECEIPTS_BY_KEY)) {
      expect({ file: r, matches: allowedSeen[r] ?? 0 }).toEqual({ file: r, matches: count });
    }
    // The Reports table, its donut and the PDF read the shared rows.
    const read = (r: string) => readFileSync(path.join(REPO_ROOT, r), "utf8");
    expect(read("apps/web/app/(app)/reports/page.tsx")).toMatch(/\bexpenseCategoryRows\s*\(/);
    expect(read("apps/web/app/(app)/reports/reports-content.tsx")).toMatch(/\bexpenseRows\b/);
    expect(read("apps/web/components/pdf/business-report-pdf.tsx")).toMatch(/\bexpenseRows\b/);
    expect(read("apps/web/app/(app)/expenses/expenses-content.tsx")).toMatch(/\bgroupExpenseLinesByCategory\s*\(/);
  });

  it("the phone shows receipt totals as receipts: no year-to-date expenses label without ytdExpenseTotals", () => {
    const mobile = files.filter((file) => rel(file).startsWith("apps/mobile/"));
    expect(mobile.length).toBeGreaterThan(20);
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of mobile) {
      const r = rel(file);
      const src = codeOnly(readFileSync(file, "utf8"));
      if (/\bytdExpenseTotals\s*\(/.test(src)) continue;
      for (const m of src.matchAll(YTD_EXPENSES_LABEL)) {
        if (ALLOWED_YTD_EXPENSES_LABELS[r] && src.startsWith(ALLOWED_YTD_EXPENSES_LABELS[r].phrase, m.index)) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED_YTD_EXPENSES_LABELS)) {
      expect({ file: r, matches: allowedSeen[r] ?? 0 }).toEqual({ file: r, matches: count });
    }

    // The Expenses screen's cards come from the engine, which decides which
    // receipts are in the year and the month. The screen works out no net
    // amount of its own to add up.
    const screen = codeOnly(readFileSync(path.join(REPO_ROOT, MOBILE_EXPENSES_SCREEN), "utf8"));
    expect(screen).toMatch(/\breceiptTotalsToDate\s*\(/);
    expect(screen).toContain('label="Receipts YTD"');
    expect(screen).not.toMatch(/\bexpenseNetOfItc\s*\(/);
    // The phone's store still has no expense_items or recurring_expenses to
    // total. The day it loads them, this screen can show year-to-date
    // expenses: call ytdExpenseTotals, add the screen to YTD_EXPENSE_SURFACES
    // and drop this check.
    const store = codeOnly(readFileSync(path.join(REPO_ROOT, "apps/mobile/stores/data-store.ts"), "utf8"));
    expect(
      store,
      "the mobile store now loads the other expense sources: see the comment above this check",
    ).not.toMatch(/\.from\(\s*["'](?:expense_items|recurring_expenses)["']\s*\)/);
  });

  it("nothing projects the year's expenses as a monthly figure × months left", () => {
    const engineFiles = sourceFiles(CORE_ENGINES);
    expect(engineFiles.map(rel)).toContain("packages/core/engines/effective-cash.ts");
    const offenders: string[] = [];
    for (const file of [...files, ...engineFiles]) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(MONTHLY_TIMES_MONTHS_LEFT)) offenders.push(`${rel(file)}:${lineOf(src, m.index ?? 0)}`);
    }
    expect(offenders).toEqual([]);
    // The surfaces that project the year take what is still to come from the
    // engine: `expensesRemaining`, from the same ytdExpenseTotals call that
    // gives them year to date. The four client components are handed it.
    const read = (r: string) => readFileSync(path.join(REPO_ROOT, r), "utf8");
    for (const receiver of YTD_EXPENSE_RECEIVERS) {
      expect(read(receiver), receiver).toMatch(/^  expensesRemaining,$/m);
      expect(read(receiver), receiver).toContain("expensesYTD + expensesRemaining");
      expect(read(receiver), receiver).not.toContain("remainingYearExpenses(");
    }
    for (const surface of [
      "apps/web/app/api/chat/route.ts",
      "apps/web/app/api/cron/weekly-digest/route.ts",
      "apps/web/lib/chat-diagnostics.ts",
    ]) {
      expect(read(surface), surface).toMatch(/\{ expensesYTD, monthlyRecurring, expensesRemaining \} = /);
      expect(read(surface), surface).not.toContain("remainingYearExpenses(");
    }
    // One place adds the two parts of "still to come" together.
    expect(read("packages/core/engines/t2125-expenses-engine.ts")).toContain("expensesRemaining: remainingYearExpenses(");
  });

  it("no year's recurring expenses are a monthly figure × 12: next year's plan is handed its own figure", () => {
    const engineFiles = sourceFiles(CORE_ENGINES);
    expect(engineFiles.map(rel)).toContain("packages/core/engines/year-plan-engine.ts");
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of [...files, ...engineFiles]) {
      const r = rel(file);
      const src = codeOnly(readFileSync(file, "utf8"));
      for (const m of src.matchAll(MONTHLY_TIMES_TWELVE)) {
        if (ALLOWED_MONTHLY_TIMES_TWELVE[r]) {
          allowedSeen[r] = (allowedSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${lineOf(src, m.index ?? 0)} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED_MONTHLY_TIMES_TWELVE)) {
      expect({ file: r, matches: allowedSeen[r] ?? 0 }).toEqual({ file: r, matches: count });
    }

    const read = (r: string) => readFileSync(path.join(REPO_ROOT, r), "utf8");
    // One place builds next year's figure, from the charge dates in that year.
    const engine = read("packages/core/engines/t2125-expenses-engine.ts");
    expect(engine).toContain("totalRecurringInYear(recurringNet, inputs.now.getFullYear() + 1)");
    expect(engine).toContain("expensesNextYear: fullYearExpenses(legacyMonthlyRecurring, recurringNextYear),");
    const callsHelper = files.filter((file) => /\bfullYearExpenses\s*\(/.test(codeOnly(readFileSync(file, "utf8")))).map(rel);
    expect(callsHelper).toEqual([]);

    // The plan takes the year's expenses whole.
    const plan = codeOnly(read("packages/core/engines/year-plan-engine.ts"));
    expect(plan).toContain("const expenses = Math.max(0, input.expenses);");
    expect(plan).not.toMatch(/\bmonthlyRecurring\b/);

    // The dashboard hands it down from the page's one engine call: both
    // pages that render the dashboard, the component, then the plan view.
    for (const page of ["apps/web/app/(app)/dashboard/page.tsx", "apps/web/app/demo/dashboard/page.tsx"]) {
      expect(read(page), page).toMatch(/\bexpensesNextYear=\{\w+\.expensesNextYear\}/);
    }
    const content = read("apps/web/app/(app)/dashboard/dashboard-content.tsx");
    expect(content).toMatch(/^  expensesNextYear,$/m);
    expect(content).toContain("expensesNextYear={expensesNextYear}");
    const view = codeOnly(read("apps/web/app/(app)/dashboard/next-year-plan.tsx"));
    expect(view).toMatch(/planTakeHome\(\{[^}]*\bexpenses: expensesNextYear\b/);
    expect(view).not.toMatch(/\bmonthlyRecurring\b/);
    // The row no longer says it is today's figure × 12.
    expect(view).not.toContain("current recurring × 12");

    // The Connector reports the same figure, not its own multiplication.
    const mcp = codeOnly(read("apps/web/supabase/functions/mcp-server/tools/expenses.ts"));
    expect(mcp).toContain("total: round2(totals.expensesNextYear),");
    expect(mcp).not.toContain("projected_annual_recurring");
  });

  it("the regexes catch the hand-rolled shapes and spare the canonical ones", () => {
    const badYtd = [
      `const expensesYTD = Math.max(receiptTotal, legacyRecurringYTDEstimate) + recurringExpYTD;`,
      `const altExpensesYTD = Math.max(receiptYTD, legacyMonthlyRecurring * expMonthsElapsed) + recurringExpYTD;`,
      `const expensesPaidYTD = Math.max(receiptTotals.paid, estimate) + paid;`,
      `const recurringYTDEstimate = legacyMonthlyRecurring * expMonthsElapsed;`,
      `(s, i) => s + i.monthly_recurring * completedMonths,`,
      `const est = Number(item.monthly_recurring ?? 0) * monthsElapsed;`,
    ];
    const goodYtd = [
      `const { expensesYTD, monthlyRecurring } = ytdExpenseTotals({ receipts, recurring, expenseItems, ctx, now: today });`,
      `const annualExpenses = expensesYTD + expensesRemaining;`,
      `total: round2(totals.expensesNextYear),`,
      `monthly_recurring: line.monthlyAmount,`,
      `const maxCatYTD = Math.max(...filteredExpenses.map((c) => c.ytd), 1);`,
    ];
    for (const s of badYtd) expect([...s.matchAll(HAND_ROLLED_YTD)].length, s).toBeGreaterThan(0);
    for (const s of goodYtd) expect([...s.matchAll(HAND_ROLLED_YTD)], s).toHaveLength(0);

    const ytdLabels = (s: string) => [...s.matchAll(YTD_EXPENSES_LABEL)].length;
    for (const s of [
      `label="YTD Total"`,
      `label="YTD Expenses"`,
      `<Text>Year-to-date expenses</Text>`,
      `title: "Total Expenses",`,
    ]) expect(ytdLabels(s), s).toBe(1);
    for (const s of [
      `label="Receipts YTD"`,
      `label="This Month"`,
      `label="YTD GCI"`,
      `const ytdTotal = expenseTotals.receiptYTD;`,
    ]) expect(ytdLabels(s), s).toBe(0);

    const monthsLeft = (s: string) => [...s.matchAll(MONTHLY_TIMES_MONTHS_LEFT)].length;
    for (const s of [
      `const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;`,
      `const annualExpenses = expensesYTD + monthlyRecurring * remainingMonths;`,
      `const annualExpenses = input.expensesYTD + input.monthlyRecurringExpenses * remainingMonths;`,
    ]) expect(monthsLeft(s), s).toBe(1);
    for (const s of [
      `const annualExpenses = expensesYTD + expensesRemaining;`,
      `return legacyMonthlyRecurring * monthsLeft + recurringRemaining;`,
      `expensesYTD + expensesRemaining + (monthlyRecurring - baselineMonthlyRecurring) * expRemainingMonths;`,
      `const expenses = Math.max(0, input.expenses);`,
    ]) expect(monthsLeft(s), s).toBe(0);

    const timesTwelve = (s: string) => [...s.matchAll(MONTHLY_TIMES_TWELVE)].length;
    for (const s of [
      `const expenses = Math.max(0, monthlyRecurring) * 12;`,
      `projected_annual_recurring: round2(totals.monthlyRecurring * 12),`,
      `const nextYear = monthlyRecurringExpenses * 12;`,
      `const annual = totalRecurringMonthly(recurringExpensesNetOfItc(list, ctx), now) * 12;`,
      `rows.reduce((s, re) => s + recurringMonthlyRunRate(re, now) * 12, 0)`,
    ]) expect(timesTwelve(s), s).toBe(1);
    for (const s of [
      `const expenses = Math.max(0, input.expenses);`,
      `return legacyMonthlyRecurring * 12 + recurringInYear;`,
      `const brokerageFees = settings.monthly_brokerage_fee * 12;`,
      `const annualBurn = monthlyBurn * 12;`,
      `expensesNextYear: fullYearExpenses(legacyMonthlyRecurring, recurringNextYear),`,
      `const recurringNextYear = totalRecurringInYear(recurringNet, inputs.now.getFullYear() + 1);`,
    ]) expect(timesTwelve(s), s).toBe(0);

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

    const limits = (s: string) => [...s.matchAll(RECEIPT_LIMIT)].map((m) => Number(m[1]));
    expect(limits(`supabase\n  .from("receipt_expenses")\n  .select("*")\n  .eq("user_id", user.id)\n  .order("created_at", { ascending: false })\n  .limit(50);`)).toEqual([50]);
    expect(limits(`supabase.from("receipt_expenses").select("category_key, total_amount, tax_amount").limit(10000),`)).toEqual([10000]);
    // The limit belongs to the NEXT query, not the receipts one.
    expect(limits(`supabase.from("receipt_expenses").select("id").eq("user_id", id),\n supabase.from("contact_tasks").select("id").limit(5)`)).toEqual([]);

    const settingsSelect = (s: string) => [...s.matchAll(SETTINGS_SELECT)].map((m) => m[1]);
    expect(settingsSelect(`supabase.from("user_settings").select("gst_hst_registered, vehicle_business_use_pct")`)).toEqual([
      "gst_hst_registered, vehicle_business_use_pct",
    ]);
    expect(settingsSelect(`.from("user_settings")\n  .select(\n    // a comment about the columns\n    "user_id, vehicle_business_use_pct"\n  )`)).toEqual([
      "user_id, vehicle_business_use_pct",
    ]);

    const select = (s: string) => [...s.matchAll(RECEIPT_SELECT)].map((m) => m[1]);
    expect(select(`supabase.from("receipt_expenses").select("total_amount").eq("user_id", id)`)).toEqual(["total_amount"]);
    expect(select(`supabase\n  .from("receipt_expenses")\n  .select("category_key, total_amount, tax_amount")`)).toEqual([
      "category_key, total_amount, tax_amount",
    ]);
  });
});
