/**
 * A commission from a note or typed on the confirm card: a percentage from
 * 1 to 10 (2.5 for 2.5%). 0.025 is a fraction and 25 is no commission an
 * agent is paid; neither is guessed at. parse.ts and checkWrite (proposals.ts)
 * both use this range.
 */
export const COMMISSION_PCT_MIN = 1;
export const COMMISSION_PCT_MAX = 10;
