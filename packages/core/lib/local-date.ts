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
 *   daysBetweenISO  whole calendar days between two YYYY-MM-DD strings.
 *   localDaysSince  whole calendar days from a stored value to today, on the
 *                   runtime's own calendar: what "Today / Yesterday / 3 days
 *                   ago" counts.
 *   nextYearlyDate  a birthday's next occurrence and the calendar days to it.
 *
 * "This year" / "this month" follow the same split. On the server,
 * `new Date().getFullYear()` and `getMonth()` are UTC: from 8 pm Atlantic on
 * Dec 31 the server is already in next year, and on a month-end evening in
 * next month. Server code uses:
 *
 *   atlanticYear / atlanticMonth  the Atlantic year and month (0-11).
 *   atlanticNoon                  a stand-in "today" for calendar math that
 *                                 reads local getters (getFullYear, getMonth,
 *                                 getDate, getDay, new Date(y, m, d)): noon
 *                                 local time on the Atlantic day, so those
 *                                 getters read the Atlantic day in any
 *                                 runtime. Pass it as `now` to engines.
 *   atlanticWallClock             the Atlantic wall-clock time with its
 *                                 fields read as UTC, for zone-independent
 *                                 math (seasonalFractionElapsed).
 *
 * Timestamps (timestamptz columns such as contact_activities.activity_date,
 * created_at, last_contact_at) are instants, not days: keep toISOString().
 * To print one as a day on the server (AI tool output, emails), name the
 * zone: `toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE })` or
 * `atlanticISODate(new Date(ts))`. Without it the server prints the UTC
 * date, and so does `ts.slice(0, 10)`.
 *
 * The database runs in UTC as well. To filter a timestamp column to a
 * calendar day, bound it with atlanticDayStart(day): a bare `2026-10-09` or
 * `2026-10-09T00:00:00` is read as UTC, 8 or 9 pm Atlantic the evening
 * before. To store a wall-clock time the user typed, send an instant
 * (`new Date(value).toISOString()` in the browser), never the bare string.
 */

export const APP_TIME_ZONE = "America/Halifax";

const pad2 = (n: number) => String(n).padStart(2, "0");

// Built on first use, not at import: apps/mobile imports this module for
// localISODate and never needs the Atlantic formatter.
let atlanticFormatter: Intl.DateTimeFormat | null = null;

/** Atlantic wall-clock fields of an instant. month is 1-12. */
function atlanticFields(d: Date) {
  if (!atlanticFormatter) {
    atlanticFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
  }
  const parts = atlanticFormatter.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** A Date as YYYY-MM-DD in the runtime's local time zone. */
export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** A Date as YYYY-MM-DD in Atlantic time, whatever zone the server runs in. */
export function atlanticISODate(d: Date = new Date()): string {
  const { year, month, day } = atlanticFields(d);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** The calendar year in Atlantic time. */
export function atlanticYear(d: Date = new Date()): number {
  return atlanticFields(d).year;
}

/** The month in Atlantic time, 0-11 like Date#getMonth. */
export function atlanticMonth(d: Date = new Date()): number {
  return atlanticFields(d).month - 1;
}

/**
 * Noon, in the runtime's local time, on the Atlantic calendar day. Its local
 * getters read the Atlantic year, month, day and weekday whatever zone the
 * runtime is in. A calendar anchor, not an instant: use the real
 * `new Date()` for timestamps and elapsed time.
 */
export function atlanticNoon(d: Date = new Date()): Date {
  const { year, month, day } = atlanticFields(d);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * The Atlantic wall-clock time of an instant, as a Date whose UTC fields
 * (getUTCFullYear, getUTCMonth, getTime against Date.UTC) are that wall
 * clock. Lets zone-independent code do calendar math in Atlantic time.
 */
export function atlanticWallClock(d: Date = new Date()): Date {
  const { year, month, day, hour, minute, second } = atlanticFields(d);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, d.getUTCMilliseconds()));
}

/**
 * The instant an Atlantic calendar day (YYYY-MM-DD) begins: 03:00 UTC in
 * daylight time, 04:00 UTC in standard time. Use it to filter a timestamptz
 * column to a day or a run of days, as a half-open range:
 *
 *   .gte(col, atlanticDayStart(first).toISOString())
 *   .lt(col, atlanticDayStart(addDaysISO(last, 1)).toISOString())
 *
 * Postgres reads a bare `${day}T00:00:00` as UTC, which is 8 or 9 pm
 * Atlantic the evening before. Invalid Date for anything that is not a real
 * YYYY-MM-DD.
 */
export function atlanticDayStart(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date(NaN);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(wall).toISOString().slice(0, 10) !== iso) return new Date(NaN);
  // How far Atlantic time is behind UTC at an instant: 3 or 4 hours.
  const behind = (t: number) => t - atlanticWallClock(new Date(t)).getTime();
  // Clocks change at 2 am, so midnight is never skipped or repeated. The
  // second pass reads the offset in force at the candidate itself.
  const guess = wall + behind(wall);
  return new Date(wall + behind(guess));
}

/**
 * The next time a yearly date-only value (a birthdate, "1990-03-21") comes
 * round, and the whole calendar days until it. The day itself is 0, all day.
 * Null when the value has no readable month and day.
 *
 * Only the calendar day of `today` is read, through its local getters: the
 * user's own day in the browser and on mobile, atlanticNoon() on the server.
 * Both ends are local noon, so the count is exact at any hour.
 * `Math.floor((new Date(birthdate) - now) / day)` is not: the date parses as
 * UTC midnight (the evening before, west of Greenwich) and the floor drops
 * the day once it has begun.
 */
export function nextYearlyDate(
  dateOnly: string,
  today: Date = new Date(),
): { date: Date; daysUntil: number } | null {
  const parts = dateOnly.split("-");
  if (parts.length !== 3) return null;
  const mm = parseInt(parts[1]) - 1;
  const dd = parseInt(parts[2]);
  if (isNaN(mm) || isNaN(dd) || mm < 0 || mm > 11 || dd < 1 || dd > 31) return null;
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const thisYear = new Date(todayNoon.getFullYear(), mm, dd, 12);
  const date = thisYear < todayNoon ? new Date(todayNoon.getFullYear() + 1, mm, dd, 12) : thisYear;
  // Rounded: across a clock change two noons are 23 or 25 hours apart.
  return { date, daysUntil: Math.round((date.getTime() - todayNoon.getTime()) / 86_400_000) };
}

/** YYYY-MM-DD plus `days` calendar days (negative goes back). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Whole calendar days from `from` to `to`, both YYYY-MM-DD. Negative when
 * `to` is the earlier day. No time zone: the caller picks whose day each
 * string is (localISODate in the browser and on mobile, atlanticISODate on
 * the server).
 */
export function daysBetweenISO(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * Whole calendar days from a stored value to today, on the runtime's own
 * calendar: 0 today, 1 yesterday, negative for a day still to come. Null
 * when the value is missing or unreadable.
 *
 * A date-only value (YYYY-MM-DD) is its own day. A timestamp is read in the
 * runtime's zone, the user's own in the browser and on mobile. Not for
 * server code, where "local" is UTC: there, compare atlanticISODate() days
 * with daysBetweenISO.
 *
 * This is the count behind a calendar label ("Today", "Yesterday", "3 days
 * ago", "Closing in 2d"). `Math.floor((now - then) / 86_400_000)` counts
 * elapsed 24-hour blocks instead: a call logged at 10 pm reads "Today" at 9
 * the next morning, and one logged at 9 am reads "Yesterday" only from 9 am
 * the day after. Keep the elapsed count for a rule about time passed ("no
 * contact in 14 days").
 */
export function localDaysSince(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return daysBetweenISO(value, localISODate(now));
  }
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return daysBetweenISO(localISODate(at), localISODate(now));
}
