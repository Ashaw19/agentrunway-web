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

/** Days between now and a date string.  Returns null on bad input. */
export function daysSince(value: string | null | undefined): number | null {
  const ms = safeDateMs(value);
  if (ms === null) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

/** Days until a future date.  Returns null on bad input or past dates. */
export function daysUntil(value: string | null | undefined): number | null {
  const ms = safeDateMs(value);
  if (ms === null) return null;
  const diff = Math.ceil((ms - Date.now()) / 86_400_000);
  return diff >= 0 ? diff : null;
}
