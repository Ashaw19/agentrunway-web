/**
 * AI layer for the footer under the Recurring Expenses list (2026-10-13).
 *
 * The footer read "Monthly avg" and "Annual total", the second being the
 * first × 12. It now reads "Monthly avg" and the year total, labelled with
 * the year ("2026 total"): each entry by the charge dates that fall in this
 * calendar year, as entered (`recurringListFooter`).
 *
 * Flight Crew explains the Expenses page from the knowledge base (always in
 * the prompt) and the playbooks of the two best-matching topics, or the
 * page's own topics when nothing matches. The playbook said an ended entry
 * "adds nothing to ... the 'Monthly avg' and 'Annual total' under the list",
 * which is no longer so: an entry that ended this year keeps its charges up
 * to its end date in the year total.
 *
 * The numbers are tested in lib/expenses/__tests__/recurring-list-footer.test.ts.
 */
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti, PAGE_TO_TOPICS } from "@/lib/troubleshooting-classifier";

/** Tax copy is information, not advice, and reads without em dashes. */
const ADVICE_OR_EM_DASH = /\b(?:should|recommend\w*|must|need to|set aside|build up|top up)\b|—/i;

/** The sentence that states the rule, wherever it is told. */
const STATES_THE_RULE = /year total[^.]*charges? dated in this calendar year/i;

const kbEntry = () =>
  KNOWLEDGE_BASE.split("\n").find((line) => line.startsWith("**Recurring expenses: how they count**")) ?? "";

describe("knowledge base: the figures under the Recurring Expenses list", () => {
  it("says what the year total is, and that it carries the year in its label", () => {
    expect(kbEntry()).not.toBe("");
    expect(kbEntry()).toMatch(STATES_THE_RULE);
    expect(kbEntry()).toMatch(/"Monthly avg"/);
    expect(kbEntry()).toMatch(/"2026 total"/);
  });

  it("says it is not the monthly figure x 12, and that both are as entered", () => {
    expect(kbEntry()).toMatch(/not Monthly avg x 12/);
    expect(kbEntry()).toMatch(/both include GST\/HST/i);
  });

  it("names the old label only as what it used to read", () => {
    const mentions = kbEntry().match(/[^.]*"Annual total"[^.]*/g) ?? [];
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatch(/used to read/);
  });

  it("is information, not advice", () => {
    expect(kbEntry()).not.toMatch(ADVICE_OR_EM_DASH);
  });
});

describe("Recurring Expenses playbook: the figures under the list", () => {
  const playbook = getPlaybook("recurring-expenses");

  it("no longer says an ended entry adds nothing to an \"Annual total\"", () => {
    expect(playbook).not.toMatch(/"Monthly avg" and "Annual total" under the list/);
    // An ended entry is out of the monthly figure and keeps its charges in the year.
    expect(playbook).toMatch(/adds nothing to Monthly Recurring or to the "Monthly avg" under the list/);
    expect(playbook).toMatch(/year total beside it keeps the entry's charges up to its end date/i);
  });

  it("states the rule, with the cases an agent asks about", () => {
    expect(playbook).toMatch(STATES_THE_RULE);
    expect(playbook).toMatch(/not Monthly avg x 12/);
    // The entry that ended, the one due to end, the one that started mid-year, the annual fee.
    expect(playbook).toMatch(/ended this year keeps its charges up to its end date/i);
    expect(playbook).toMatch(/end date still ahead stops at that date/i);
    expect(playbook).toMatch(/started part-way through the year counts from its start date/i);
    expect(playbook).toMatch(/annual fee counts once/i);
    // When the two do agree, so the agent can check its own list.
    expect(playbook).toMatch(/year total is 12 times Monthly avg/i);
  });

  it("says the footer is as entered and why it can be above the totals", () => {
    expect(playbook).toMatch(/as entered \(GST\/HST included/);
    expect(playbook).toMatch(/net of ITCs[^.]*Home Office bill at the home office share/i);
  });

  it("says where the figure comes from and what it replaced", () => {
    expect(playbook).toContain("recurringListFooter");
    expect(playbook).toContain("recurringChargesInYear");
    expect(playbook).toMatch(/used to read "Annual total" and was Monthly avg x 12/);
  });

  it("answers the agent who sees the two figures disagree", () => {
    expect(playbook).toMatch(/\*\*"The year total under my recurring list is not 12 times the monthly avg"/);
    expect(playbook).toMatch(/"Where did Annual total go"/i);
  });

  it("is information, not advice", () => {
    expect(playbook).not.toMatch(ADVICE_OR_EM_DASH);
  });
});

describe("Expenses playbook: what is still shown as paid", () => {
  const playbook = getPlaybook("expenses");

  it("names the two figures under the list, not \"annual totals\"", () => {
    expect(playbook).not.toMatch(/monthly and annual totals/);
    expect(playbook).toMatch(/Recurring Expenses list with the two "as charged" figures under it \("Monthly avg" and the year total/);
  });
});

describe("the playbooks a footer question loads explain it", () => {
  const explainedBy = (message: string) =>
    classifyTopicMulti(message)
      .slice(0, 2)
      .filter((m) => STATES_THE_RULE.test(getPlaybook(m.topic)))
      .map((m) => m.topic);

  const cases = [
    "why is the 2026 total under my recurring expenses not 12 times the monthly avg",
    "where did the annual total under my recurring expenses go",
    "what does 2026 total mean under the recurring expenses list",
    "does the total under my recurring expenses count a subscription I cancelled in June",
    "my recurring expense list shows a year total lower than monthly avg x 12",
  ];
  for (const message of cases) {
    it(`"${message}"`, () => {
      expect(explainedBy(message).length).toBeGreaterThan(0);
    });
  }

  it("a question with no topic words, asked on the Expenses page, still loads it", () => {
    // The chat route falls back to the page's topics when the message matches none.
    expect(classifyTopicMulti("what does 2026 total mean")).toEqual([]);
    expect((PAGE_TO_TOPICS["/expenses"] ?? []).slice(0, 2)).toContain("recurring-expenses");
  });
});
