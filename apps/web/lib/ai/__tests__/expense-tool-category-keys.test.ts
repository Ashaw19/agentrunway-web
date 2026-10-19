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
 *   5. a recurring expense carries the GST/HST inside each charge
 *      (`hst_included` / `hst_amount`) the same way: as stated, never worked
 *      out. Until 2026-10-13 neither recurring tool wrote those columns, so
 *      a recurring expense set up through Flight Crew had no input tax
 *      credit on the GST34 pre-fill and counted in full for a registrant.
 *   6. Navigator can add it to an existing one: searchRecurringExpenses
 *      shows the GST/HST on each entry and its ID, updateRecurringExpense
 *      takes it, the chat prompt routes there, and no copy the model reads
 *      says Flight Crew can't (2026-10-19).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asSchema } from "ai";
import { EXPENSE_KEY_TO_T2125 } from "@agent-runway/core/engines/t2125-engine";
import { isMealOrEntertainmentKey, isVehicleKey } from "@agent-runway/core/engines/gst34-engine";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import { RECEIPT_CATEGORIES, RECEIPT_CATEGORY_GROUPS, isReceiptCategoryKey } from "@/lib/types/receipt";
import { recurringHSTEntriesForPeriod } from "@agent-runway/core/engines/recurring-expense-engine";
import { expenseTaxContext, recurringNetOfItc } from "@agent-runway/core/engines/expense-totals-engine";
import { APPROVAL_DESCRIPTIONS, NEEDS_APPROVAL_TOOLS, createAgentTools } from "../tools";
import { fakeSupabase, type FakeSupabaseOptions, type Row } from "./helpers/fake-supabase";

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

function tools(tables: Record<string, Row[]> = {}, options: FakeSupabaseOptions = {}) {
  const { client, writes } = fakeSupabase(tables, options);
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
    expect(card).not.toContain("GST/HST");
  });

  it("shows the GST/HST when one is stated", () => {
    const card = APPROVAL_DESCRIPTIONS.createRecurringExpense({
      name: "Canva", amount: 115, hstAmount: 15, categoryKey: "office_software",
    });
    expect(card).toContain("Office & Tech: Software Subscriptions");
    expect(card).toContain("$15.00 GST/HST");
  });
});

/** A GST/HST registrant in a 15% HST province: a rate the tools could reach for. */
const REGISTRANT = {
  user_settings: [{
    user_id: USER, gst_hst_registered: true, province: "newBrunswick",
    vehicle_business_use_pct: 0.8, home_office_business_use_pct: 0,
  }],
};

describe("createRecurringExpense — GST/HST", () => {
  const canva = { name: "Canva", amount: 115, categoryKey: "office_software", dayOfMonth: 1 };

  it("records no GST/HST when none is stated, whatever the province's rate", async () => {
    const { tools: t, writes } = tools(REGISTRANT);
    await run(t, "createRecurringExpense", canva);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "recurring_expenses", op: "insert" });
    expect(writes[0].payload).toMatchObject({
      user_id: USER, name: "Canva", amount: 115, category_key: "office_software",
      hst_included: false, hst_amount: 0,
    });
  });

  it("records the GST/HST the agent states, exactly as stated", async () => {
    const { tools: t, writes } = tools(REGISTRANT);
    // $12.40 is not 15% of anything here: a worked-out figure would be $15.00.
    const out = await run(t, "createRecurringExpense", { ...canva, hstAmount: 12.4 });

    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ amount: 115, hst_included: true, hst_amount: 12.4 });
    expect(out).toContain("$12.40 GST/HST");
  });

  it("what it writes is what the GST34 pre-fill claims and the totals take off", async () => {
    // The columns the tool sets, then the row as the engines read it back.
    const charge = { amount: 115, hst_included: true, hst_amount: 15, category_key: "office_software" };
    const { tools: t, writes } = tools(REGISTRANT);
    await run(t, "createRecurringExpense", { ...canva, hstAmount: 15 });
    expect(writes[0].payload).toMatchObject(charge);

    const row: RecurringExpense = {
      ...charge, id: "r1", user_id: USER, name: "Canva", frequency: "monthly", day_of_month: 1,
      month_of_year: null, vehicle_pct_applicable: false, notes: "", start_date: "2026-01-01",
      end_date: null, is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01",
    };
    const ctx = expenseTaxContext(REGISTRANT.user_settings[0]);

    expect(recurringNetOfItc(row, ctx)).toMatchObject({ paid: 115, itc: 15, net: 100 });
    // Three monthly charges in Q3, $15 of GST/HST in each.
    expect(recurringHSTEntriesForPeriod([row], "2026-07-01", "2026-09-30")).toEqual(
      [{ category_key: "office_software", tax_amount: 45, vehicle_use: false }],
    );
  });

  it("treats a stated $0 as no GST/HST, so the web form never fills one in from a rate", async () => {
    // The recurring dialog works the amount out from the province rate when
    // "includes HST" is on and the amount is 0 (expenses-content.tsx,
    // saveRecurringExpense). A row with the box on and $0 would pick one up
    // on its next edit there.
    const { tools: t, writes } = tools(REGISTRANT);
    await run(t, "createRecurringExpense", { ...canva, hstAmount: 0 });

    expect(writes[0].payload).toMatchObject({ hst_included: false, hst_amount: 0 });
  });

  it("refuses GST/HST larger than the charge, and writes nothing", async () => {
    const { tools: t, writes } = tools(REGISTRANT);
    const out = await run(t, "createRecurringExpense", { ...canva, amount: 20, hstAmount: 25 });

    expect(writes).toHaveLength(0);
    expect(out).toContain("GST/HST");
    expect(out).not.toContain("✓");
  });

  it("rejects a negative GST/HST amount", async () => {
    expect(await accepts("createRecurringExpense", { ...canva, hstAmount: -1 })).toBe(false);
    expect(await accepts("createRecurringExpense", { ...canva, hstAmount: 15 })).toBe(true);
  });

  it("tells a registrant when no input tax credit is counted", async () => {
    const withoutTax = await run(tools(REGISTRANT).tools, "createRecurringExpense", canva);
    const withTax = await run(tools(REGISTRANT).tools, "createRecurringExpense", { ...canva, hstAmount: 15 });
    const notRegistered = await run(tools().tools, "createRecurringExpense", canva);

    expect(withoutTax).toContain("no input tax credit");
    // The way to add it later: the agent states the amount (Navigator), or the Expenses page.
    expect(withoutTax).toContain("updateRecurringExpense");
    expect(withTax).not.toContain("no input tax credit");
    expect(notRegistered).not.toContain("input tax credit");
  });

  it("still reports the expense as created when the registration can't be read afterwards", async () => {
    // A failure reported here would have the model create it a second time.
    const { tools: t, writes } = tools({}, { unreachable: ["user_settings"] });
    const out = await run(t, "createRecurringExpense", canva);

    expect(writes).toHaveLength(1);
    expect(out).toContain("✓ Recurring expense created");
    expect(out).not.toContain("Failed");
  });

  it("describes the GST/HST input as stated, never calculated", async () => {
    for (const tool of ["createRecurringExpense", "updateRecurringExpense"]) {
      const schema = await asSchema(tools().tools[tool].inputSchema).jsonSchema;
      const prop = schema.properties?.hstAmount;
      if (typeof prop !== "object") throw new Error(`${tool}.hstAmount is missing`);
      expect(prop.description, tool).toContain("ONLY when the agent states it");
      expect(prop.description, tool).toContain("Never calculate it from a rate or a province");
      expect(schema.required ?? [], tool).not.toContain("hstAmount");
    }
  });
});

describe("updateRecurringExpense — GST/HST", () => {
  const stored = (over: Row = {}) => ({
    recurring_expenses: [{
      id: EXPENSE, user_id: USER, name: "Canva", amount: 115, category_key: "office_software",
      hst_included: false, hst_amount: 0, is_active: true, ...over,
    }],
    ...REGISTRANT,
  });

  it("adds the stated GST/HST to a recurring expense set up without it", async () => {
    const { tools: t, writes } = tools(stored());
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: EXPENSE, hstAmount: 12.4 });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "recurring_expenses", op: "update" });
    expect(writes[0].payload).toMatchObject({ hst_included: true, hst_amount: 12.4 });
    expect(writes[0].payload).not.toHaveProperty("amount");
    expect(out).toContain("none recorded → $12.40");
  });

  it("removes the GST/HST when the agent states $0", async () => {
    const { tools: t, writes } = tools(stored({ hst_included: true, hst_amount: 15 }));
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: EXPENSE, hstAmount: 0 });

    expect(writes[0].payload).toMatchObject({ hst_included: false, hst_amount: 0 });
    expect(out).toContain("$15.00 → none");
  });

  it("refuses GST/HST larger than the stored charge, and writes nothing", async () => {
    const { tools: t, writes } = tools(stored());
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: EXPENSE, hstAmount: 200 });

    expect(writes).toHaveLength(0);
    expect(out).toContain("GST/HST");
  });

  it("refuses a new amount smaller than the GST/HST already recorded", async () => {
    const { tools: t, writes } = tools(stored({ hst_included: true, hst_amount: 15 }));
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: EXPENSE, amount: 10 });

    expect(writes).toHaveLength(0);
    expect(out).toContain("GST/HST");
  });

  it("leaves the recorded GST/HST alone when only the amount changes, and says so", async () => {
    const { tools: t, writes } = tools(stored({ hst_included: true, hst_amount: 15 }));
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: EXPENSE, amount: 230 });

    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ amount: 230 });
    expect(writes[0].payload).not.toHaveProperty("hst_amount");
    expect(writes[0].payload).not.toHaveProperty("hst_included");
    expect(out).toContain("$15.00");
    expect(out).toContain("not recalculated");
  });

  it("does not touch GST/HST on a change that isn't about money", async () => {
    const { tools: t, writes } = tools(stored({ hst_included: true, hst_amount: 15 }));
    await run(t, "updateRecurringExpense", { recurringExpenseId: EXPENSE, isActive: false });

    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ is_active: false });
    expect(writes[0].payload).not.toHaveProperty("hst_amount");
    expect(writes[0].payload).not.toHaveProperty("hst_included");
  });

  it("writes nothing for a recurring expense that isn't the user's", async () => {
    const { tools: t, writes } = tools(stored({ user_id: "someone-else" }));
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: EXPENSE, hstAmount: 15 });

    expect(writes).toHaveLength(0);
    expect(out).toContain("not found");
  });

  it("is behind the approval card, which shows the GST/HST", () => {
    expect(NEEDS_APPROVAL_TOOLS.has("updateRecurringExpense")).toBe(true);
    const card = APPROVAL_DESCRIPTIONS.updateRecurringExpense({
      recurringExpenseId: EXPENSE, expenseName: "Canva", hstAmount: 15,
    });
    expect(card).toContain("Canva");
    expect(card).toContain("$15.00");
    expect(card).toContain("GST/HST");
  });
});

describe("Navigator adds GST/HST to an existing recurring expense", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const WEB = path.resolve(HERE, "../../..");
  const source = (file: string) => readFileSync(path.resolve(WEB, file), "utf8");
  const ROGERS = "00000000-0000-4000-8000-000000000002";
  const rows = {
    recurring_expenses: [
      {
        id: EXPENSE, user_id: USER, name: "Canva", amount: 115, category_key: "office_software", frequency: "monthly",
        day_of_month: 1, hst_included: true, hst_amount: 15, start_date: "2026-01-01", end_date: null, is_active: true, notes: null,
      },
      {
        id: ROGERS, user_id: USER, name: "Rogers", amount: 92, category_key: "office_phone", frequency: "monthly",
        day_of_month: 5, hst_included: false, hst_amount: 0, start_date: "2026-01-01", end_date: null, is_active: true, notes: null,
      },
    ],
    ...REGISTRANT,
  };
  const lineFor = (out: string, name: string) => out.split("\n").find((l) => l.includes(name)) ?? "";

  it("searchRecurringExpenses shows the GST/HST recorded on each charge, or that none is", async () => {
    const out = await run(tools(rows).tools, "searchRecurringExpenses", {});

    expect(lineFor(out, "Canva")).toContain("$15.00 GST/HST");
    expect(lineFor(out, "Rogers")).toContain("no GST/HST recorded");
    // The amounts as charged: the GST/HST is inside the $115, not added to it.
    expect(lineFor(out, "Canva")).toContain("$115.00/month");
  });

  it("the ID search prints is the one updateRecurringExpense takes", async () => {
    const t = tools(rows);
    const found = await run(t.tools, "searchRecurringExpenses", { query: "rogers" });
    const id = found.match(/\(ID: ([0-9a-f-]{36})\)/)?.[1];
    expect(id).toBe(ROGERS);

    const out = await run(t.tools, "updateRecurringExpense", { recurringExpenseId: id, hstAmount: 12 });
    expect(t.writes).toEqual([
      expect.objectContaining({ table: "recurring_expenses", op: "update", payload: expect.objectContaining({ hst_included: true, hst_amount: 12 }) }),
    ]);
    expect(out).toContain("none recorded → $12.00");
  });

  it("the chat prompt sends a change to an existing entry through search, then update", () => {
    const trigger = source("app/api/chat/route.ts").split("\n").find((l) => /existing recurring expense/i.test(l) && l.startsWith("- ")) ?? "";
    expect(trigger).toContain("searchRecurringExpenses → updateRecurringExpense");
    expect(trigger).toContain("hstAmount");
    expect(trigger).toMatch(/never worked out from a rate/);
  });

  it("nothing the model reads says Flight Crew can't change an existing recurring expense", () => {
    const cannot = /no flight crew member can (?:edit|change)|(?:flight crew|navigator) can(?:not|'t| not) (?:edit|change)|can(?:not|'t| not) edit an existing recurring|can be added by editing the entry in the Recurring Expenses list\./i;
    for (const file of ["lib/ai/tools.ts", "lib/troubleshooting-playbooks.ts", "lib/knowledge-base.ts", "app/api/chat/route.ts"]) {
      const hits = source(file).split("\n").filter((l) => cannot.test(l));
      expect(hits, file).toEqual([]);
    }
  });
});

describe("deleteRecurringExpense — approval card", () => {
  it("names the recurring expense", () => {
    const card = APPROVAL_DESCRIPTIONS.deleteRecurringExpense({
      recurringExpenseId: EXPENSE, expenseName: "Canva",
    });
    expect(card).toContain("Canva");
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
