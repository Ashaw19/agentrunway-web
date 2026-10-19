/**
 * Every year-to-date "GST/HST collected" figure takes the HST commission
 * statements show (2026-10-19). Until then each surface multiplied YTD GCI
 * by the rate; a real statement paid $777 on a $7,000 commission (15% of the
 * agent's share after the split and franchise fee), not $1,050. A surface
 * that leaves out `recorded` would show the old estimate beside the GST/HST
 * return card's statement figure.
 *
 * Calls that are NOT year-to-date figures for real deals are allowlisted:
 * the Forecast's projection (future deals have no statement), the closing-day
 * breakdown (a deal being recorded now) and Flight Crew's worked example.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateTransaction } from "@agent-runway/core/validation/input-guards";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Each `computeHSTCollected({ ... })` call's argument text. */
function calls(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf("computeHSTCollected({");
  while (i >= 0) {
    const start = i + "computeHSTCollected(".length;
    let depth = 0;
    let j = start;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    out.push(src.slice(start, j + 1));
    i = src.indexOf("computeHSTCollected({", j);
  }
  return out;
}

const YTD_SURFACES = [
  "apps/web/app/(app)/dashboard/dashboard-content.tsx",
  "apps/web/app/(app)/forecast/forecast-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/app/api/chat/route.ts",
  "apps/web/supabase/functions/mcp-server/tools/analytics.ts",
  "packages/core/engines/effective-cash.ts",
];

describe("HST collected year to date uses the commission statements' figures", () => {
  it.each(YTD_SURFACES)("%s passes `recorded` on every YTD call", (file) => {
    const found = calls(read(file));
    expect(found.length, file).toBeGreaterThan(0);
    for (const call of found) {
      if (/ytdGCI:\s*projectedGCI/.test(call)) continue; // the Forecast's projection
      expect(call, file).toMatch(/\brecorded\b/);
    }
  });

  it("the connector reads commission_hst and uses the core helper, not its mirror", () => {
    const src = read("apps/web/supabase/functions/mcp-server/tools/analytics.ts");
    expect(src).toContain('from "../../_shared/core/engines/hst-engine.ts"');
    expect(src).toMatch(/\.select\("[^"]*commission_hst[^"]*"\)/);
  });

  it("Flight Crew's context query selects commission_hst", () => {
    expect(read("apps/web/app/api/chat/route.ts")).toMatch(/from\("transactions"\)\.select\("[^"]*commission_hst[^"]*"\)/);
  });

  it("the return card places deals with the timing setting and the paid-in-this-year carry-in", () => {
    const content = read("apps/web/app/(app)/expenses/expenses-content.tsx");
    expect(content).toContain("commissionsInGstHstPeriod(");
    expect(content).toContain("periodTransactions: periodTx.map(commissionHstInput)");
    expect(read("apps/web/app/(app)/expenses/page.tsx")).toContain("loadGstHstCarryIn(");
  });
});

describe("the transaction form's GST/HST paid field", () => {
  const base = { sale_price: "280000", commission_pct: "2.5", address: "", notes: "", date: "2026-03-27" }; // a $7,000 commission

  it("blank is not entered; a statement figure is kept to the cent", () => {
    expect(validateTransaction({ ...base }).parsed?.commission_hst).toBeNull();
    expect(validateTransaction({ ...base, commission_hst: "  " }).parsed?.commission_hst).toBeNull();
    expect(validateTransaction({ ...base, commission_hst: "$777.00" }).parsed?.commission_hst).toBe(777);
    expect(validateTransaction({ ...base, commission_hst: "0" }).parsed?.commission_hst).toBe(0);
  });

  it("refuses more than 15% of the commission (likely the net pay in the wrong box) and junk", () => {
    const tooMuch = validateTransaction({ ...base, commission_hst: "3613.88" });
    expect(tooMuch.valid).toBe(false);
    expect(tooMuch.errors.join(" ")).toContain("more than 15% of the commission");
    expect(validateTransaction({ ...base, commission_hst: "1050" }).valid).toBe(true);
    expect(validateTransaction({ ...base, commission_hst: "abc" }).valid).toBe(false);
  });
});
