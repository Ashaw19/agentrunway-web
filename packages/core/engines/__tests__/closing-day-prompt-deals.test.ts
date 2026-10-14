import { describe, it, expect } from "vitest";
import {
  dealsAwaitingCloseConfirmation,
  type PipelineDeal,
} from "../../types/database";

/**
 * Regression suite for the dashboard's Closing Day prompt (2026-10-14).
 *
 * Closing a deal from Transactions → Pipeline writes a `transactions` row that
 * carries `pipeline_deal_id` and keeps the pipeline row at stage='closed'. The
 * prompt listed every row at 'firm' OR 'closed' dated today or earlier, so a
 * deal already recorded that way asked "What's the status?" every day, and
 * "Register & Close" inserted a second transaction (no pipeline_deal_id) and
 * deleted the pipeline row, which nulled the first transaction's link.
 *
 * A row is asked about only while no transaction carries its id.
 */

const TODAY = "2026-10-14";

const row = (id: string, stage: string, expected_close_date: string | null): PipelineDeal =>
  ({ id, stage, expected_close_date }) as unknown as PipelineDeal;

const ids = (deals: PipelineDeal[]) => deals.map((d) => d.id);

describe("dealsAwaitingCloseConfirmation", () => {
  it("a deal closed from the pipeline (stage closed, transaction linked) is not asked about again", () => {
    const deals = [row("closed-recorded", "closed", "2026-10-01")];
    expect(dealsAwaitingCloseConfirmation(deals, new Set(["closed-recorded"]), TODAY)).toEqual([]);
  });

  it("the same row with no linked transaction is asked about: it was moved to closed without being recorded", () => {
    // Flight Crew's updatePipelineDealStage and the mobile Deals screen can set
    // stage='closed' without writing a transaction. The prompt is where that
    // deal gets recorded.
    const deals = [row("closed-unrecorded", "closed", "2026-10-01")];
    expect(ids(dealsAwaitingCloseConfirmation(deals, new Set(), TODAY))).toEqual(["closed-unrecorded"]);
  });

  it("a firm deal due today or earlier is asked about", () => {
    const deals = [row("firm-today", "firm", TODAY), row("firm-past", "firm", "2026-09-30")];
    expect(ids(dealsAwaitingCloseConfirmation(deals, new Set(), TODAY))).toEqual(["firm-today", "firm-past"]);
  });

  it("a firm deal that already has a linked transaction is not asked about", () => {
    // e.g. a recorded deal moved back to firm from the Flight Crew.
    const deals = [row("firm-recorded", "firm", "2026-10-01")];
    expect(dealsAwaitingCloseConfirmation(deals, new Set(["firm-recorded"]), TODAY)).toEqual([]);
  });

  it("a deal due after today, or with no date, is not asked about", () => {
    const deals = [row("firm-future", "firm", "2026-10-15"), row("firm-undated", "firm", null), row("closed-undated", "closed", null)];
    expect(dealsAwaitingCloseConfirmation(deals, new Set(), TODAY)).toEqual([]);
  });

  it("earlier stages and lost deals are not asked about", () => {
    const deals = ["lead", "showing", "offer", "conditional", "lost"].map((s) => row(s, s, "2026-10-01"));
    expect(dealsAwaitingCloseConfirmation(deals, new Set(), TODAY)).toEqual([]);
  });

  it("only the recorded row drops out of a mixed list", () => {
    const deals = [
      row("a", "firm", "2026-10-10"),
      row("b", "closed", "2026-10-10"),
      row("c", "closed", "2026-10-11"),
    ];
    expect(ids(dealsAwaitingCloseConfirmation(deals, new Set(["b"]), TODAY))).toEqual(["a", "c"]);
  });
});
