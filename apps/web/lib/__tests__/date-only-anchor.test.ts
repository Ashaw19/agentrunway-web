/**
 * REGRESSION TRIPWIRE — date-only columns must be parsed with a local anchor
 * (2026-07-27).
 *
 * Several Postgres columns are `date`, not `timestamptz`, and PostgREST returns
 * them as bare `"YYYY-MM-DD"` strings:
 *
 *   transactions.date              pipeline_deals.expected_close_date
 *   team_deals.date                listing_appointments.expected_close_date
 *   corp_transactions.date         referral_opportunities.expected_close_date
 *   client_records.close_date      contact_tasks.due_date
 *   mileage_logs.trip_date         clients.scheduled_for
 *
 * `new Date("2026-01-01")` is parsed by ECMA-262 as UTC midnight. Every Canadian
 * time zone is behind UTC, so that instant is 2025-12-31 *locally* — which means
 * `.getFullYear()` returns 2025, `.getMonth()` returns the previous month for any
 * 1st-of-month date, and `.toLocaleDateString()` prints the day before. Concretely:
 * a Jan 1 closing falls out of YTD GCI, a Mar 1 closing is credited to February,
 * and a task due today reads as overdue.
 *
 * The repo-wide fix is to anchor at local noon — `new Date(iso + "T12:00:00")` —
 * which is the idiom the dashboard (the display source of truth) already uses at
 * dashboard-content.tsx:243/935/3026/3063, and which CRM, expenses, mileage,
 * pipeline and transactions follow. Noon (not `T00:00:00`) keeps a 12-hour margin
 * on both sides so a DST transition can never push the date across a boundary.
 *
 * `contact_activities.activity_date` is `timestamptz` and is deliberately NOT in
 * scope — a bare `new Date()` is correct there.
 *
 * This is a source-level check, not a runtime one: the call sites are spread
 * across large client components and a React Native screen, and the bug only
 * reproduces under a negative UTC offset, so a unit test would have to pin the
 * host TZ to prove anything. Scanning for the unanchored shape is the honest
 * guard, and it covers files a runtime test never would.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const SCAN_ROOTS = [
  "apps/web/app",
  "apps/web/lib",
  "apps/mobile/app",
  "packages/core/engines",
] as const;

/** Columns that are Postgres `date` (verified against information_schema). */
const DATE_ONLY_FIELDS = [
  "date",
  "close_date",
  "closing_date",
  "trip_date",
  "expected_close_date",
  "scheduled_for",
  "due_date",
  "condition_date",
  "expense_date",
] as const;

/**
 * Matches `new Date(<ident>.<date-only field>)` where the argument is closed by
 * `)` with no concatenation — i.e. no `+ "T12:00:00"` / `+ "T00:00:00"` anchor.
 * An anchored call has a `+` before the closing paren and will not match.
 */
const UNANCHORED = new RegExp(
  String.raw`new Date\(\s*\w+(?:\.\w+)*\.(?:${DATE_ONLY_FIELDS.join("|")})\s*\)`,
  "g",
);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(REPO_ROOT, dir);
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__") continue;
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

describe("REGRESSION — date-only columns are never parsed unanchored", () => {
  const files = SCAN_ROOTS.flatMap(sourceFiles);

  it("finds source files to scan (guards against a broken walker)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no `new Date(x.<date-only column>)` without a time anchor", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(UNANCHORED)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${path.relative(REPO_ROOT, file)}:${line} — ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the dashboard's noon-anchor idiom is still present (anchor of the rule)", () => {
    const dash = readFileSync(
      path.join(REPO_ROOT, "apps/web/app/(app)/dashboard/dashboard-content.tsx"),
      "utf8",
    );
    expect(dash).toContain(`new Date(tx.date + "T12:00:00")`);
  });

  it("the regex actually catches the unanchored shape and spares the anchored one", () => {
    const bad = `const d = new Date(tx.date);`;
    const good = `const d = new Date(tx.date + "T12:00:00");`;
    const alsoGood = `const d = new Date(r.expense_date + "T00:00:00");`;
    expect([...bad.matchAll(UNANCHORED)]).toHaveLength(1);
    expect([...good.matchAll(UNANCHORED)]).toHaveLength(0);
    expect([...alsoGood.matchAll(UNANCHORED)]).toHaveLength(0);
  });
});
