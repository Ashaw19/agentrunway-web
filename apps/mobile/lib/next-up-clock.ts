/**
 * The dashboard's clock: the Atlantic day and hour Next up is built on (the
 * time-of-day band, the handful's day, the day a Later is keyed on).
 *
 * The Atlantic helpers read the hour through Intl.DateTimeFormat with
 * timeZone "America/Halifax". Hermes on the phone may lack that zone, or
 * return no hour part from formatToParts (the helper then reads NaN), or
 * throw. When either value comes back unreadable, both fall back to the
 * phone's own clock: the device's hour and calendar day. For Andrew, in New
 * Brunswick, the two agree (correction 14).
 */

import { atlanticHour, atlanticISODate, localISODate } from "@agent-runway/core/lib/local-date";
import { timeBand, type TimeBand } from "@agent-runway/core/lib/next-up/rules";
import {
  LATER_TOMORROW_HOUR,
  LATER_TONIGHT_HOUR,
  laterUntil,
  stopUntil,
  type LaterChoice,
} from "@agent-runway/core/lib/suggestion-dismissals";

export interface NextUpClock {
  /** The day, YYYY-MM-DD. */
  today: string;
  /** The hour of the day, 0-23. */
  hour: number;
  band: TimeBand;
  /** True when today and hour are Atlantic; false when they are the phone's own. */
  atlantic: boolean;
}

/** The two Atlantic readers, swappable in tests. */
export interface AtlanticReaders {
  hour: (d: Date) => number;
  day: (d: Date) => string;
}

const ATLANTIC: AtlanticReaders = { hour: atlanticHour, day: atlanticISODate };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today and the band, in Atlantic time when the phone can read it, else the phone's own. */
export function nextUpClock(now: Date = new Date(), read: AtlanticReaders = ATLANTIC): NextUpClock {
  try {
    const hour = read.hour(now);
    const today = read.day(now);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23 && ISO_DAY.test(today)) {
      return { today, hour, band: timeBand(hour), atlantic: true };
    }
  } catch {
    // Falls through to the phone's own clock.
  }
  const hour = now.getHours();
  return { today: localISODate(now), hour, band: timeBand(hour), atlantic: false };
}

// ── Later and Stop on the phone ──────────────────────────────────────────────
//
// Core's laterChoices / laterUntil / stopUntil read the Atlantic hour and day
// too, so on the phone they go through the same guard: core's answer when the
// phone reads Atlantic time, else the phone's own clock (tonight is 19:00
// today, tomorrow 08:00 the next day, a Stop ends at midnight starting the
// same day N months on). No timeZone is ever put on a Date here.

const readable = (d: Date) => Number.isFinite(d.getTime());

/** The Later options at `now`: no "tonight" from 19:00 on. */
export function laterChoicesAt(now: Date = new Date(), read: AtlanticReaders = ATLANTIC): LaterChoice[] {
  return nextUpClock(now, read).hour < LATER_TONIGHT_HOUR
    ? ["in_an_hour", "tonight", "tomorrow"]
    : ["in_an_hour", "tomorrow"];
}

/** When a Later chosen at `now` ends. */
export function laterUntilAt(choice: LaterChoice, now: Date = new Date(), read: AtlanticReaders = ATLANTIC): Date {
  if (nextUpClock(now, read).atlantic) {
    try {
      const until = laterUntil(choice, now);
      if (readable(until)) return until;
    } catch {
      // Falls through to the phone's own clock.
    }
  }
  if (choice === "in_an_hour") return new Date(now.getTime() + 3_600_000);
  const at = new Date(now.getTime());
  if (choice === "tomorrow") at.setDate(at.getDate() + 1);
  at.setHours(choice === "tonight" ? LATER_TONIGHT_HOUR : LATER_TOMORROW_HOUR, 0, 0, 0);
  return at;
}

/** When a Stop of 3 or 6 months chosen at `now` ends. */
export function stopUntilAt(choice: "3_months" | "6_months", now: Date = new Date(), read: AtlanticReaders = ATLANTIC): Date {
  if (nextUpClock(now, read).atlantic) {
    try {
      const until = stopUntil(choice, now);
      if (readable(until)) return until;
    } catch {
      // Falls through to the phone's own clock.
    }
  }
  const months = choice === "3_months" ? 3 : 6;
  const first = new Date(now.getFullYear(), now.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(now.getDate(), lastDay));
}
