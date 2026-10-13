/**
 * "Today / Yesterday / 3 days ago" labels for a timestamp, by calendar day.
 *
 * The count is midnights passed on the agent's own calendar
 * (localDaysSince), not elapsed 24-hour blocks: a call logged at 10 pm is
 * "Yesterday" at 9 the next morning, 11 hours on.
 *
 * Browser code only: on the server "local" is UTC.
 */
import { localDaysSince } from "@agent-runway/core/lib/local-date";

/** "Today", "Yesterday", "3 days ago", then "Oct 6". CRM activity rows. */
export function relativeDate(isoStr: string, now: Date = new Date()): string {
  const days = localDaysSince(isoStr, now);
  if (days === null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  return new Date(isoStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/** "Today", "Yesterday", "3d ago", "2w ago", "4mo ago". Pipeline tab rows. */
export function lastTouchLabel(iso: string | null | undefined, now: Date = new Date()): string {
  const days = localDaysSince(iso, now);
  if (days === null) return "No contact on record";
  if (days <= 0)    return "Today";
  if (days === 1)    return "Yesterday";
  if (days < 7)     return `${days}d ago`;
  if (days < 30)    return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
