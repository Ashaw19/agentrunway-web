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
