/**
 * Spoken dates ("Thursday", "next week", "the 24th") to calendar days.
 *
 * `today` is the Atlantic calendar day (atlanticISODate() on the server),
 * the same day the rest of the app uses, so "tomorrow" said at 9 pm in Saint
 * John is tomorrow there, not the UTC day after. Everything here is calendar
 * arithmetic on YYYY-MM-DD strings (addDaysISO): no clock and no time zone.
 *
 * `direction` says which way an unanchored day points. A task due "Thursday"
 * is the coming Thursday; a showing "Thursday" was the last one.
 *
 * Rules (said on Sunday 2026-10-18):
 *   today, tonight, this morning ............ 2026-10-18
 *   tomorrow / yesterday .................... +1 / -1
 *   Thursday (ahead) ........................ the next Thursday, 1 to 7 days on:
 *                                             said on a Thursday it is a week later
 *   Thursday (past) / last Thursday ......... the last Thursday, 1 to 7 days back
 *   this Thursday ........................... the Thursday of this week (Mon to Sun),
 *                                             or the next one once it has passed
 *   next Thursday ........................... the Thursday of next week (Mon to Sun)
 *   next week ............................... next Monday
 *   end of the week ......................... this Friday (the next one on a weekend)
 *   end of the month ........................ the last day of this month
 *   in 3 days, in two weeks, a week from today
 *   October 24, Oct 24th, 24 October ........ that day in the direction's year
 *   the 24th ................................ that day in the direction's month
 *   2026-10-24 .............................. as written
 * Anything else is null: the model's own reading is used instead (pickDate),
 * and the card shows the date for the agent to check.
 */

import { addDaysISO } from "../local-date";

export type DateDirection = "future" | "past";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_SHORT: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_SHORT: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, thirty: 30,
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A real calendar day written YYYY-MM-DD ("2026-02-30" is not one). */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 0 = Sunday, as Date#getDay, for a YYYY-MM-DD. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday of the week (Monday to Sunday) a day falls in. */
function mondayOf(iso: string): string {
  const dow = weekdayOf(iso);
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function isoOf(year: number, month0: number, day: number): string | null {
  if (day < 1 || day > daysInMonth(year, month0)) return null;
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function weekdayIndex(word: string): number | null {
  const full = WEEKDAYS.indexOf(word);
  if (full >= 0) return full;
  return WEEKDAY_SHORT[word] ?? null;
}

function monthIndex(word: string): number | null {
  const full = MONTHS.indexOf(word);
  if (full >= 0) return full;
  return MONTH_SHORT[word] ?? null;
}

function countOf(word: string): number | null {
  if (/^\d{1,3}$/.test(word)) return Number(word);
  return NUMBER_WORDS[word] ?? null;
}

function normalize(spoken: string): string {
  return spoken
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(on|by|for|due|until|before)\s+/, "")
    .replace(/^the\s+(?=(end|day)\b|\d)/, "")
    .replace(/^this (morning|afternoon|evening)$/, "today")
    .replace(/^(tonight|earlier today|later today|just now|right now)$/, "today")
    .replace(/^last night$/, "yesterday")
    .replace(/\s+(morning|afternoon|evening|night)$/, "")
    .replace(/\s+at \d{1,2}(?::\d{2})?(?: ?[ap]m)?$/, "")
    .trim();
}

/** A day from the words said, or null when they don't name one this can read. */
export function resolveSpokenDate(
  spoken: string | null | undefined,
  today: string,
  direction: DateDirection,
): string | null {
  if (!spoken || !isIsoDay(today)) return null;
  const s = normalize(spoken);
  if (!s) return null;
  if (isIsoDay(s)) return s;

  const [ty, tm, td] = today.split("-").map(Number);
  const tMonth0 = tm - 1;

  if (s === "today" || s === "now") return today;
  if (s === "tomorrow") return addDaysISO(today, 1);
  if (s === "yesterday") return addDaysISO(today, -1);
  if (s === "day after tomorrow") return addDaysISO(today, 2);
  if (s === "day before yesterday") return addDaysISO(today, -2);

  if (s === "next week") return addDaysISO(mondayOf(today), 7);
  if (s === "last week") return addDaysISO(mondayOf(today), -7);
  if (/^(this weekend|the weekend|weekend)$/.test(s)) {
    // Saturday, or today when it is already the weekend.
    const dow = weekdayOf(today);
    return dow === 6 || dow === 0 ? today : addDaysISO(today, 6 - dow);
  }
  if (/^end of (the |this )?week$/.test(s)) {
    // This Friday; on a weekend, the coming Friday.
    const dow = weekdayOf(today);
    return addDaysISO(today, dow === 6 ? 6 : dow === 0 ? 5 : 5 - dow);
  }
  if (/^end of (the |this )?month$/.test(s)) {
    return isoOf(ty, tMonth0, daysInMonth(ty, tMonth0));
  }
  if (s === "next month") {
    const m0 = (tMonth0 + 1) % 12;
    const y = tMonth0 === 11 ? ty + 1 : ty;
    return isoOf(y, m0, Math.min(td, daysInMonth(y, m0)));
  }

  // "in 3 days", "in two weeks", "3 days from now", "a week from today", "2 days ago"
  let m = /^in (\w+) (day|days|week|weeks)$/.exec(s)
    ?? /^(\w+) (day|days|week|weeks) from (now|today)$/.exec(s);
  if (m) {
    const n = countOf(m[1]);
    if (n === null) return null;
    return addDaysISO(today, n * (m[2].startsWith("week") ? 7 : 1));
  }
  m = /^(\w+) (day|days|week|weeks) ago$/.exec(s);
  if (m) {
    const n = countOf(m[1]);
    if (n === null) return null;
    return addDaysISO(today, -n * (m[2].startsWith("week") ? 7 : 1));
  }

  // Weekdays: "thursday", "this thursday", "next thursday", "last thursday"
  m = /^(this |next |last |this coming |coming )?([a-z]+)$/.exec(s);
  if (m) {
    const wd = weekdayIndex(m[2]);
    if (wd !== null) {
      const qualifier = (m[1] ?? "").trim();
      const dow = weekdayOf(today);
      if (qualifier === "next") {
        // The weekday in next week (Monday to Sunday).
        return addDaysISO(addDaysISO(mondayOf(today), 7), (wd + 6) % 7);
      }
      if (qualifier === "this") {
        const inWeek = addDaysISO(mondayOf(today), (wd + 6) % 7);
        if (direction === "future" && inWeek < today) return addDaysISO(inWeek, 7);
        if (direction === "past" && inWeek > today) return addDaysISO(inWeek, -7);
        return inWeek;
      }
      if (qualifier === "last") {
        const back = ((dow - wd + 7) % 7) || 7;
        return addDaysISO(today, -back);
      }
      // Plain, or "this coming": never today itself.
      if (direction === "future" || qualifier.includes("coming")) {
        const ahead = ((wd - dow + 7) % 7) || 7;
        return addDaysISO(today, ahead);
      }
      const back = ((dow - wd + 7) % 7) || 7;
      return addDaysISO(today, -back);
    }
  }

  // "october 24", "oct 24", "24 october", "24th of october"
  m = /^([a-z]+) (\d{1,2})(?: (\d{4}))?$/.exec(s) ?? null;
  let month0: number | null = null;
  let day: number | null = null;
  let year: number | null = null;
  if (m && monthIndex(m[1]) !== null) {
    month0 = monthIndex(m[1]);
    day = Number(m[2]);
    year = m[3] ? Number(m[3]) : null;
  } else {
    const m2 = /^(\d{1,2}) (?:of )?([a-z]+)(?: (\d{4}))?$/.exec(s);
    if (m2 && monthIndex(m2[2]) !== null) {
      month0 = monthIndex(m2[2]);
      day = Number(m2[1]);
      year = m2[3] ? Number(m2[3]) : null;
    }
  }
  if (month0 !== null && day !== null) {
    if (year !== null) return isoOf(year, month0, day);
    const thisYear = isoOf(ty, month0, day);
    if (!thisYear) {
      // Feb 29 in a common year: the direction's nearest leap year is too far to guess.
      return null;
    }
    if (direction === "future") return thisYear >= today ? thisYear : isoOf(ty + 1, month0, day);
    return thisYear <= today ? thisYear : isoOf(ty - 1, month0, day);
  }

  // "the 24th" (ordinal already stripped to "24"; "the" may remain)
  m = /^(?:the )?(\d{1,2})$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const here = isoOf(ty, tMonth0, d);
    if (direction === "future") {
      if (here && here >= today) return here;
      const nm = (tMonth0 + 1) % 12;
      return isoOf(tMonth0 === 11 ? ty + 1 : ty, nm, d);
    }
    if (here && here <= today) return here;
    const pm = (tMonth0 + 11) % 12;
    return isoOf(tMonth0 === 0 ? ty - 1 : ty, pm, d);
  }

  return null;
}

export type DateSource = "spoken" | "model" | "default" | "none";

export interface PickedDate {
  date: string | null;
  source: DateSource;
}

/**
 * The day for a write: the words said when this can read them, else the
 * model's YYYY-MM-DD, else `fallback` (today for an activity, a trip, an
 * expense; nothing for a close date). The source lets the card say "no date
 * was said".
 */
export function pickDate(
  raw: { spoken: string | null; iso: string | null },
  today: string,
  direction: DateDirection,
  fallback: string | null,
): PickedDate {
  const spoken = resolveSpokenDate(raw.spoken, today, direction);
  if (spoken) return { date: spoken, source: "spoken" };
  if (isIsoDay(raw.iso)) return { date: raw.iso, source: "model" };
  if (fallback) return { date: fallback, source: "default" };
  return { date: null, source: "none" };
}

/** "Thu, Oct 22" for a YYYY-MM-DD, independent of the runtime's zone. */
export function shortDayLabel(iso: string): string {
  if (!isIsoDay(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${days[dow]}, ${months[m - 1]} ${d}`;
}
