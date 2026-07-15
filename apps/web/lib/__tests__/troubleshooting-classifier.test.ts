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
