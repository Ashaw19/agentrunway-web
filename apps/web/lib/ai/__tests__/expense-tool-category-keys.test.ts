/**
 * REGRESSION — Flight Crew writes expense ITEM keys (2026-10-13).
 *
 * `receipt_expenses.category_key` and `recurring_expenses.category_key` hold
 * an expense item key (`vehicle_fuel`, `meals_client`, ...): the key the
 * Expenses page rows, the T2125 lines and the GST34 ITC limits all look up.
 *
 * Until this date the four Flight Crew tools that write that column had
 * their own list of eight "category" keys (`vehicle`, `marketing`,
 * `office_tech`, `professional_fees`, `travel_meals`, `insurance_licenses`,
 * `education_dev`, `other`). None is an item key, so an expense the Flight
 * Crew logged was in the dashboard total but in no row on the Expenses page,
 * on no T2125 line, and a meal logged as `travel_meals` skipped CRA's 50%
 * limit. The tools also never recorded GST/HST, so no input tax credit was
 * ever counted on one.
 *
 * Pinned here:
 *   1. every key the tools offer the model is a T2125-mapped item key, and
 *      the list is the receipt form's (one source: RECEIPT_CATEGORY_GROUPS)
 *   2. the retired keys are rejected
 *   3. GST/HST is recorded only when it is stated, never worked out
 *   4. the data repair (migration 00175) sends every retired key to an item
 *      key in the same category
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asSchema } from "ai";
import { EXPENSE_KEY_TO_T2125 } from "@agent-runway/core/engines/t2125-engine";
import { isMealOrEntertainmentKey, isVehicleKey } from "@agent-runway/core/engines/gst34-engine";
import { RECEIPT_CATEGORIES, RECEIPT_CATEGORY_GROUPS, isReceiptCategoryKey } from "@/lib/types/receipt";
import { APPROVAL_DESCRIPTIONS, createAgentTools } from "../tools";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const EXPENSE = "00000000-0000-4000-8000-000000000001";

/** The tools that write `category_key`, and the table each writes to. */
const WRITERS = [
  { tool: "logExpense", table: "receipt_expenses" },
  { tool: "updateExpense", table: "receipt_expenses" },
  { tool: "createRecurringExpense", table: "recurring_expenses" },
  { tool: "updateRecurringExpense", table: "recurring_expenses" },
] as const;

/** What the tools wrote before the fix. */
const RETIRED_TOOL_KEYS = [
  "vehicle", "marketing", "office_tech", "professional_fees",
  "travel_meals", "insurance_licenses", "education_dev", "other",
];

const ITEM_KEYS = RECEIPT_CATEGORIES.map((c) => c.key);

function tools(tables: Record<string, Row[]> = {}) {
  const { client, writes } = fakeSupabase(tables);
  return { tools: createAgentTools(client, USER), writes };
}

/** The `categoryKey` values the model is offered: the schema it is sent. */
async function offeredKeys(tool: string): Promise<string[]> {
  const schema = await asSchema(tools().tools[tool].inputSchema).jsonSchema;
  const prop = schema.properties?.categoryKey;
  if (typeof prop !== "object" || !Array.isArray(prop.enum)) {
    throw new Error(`${tool}.categoryKey is not an enum`);
  }
  return prop.enum.map(String);
}

async function accepts(tool: string, input: Record<string, unknown>): Promise<boolean> {
  const validate = asSchema(tools().tools[tool].inputSchema).validate;
  if (!validate) throw new Error(`${tool} has no validator`);
  return (await validate(input)).success;
}

/** A valid input for each writer, less `categoryKey`. */
const BASE_INPUT: Record<string, Record<string, unknown>> = {
  logExpense: { vendor: "Shell", amount: 115, expenseDate: "2026-10-13" },
  updateExpense: { expenseId: EXPENSE },
  createRecurringExpense: { name: "Canva", amount: 20 },
  updateRecurringExpense: { recurringExpenseId: EXPENSE },
};

type Execute = (input: Record<string, unknown>, opts: unknown) => Promise<string>;
const run = (t: ReturnType<typeof tools>["tools"], tool: string, input: Record<string, unknown>) =>
  (t[tool].execute as Execute)(input, { toolCallId: "t", messages: [] });

describe("Flight Crew expense tools — category keys", () => {
  it.each(WRITERS)("$tool offers the receipt form's item keys", async ({ tool }) => {
    expect([...(await offeredKeys(tool))].sort()).toEqual([...ITEM_KEYS].sort());
  });

  it.each(WRITERS)("every key $tool can write has a T2125 line", async ({ tool }) => {
    const unmapped = (await offeredKeys(tool)).filter((k) => !EXPENSE_KEY_TO_T2125[k]);
    expect(unmapped).toEqual([]);
  });

  it.each(WRITERS)("$tool rejects the retired category keys", async ({ tool }) => {
    for (const key of RETIRED_TOOL_KEYS) {
      expect(await accepts(tool, { ...BASE_INPUT[tool], categoryKey: key }), key).toBe(false);
    }
    expect(await accepts(tool, { ...BASE_INPUT[tool], categoryKey: "vehicle_fuel" })).toBe(true);
  });

  it("a meal or a vehicle cost can be logged under a key the CRA limits apply to", async () => {
    const offered = await offeredKeys("logExpense");
    expect(offered.filter(isMealOrEntertainmentKey).sort()).toEqual(
      ["ent_client", "ent_events", "meals_client", "meals_team"],
    );
    expect(offered.filter(isVehicleKey).sort()).toEqual(
      ["vehicle_fuel", "vehicle_insurance", "vehicle_payment", "vehicle_service"],
    );
  });

  it("the tool descriptions name the item keys, not the retired ones", () => {
    const { tools: t } = tools();
    for (const tool of ["logExpense", "createRecurringExpense"]) {
      const description = String(t[tool].description);
      for (const key of ITEM_KEYS) expect(description, `${tool}: ${key}`).toContain(key);
      for (const key of ["professional_fees", "travel_meals", "insurance_licenses", "education_dev", "office_tech"]) {
        expect(description, `${tool}: ${key}`).not.toContain(key);
      }
    }
  });
});

describe("logExpense — what is written", () => {
  it("writes the item key and leaves GST/HST empty when none is stated", async () => {
    const { tools: t, writes } = tools();
    const out = await run(t, "logExpense", {
      vendor: "Shell", amount: 115, categoryKey: "vehicle_fuel", expenseDate: "2026-10-13",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "receipt_expenses", op: "insert" });
    expect(writes[0].payload).toMatchObject({
      user_id: USER, vendor: "Shell", total_amount: 115, category_key: "vehicle_fuel",
      tax_amount: null, subtotal: null,
    });
    expect(out).toContain("Vehicle: Fuel / Gas");
  });

  it("records the GST/HST the agent states, and the amount before it", async () => {
    const { tools: t, writes } = tools();
    const out = await run(t, "logExpense", {
      vendor: "Shell", amount: 115, taxAmount: 15, categoryKey: "vehicle_fuel", expenseDate: "2026-10-13",
    });

    expect(writes[0].payload).toMatchObject({ total_amount: 115, tax_amount: 15, subtotal: 100 });
    expect(out).toContain("$15.00 GST/HST");
  });

  it("refuses GST/HST larger than the total, and writes nothing", async () => {
    const { tools: t, writes } = tools();
    const out = await run(t, "logExpense", {
      vendor: "Shell", amount: 20, taxAmount: 25, categoryKey: "vehicle_fuel", expenseDate: "2026-10-13",
    });

    expect(writes).toHaveLength(0);
    expect(out).toContain("GST/HST");
  });

  it("tells a registrant when no input tax credit is counted", async () => {
    const registered = { user_settings: [{ user_id: USER, gst_hst_registered: true, vehicle_business_use_pct: 0.8 }] };
    const withoutTax = await run(tools(registered).tools, "logExpense", {
      vendor: "Staples", amount: 115, categoryKey: "office_supplies", expenseDate: "2026-10-13",
    });
    const withTax = await run(tools(registered).tools, "logExpense", {
      vendor: "Staples", amount: 115, taxAmount: 15, categoryKey: "office_supplies", expenseDate: "2026-10-13",
    });
    const notRegistered = await run(tools().tools, "logExpense", {
      vendor: "Staples", amount: 115, categoryKey: "office_supplies", expenseDate: "2026-10-13",
    });

    expect(withoutTax).toContain("no input tax credit");
    expect(withTax).not.toContain("no input tax credit");
    expect(notRegistered).not.toContain("input tax credit");
  });

  it("logs a home bill under its Home Office item and states the share it counts at", async () => {
    const settings = {
      user_settings: [{
        user_id: USER, gst_hst_registered: false, vehicle_business_use_pct: 0.8, home_office_business_use_pct: 0.15,
      }],
    };
    const { tools: t, writes } = tools(settings);
    const out = await run(t, "logExpense", {
      vendor: "NB Power", amount: 300, categoryKey: "home_utilities", expenseDate: "2026-10-13",
    });

    expect(writes[0].payload).toMatchObject({ category_key: "home_utilities", total_amount: 300 });
    expect(out).toContain("Home Office: Electricity, Heat & Water");
    expect(out).toContain("15% home office share");
  });

  it("names the item and the GST/HST on the approval card", () => {
    const card = APPROVAL_DESCRIPTIONS.logExpense({
      vendor: "Shell", amount: 115, taxAmount: 15, categoryKey: "vehicle_fuel", expenseDate: "2026-10-13",
    });
    expect(card).toContain("Vehicle: Fuel / Gas");
    expect(card).toContain("$15.00 GST/HST");
  });
});

describe("createRecurringExpense — approval card", () => {
  it("names the expense and its item", () => {
    const card = APPROVAL_DESCRIPTIONS.createRecurringExpense({
      name: "Canva", amount: 20, categoryKey: "office_software",
    });
    expect(card).toContain("Canva");
    expect(card).toContain("Office & Tech: Software Subscriptions");
  });
});

describe("AI-suggested categories", () => {
  it("only an expense item key passes isReceiptCategoryKey", () => {
    for (const key of ITEM_KEYS) expect(isReceiptCategoryKey(key), key).toBe(true);
    for (const key of [...RETIRED_TOOL_KEYS, "professional", "meals", "", null, undefined, 7]) {
      expect(isReceiptCategoryKey(key), String(key)).toBe(false);
    }
  });
});

describe("updateExpense — GST/HST", () => {
  const existing = {
    receipt_expenses: [{
      id: EXPENSE, user_id: USER, vendor: "Shell", total_amount: 115, tax_amount: null,
      category_key: "vehicle_fuel", expense_date: "2026-10-13", notes: null,
    }],
  };

  it("adds the stated GST/HST to an expense logged without it", async () => {
    const { tools: t, writes } = tools(existing);
    const out = await run(t, "updateExpense", { expenseId: EXPENSE, taxAmount: 15 });

    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ tax_amount: 15, subtotal: 100 });
    expect(out).toContain("GST/HST");
  });

  it("refuses GST/HST larger than the total", async () => {
    const { tools: t, writes } = tools(existing);
    await run(t, "updateExpense", { expenseId: EXPENSE, taxAmount: 200 });
    expect(writes).toHaveLength(0);
  });
});

describe("migration 00175 — retired keys go to an item key in the same category", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    path.resolve(HERE, "../../../supabase/migrations/00175_expense_category_keys_to_item_keys.sql"),
    "utf8",
  );
  // ('old_key', 'item_key') pairs in the mapping VALUES list.
  const mapping = new Map(
    [...sql.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)].map((m) => [m[1], m[2]]),
  );
  const groupOf = (itemKey: string) =>
    RECEIPT_CATEGORY_GROUPS.find((g) => g.items.some((i) => i.key === itemKey))?.group;

  it("covers every key the tools used to write", () => {
    expect(RETIRED_TOOL_KEYS.filter((k) => !mapping.has(k))).toEqual([]);
  });

  it("maps only to T2125-mapped item keys, and never from one", () => {
    for (const [from, to] of mapping) {
      expect(EXPENSE_KEY_TO_T2125[to], `${from} → ${to}`).toBeDefined();
      expect(ITEM_KEYS, from).not.toContain(from);
    }
  });

  it("keeps each expense under the same CRA treatment", () => {
    // The 50% limit and the vehicle business-use share follow the key.
    for (const from of ["travel_meals", "meals", "entertainment"]) {
      expect(isMealOrEntertainmentKey(mapping.get(from)), from).toBe(true);
    }
    expect(isVehicleKey(mapping.get("vehicle"))).toBe(true);
    expect(groupOf(mapping.get("marketing") ?? "")).toBe("Marketing");
    expect(groupOf(mapping.get("office_tech") ?? "")).toBe("Office & Tech");
    expect(groupOf(mapping.get("professional") ?? "")).toBe("Professional Fees");
    expect(groupOf(mapping.get("professional_fees") ?? "")).toBe("Professional Fees");
    expect(groupOf(mapping.get("insurance_licenses") ?? "")).toBe("Professional Fees");
    expect(groupOf(mapping.get("education") ?? "")).toBe("Education");
    expect(groupOf(mapping.get("education_dev") ?? "")).toBe("Education");
    expect(mapping.get("other")).toBe("other_misc");
  });
});
