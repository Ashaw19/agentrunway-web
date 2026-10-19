/**
 * The extraction model's reply is checked field by field (capture/parse.ts).
 * The replies below are synthetic: what a model returns for made-up notes.
 */
import { describe, expect, it } from "vitest";
import { CaptureParseError, MAX_CAPTURE_INTENTS, cleanNumber, parseCaptureExtraction, parseIntent } from "../capture/parse";

const KEYS = new Set(["vehicle_fuel", "meals_client", "home_utilities"]);
const isKey = (k: string) => KEYS.has(k);

describe("parseCaptureExtraction", () => {
  it("reads a multi-intent reply after a showing", () => {
    const reply = JSON.stringify({
      transcript_cleaned: "Showed 12 Elm to Sarah Johnson. Follow up Thursday. Drove 18 km.",
      intents: [
        { intent: "log_activity", client_name: "Sarah Johnson", deal: null, activity_type: "showing", summary: "Showed 12 Elm St; liked the kitchen", date_spoken: "today", date: "2026-10-18" },
        { intent: "create_task", title: "Follow up with Sarah about 12 Elm", client_name: "Sarah Johnson", due_spoken: "Thursday", due_date: "2026-10-22", priority: "normal", notes: null },
        { intent: "log_trip", km: "18 km", from: "office", to: "12 Elm St", purpose: "Showing at 12 Elm St", date_spoken: null, date: null },
      ],
    });
    const parsed = parseCaptureExtraction(reply, { isExpenseCategoryKey: isKey });
    expect(parsed.dropped).toEqual([]);
    expect(parsed.intents.map((i) => i.intent)).toEqual(["log_activity", "create_task", "log_trip"]);
    expect(parsed.intents[0]).toMatchObject({ clientName: "Sarah Johnson", activityType: "showing", date: { spoken: "today", iso: "2026-10-18" } });
    expect(parsed.intents[1]).toMatchObject({ due: { spoken: "Thursday", iso: "2026-10-22" }, priority: "normal" });
    expect(parsed.intents[2]).toMatchObject({ km: 18, to: "12 Elm St" });
  });

  it("strips a markdown fence and prose around the JSON", () => {
    const reply = "Here you go:\n```json\n{\"transcript_cleaned\":\"x\",\"intents\":[]}\n```";
    expect(parseCaptureExtraction(reply)).toEqual({ transcriptCleaned: "x", intents: [], dropped: [] });
  });

  it("throws only when the reply is not a JSON object", () => {
    expect(() => parseCaptureExtraction("I can't help with that.")).toThrow(CaptureParseError);
    expect(() => parseCaptureExtraction("[1,2]")).toThrow(CaptureParseError);
  });

  it("keeps at most the first eight things heard", () => {
    const intents = Array.from({ length: 10 }, (_, n) => ({ intent: "note", client_name: "Sam Lee", summary: `note ${n}` }));
    const parsed = parseCaptureExtraction({ transcript_cleaned: "", intents });
    expect(parsed.intents).toHaveLength(MAX_CAPTURE_INTENTS);
    expect(parsed.dropped[parsed.dropped.length - 1]).toMatch(/first 8/);
  });

  it("drops what can't be saved and says why", () => {
    const parsed = parseCaptureExtraction({
      intents: [
        { intent: "order_pizza" },
        { intent: "unknown" },
        { intent: "create_task", title: "  " },
        { intent: "update_deal", deal: "12 Elm", stage: "closed" },
        { intent: "update_deal", deal: "12 Elm", stage: "lost" },
        { intent: "new_client", full_name: null },
      ],
    });
    expect(parsed.intents).toEqual([]);
    expect(parsed.dropped).toHaveLength(6);
    expect(parsed.dropped[3]).toMatch(/closing records the sale/);
    expect(parsed.dropped[4]).toMatch(/takes a reason/);
  });
});

describe("parseIntent — field checks", () => {
  it("maps activity words and falls back to an in-person meeting", () => {
    const type = (t: unknown) => {
      const r = parseIntent({ intent: "log_activity", client_name: "Sam", activity_type: t, summary: "x" });
      return "intent" in r && r.intent.intent === "log_activity" ? r.intent.activityType : null;
    };
    expect(type("call")).toBe("call");
    expect(type("voicemail")).toBe("call");
    expect(type("texted")).toBe("text");
    expect(type("open house")).toBe("showing");
    expect(type("coffee")).toBe("meeting");
    expect(type("telepathy")).toBe("meeting");
  });

  it("keeps an activity with no name (the card asks, or the profile it was said on)", () => {
    const r = parseIntent({ intent: "log_activity", client_name: null, activity_type: "call", summary: "Left a voicemail" });
    expect("intent" in r && r.intent).toMatchObject({ clientName: null, summary: "Left a voicemail" });
  });

  it("clears an expense category that isn't an item key", () => {
    const r = parseIntent({ intent: "new_expense", category_key: "travel_meals", amount: 42, vendor: "Java Moose" }, { isExpenseCategoryKey: isKey });
    expect("intent" in r && r.intent).toMatchObject({ categoryKey: null, amount: 42 });
    const ok = parseIntent({ intent: "new_expense", category_key: "meals_client", amount: "$42.50", vendor: "Java Moose" }, { isExpenseCategoryKey: isKey });
    expect("intent" in ok && ok.intent).toMatchObject({ categoryKey: "meals_client", amount: 42.5 });
  });

  it("keeps GST/HST only as stated and never above the total", () => {
    const stated = parseIntent({ intent: "new_expense", amount: 115, tax_amount: 15, vendor: "Shell" });
    expect("intent" in stated && stated.intent).toMatchObject({ taxAmount: 15 });
    const tooBig = parseIntent({ intent: "new_expense", amount: 20, tax_amount: 25, vendor: "Shell" });
    expect("intent" in tooBig && tooBig.intent).toMatchObject({ taxAmount: null });
    const none = parseIntent({ intent: "new_expense", amount: 115, vendor: "Shell" });
    expect("intent" in none && none.intent).toMatchObject({ taxAmount: null });
  });

  it("caps text at the database limits and treats 'null' strings as blank", () => {
    const r = parseIntent({ intent: "create_task", title: "x".repeat(900), client_name: "null", priority: "urgent" });
    expect("intent" in r && r.intent).toMatchObject({ clientName: null, priority: "normal" });
    if ("intent" in r && r.intent.intent === "create_task") expect(r.intent.title).toHaveLength(500);
  });

  it("takes a commission as a percentage between 0 and 10", () => {
    const pct = (v: unknown) => {
      const r = parseIntent({ intent: "new_transaction", address: "1 Main St", commission_pct: v });
      return "intent" in r && r.intent.intent === "new_transaction" ? r.intent.commissionPct : undefined;
    };
    expect(pct(2.5)).toBe(2.5);
    expect(pct("2.5")).toBe(2.5);
    expect(pct(25)).toBeNull();
    expect(pct(-1)).toBeNull();
  });

  it("keeps a deal update with a close date and no stage", () => {
    const r = parseIntent({ intent: "update_deal", deal: "12 Elm", stage: null, close_date_spoken: "November 15", close_date: null });
    expect("intent" in r && r.intent).toMatchObject({ stage: null, closeDate: { spoken: "November 15", iso: null } });
  });

  it("refuses a bad model date but keeps the words", () => {
    const r = parseIntent({ intent: "log_trip", km: 12, to: "Quispamsis", date_spoken: "Tuesday", date: "Oct 20" });
    expect("intent" in r && r.intent).toMatchObject({ date: { spoken: "Tuesday", iso: null } });
  });
});

describe("cleanNumber", () => {
  it("reads numbers and money strings", () => {
    expect(cleanNumber(18)).toBe(18);
    expect(cleanNumber("1,250.50")).toBe(1250.5);
    expect(cleanNumber("$85")).toBe(85);
    expect(cleanNumber("eighty")).toBeNull();
    expect(cleanNumber(Number.NaN)).toBeNull();
  });
});
