/**
 * Home Office expense keys are listed in eight places (2026-10-13).
 *
 * The canonical list is EXPENSE_KEY_TO_T2125 (entries flagged applyHomeUse).
 * Every other list has to carry the same keys or a home bill either can't be
 * picked, is rejected as an unknown category, or shows as a raw key:
 *
 *   lib/types/receipt.ts              receipt + recurring category pickers
 *   lib/receipts/category-hints.ts    keys the OCR suggestion may return
 *   lib/receipts/extract.ts           the OCR prompt
 *   app/api/voice-extract/route.ts    the voice prompt
 *   app/(app)/expenses/page.tsx       categories seeded for a new account
 *   supabase/migrations/00174_*.sql   seed_home_office_expenses (the DB seed)
 *   lib/ai/tools.ts                   Flight Crew's logExpense
 *   apps/mobile .../profile/expenses  mobile labels
 *
 * A key missing from the T2125 map is the dangerous direction: the engines
 * would treat that bill as an ordinary expense and count it in full.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPENSE_KEY_TO_T2125, HOME_OFFICE_KEY_TO_COST, isHomeOfficeKey } from "@/lib/engines/t2125-engine";
import { RECEIPT_CATEGORY_GROUPS } from "@/lib/types/receipt";
import { resolveCategory, suggestCategoryFromText } from "@/lib/receipts/category-hints";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

const HOME_KEYS = Object.entries(EXPENSE_KEY_TO_T2125)
  .filter(([, v]) => v.applyHomeUse)
  .map(([k]) => k)
  .sort();

/** Every `home_xxx` identifier in a source file, de-duplicated. */
const homeKeysIn = (src: string) =>
  [...new Set(src.match(/\bhome_(?!office)[a-z_]+\b/g) ?? [])].sort();

describe("Home Office expense keys agree everywhere they are listed", () => {
  it("the canonical list is the eight home bills", () => {
    expect(HOME_KEYS).toEqual([
      "home_condo_fees", "home_insurance", "home_internet", "home_maintenance",
      "home_mortgage_interest", "home_property_tax", "home_rent", "home_utilities",
    ]);
    for (const k of HOME_KEYS) {
      expect(isHomeOfficeKey(k)).toBe(true);
      expect(HOME_OFFICE_KEY_TO_COST[k]).toBeTruthy();
    }
  });

  it("the receipt and recurring pickers offer exactly those keys under Home Office", () => {
    const group = RECEIPT_CATEGORY_GROUPS.find((g) => g.group === "Home Office");
    expect(group?.items.map((i) => i.key).sort()).toEqual(HOME_KEYS);
    // And no home key hides in another group.
    for (const g of RECEIPT_CATEGORY_GROUPS) {
      if (g.group === "Home Office") continue;
      for (const item of g.items) expect(isHomeOfficeKey(item.key), item.key).toBe(false);
    }
  });

  it("an OCR-suggested home key is accepted, not dropped to Miscellaneous", () => {
    for (const k of HOME_KEYS) {
      expect(resolveCategory(null, undefined, k, 0.9)).toEqual({ categoryKey: k, source: "groq" });
    }
  });

  it.each([
    ["apps/web/lib/receipts/extract.ts", "OCR prompt"],
    ["apps/web/app/api/voice-extract/route.ts", "voice prompt"],
    ["apps/web/app/(app)/expenses/page.tsx", "new-account categories"],
    ["apps/web/supabase/migrations/00174_home_office_expense_category.sql", "DB seed"],
    ["apps/web/lib/ai/tools.ts", "Flight Crew logExpense"],
    ["apps/mobile/app/(app)/profile/expenses.tsx", "mobile labels"],
  ])("%s (%s) lists the same keys", (file) => {
    expect(homeKeysIn(read(file))).toEqual(HOME_KEYS);
  });
});

describe("vendor hints for home bills", () => {
  it("a named power or heating utility is suggested as a home utility bill", () => {
    for (const vendor of ["NB Power", "Saint John Energy", "Nova Scotia Power", "Hydro One", "Enbridge Gas", "Hydro-Québec"]) {
      expect(suggestCategoryFromText(vendor), vendor).toBe("home_utilities");
    }
    expect(suggestCategoryFromText("Irving Energy", "home heat delivery furnace oil 450L")).toBe("home_utilities");
    expect(suggestCategoryFromText("Town of Quispamsis", "property tax notice")).toBe("home_property_tax");
  });

  it("gas stations are still vehicle fuel", () => {
    for (const vendor of ["Circle K/Irving", "Shell Canada", "QUISPAMSIS ESSO", "Petro-Canada", "Irving Oil"]) {
      expect(suggestCategoryFromText(vendor), vendor).toBe("vehicle_fuel");
    }
  });

  it("a phone or internet carrier is not guessed to be a home bill", () => {
    for (const vendor of ["Rogers", "Bell Aliant", "Telus"]) {
      expect(isHomeOfficeKey(suggestCategoryFromText(vendor)), vendor).toBe(false);
    }
  });
});
