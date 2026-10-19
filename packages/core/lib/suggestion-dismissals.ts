/**
 * Suggestion rules shared by every surface that suggests a client: web
 * Flight Control (Scan), the nightly drafts, the phone's Next up, Flight Crew
 * and MCP. Pure: no database, no clock of its own (callers pass `now`).
 *
 * flight_control_dismissals holds three kinds of row (00168, 00188):
 *
 *   skip   one occurrence: (client, opportunity type, trigger date), the key
 *          outreach_queue is unique on. Next month's idle check-in or next
 *          year's anniversary is a new occurrence and can surface again.
 *   later  the client, whatever the reason, until `until` (an instant).
 *   stop   the client, whatever the reason, until `until`, except a
 *          consent-lapsing notice: the CASL ask has a deadline and a Stop
 *          that visibly did nothing on that card would be worse.
 *
 * A later or stop row's opportunity_type is HOLD_OPPORTUNITY_TYPE ('any') and
 * its trigger_date is the Atlantic day it was made. A row with no `kind` is
 * a skip (rows from before 00188, and test fakes).
 *
 * Times the agent picks ("tonight", "tomorrow", a number of months) are
 * Atlantic wall-clock times, never UTC and never the device's zone. Relative
 * imports only: the MCP build copies packages/core into Deno.
 */

import {
  addDaysISO,
  atlanticDayStart,
  atlanticHour,
  atlanticISODate,
  atlanticWallClock,
} from "./local-date";

export type DismissalKind = "skip" | "later" | "stop";

/** opportunity_type of a Later or Stop row: it covers every type. */
export const HOLD_OPPORTUNITY_TYPE = "any" as const;
/** Flight Control's consent_lapsing opportunity (apps/web/lib/crm/consent-lapsing.ts re-exports it). */
export const CONSENT_LAPSING_TYPE = "consent_lapsing" as const;

export interface OpportunityKeyParts {
  client_id:        string;
  opportunity_type: string;
  trigger_date:     string;
}

export interface DismissalRow extends OpportunityKeyParts {
  id?:           string;
  /** Missing or null reads as "skip". */
  kind?:         DismissalKind | null;
  /** ISO instant a Later or Stop ends; null for a skip. */
  until?:        string | null;
  dismissed_at?: string | null;
}

export function opportunityKey(o: OpportunityKeyParts): string {
  return `${o.client_id}|${o.opportunity_type}|${o.trigger_date.slice(0, 10)}`;
}

/**
 * Drops the occurrences the agent skipped. Skip rows only: a Later or Stop
 * covers a client (see isHeld), not an occurrence.
 */
export function withoutDismissed<T extends OpportunityKeyParts>(
  candidates: readonly T[],
  dismissals: readonly DismissalRow[],
): T[] {
  const skips = dismissals.filter((d) => (d.kind ?? "skip") === "skip");
  if (skips.length === 0) return [...candidates];
  const dismissed = new Set(skips.map(opportunityKey));
  return candidates.filter((c) => !dismissed.has(opportunityKey(c)));
}

/** The row's `until` as epoch ms, NaN when it has none or can't be read. */
function untilMs(row: DismissalRow): number {
  return row.until ? Date.parse(row.until) : NaN;
}

/**
 * Whether the client's suggestions are on hold at `now`.
 *   a later row with until > now holds every type;
 *   a stop row with until > now holds every type except a consent-lapsing
 *   notice.
 * A hold ends at its `until` instant: at `until` it no longer holds.
 */
export function isHeld(
  clientId:        string,
  opportunityType: string,
  rows:            readonly DismissalRow[],
  now:             Date,
): boolean {
  const t = now.getTime();
  return rows.some((r) => {
    if (r.client_id !== clientId) return false;
    if (!(untilMs(r) > t)) return false;
    if (r.kind === "later") return true;
    if (r.kind === "stop") return opportunityType !== CONSENT_LAPSING_TYPE;
    return false;
  });
}

/** Candidates minus skipped occurrences and clients on hold. */
export function withoutDismissedOrHeld<T extends OpportunityKeyParts>(
  candidates: readonly T[],
  rows:       readonly DismissalRow[],
  now:        Date,
): T[] {
  return withoutDismissed(candidates, rows).filter(
    (c) => !isHeld(c.client_id, c.opportunity_type, rows, now),
  );
}

/**
 * When the client's live Later ends (the row's `until`, as stored), or null
 * when they have none. The latest one if there is more than one.
 */
export function activeLaterUntil(
  clientId: string,
  rows:     readonly DismissalRow[],
  now:      Date,
): string | null {
  const t = now.getTime();
  let best: { at: number; until: string } | null = null;
  for (const r of rows) {
    if (r.client_id !== clientId || r.kind !== "later" || !r.until) continue;
    const at = untilMs(r);
    if (!(at > t)) continue;
    if (!best || at > best.at) best = { at, until: r.until };
  }
  return best ? best.until : null;
}

// --- Later: "in an hour, tonight or tomorrow" -------------------------------

export type LaterChoice = "in_an_hour" | "tonight" | "tomorrow";

/** "Tonight" is 19:00 Atlantic; from 19:00 on it is no longer ahead. */
export const LATER_TONIGHT_HOUR = 19;
/** "Tomorrow" is 08:00 Atlantic on the next calendar day. */
export const LATER_TOMORROW_HOUR = 8;

/** The Later options to offer at `now`: no "tonight" at or after 19:00 Atlantic. */
export function laterChoices(now: Date): LaterChoice[] {
  return atlanticHour(now) < LATER_TONIGHT_HOUR
    ? ["in_an_hour", "tonight", "tomorrow"]
    : ["in_an_hour", "tomorrow"];
}

/**
 * The instant an Atlantic calendar day (YYYY-MM-DD) reads `hour`:00 on the
 * wall. Built from the day's start and corrected through atlanticWallClock,
 * so a clock-change day (23 or 25 hours long) still lands on the stated hour.
 */
function atlanticWallHour(day: string, hour: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour);
  const guess = atlanticDayStart(day).getTime() + hour * 3_600_000;
  return new Date(guess + (wanted - atlanticWallClock(new Date(guess)).getTime()));
}

/** When a Later ends. */
export function laterUntil(choice: LaterChoice, now: Date): Date {
  switch (choice) {
    case "in_an_hour":
      return new Date(now.getTime() + 3_600_000);
    case "tonight":
      return atlanticWallHour(atlanticISODate(now), LATER_TONIGHT_HOUR);
    case "tomorrow":
      return atlanticWallHour(addDaysISO(atlanticISODate(now), 1), LATER_TOMORROW_HOUR);
  }
}

// --- Stop suggesting: "3 months, 6 months, or move to the Hangar" -----------

export type StopChoice = "3_months" | "6_months" | "hangar";

/**
 * When a timed Stop ends: Atlantic midnight starting the same calendar day
 * N months on, clamped to the end of a shorter month (Nov 30 + 3 months is
 * Feb 28, or 29 in a leap year). "hangar" is not a timed stop: it archives
 * the client instead.
 */
export function stopUntil(choice: "3_months" | "6_months", now: Date): Date {
  const months = choice === "3_months" ? 3 : 6;
  const [y, m, d] = atlanticISODate(now).split("-").map(Number);
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = index % 12; // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return atlanticDayStart(iso);
}

// --- The dismiss menu -------------------------------------------------------

export type DismissChoice = "already_talked" | "later" | "skip" | "stop";

/** The menu on a suggestion card. A consent-lapsing card can't be stopped. */
export function dismissChoicesFor(opportunityType: string): DismissChoice[] {
  return opportunityType === CONSENT_LAPSING_TYPE
    ? ["already_talked", "later", "skip"]
    : ["already_talked", "later", "skip", "stop"];
}
