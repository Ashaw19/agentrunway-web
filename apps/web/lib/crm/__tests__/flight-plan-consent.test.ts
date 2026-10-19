/**
 * A Flight Plan's email or text step only becomes a message when the
 * client's CASL consent covers that channel on the step's day; otherwise a
 * Checklist call, with the reason. Unreadable consent fails closed.
 */
import { describe, expect, it } from "vitest";
import { flightPlanMessageStep } from "../flight-plan-consent";

const TODAY = "2026-10-06";
const step = (over: Partial<Parameters<typeof flightPlanMessageStep>[0]>) =>
  flightPlanMessageStep({ action: "email", inputs: { client: {}, closedDeals: [], consents: [] }, clientName: "Sam Lee", planName: "Past client", dueDate: TODAY, today: TODAY, ...over });

describe("flightPlanMessageStep", () => {
  it("queues the message when consent covers it (or there's no record, as before)", () => {
    expect(step({})).toEqual({ kind: "message" });
    expect(step({ inputs: { client: {}, closedDeals: [{ close_date: "2025-06-01" }], consents: [] } })).toEqual({ kind: "message" });
  });

  it("is a call for an unsubscribed client, with the reason", () => {
    const out = step({ inputs: { client: { email_opt_out_at: "2026-10-01T12:00:00Z" }, closedDeals: [], consents: [] } });
    expect(out).toMatchObject({ kind: "call_task", title: "Call Sam Lee (Flight Plan: Past client)" });
    expect(out.kind === "call_task" && out.notes).toMatch(/unsubscribed from your emails/);
  });

  it("checks the step's own day: a step due after the lapse is a call", () => {
    const inputs = { client: {}, closedDeals: [{ close_date: "2024-10-20" }], consents: [] }; // lapses 2026-10-20
    expect(step({ inputs, dueDate: "2026-10-10" })).toEqual({ kind: "message" });
    expect(step({ inputs, dueDate: "2026-10-25" }).kind).toBe("call_task");
  });

  it("checks the text channel for a text step", () => {
    const inputs = { client: { sms_opt_out_at: "2026-10-01T12:00:00Z" }, closedDeals: [], consents: [] };
    expect(step({ action: "email", inputs })).toEqual({ kind: "message" });
    expect(step({ action: "text", inputs }).kind).toBe("call_task");
  });

  it("fails closed when consent couldn't be read", () => {
    expect(step({ inputs: null })).toMatchObject({ kind: "call_task" });
  });
});
