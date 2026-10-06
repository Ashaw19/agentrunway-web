import { describe, it, expect } from "vitest";
import { classifyTopic } from "@/lib/troubleshooting-classifier";

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
