/**
 * A `<input type="datetime-local">` value as the instant it names.
 *
 * The input gives `2026-10-09T21:30`: the agent's wall clock, no offset.
 * Sent to the database as is, Postgres reads it as UTC and stores 21:30 UTC,
 * which is 6:30 pm Atlantic. Parsed in the browser first, it is read in the
 * agent's own zone, and the ISO string that goes to the database carries the
 * moment they meant.
 *
 * Browser code only: on the server "local" is UTC, which is the bug.
 * A value that already carries an offset is the same instant coming out.
 * An empty or unreadable value becomes now, as the form's default is.
 */
export function localDateTimeToInstant(value: string): string {
  const at = new Date(value);
  return (Number.isNaN(at.getTime()) ? new Date() : at).toISOString();
}
