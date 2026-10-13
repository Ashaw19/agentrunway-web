/**
 * Safe date parsing utilities for the mobile app.
 *
 * Prevents NaN from propagating through calculations when
 * date strings are null, undefined, or malformed.
 */

/** Parse a date string safely.  Returns null instead of Invalid Date. */
export function safeParseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Get epoch ms from a date string safely.  Returns null on bad input. */
export function safeDateMs(value: string | null | undefined): number | null {
  const d = safeParseDate(value);
  return d ? d.getTime() : null;
}

// For a day count behind a label ("Today", "3 days ago"), use localDaysSince
// from @agent-runway/core/lib/local-date: calendar days on the phone's own
// day, null-safe. The daysSince / daysUntil that were here (no callers)
// counted elapsed 24-hour blocks.
