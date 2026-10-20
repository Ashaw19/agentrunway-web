/**
 * The Runway Score badge's two sheets (lib/score-sheets.ts): the score sheet
 * and the full breakdown it links to. iOS shows one modal at a time, so on
 * iOS the breakdown opens once the score sheet has finished closing (its
 * Modal's onDismiss), not after a timer (fix 7). A breakdown that couldn't be
 * shown never stays "open": nothing opens over another sheet, and opening the
 * badge again starts both sheets afresh.
 */
import { describe, expect, it } from "vitest";
import { SCORE_SHEETS_CLOSED, scoreSheets, type ScoreSheets } from "../score-sheets";

const run = (events: Parameters<typeof scoreSheets>[1][], from: ScoreSheets = SCORE_SHEETS_CLOSED) =>
  events.reduce(scoreSheets, from);

describe("scoreSheets", () => {
  it("the badge opens the score sheet; closing it closes it", () => {
    expect(run([{ type: "open_score" }])).toEqual({ score: true, breakdown: false, pendingBreakdown: false });
    expect(run([{ type: "open_score" }, { type: "close_score" }])).toEqual(SCORE_SHEETS_CLOSED);
  });

  it("on iOS, Full breakdown closes the score sheet and the breakdown waits for it to finish closing", () => {
    const asked = run([{ type: "open_score" }, { type: "full_breakdown", waitForDismiss: true }]);
    expect(asked).toEqual({ score: false, breakdown: false, pendingBreakdown: true });
    expect(scoreSheets(asked, { type: "score_dismissed", otherSheetOpen: false }))
      .toEqual({ score: false, breakdown: true, pendingBreakdown: false });
  });

  it("where nothing waits for a dismissal (Android), the breakdown opens at once", () => {
    expect(run([{ type: "open_score" }, { type: "full_breakdown", waitForDismiss: false }]))
      .toEqual({ score: false, breakdown: true, pendingBreakdown: false });
  });

  it("the score sheet closing on its own (X, backdrop) opens nothing", () => {
    expect(run([{ type: "open_score" }, { type: "close_score" }, { type: "score_dismissed", otherSheetOpen: false }]))
      .toEqual(SCORE_SHEETS_CLOSED);
  });

  it("never opens the breakdown over another sheet (iOS would refuse it): the request is dropped", () => {
    const asked = run([{ type: "open_score" }, { type: "full_breakdown", waitForDismiss: true }]);
    expect(scoreSheets(asked, { type: "score_dismissed", otherSheetOpen: true })).toEqual(SCORE_SHEETS_CLOSED);
  });

  it("a breakdown left marked open (refused, never shown) is cleared when the badge is opened again", () => {
    const stuck: ScoreSheets = { score: false, breakdown: true, pendingBreakdown: false };
    expect(scoreSheets(stuck, { type: "open_score" })).toEqual({ score: true, breakdown: false, pendingBreakdown: false });
    const waiting: ScoreSheets = { score: false, breakdown: false, pendingBreakdown: true };
    expect(scoreSheets(waiting, { type: "open_score" })).toEqual({ score: true, breakdown: false, pendingBreakdown: false });
  });

  it("closing the breakdown closes it", () => {
    const open: ScoreSheets = { score: false, breakdown: true, pendingBreakdown: false };
    expect(scoreSheets(open, { type: "close_breakdown" })).toEqual(SCORE_SHEETS_CLOSED);
  });
});
