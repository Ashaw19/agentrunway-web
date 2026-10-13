/**
 * Flight Crew can end a recurring expense (2026-10-13).
 *
 * A recurring expense counts by its schedule: the charge dates from its
 * start date to its end date. Until this date nothing wrote `end_date`. The
 * only ways to stop one were to pause it (`is_active` false) or delete it,
 * and every total reads active rows only, so either one also took the months
 * already past out of the year to date, the T2125 lines and the ITCs.
 *
 * Pinned here:
 *   1. updateRecurringExpense takes an end date, writes `end_date` and
 *      leaves the row active
 *   2. an end date before the start date, or one that is not a calendar
 *      date, is refused and nothing is written
 *   3. searchRecurringExpenses tells an ended row from a running one
 *   4. deleteRecurringExpense says what deleting removes, and points to the
 *      end date for an expense that was real
 *   5. Navigator, the persona with the expense tools, can look a recurring
 *      expense up and end it (it could only create and delete)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";
import { APPROVAL_DESCRIPTIONS, NEEDS_APPROVAL_TOOLS, createAgentTools, createPersonaAgentTools } from "../tools";
import { fakeSupabase, type Row } from "./helpers/fake-supabase";

const USER = "user-1";
const CANVA = "00000000-0000-4000-8000-000000000001";
const LEASE = "00000000-0000-4000-8000-000000000002";
const GYM = "00000000-0000-4000-8000-000000000003";
const BOARD = "00000000-0000-4000-8000-000000000004";

const row = (over: Row = {}): Row => ({
  id: CANVA, user_id: USER, name: "Canva", amount: 115, category_key: "office_software",
  frequency: "monthly", day_of_month: 1, hst_included: false, hst_amount: 0,
  start_date: "2026-01-01", end_date: null, is_active: true, notes: null,
  ...over,
});

function tools(rows: Row[] = [row()]) {
  const { client, writes } = fakeSupabase({ recurring_expenses: rows });
  return { tools: createAgentTools(client, USER), writes };
}

type Execute = (input: Record<string, unknown>, opts: unknown) => Promise<string>;
const run = (t: ReturnType<typeof tools>["tools"], tool: string, input: Record<string, unknown>) =>
  (t[tool].execute as Execute)(input, { toolCallId: "t", messages: [] });

async function accepts(tool: string, input: Record<string, unknown>): Promise<boolean> {
  const validate = asSchema(tools().tools[tool].inputSchema).validate;
  if (!validate) throw new Error(`${tool} has no validator`);
  return (await validate(input)).success;
}

// 13 October 2026, mid-afternoon Atlantic. The server runs in UTC.
beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T18:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("updateRecurringExpense — end date", () => {
  it("takes a YYYY-MM-DD end date, or null to remove one", async () => {
    expect(await accepts("updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-06-30" })).toBe(true);
    expect(await accepts("updateRecurringExpense", { recurringExpenseId: CANVA, endDate: null })).toBe(true);
    expect(await accepts("updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "June 30" })).toBe(false);
    expect(await accepts("updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-6-30" })).toBe(false);
  });

  it("writes the end date and leaves the expense active, so its earlier charges keep counting", async () => {
    const { tools: t, writes } = tools();
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-06-30" });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "recurring_expenses", op: "update" });
    expect(writes[0].payload).toMatchObject({ end_date: "2026-06-30" });
    expect(writes[0].payload).not.toHaveProperty("is_active");
    expect(out).toContain("2026-06-30");
    expect(out).toContain("stay in");
  });

  it("refuses an end date before the start date, and writes nothing", async () => {
    const { tools: t, writes } = tools([row({ start_date: "2026-03-01" })]);
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-02-28" });

    expect(writes).toHaveLength(0);
    expect(out).toContain("2026-03-01");
    expect(out).toContain("nothing was changed");
  });

  it("accepts an end date on the start date", async () => {
    const { tools: t, writes } = tools([row({ start_date: "2026-03-01" })]);
    await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-03-01" });

    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ end_date: "2026-03-01" });
  });

  it("refuses a date that is not on the calendar, and writes nothing", async () => {
    const { tools: t, writes } = tools();
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-02-30" });

    expect(writes).toHaveLength(0);
    expect(out).toContain("2026-02-30");
    expect(out).toContain("nothing was changed");
  });

  it("accepts an end date still ahead, and says it ends then", async () => {
    const { tools: t, writes } = tools();
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-12-31" });

    expect(writes[0].payload).toMatchObject({ end_date: "2026-12-31" });
    expect(out).toContain("2026-12-31");
  });

  it("removes the end date with null", async () => {
    const { tools: t, writes } = tools([row({ end_date: "2026-06-30" })]);
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: null });

    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ end_date: null });
    expect(out).toContain("end date removed");
  });

  it("leaves the end date alone on a change that isn't about it", async () => {
    const { tools: t, writes } = tools([row({ end_date: "2026-06-30" })]);
    await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, notes: "old plan" });

    expect(writes).toHaveLength(1);
    expect(writes[0].payload).not.toHaveProperty("end_date");
  });

  it("says a paused expense counts nothing until it is resumed", async () => {
    const { tools: t, writes } = tools([row({ is_active: false })]);
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-06-30" });

    expect(writes[0].payload).toMatchObject({ end_date: "2026-06-30" });
    expect(out).toContain("paused");
  });

  it("resumes and ends a paused expense in one change, with no paused note", async () => {
    const { tools: t, writes } = tools([row({ is_active: false })]);
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-06-30", isActive: true });

    expect(writes[0].payload).toMatchObject({ end_date: "2026-06-30", is_active: true });
    expect(out).not.toContain("is paused");
  });

  it("writes nothing for a recurring expense that isn't the user's", async () => {
    const { tools: t, writes } = tools([row({ user_id: "someone-else" })]);
    const out = await run(t, "updateRecurringExpense", { recurringExpenseId: CANVA, endDate: "2026-06-30" });

    expect(writes).toHaveLength(0);
    expect(out).toContain("not found");
  });

  it("is behind the approval card, which shows the end date", () => {
    expect(NEEDS_APPROVAL_TOOLS.has("updateRecurringExpense")).toBe(true);
    const ending = APPROVAL_DESCRIPTIONS.updateRecurringExpense({
      recurringExpenseId: CANVA, expenseName: "Canva", endDate: "2026-06-30",
    });
    expect(ending).toContain("Canva");
    expect(ending).toContain("2026-06-30");

    const reopening = APPROVAL_DESCRIPTIONS.updateRecurringExpense({
      recurringExpenseId: CANVA, expenseName: "Canva", endDate: null,
    });
    expect(reopening).toContain("end date removed");
  });

  it("describes ending as what keeps the earlier charges, and pausing as what does not", () => {
    const description = tools().tools.updateRecurringExpense.description ?? "";
    expect(description).toContain("endDate");
    expect(description).toMatch(/paus/i);
  });
});

describe("searchRecurringExpenses — ended, ending and running", () => {
  const rows = [
    row({ id: CANVA, name: "Canva" }),
    row({ id: LEASE, name: "Car lease", end_date: "2026-06-30" }),
    row({ id: GYM, name: "Gym", end_date: "2026-12-31" }),
    row({ id: BOARD, name: "Board dues", frequency: "annual", amount: 1200, is_active: false }),
  ];
  const lineFor = (out: string, name: string) => out.split("\n").find((l) => l.includes(name)) ?? "";

  it("marks a row whose end date has passed as ended, with the date", async () => {
    const out = await run(tools(rows).tools, "searchRecurringExpenses", {});
    expect(lineFor(out, "Car lease")).toContain("Ended 2026-06-30");
    expect(lineFor(out, "Car lease")).not.toContain("Active");
  });

  it("shows an end date still ahead on a row that is running", async () => {
    const out = await run(tools(rows).tools, "searchRecurringExpenses", {});
    expect(lineFor(out, "Gym")).toContain("Active");
    expect(lineFor(out, "Gym")).toContain("ends 2026-12-31");
  });

  it("shows no end date on a row without one", async () => {
    const out = await run(tools(rows).tools, "searchRecurringExpenses", {});
    expect(lineFor(out, "Canva")).toContain("Active");
    expect(lineFor(out, "Canva")).not.toMatch(/end/i);
  });

  it("a row is still running on its end date (Atlantic day)", async () => {
    const out = await run(tools([row({ end_date: "2026-10-13" })]).tools, "searchRecurringExpenses", {});
    expect(out).toContain("Active");
    expect(out).toContain("ends 2026-10-13");
  });

  it("keeps showing a paused row as paused", async () => {
    const out = await run(tools(rows).tools, "searchRecurringExpenses", {});
    expect(lineFor(out, "Board dues")).toContain("Paused");
  });

  it("states each row's own frequency", async () => {
    const out = await run(tools(rows).tools, "searchRecurringExpenses", {});
    expect(lineFor(out, "Board dues")).toContain("$1200.00/year");
    expect(lineFor(out, "Canva")).toContain("$115.00/month");
  });
});

describe("deleteRecurringExpense — what it removes", () => {
  it("points to the end date for an expense that was real", () => {
    const description = tools().tools.deleteRecurringExpense.description ?? "";
    expect(description).toContain("updateRecurringExpense");
    expect(description).toContain("endDate");
    expect(description).toContain("months already past");
  });

  it("the approval card says the months already past go with it", () => {
    const card = APPROVAL_DESCRIPTIONS.deleteRecurringExpense({ recurringExpenseId: CANVA, expenseName: "Canva" });
    expect(card).toContain("Canva");
    expect(card).toContain("months already past");
  });

  it("the reply says so too, and names the end date as the way to keep them", async () => {
    const { tools: t, writes } = tools();
    const out = await run(t, "deleteRecurringExpense", { recurringExpenseId: CANVA, expenseName: "Canva" });

    expect(writes).toEqual([{ table: "recurring_expenses", op: "delete", payload: null }]);
    expect(out).toContain("months already past");
    expect(out).toContain("end date");
  });
});

describe("persona tool sets", () => {
  const personaTools = (persona: "captain" | "navigator" | "dispatcher") =>
    Object.keys(createPersonaAgentTools(fakeSupabase({}).client, USER, persona));

  it("Navigator can look a recurring expense up and end it", () => {
    const navigator = personaTools("navigator");
    expect(navigator).toContain("searchRecurringExpenses");
    expect(navigator).toContain("updateRecurringExpense");
    expect(navigator).toContain("createRecurringExpense");
    expect(navigator).toContain("deleteRecurringExpense");
  });

  it("Captain and Dispatcher have no recurring expense tools", () => {
    for (const persona of ["captain", "dispatcher"] as const) {
      expect(personaTools(persona).filter((name) => /RecurringExpense/.test(name))).toEqual([]);
    }
  });
});
