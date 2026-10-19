/**
 * One vehicle business-use share, from one resolver (2026-10-18).
 *
 * The share applied to vehicle costs comes from CRA's logbook when it covers
 * the year (core/engines/vehicle-logbook-engine.ts) and from the declared
 * setting `user_settings.vehicle_business_use_pct` otherwise. Every surface
 * gets it through `expenseTaxContext(settings, logbook)`. Memory records
 * several bugs where surfaces read the same input differently; this guard
 * keeps a surface from reading the setting on its own.
 *
 * What it checks, in apps/web (app, lib, components), apps/mobile and the MCP
 * edge function:
 *   1. Every `expenseTaxContext(` call passes the logbook as a second
 *      argument (`null` only where nothing can be loaded, such as the demo).
 *   2. Every `computeT2125(` call passes `vehicleBusinessUsePct` (the
 *      context's share). Left out, the T2125 falls back to the setting.
 *   3. `.vehicle_business_use_pct` is read as a value only where it is the
 *      DECLARED setting: the Settings editor and the Expenses page's declared
 *      field. Selecting the column for expenseTaxContext is fine.
 *   4. No copy calls km × CRA's per-km allowance rate a deduction. Until
 *      2026-10-18 the Mileage tab printed it as the total and estimated
 *      deduction and per trip, the T2125 PDF as the total at the CRA per-km
 *      rate, and the connector described a CRA deduction amount.
 *   5. CRA's per-km rates are not typed: they come from CRA_ALLOWANCE_RATES
 *      (tax-copy/cra-rules.ts), which names the year. `CRA_MILEAGE_RATES`
 *      held 2025's rates under the current year's label.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const ROOTS = [
  join(WEB, "app"),
  join(WEB, "lib"),
  join(WEB, "components"),
  join(WEB, "supabase", "functions", "mcp-server"),
  join(REPO, "apps", "mobile", "app"),
  join(REPO, "apps", "mobile", "stores"),
  join(REPO, "apps", "mobile", "lib"),
  join(REPO, "apps", "mobile", "components"),
];

function files(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

const SOURCES = ROOTS.flatMap(files).map((file) => ({
  file,
  rel: relative(REPO, file),
  text: readFileSync(file, "utf8"),
}));

/** Source with comments blanked (same length, so offsets still line up). */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

/** The argument list of a call starting at `open` (the "(" index), and whether it has a top-level comma. */
function argsAt(src: string, open: number): { args: string; twoOrMore: boolean } {
  let depth = 0;
  let twoOrMore = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return { args: src.slice(open + 1, i), twoOrMore };
    } else if (c === "," && depth === 1) {
      // A trailing comma before ")" is not a second argument.
      if (!/^\s*\)/.test(src.slice(i + 1))) twoOrMore = true;
    }
  }
  return { args: src.slice(open + 1), twoOrMore };
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

describe("one vehicle business-use share", () => {
  it("scans the apps", () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.some((s) => s.rel.includes("apps/mobile/"))).toBe(true);
    expect(SOURCES.some((s) => s.rel.includes("functions/mcp-server/"))).toBe(true);
  });

  it("every expenseTaxContext call passes the logbook", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      const src = code(text);
      for (const m of src.matchAll(/\bexpenseTaxContext\s*\(/g)) {
        const before = src.slice(Math.max(0, m.index! - 20), m.index!);
        if (/function\s*$/.test(before)) continue;
        const { twoOrMore } = argsAt(src, m.index! + m[0].length - 1);
        if (!twoOrMore) offenders.push(`${rel}:${lineOf(text, m.index!)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every computeT2125 call passes the resolved vehicle share", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      const src = code(text);
      for (const m of src.matchAll(/\bcomputeT2125\s*\(/g)) {
        const before = src.slice(Math.max(0, m.index! - 20), m.index!);
        if (/function\s*$/.test(before)) continue;
        const { args } = argsAt(src, m.index! + m[0].length - 1);
        if (!/\bvehicleBusinessUsePct\b/.test(args)) offenders.push(`${rel}:${lineOf(text, m.index!)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the setting is read as a value only where it is the declared one", () => {
    // Where the DECLARED share is shown and edited.
    const DECLARED = new Set([
      "apps/web/app/(app)/settings/settings-content.tsx",
      "apps/web/app/(app)/expenses/expenses-content.tsx",
    ]);
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      if (DECLARED.has(rel)) continue;
      const src = code(text);
      for (const m of src.matchAll(/(?:\?\.|\.)vehicle_business_use_pct\b/g)) {
        offenders.push(`${rel}:${lineOf(text, m.index!)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no copy calls the per-km allowance figure a deduction", () => {
    // The knowledge base and the playbooks describe the old labels on purpose
    // ("Changed 2026-10-18: it was labelled ...").
    const DESCRIBES_THE_CHANGE = new Set([
      "apps/web/lib/knowledge-base.ts",
      "apps/web/lib/troubleshooting-playbooks.ts",
      // Words people type, matched to route their question; not a label.
      "apps/web/lib/troubleshooting-classifier.ts",
      // A search keyword in the article's metadata; the article itself is
      // about the CRA logbook and line 9281 (not reviewed in this change).
      "apps/web/app/vehicle-expenses-real-estate-agents-canada/page.tsx",
    ]);
    const OLD_LABELS = [
      /total deduction(?! at)/i,
      /est\.\s*deduction/i,
      /deduction at cra per-km rate/i,
      /cra deduction amount/i,
      /\bdeduction \(auto-calculated/i,
      /estimated deduction: ~/i,
      /deductible rates are/i,
      /mileage deductions?\b/i,
    ];
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      if (DESCRIBES_THE_CHANGE.has(rel)) continue;
      const src = code(text);
      for (const re of OLD_LABELS) {
        const m = re.exec(src);
        if (m) offenders.push(`${rel}:${lineOf(text, m.index)} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("CRA's per-km rates are never typed", () => {
    const offenders: string[] = [];
    for (const { rel, text } of SOURCES) {
      const src = code(text);
      for (const m of src.matchAll(/\$0\.(?:5|6|7)\d\/km|\bCRA_MILEAGE_RATES\b|cra_rate_per_km\s*\?\?\s*0\.\d+/g)) {
        offenders.push(`${rel}:${lineOf(text, m.index!)} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
