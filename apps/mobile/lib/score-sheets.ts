/**
 * The Runway Score badge's two sheets on the dashboard: the score sheet, and
 * the full breakdown its "Full breakdown" link opens.
 *
 * iOS shows one modal at a time: one asked for while another is still
 * sliding away is refused, and stays "open" in the app's state with nothing
 * on screen. So on iOS "Full breakdown" closes the score sheet and waits for
 * it to finish closing (the Sheet's onDismiss) before the breakdown opens.
 * React Native calls onDismiss on iOS only; elsewhere the breakdown opens at
 * once. The breakdown never opens over another sheet (that request is
 * dropped), and opening the badge again starts both sheets afresh, so a
 * breakdown that couldn't be shown is never left stuck open.
 *
 * A plain reducer, so lib/__tests__ can run it.
 */

export interface ScoreSheets {
  score: boolean;
  breakdown: boolean;
  /** "Full breakdown" was tapped; the breakdown opens when the score sheet has gone. */
  pendingBreakdown: boolean;
}

export type ScoreSheetEvent =
  | { type: "open_score" }
  | { type: "close_score" }
  /** waitForDismiss: the platform reports the score sheet's dismissal (iOS). */
  | { type: "full_breakdown"; waitForDismiss: boolean }
  /** The score sheet finished closing; otherSheetOpen: another sheet is on screen now. */
  | { type: "score_dismissed"; otherSheetOpen: boolean }
  | { type: "close_breakdown" };

export const SCORE_SHEETS_CLOSED: ScoreSheets = { score: false, breakdown: false, pendingBreakdown: false };

export function scoreSheets(state: ScoreSheets, event: ScoreSheetEvent): ScoreSheets {
  switch (event.type) {
    case "open_score":
      return { score: true, breakdown: false, pendingBreakdown: false };
    case "close_score":
      return { ...state, score: false };
    case "full_breakdown":
      return event.waitForDismiss
        ? { score: false, breakdown: false, pendingBreakdown: true }
        : { score: false, breakdown: true, pendingBreakdown: false };
    case "score_dismissed":
      if (!state.pendingBreakdown) return state;
      return { score: false, breakdown: !event.otherSheetOpen, pendingBreakdown: false };
    case "close_breakdown":
      return { ...state, breakdown: false };
  }
}
