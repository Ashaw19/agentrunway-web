/**
 * The statement import's database check accepts exactly the expense item
 * keys the web accepts (isReceiptCategoryKey, RECEIPT_CATEGORY_KEYS in
 * packages/core/lib/expense-items.ts), whatever expense_items rows an
 * account has: an account missing a seeded item is not refused a valid key,
 * and a key the web would refuse is refused in the database too.
 *
 * The function is defined in 00185 and redefined, with the key list only,
 * whenever an item is added (00186: Business Parking and Supplementary
 * Business Insurance). The LAST definition is the one the database runs.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RECEIPT_CATEGORY_KEYS } from "@agent-runway/core/lib/expense-items";
import { RECEIPT_CATEGORY_KEYS as WEB_KEYS } from "@/lib/types/receipt";

const MIGRATIONS = path.join(__dirname, "../../../supabase/migrations");
const DEFINITION = "CREATE OR REPLACE FUNCTION public.fn_confirm_statement_lines(";

/** fn_confirm_statement_lines as each migration that defines it writes it, oldest first. */
const definitions = readdirSync(MIGRATIONS)
  .filter((f) => /^\d{5}_.*\.sql$/.test(f))
  .sort()
  .map((file) => ({ file, sql: readFileSync(path.join(MIGRATIONS, file), "utf8") }))
  .filter(({ sql }) => sql.includes(DEFINITION))
  .map(({ file, sql }) => {
    const start = sql.indexOf(DEFINITION);
    return { file, fn: sql.slice(start, sql.indexOf("$$;", sql.indexOf("AS $$", start)) + 3) };
  });
const latest = definitions[definitions.length - 1];

const KEY_LIST = /v_keys {7}text\[\] := ARRAY\[[\s\S]*?\];/;
const keysOf = (fn: string) => [...(KEY_LIST.exec(fn)?.[0] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe("fn_confirm_statement_lines' item keys", () => {
  it("the database runs the last definition, 00186's", () => {
    expect(definitions.map((d) => d.file)).toEqual(["00185_statement_import.sql", "00186_vehicle_full_deduction_items.sql"]);
  });

  it("are RECEIPT_CATEGORY_KEYS, in order", () => {
    expect(keysOf(latest.fn)).toEqual(RECEIPT_CATEGORY_KEYS);
  });

  it("each redefinition changes the key list and nothing else", () => {
    for (let i = 1; i < definitions.length; i++) {
      expect(definitions[i].fn.replace(KEY_LIST, "")).toBe(definitions[i - 1].fn.replace(KEY_LIST, ""));
    }
  });

  it("the check is the list, not the account's expense_items rows", () => {
    expect(latest.fn).toContain("IF NOT (v_category = ANY (v_keys)) THEN");
    expect(latest.fn).not.toMatch(/FROM expense_items/);
  });

  it("the web's list is the core list (re-exported)", () => {
    expect(WEB_KEYS).toBe(RECEIPT_CATEGORY_KEYS);
  });
});
