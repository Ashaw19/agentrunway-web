/**
 * Checklist — pure helpers (no I/O).
 *
 * The Checklist page is the existing task list (contact_tasks): the same
 * items show on the page, a client's profile, the dashboard tasks card and to
 * Flight Crew. Dates are browser-local. `due_date` is a date-only column, so
 * it is compared as a YYYY-MM-DD string and parsed with the local-noon anchor
 * when a Date is needed (see date-only-anchor.test.ts).
 */

import type { ActivityType, ChecklistCompletedVia, ContactTask } from "@/lib/types/database";
import { localISODate } from "@/lib/crm/outreach-consent";

/** How a client item can be reached from the tick-off pop-up. */
export const CHECKLIST_CONTACT_METHODS = ["call", "text", "email", "meeting"] as const;
export type ChecklistContactMethod = (typeof CHECKLIST_CONTACT_METHODS)[number];

/** The activity type each contact method is logged as. */
export const METHOD_ACTIVITY_TYPE: Record<ChecklistContactMethod, ActivityType> = {
  call:    "call",
  text:    "text",
  email:   "email",
  meeting: "meeting",
};

export const METHOD_LABEL: Record<ChecklistContactMethod, string> = {
  call:    "Call",
  text:    "Text",
  email:   "Email",
  meeting: "Meeting",
};

/** "Called" etc., for the Done list. */
const VIA_PAST: Record<ChecklistCompletedVia, string> = {
  call:    "Called",
  text:    "Texted",
  email:   "Emailed",
  meeting: "Met",
  done:    "Done",
};

const METHOD_VERB: Record<ChecklistContactMethod, string> = {
  call:    "call",
  text:    "text",
  email:   "email",
  meeting: "meet with",
};

export function todayLocalIso(now: Date = new Date()): string {
  return localISODate(now);
}

/** YYYY-MM-DD `days` after the given date-only string (DST-safe: noon anchor). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

/** Local midnight on the Monday of `now`'s week. */
export function weekStart(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (d.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

export interface ChecklistGroups {
  overdue:  ContactTask[];
  today:    ContactTask[];
  upcoming: ContactTask[];
}

/** Open items by due date. High priority first within a day, then oldest first. */
export function groupOpenItems(tasks: ContactTask[], todayIso: string): ChecklistGroups {
  const rank = { high: 0, normal: 1, low: 2 } as const;
  const open = tasks
    .filter((t) => !t.completed_at)
    .sort((a, b) =>
      a.due_date.localeCompare(b.due_date)
      || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1)
      || a.created_at.localeCompare(b.created_at));
  return {
    overdue:  open.filter((t) => t.due_date < todayIso),
    today:    open.filter((t) => t.due_date === todayIso),
    upcoming: open.filter((t) => t.due_date > todayIso),
  };
}

/** Items completed since Monday (local), newest first. */
export function doneThisWeek(tasks: ContactTask[], now: Date = new Date()): ContactTask[] {
  const start = weekStart(now).getTime();
  return tasks
    .filter((t) => t.completed_at && new Date(t.completed_at).getTime() >= start)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
}

/** "Called · Tue" — how and when a done item was finished. */
export function doneLabel(task: Pick<ContactTask, "completed_at" | "completed_via">): string {
  const via = task.completed_via ? VIA_PAST[task.completed_via] : "Done";
  if (!task.completed_at) return via;
  const day = new Date(task.completed_at).toLocaleDateString("en-CA", { weekday: "short" });
  return `${via} · ${day}`;
}

/** "Today", "Tomorrow", "Mon", or "Oct 20" for an open item's due date. */
export function dueLabel(dueIso: string, todayIso: string): string {
  if (dueIso === todayIso) return "Today";
  if (dueIso === addDaysIso(todayIso, 1)) return "Tomorrow";
  if (dueIso === addDaysIso(todayIso, -1)) return "Yesterday";
  const d = new Date(dueIso + "T12:00:00");
  const days = Math.round((d.getTime() - new Date(todayIso + "T12:00:00").getTime()) / 86_400_000);
  if (days > 1 && days < 7) return d.toLocaleDateString("en-CA", { weekday: "long" });
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/** "Was due yesterday" / "Was due Oct 3" for an overdue item. */
export function overdueLabel(dueIso: string, todayIso: string): string {
  if (dueIso === addDaysIso(todayIso, -1)) return "Was due yesterday";
  const d = new Date(dueIso + "T12:00:00");
  return `Was due ${d.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;
}

/** Title for a one-tap "Add to checklist" item. */
export function contactItemTitle(clientName: string): string {
  return `Contact ${clientName.trim()}`;
}

/** Activity description when the contact was made. Falls back to a plain line. */
export function contactDescription(method: ChecklistContactMethod, note: string): string {
  return note.trim() || `${METHOD_LABEL[method]} (from Checklist)`;
}

/** Note logged on the profile when they couldn't be reached. Not contact (00171). */
export function attemptDescription(method: ChecklistContactMethod, note: string): string {
  const base = `Tried to ${METHOD_VERB[method]} them, couldn't reach them`;
  return note.trim() ? `${base}. ${note.trim()}` : base;
}
