/**
 * Next up rules shared by the server (/api/next-up's urgent counts) and the
 * phone's builder, so both count the same leads, tasks and deadlines.
 *
 * Pure: no database and no clock of its own. Callers pass `now` (an instant)
 * and `today` (YYYY-MM-DD: atlanticISODate on the server). Hours are Atlantic
 * wall-clock hours (atlanticHour).
 *
 * Relative imports only: the MCP build copies packages/core into Deno.
 */

import { daysBetweenISO } from "../local-date";
import { CONSENT_LAPSING_TYPE } from "../suggestion-dismissals";

/** Clients suggested a day. */
export const HANDFUL_TARGET = 5;
/** A lead is new, and always on top, for this many hours after it's added. */
export const NEW_LEAD_HOURS = 48;
/** A deal deadline is always on top from this many days out. */
export const DEAL_DEADLINE_DAYS = 7;
/** Morning ends at noon. */
export const MORNING_END_HOUR = 12;
/** Evening starts at 5 pm. */
export const EVENING_START_HOUR = 17;

export type TimeBand = "morning" | "midday" | "evening";

/** The band for an hour of the day (0 to 23): 12:00 is midday, 17:00 is evening. */
export function timeBand(hour: number): TimeBand {
  if (hour < MORNING_END_HOUR) return "morning";
  if (hour < EVENING_START_HOUR) return "midday";
  return "evening";
}

interface LeadFields {
  status:          string;
  last_contact_at: string | null;
  created_at:      string;
  archived_at?:    string | null;
}

/** A Boarding client never contacted (a Note isn't contact) and not in the Hangar. */
export function isUncontactedLead(c: Omit<LeadFields, "created_at">): boolean {
  return c.status === "boarding" && !c.last_contact_at && !c.archived_at;
}

/**
 * An uncontacted lead added less than NEW_LEAD_HOURS ago. Elapsed time, not
 * calendar days: a lead added at 9 pm is new until 9 pm two days later.
 */
export function isNewLead(c: LeadFields, now: Date): boolean {
  if (!isUncontactedLead(c)) return false;
  const added = Date.parse(c.created_at);
  if (Number.isNaN(added)) return false;
  return now.getTime() - added < NEW_LEAD_HOURS * 3_600_000;
}

interface TaskFields {
  due_date:     string;
  completed_at: string | null;
}

/** An open task due before today. due_date is a date-only column. */
export function isOverdueTask(t: TaskFields, today: string): boolean {
  return !t.completed_at && !!t.due_date && t.due_date.slice(0, 10) < today;
}

/** An open task due today. */
export function isDueToday(t: TaskFields, today: string): boolean {
  return !t.completed_at && !!t.due_date && t.due_date.slice(0, 10) === today;
}

/** Calendar days from today to `date`, when that is 0 to DEAL_DEADLINE_DAYS; else null. */
function daysInWindow(date: string | null | undefined, today: string): number | null {
  if (!date) return null;
  const days = daysBetweenISO(today, date.slice(0, 10));
  return days >= 0 && days <= DEAL_DEADLINE_DAYS ? days : null;
}

/**
 * Days until an active deal's expected close, 0 to 7, or null outside that
 * window. Callers pass active deals only (activePipelineDeals). A passed
 * date is null here: see isPastCloseDate.
 */
export function dealDeadlineDays(d: { expected_close_date: string | null }, today: string): number | null {
  return daysInWindow(d.expected_close_date, today);
}

/** Condition statuses that leave no deadline. */
const SETTLED_CONDITIONS: readonly string[] = ["firmed", "waived", "collapsed"];

/**
 * Days until a deal's condition date, 0 to 7, or null: outside that window,
 * or the condition is already firmed, waived or collapsed.
 */
export function conditionDeadlineDays(
  r:     { condition_date: string | null; condition_status: string | null },
  today: string,
): number | null {
  if (r.condition_status && SETTLED_CONDITIONS.includes(r.condition_status)) return null;
  return daysInWindow(r.condition_date, today);
}

/** An expected close date before today: the deal needs an update. */
export function isPastCloseDate(d: { expected_close_date: string | null }, today: string): boolean {
  return !!d.expected_close_date && d.expected_close_date.slice(0, 10) < today;
}

/** The text a handful card drafts: a consent-lapsing card asks to keep in touch; the rest check in. */
export function textPurposeFor(opportunityType: string): "check_in" | "consent_request" {
  return opportunityType === CONSENT_LAPSING_TYPE ? "consent_request" : "check_in";
}
