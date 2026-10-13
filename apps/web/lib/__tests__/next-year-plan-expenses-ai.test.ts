/**
 * AI layer for the next-year plan's "Business expenses" row (2026-10-13).
 *
 * The dashboard's next-year plan used to deduct today's monthly recurring
 * figure × 12, so a recurring expense with an end date of Dec 31 was counted
 * for all of next year. It now deducts next year's own figure
 * (`ytdExpenseTotals(...).expensesNextYear`): each Recurring Expenses entry
 * by the charge dates that fall in that year, plus 12 months of the per-item
 * monthly figures.
 *
 * Flight Crew explains the dashboard from three places: the knowledge base
 * (always in the prompt), the playbooks of the two best-matching topics, and
 * the financial context the chat route builds. The first two said the old
 * rule in so many words ("the monthly figure ... next year's plan"), and the
 * third gave the plan's goal and pipeline with no expenses figure at all.
 *
 * The numbers are tested in packages/core/engines/__tests__/
 * (year-plan-engine, t2125-expenses-engine, recurring-expense-engine).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "../..");

/** Tax copy is information, not advice, and reads without em dashes. */
const ADVICE_OR_EM_DASH = /\b(?:should|recommend\w*|must|need to|set aside|build up|top up)\b|—/i;

/** The sentence that states the rule, wherever it is told. */
const STATES_THE_RULE = /next year's plan[^.]*charge dates that fall in that year/i;

const kbEntry = () =>
  KNOWLEDGE_BASE.split("\n").find((line) => line.startsWith("**Recurring expenses: how they count**")) ?? "";

describe("knowledge base: recurring expenses and next year's plan", () => {
  it("no longer lists next year's plan as a use of the monthly figure", () => {
    expect(kbEntry()).not.toBe("");
    expect(kbEntry()).not.toMatch(/survival burn, next year's plan\)/);
  });

  it("says next year's plan counts the charge dates in that year, and the monthly figures for 12 months", () => {
    expect(kbEntry()).toMatch(STATES_THE_RULE);
    expect(kbEntry()).toMatch(/12 months/);
    expect(kbEntry()).toMatch(/not Monthly Recurring x 12/);
  });

  it("is information, not advice", () => {
    expect(kbEntry()).not.toMatch(ADVICE_OR_EM_DASH);
  });
});

describe("Recurring Expenses playbook: next year's plan", () => {
  const playbook = getPlaybook("recurring-expenses");

  it("no longer says the monthly figure feeds next year's plan", () => {
    expect(playbook).not.toMatch(/survival burn and next year's plan/);
  });

  it("states the rule, with the cases an agent asks about", () => {
    expect(playbook).toMatch(STATES_THE_RULE);
    // The lease that ends before next year, the row that starts during it, the annual fee.
    expect(playbook).toMatch(/still in next year's plan/i);
    expect(playbook).toMatch(/ends on December 31[^.]*adds nothing to next year's plan/i);
    expect(playbook).toMatch(/starts during next year counts from its start date/i);
    expect(playbook).toMatch(/annual fee counts once/i);
  });

  it("names where the figure comes from, for the Connector too", () => {
    expect(playbook).toContain("expensesNextYear");
    expect(playbook).toContain("next_year_expenses");
    expect(playbook).not.toContain("projected_annual_recurring");
  });

  it("is information, not advice", () => {
    expect(playbook).not.toMatch(ADVICE_OR_EM_DASH);
  });
});

describe("the playbooks a plan question loads explain the row", () => {
  const explainedBy = (message: string) =>
    classifyTopicMulti(message)
      .slice(0, 2)
      .filter((m) => STATES_THE_RULE.test(getPlaybook(m.topic)))
      .map((m) => m.topic);

  const cases = [
    "why does next year's plan show $12,000 of business expenses",
    "does next year's plan count a recurring expense that has an end date",
    "my 2027 plan business expenses look too high",
    "how are business expenses in my next year plan calculated",
    "my car lease ends in December, why is it still in my 2027 plan",
    "my subscription ends in March, is it counted in my expenses next year",
  ];
  for (const message of cases) {
    it(`"${message}"`, () => {
      expect(explainedBy(message).length).toBeGreaterThan(0);
    });
  }

  it("the goal playbook says what the plan's take-home deducts", () => {
    // "How do I set my goal for next year?" describes the year switch.
    expect(getPlaybook("runway-score")).toMatch(/take-home at goal[^.]*\.[^.]*business expenses expected that year/i);
  });

  it("does not pull in questions that only share a word", () => {
    const topTwo = (message: string) => classifyTopicMulti(message).slice(0, 2).map((m) => m.topic);
    expect(topTwo("my client's lease ends in March, draft them a note")).not.toContain("recurring-expenses");
    expect(topTwo("how do I set my goal for next year")).not.toContain("recurring-expenses");
    expect(topTwo("when does my trial end")).not.toContain("recurring-expenses");
  });
});

describe("chat context: the plan's expenses figure comes from the engine", () => {
  const route = readFileSync(path.join(WEB_ROOT, "app/api/chat/route.ts"), "utf8");
  const planLine = route.slice(route.indexOf("Next-year plan (${ny})"), route.indexOf("Next-year plan (${ny})") + 1400);

  it("the Next-year plan line gives next year's business expenses", () => {
    expect(planLine).toContain("expenseTotals.expensesNextYear");
    expect(planLine).toMatch(/charge dates/);
  });

  it("it is not worked out in the route", () => {
    expect(route).not.toMatch(/monthlyRecurring\s*\*\s*12/);
  });
});
