/**
 * The statement import's database check accepts exactly the expense item
 * keys the web accepts (isReceiptCategoryKey, RECEIPT_CATEGORY_KEYS in
 * packages/core/lib/expense-items.ts), whatever expense_items rows an
 * account has: an account missing a seeded item is not refused a valid key,
 * and a key the web would refuse is refused in the database too.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RECEIPT_CATEGORY_KEYS } from "@agent-runway/core/lib/expense-items";
import { RECEIPT_CATEGORY_KEYS as WEB_KEYS } from "@/lib/types/receipt";

const SQL = readFileSync(path.join(__dirname, "../../../supabase/migrations/00185_statement_import.sql"), "utf8");

describe("fn_confirm_statement_lines' item keys", () => {
  it("are RECEIPT_CATEGORY_KEYS, in order", () => {
    const body = SQL.slice(SQL.indexOf("v_keys       text[] := ARRAY["), SQL.indexOf("];", SQL.indexOf("v_keys       text[] := ARRAY[")));
    const keys = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual(RECEIPT_CATEGORY_KEYS);
  });

  it("the check is the list, not the account's expense_items rows", () => {
    const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.fn_confirm_statement_lines("), SQL.indexOf("$$;", SQL.indexOf("CREATE OR REPLACE FUNCTION public.fn_confirm_statement_lines(")));
    expect(fn).toContain("IF NOT (v_category = ANY (v_keys)) THEN");
    expect(fn).not.toMatch(/FROM expense_items/);
  });

  it("the web's list is the core list (re-exported)", () => {
    expect(WEB_KEYS).toBe(RECEIPT_CATEGORY_KEYS);
  });
});
