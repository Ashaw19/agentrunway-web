/**
 * Loading and reporting the AI run ledger (core/lib/ai-activity-load.ts):
 * Atlantic day boundaries, the 24-hour failure count, and the text Flight
 * Crew's getAIActivity and the connector's get_ai_activity return.
 */
import { describe, expect, it } from "vitest";
import {
  actionView,
  aiActivityReport,
  aiActivitySince,
  countAIFailures,
  loadAIActivity,
} from "../ai-activity-load";
import { FakeDb, write } from "./ai-ledger-fixtures";

describe("aiActivitySince", () => {
  it("today starts at Atlantic midnight, not UTC midnight", () => {
    // 02:00 UTC on Oct 18 is still Oct 17 in Halifax (ADT, UTC-3).
    expect(aiActivitySince("today", new Date("2026-10-18T02:00:00Z"))).toBe("2026-10-17T03:00:00.000Z");
    expect(aiActivitySince("7d", new Date("2026-10-18T15:00:00Z"))).toBe("2026-10-12T03:00:00.000Z");
    // After the November clock change Halifax is UTC-4.
    expect(aiActivitySince("today", new Date("2026-11-10T15:00:00Z"))).toBe("2026-11-10T04:00:00.000Z");
  });
});

describe("loadAIActivity totals past the API's 1,000-row cap", () => {
  it("counts every call in the period, and says when a list was cut off", async () => {
    const runs = Array.from({ length: 2_350 }, (_, i) => ({
      id: `r${String(i).padStart(5, "0")}`, user_id: "u1", feature: i % 2 ? "chat" : "receipt-ocr",
      outcome: i % 10 === 0 ? "error" : "ok", estimated_cost_usd: 0.001, created_at: "2026-10-18T14:00:00.000Z",
    }));
    const fake = new FakeDb({ ai_runs: runs, ai_run_writes: [] });
    const snap = await loadAIActivity(fake, "u1", { since: "2026-10-01T00:00:00.000Z" });
    expect(snap.summary.calls).toBe(2_350);
    expect(snap.summary.failed).toBe(235);
    expect(snap.summary.costUsd).toBeCloseTo(2.35, 6);
    expect(snap.runs).toHaveLength(100);
    expect(snap.truncated).toBe(false);

    const capped = await loadAIActivity(fake, "u1", { since: "2026-10-01T00:00:00.000Z", runLimit: 2_000 });
    expect(capped.summary.calls).toBe(2_000);
    expect(capped.truncated).toBe(true);
    const exact = await loadAIActivity(fake, "u1", { since: "2026-10-01T00:00:00.000Z", runLimit: 2_350 });
    expect(exact.truncated).toBe(false);
  });
});

describe("loadAIActivity totals from fn_ai_run_summary", () => {
  it("uses the per-feature totals Postgres counted, in one query", async () => {
    const fake = new FakeDb({ ai_run_writes: [], ai_runs: [] }, {
      fn_ai_run_summary: (args) => {
        expect(args).toEqual({ p_since: "2026-10-01T00:00:00.000Z" });
        return {
          data: [
            { feature: "receipt-ocr", calls: 40, failed: 2, aborted: 0, cost_usd: "0.0812" },
            { feature: "chat", calls: 61_000, failed: 9, aborted: 3, cost_usd: 102.5 },
          ],
          error: null,
        };
      },
    });
    const snap = await loadAIActivity(fake, "u1", { since: "2026-10-01T00:00:00.000Z" });
    expect(snap.summary).toMatchObject({ calls: 61_040, failed: 11, aborted: 3 });
    expect(snap.summary.costUsd).toBeCloseTo(102.5812, 6);
    expect(snap.summary.byFeature[0].feature).toBe("chat");
    expect(snap.truncated).toBe(false);
    expect(fake.log.filter((l) => l.startsWith("select ai_runs")).length).toBe(1); // the recent list only
  });
});

describe("loadAIActivity + aiActivityReport", () => {
  const fake = new FakeDb({
    ai_run_writes: [
      write({ id: "w1", tool_call_id: "toolu_a", created_at: "2026-10-18T14:00:00.000Z" }),
      write({ id: "w2", tool_call_id: "toolu_b", tool_name: "logContactActivity", table_name: "contact_activities", row_id: null, after_image: null, outcome: "error", error_class: "42703", created_at: "2026-10-18T15:00:00.000Z" }),
      write({ id: "w3", tool_call_id: "toolu_old", created_at: "2026-09-01T15:00:00.000Z" }),
      write({ id: "w4", user_id: "u2", tool_call_id: "toolu_other", created_at: "2026-10-18T15:30:00.000Z" }),
    ] as unknown as Record<string, unknown>[],
    ai_runs: [
      { id: "r1", user_id: "u1", feature: "chat", outcome: "ok", estimated_cost_usd: 0.012, created_at: "2026-10-18T14:00:00.000Z" },
      { id: "r2", user_id: "u1", feature: "receipt-ocr", outcome: "error", estimated_cost_usd: null, error_class: "APICallError 529", created_at: "2026-10-18T15:00:00.000Z" },
      { id: "r3", user_id: "u2", feature: "chat", outcome: "error", estimated_cost_usd: 1, created_at: "2026-10-18T15:00:00.000Z" },
    ],
  });
  const now = new Date("2026-10-18T16:00:00.000Z");

  it("reads only the agent's rows from the period", async () => {
    const snap = await loadAIActivity(fake, "u1", { since: aiActivitySince("today", now) });
    expect(snap.actions.map((a) => a.toolCallId)).toEqual(["toolu_b", "toolu_a"]);
    expect(snap.summary).toMatchObject({ calls: 2, failed: 1 });
    expect(snap.error).toBeNull();
  });

  it("counts failures in the last 24 hours, per agent or for everyone", async () => {
    expect(await countAIFailures(fake, "u1", now)).toEqual({ failedRuns: 1, failedWrites: 1, unknown: false });
    expect(await countAIFailures(fake, null, now)).toEqual({ failedRuns: 2, failedWrites: 1, unknown: false });
  });

  it("the report names each change, its status and its toolCallId, and never advises", async () => {
    const snap = await loadAIActivity(fake, "u1", { since: aiActivitySince("today", now) });
    const text = aiActivityReport(snap, await countAIFailures(fake, "u1", now), { periodLabel: "today", now });
    expect(text).toContain("Logged an expense: Staples. Undo available. (toolCallId: toolu_a)");
    expect(text).toContain("Logged a contact. Didn't save (error 42703). (toolCallId: toolu_b)");
    expect(text).toContain("AI calls: 2 (1 failed, 0 stopped), estimated cost $0.01 at list prices.")
    expect(text).toContain("By feature: Flight Crew chat 1, Receipt scan 1.");
    expect(text).toContain("Failed in the last 24 hours: 1 AI call, 1 change.");
    expect(text).not.toMatch(/\b(should|recommend|must)\b/i);
  });

  it("the list view carries words only, no row images", async () => {
    const snap = await loadAIActivity(fake, "u1", { since: aiActivitySince("today", now) });
    const view = actionView(snap.actions[1], now);
    expect(view).toMatchObject({
      toolCallId: "toolu_a", canUndo: true, status: "Undo available", details: ["Created expense"],
      consequences: ['Removes the expense "Staples"'], deletesClient: false,
    });
    expect(JSON.stringify(view)).not.toContain("total_amount");
  });
});
