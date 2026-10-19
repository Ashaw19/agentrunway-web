/**
 * Business Parking and Supplementary Business Insurance (2026-10-19) are
 * listed wherever an expense item has to be offered, suggested or seeded.
 * The canonical list is EXPENSE_KEY_TO_T2125's `fullVehicleDeduction`
 * entries (VEHICLE_FULL_DEDUCTION_KEYS). A list without them either can't
 * offer them, or (the prompts) files parking under Service & Repairs, where
 * the vehicle business-use share cuts it down.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VEHICLE_FULL_DEDUCTION_KEYS } from "@agent-runway/core/engines/t2125-engine";
import { RECEIPT_CATEGORY_KEYS } from "@/lib/types/receipt";
import { resolveCategory } from "@/lib/receipts/category-hints";
import { EXPENSE_CATEGORY_LABELS } from "../../../mobile/lib/expense-categories";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("the full-deduction vehicle items are listed everywhere", () => {
  it("are the two items", () => {
    expect([...VEHICLE_FULL_DEDUCTION_KEYS].sort()).toEqual(["vehicle_business_insurance", "vehicle_parking"]);
    for (const k of VEHICLE_FULL_DEDUCTION_KEYS) expect(RECEIPT_CATEGORY_KEYS).toContain(k);
  });

  it("the phone has a label for every item key", () => {
    expect(Object.keys(EXPENSE_CATEGORY_LABELS).sort()).toEqual([...RECEIPT_CATEGORY_KEYS].sort());
  });

  it("an OCR-suggested key is accepted, not dropped to Miscellaneous", () => {
    for (const k of VEHICLE_FULL_DEDUCTION_KEYS) {
      expect(resolveCategory(null, undefined, k, 0.9)).toEqual({ categoryKey: k, source: "groq" });
    }
  });

  it.each([
    ["apps/web/lib/receipts/extract.ts", "OCR prompt"],
    ["apps/web/lib/voice/extract-prompt.ts", "voice prompt"],
    ["apps/web/lib/ai/tools.ts", "Flight Crew's filing guidance"],
    ["apps/web/app/(app)/expenses/page.tsx", "new-account categories"],
    ["apps/web/supabase/migrations/00186_vehicle_full_deduction_items.sql", "DB seed"],
  ])("%s (%s) names both", (file) => {
    const src = read(file);
    for (const k of VEHICLE_FULL_DEDUCTION_KEYS) expect(src, k).toMatch(new RegExp(`\\b${k}\\b`));
  });

  it("no prompt still files parking under Service & Repairs", () => {
    for (const file of ["apps/web/lib/receipts/extract.ts", "apps/web/lib/voice/extract-prompt.ts", "apps/web/lib/ai/tools.ts"]) {
      expect(read(file), file).not.toMatch(/parking(?: and car washes)? (?:is|are) vehicle_service|vehicle_service:[^\n]*parking/i);
    }
  });
});
