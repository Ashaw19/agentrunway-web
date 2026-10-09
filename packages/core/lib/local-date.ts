/**
 * Calendar-day helpers for date-only values (YYYY-MM-DD).
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC day. Every Canadian time
 * zone is behind UTC, so from 8 pm Atlantic (earlier further west) it is
 * already tomorrow: tasks due today read as overdue, form dates default to
 * tomorrow, and a deal logged on Dec 31 lands in next year.
 *
 *   localISODate    browser, mobile and engine code: the runtime's own day
 *                   (the user's day on their device). Matches getFullYear /
 *                   getMonth / getDate on the same Date.
 *   atlanticISODate server code: Vercel and Supabase Edge run in UTC, so
 *                   "today" for the user is pinned to America/Halifax, the
 *                   same zone as income_goal_current_year().
 *   addDaysISO      calendar arithmetic on a YYYY-MM-DD string, no time zone.
 *
 * Timestamps (timestamptz columns such as contact_activities.activity_date,
 * created_at, last_contact_at) are instants, not days: keep toISOString().
 */

export const APP_TIME_ZONE = "America/Halifax";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A Date as YYYY-MM-DD in the runtime's local time zone. */
export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** A Date as YYYY-MM-DD in Atlantic time, whatever zone the server runs in. */
export function atlanticISODate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** YYYY-MM-DD plus `days` calendar days (negative goes back). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
