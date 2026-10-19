/**
 * The activity streak and the day's activity count, worked out from activity
 * dates alone (the data store keeps the last 60 days of them, recentActivityDates).
 *
 * activity_date is a UTC timestamp. Its first ten characters are the UTC
 * date, which is the next day for anything logged from 9 pm Atlantic, so a
 * day here is the phone's own calendar day of the instant (localDayOf).
 * Days are YYYY-MM-DD strings; none is made into a Date.
 */
import { addDaysISO, localISODate } from "@agent-runway/core/lib/local-date";
import { safeParseDate } from "./safe-date";

/** The phone's calendar day of an activity timestamp, or null when it isn't a date. */
export function localDayOf(timestamp: string): string | null {
  const at = safeParseDate(timestamp);
  return at ? localISODate(at) : null;
}

/** The days activities fell on, each once, newest first. */
export function activityDays(dates: readonly string[]): string[] {
  const days = new Set<string>();
  for (const date of dates) {
    const day = localDayOf(date);
    if (day) days.add(day);
  }
  return [...days].sort((a, b) => b.localeCompare(a));
}

/**
 * Consecutive days with an activity, counting back from today. The run must
 * be current: its newest day is today or yesterday, otherwise 0. The rule the
 * data store's contactStreak always had, here so it can be tested on its own.
 */
export function activityStreak(days: readonly string[], today: string): number {
  const newestFirst = [...new Set(days)].sort((a, b) => b.localeCompare(a));
  if (newestFirst.length === 0) return 0;
  if (newestFirst[0] !== today && newestFirst[0] !== addDaysISO(today, -1)) return 0;

  let streak = 1;
  for (let i = 1; i < newestFirst.length; i++) {
    if (newestFirst[i] !== addDaysISO(newestFirst[i - 1], -1)) break;
    streak++;
  }
  return streak;
}

/** How many of these activity timestamps fell on the phone's calendar `day`. */
export function activitiesOnDay(dates: readonly string[], day: string): number {
  return dates.filter((date) => localDayOf(date) === day).length;
}
