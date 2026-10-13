/**
 * REGRESSION TRIPWIRE — `expense_items.ytd_amount` is a dead column
 * (2026-10-13).
 *
 * The column held a year-to-date amount typed on each expense item. Receipts
 * (`receipt_expenses`) and the Recurring Expenses list (`recurring_expenses`)
 * replaced it, and nothing has written it since: it is 0, or a figure typed
 * before then. Code that still read it described an agent with a year of
 * receipts as having no expenses:
 *
 *   - the MCP server's expense tools (fixed in #304);
 *   - the tax cards' "already tracked" flags on the Dashboard, Forecast and
 *     Overhead pages;
 *   - Flight Crew's [MISSING DEDUCTIONS], [DOCUMENTATION] and
 *     [CCA OPPORTUNITY] context lines, and the expense diagnostic's category
 *     lines;
 *   - the team report's "haven't logged expenses this quarter" (SQL, 00176).
 *
 * What to use instead (packages/core/engines):
 *   expense-totals-engine     any expense TOTAL (ytdExpenseTotals,
 *                             aggregateReceiptTotals(rows, ctx).byKey)
 *   t2125-expenses-engine     what is recorded per expense line and per
 *                             category (buildT2125Expenses,
 *                             trackedExpensesByCategory)
 *   tax-optimization-engine   deductionTrackingFlags
 *
 * This test fails on any use of the name outside the allowlist: a select, a
 * property read, or a write. The column itself still exists (see the
 * allowlist); dropping it is a separate migration.
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
  "apps/web/supabase/functions",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/stores",
  "apps/mobile/lib",
  "packages/core/engines",
  "packages/core/lib",
  "packages/core/types",
] as const;

const MIGRATIONS = "apps/web/supabase/migrations";

const DEAD_COLUMN = /\bytd_amount\b/g;

/**
 * Known uses left in place, counted per file so a new one still fails and a
 * removed one forces this list to shrink.
 */
const ALLOWED: Record<string, { count: number; why: string }> = {
  "packages/core/types/database.ts": {
    count: 1,
    why: "ExpenseItem mirrors the table, and the column still exists.",
  },
  "apps/web/app/demo/dashboard/page.tsx": {
    count: 10,
    why: "Sample ExpenseItem rows for the demo dashboard: the type requires the field. Nothing reads it.",
  },
  "apps/web/supabase/functions/mcp-server/tools/expenses.ts": {
    count: 13,
    why: "`ytd_amount` here is a field of get_expenses' OUTPUT, filled from receipts and recurring expenses (lib/expense-inputs.ts). The column is not selected.",
  },
};

/** Migrations written while the column was live. Later ones may only drop it. */
const HISTORICAL_MIGRATIONS = new Set([
  "00001_initial_schema.sql",
  "00023_business_structure.sql",
  "00060_org_report_functions.sql",
]);

const stripTsComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // `//` to end of line, but not the `//` of a URL inside a string.
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const stripSqlComments = (src: string) => src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Uses of the name in code, comments excluded. */
const usesIn = (src: string) => [...stripTsComments(src).matchAll(DEAD_COLUMN)].length;

/** Uses in SQL other than dropping the column. */
const sqlUsesIn = (src: string) =>
  [...stripSqlComments(src).replace(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?ytd_amount\b/gi, "").matchAll(DEAD_COLUMN)].length;

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
      // _shared/core is a generated copy of packages/core (pnpm build:mcp-shared).
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__" || entry === "_shared" || entry.startsWith(".")) continue;
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(path.join(REPO_ROOT, dir));
  return out;
}

const rel = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join("/");

describe("REGRESSION — nothing reads or writes the dead expense_items.ytd_amount column", () => {
  const files = ROOTS.flatMap(sourceFiles);

  it("finds the files that used to read it (guards against a broken walker)", () => {
    expect(files.length).toBeGreaterThan(400);
    for (const must of [
      "apps/web/app/(app)/layout.tsx",
      "apps/web/app/(app)/dashboard/dashboard-content.tsx",
      "apps/web/app/(app)/forecast/forecast-content.tsx",
      "apps/web/app/(app)/overhead/overhead-content.tsx",
      "apps/web/app/(app)/expenses/expenses-content.tsx",
      "apps/web/app/api/chat/route.ts",
      "apps/web/app/api/cron/weekly-digest/route.ts",
      "apps/web/lib/chat-diagnostics.ts",
      "apps/web/supabase/functions/mcp-server/tools/analytics.ts",
      "packages/core/engines/expense-totals-engine.ts",
    ]) {
      expect(files.map(rel)).toContain(must);
    }
  });

  it("no use of ytd_amount outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const r = rel(file);
      const count = usesIn(readFileSync(file, "utf8"));
      if (count === 0) continue;
      if (ALLOWED[r]) allowedSeen[r] = count;
      else offenders.push(`${r} (${count})`);
    }
    expect(offenders).toEqual([]);
    for (const [r, { count }] of Object.entries(ALLOWED)) {
      expect({ file: r, uses: allowedSeen[r] ?? 0 }).toEqual({ file: r, uses: count });
    }
  });

  it("no migration after the historical ones uses the column, except to drop it", () => {
    const dir = path.join(REPO_ROOT, MIGRATIONS);
    const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(migrations.length).toBeGreaterThan(150);
    for (const name of HISTORICAL_MIGRATIONS) expect(migrations).toContain(name);
    const offenders = migrations
      .filter((name) => !HISTORICAL_MIGRATIONS.has(name))
      .filter((name) => sqlUsesIn(readFileSync(path.join(dir, name), "utf8")) > 0);
    expect(offenders).toEqual([]);
  });

  it("the org expense status function no longer reads it (00176 replaces 00060's)", () => {
    const sql = stripSqlComments(
      readFileSync(path.join(REPO_ROOT, MIGRATIONS, "00176_org_expense_status_from_recorded_expenses.sql"), "utf8"),
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fn_org_expense_filing_status(p_org_id UUID)");
    // The three places an expense is recorded.
    expect(sql).toMatch(/FROM receipt_expenses re\b/);
    expect(sql).toMatch(/FROM recurring_expenses rx\b[\s\S]*?rx\.is_active/);
    expect(sql).toMatch(/FROM expense_items ei\b[\s\S]*?ei\.monthly_recurring > 0/);
    // 00160's hardening has to survive the replace: CREATE OR REPLACE resets
    // a function's SET clauses to the ones in the new definition.
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
  });

  it("the matchers catch selects, reads and writes, and spare comments and the DROP", () => {
    const bad = [
      `.select("title, expense_items(ytd_amount, monthly_recurring)")`,
      `cat.items.some((i) => Number(i.ytd_amount) > 0 || Number(i.monthly_recurring) > 0)`,
      `s + Number(i.ytd_amount ?? 0)`,
      `ytd_amount: 0,`,
      "const cols = `key, ytd_amount`;",
    ];
    const good = [
      `// ytd_amount is dead: read receipts instead`,
      `/** Replaces the old ytd_amount sum. */\nconst receiptYTD = totals.total;`,
      `const url = "https://example.ca/docs"; // not ytd_amount`,
      `const ytd_amounts = byKey;`,
      `monthly_recurring: 0,`,
    ];
    for (const s of bad) expect(usesIn(s), s).toBe(1);
    for (const s of good) expect(usesIn(s), s).toBe(0);
    // A URL in a string doesn't hide a use later on the same line.
    expect(usesIn(`fetch("https://example.ca/x").then((r) => r.ytd_amount)`)).toBe(1);

    expect(sqlUsesIn(`WHERE ec.user_id = om.user_id AND ei.ytd_amount > 0`)).toBe(1);
    expect(sqlUsesIn(`-- was: ei.ytd_amount > 0\nSELECT 1;`)).toBe(0);
    expect(sqlUsesIn(`ALTER TABLE expense_items DROP COLUMN IF EXISTS ytd_amount;`)).toBe(0);
    expect(sqlUsesIn(`ALTER TABLE expense_items DROP COLUMN ytd_amount;`)).toBe(0);
  });
});
