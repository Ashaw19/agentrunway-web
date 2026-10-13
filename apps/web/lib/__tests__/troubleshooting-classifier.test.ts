import { describe, it, expect } from "vitest";
import { classifyTopic, classifyTopicMulti } from "@/lib/troubleshooting-classifier";

// Guards the REAL Brokerage comp keywords added for comp_plan = 'real'
// (migration 00161 / real-compensation-engine.ts). Keywords are matched as
// plain substrings at 5 points each, so a phrase that reads naturally inside
// another topic's question will silently hijack it — these cases pin both
// directions.

describe("classifyTopic — REAL compensation keywords", () => {
  const settingsCases = [
    "how does the REAL Brokerage plan work",
    "what is my cap tier",
    "explain company dollar",
    "what is the elite fee",
    "what is the elite threshold",
    "is the cbr fee per deal",
    "what is beop",
    "where do I set my real join date",
    "what compensation plan am I on",
    "change my comp plan",
    "what is the post cap fee",
  ];

  for (const message of settingsCases) {
    it(`routes to settings: "${message}"`, () => {
      expect(classifyTopic(message)).toBe("settings");
    });
  }
});

describe("classifyTopic — REAL keywords do not hijack other topics", () => {
  const cases: [string, string][] = [
    ["when is my client's anniversary outreach", "flight-control"],
    ["add a new transaction with commission", "transactions"],
    ["how do I invite a team member", "teams"],
    ["my pipeline weighted gci looks wrong", "pipeline"],
    ["what is my referral fee split", "referrals"],
  ];

  for (const [message, expected] of cases) {
    it(`"${message}" stays on ${expected}, not settings`, () => {
      expect(classifyTopic(message)).not.toBe("settings");
    });
  }
});

describe("classifyTopic — CASL drafting questions reach the Flight Control playbook", () => {
  const cases = [
    "why does it say call instead of email for my past client",
    "what is casl implied consent",
    "can I still email a client who bought 3 years ago? express consent?",
    "who are the past clients listed under newsletter recipients",
  ];

  for (const message of cases) {
    it(`routes to flight-control: "${message}"`, () => {
      expect(classifyTopic(message)).toBe("flight-control");
    });
  }
});

describe("classifyTopic — CRM on-demand draft buttons reach the Flight Control playbook", () => {
  const cases = [
    "the ask for referral button says no closed deal on record",
    "request review button gave me an error",
    "how do I send a review request to a past client",
    "why is there no draft button on a going quiet client",
  ];

  for (const message of cases) {
    it(`routes to flight-control: "${message}"`, () => {
      expect(classifyTopic(message)).toBe("flight-control");
    });
  }

  it("still routes referral-fee questions to referrals", () => {
    expect(classifyTopic("how do I log a referral fee I paid")).toBe("referrals");
  });
});

describe("classifyTopic — collapsed-deal outreach questions reach the Flight Control playbook", () => {
  const cases = [
    "why is there no anniversary note for a client whose deal collapsed",
    "the deal collapsed, why did the review request and follow-ups stop",
  ];

  for (const message of cases) {
    it(`routes to flight-control: "${message}"`, () => {
      expect(classifyTopic(message)).toBe("flight-control");
    });
  }
});

describe("classifyTopic — CRM briefing questions reach the CRM playbook", () => {
  const cases = [
    "why does my briefing show a closing anniversary for a deal that collapsed",
    "today's focus says mortgage renewal for a deal that fell through",
    "why is there no home anniversary in the briefing for this deal",
  ];

  for (const message of cases) {
    it(`routes to crm: "${message}"`, () => {
      expect(classifyTopic(message)).toBe("crm");
    });
  }

  it("a Draft button question on the briefing still reaches Flight Control", () => {
    expect(classifyTopic("why is there no draft button on the briefing row")).toBe("flight-control");
  });
});

describe("classifyTopic — CRM lifetime GCI questions reach the CRM playbook", () => {
  const cases = [
    "why doesn't my lifetime gci include a collapsed deal",
    "my total deals and repeat rate dropped after a deal collapsed",
    "the gift budget for this client changed",
    "why did the first class badge disappear",
  ];

  for (const message of cases) {
    it(`routes to crm: "${message}"`, () => {
      expect(classifyTopic(message)).toBe("crm");
    });
  }
});

// A recurring expense can be given an end date (2026-10-13). The chat route
// loads the playbooks of the two best topics, so a question about an expense
// that stopped has to land "recurring-expenses" in that pair, in the words
// an agent uses for it (a cancelled subscription, a lease that ended).
describe("classifyTopicMulti — ending a recurring expense reaches the Recurring Expenses playbook", () => {
  const topTwo = (message: string) => classifyTopicMulti(message).slice(0, 2).map((m) => m.topic);

  const cases = [
    "I cancelled my Canva subscription in June, do the earlier months still count?",
    "how do I put an end date on a recurring expense",
    "my car lease ended in June, how do I stop it without losing the months I paid",
    "I stopped paying for Mailchimp in the spring",
    "my Mailchimp entry says Ended but it is still in the list",
    "what is the difference between ending and deleting a recurring expense",
    "I no longer pay for the gym, how do I take it off",
  ];
  for (const message of cases) {
    it(`"${message}"`, () => {
      expect(topTwo(message)).toContain("recurring-expenses");
    });
  }

  it("does not pull in questions that only share a word", () => {
    expect(topTwo("when does my trial end")).not.toContain("recurring-expenses");
    expect(topTwo("my client's lease ended, draft them a note")).not.toContain("recurring-expenses");
    expect(topTwo("what is the expected close date on the Main St deal")).not.toContain("recurring-expenses");
  });
});

// An end date still ahead, and next year's plan (2026-10-13). The plan counts
// a recurring expense by its charge dates in that year, so the question an
// agent asks is about an expense that is going to stop, in the future tense.
describe("classifyTopicMulti — an expense that is going to end reaches the Recurring Expenses playbook", () => {
  const topTwo = (message: string) => classifyTopicMulti(message).slice(0, 2).map((m) => m.topic);

  const cases = [
    "my car lease ends in December, why is it still in my 2027 plan",
    "my lease ends December 31, will next year's plan still count it",
    "my Canva subscription ends in March, is it counted in my expenses next year",
    "what are my expenses for next year if my subscription ends in June",
  ];
  for (const message of cases) {
    it(`"${message}"`, () => {
      expect(topTwo(message)).toContain("recurring-expenses");
    });
  }

  it("does not pull in questions that only share a word", () => {
    expect(topTwo("my client's lease ends in March, draft them a note")).not.toContain("recurring-expenses");
    expect(topTwo("how do I set my goal for next year")).not.toContain("recurring-expenses");
    expect(topTwo("what is my GCI goal next year")).not.toContain("recurring-expenses");
  });
});
