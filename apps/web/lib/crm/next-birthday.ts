import { atlanticNoon } from "@agent-runway/core/lib/local-date";

/**
 * The next occurrence of a birthday ("1990-03-21"), as local noon on that day.
 * A birthday falling today is still this year's, all day.
 *
 * Compared by calendar day: both sides are local noon. Comparing noon of the
 * birthday with the current instant rolled the birthday to next year from
 * noon UTC (8-9 am Atlantic) on the day itself, and the UTC year rolled every
 * year-end birthday early from 8 pm Atlantic on Dec 31.
 *
 * `today` defaults to the Atlantic day (server code); only its calendar day
 * is read.
 */
export function nextBirthdayDate(birthdate: string, today: Date = atlanticNoon()): Date {
  const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const [, mmdd] = birthdate.split(/-(.+)/); // "1990-03-21" → "03-21"
  const candidate = new Date(`${anchor.getFullYear()}-${mmdd}T12:00:00`);
  if (isNaN(candidate.getTime())) return candidate; // guard malformed dates
  if (candidate < anchor) candidate.setFullYear(anchor.getFullYear() + 1);
  return candidate;
}
