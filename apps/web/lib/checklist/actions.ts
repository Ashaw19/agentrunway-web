/**
 * Checklist writes from the browser (RLS-scoped client).
 *
 * Used by the Checklist page, the tick-off pop-up (client profile, dashboard
 * card) and "Add to checklist" buttons (Flight Control, client profile).
 *
 * Contact outcome order: the activity is logged first (logClientContact), then
 * the item is marked done. If the activity fails nothing changes. If the item
 * update fails after the activity saved, the caller is told so it can say
 * "logged, but still on your list" and the retry is "Just mark done" (no
 * duplicate activity).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChecklistCompletedVia, ContactActivity, ContactTask, TaskPriority } from "@/lib/types/database";
import { logClientContact } from "@/lib/crm/log-contact";
import {
  METHOD_ACTIVITY_TYPE,
  addDaysIso,
  attemptDescription,
  contactDescription,
  contactItemTitle,
  todayLocalIso,
  type ChecklistContactMethod,
} from "./checklist";

export interface NewChecklistItem {
  title:     string;
  clientId?: string | null;
  dueDate?:  string;            // YYYY-MM-DD, defaults to today (local)
  priority?: TaskPriority;
  notes?:    string | null;
}

export async function addChecklistItem(
  supabase: SupabaseClient,
  item:     NewChecklistItem,
): Promise<ContactTask | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("contact_tasks")
    .insert({
      user_id:   user.id,
      client_id: item.clientId || null,
      title:     item.title.trim(),
      due_date:  item.dueDate ?? todayLocalIso(),
      priority:  item.priority ?? "normal",
      notes:     item.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    console.error("[checklist] add failed:", error.code ?? "", error.message);
    return null;
  }
  return data as ContactTask;
}

/** One-tap "Add to checklist": "Contact <name>", due today. */
export function addContactItem(supabase: SupabaseClient, clientId: string, clientName: string) {
  return addChecklistItem(supabase, { title: contactItemTitle(clientName), clientId });
}

export async function markItemDone(
  supabase: SupabaseClient,
  taskId:   string,
  via:      ChecklistCompletedVia,
): Promise<{ completed_at: string } | null> {
  const completed_at = new Date().toISOString();
  const { error } = await supabase
    .from("contact_tasks")
    .update({ completed_at, completed_via: via })
    .eq("id", taskId);
  if (error) {
    console.error("[checklist] complete failed:", error.code ?? "", error.message);
    return null;
  }
  return { completed_at };
}

export async function reopenItem(supabase: SupabaseClient, taskId: string): Promise<boolean> {
  const { error } = await supabase
    .from("contact_tasks")
    .update({ completed_at: null, completed_via: null })
    .eq("id", taskId);
  if (error) console.error("[checklist] reopen failed:", error.code ?? "", error.message);
  return !error;
}

export type ContactOutcomeResult =
  | { status: "done"; completed_at: string; priorStatus: string | null; newStatus: string | null; activity?: ContactActivity }
  | { status: "logged_not_done" }   // activity saved, item update failed
  | { status: "failed" };           // nothing saved

/** "Save to their profile": log the contact, then tick the item off. */
export async function completeWithContact(
  supabase: SupabaseClient,
  task:     Pick<ContactTask, "id" | "client_id">,
  method:   ChecklistContactMethod,
  note:     string,
): Promise<ContactOutcomeResult> {
  if (!task.client_id) return { status: "failed" };
  const logged = await logClientContact(supabase, {
    clientId:    task.client_id,
    type:        METHOD_ACTIVITY_TYPE[method],
    description: contactDescription(method, note),
  });
  if (!logged.ok) return { status: "failed" };
  const done = await markItemDone(supabase, task.id, method);
  if (!done) return { status: "logged_not_done" };
  return {
    status: "done", completed_at: done.completed_at,
    priorStatus: logged.priorStatus, newStatus: logged.newStatus, activity: logged.activity,
  };
}

/**
 * "Couldn't reach them": a note on their profile (notes aren't contact, so
 * Flight Control keeps them) and the item moves to tomorrow.
 */
export async function logAttemptAndReschedule(
  supabase: SupabaseClient,
  task:     Pick<ContactTask, "id" | "client_id">,
  method:   ChecklistContactMethod,
  note:     string,
): Promise<{ ok: boolean; dueDate: string; activity?: ContactActivity }> {
  const dueDate = addDaysIso(todayLocalIso(), 1);
  if (!task.client_id) return { ok: false, dueDate };
  const logged = await logClientContact(supabase, {
    clientId:    task.client_id,
    type:        "note",
    description: attemptDescription(method, note),
  });
  if (!logged.ok) return { ok: false, dueDate };
  const { error } = await supabase
    .from("contact_tasks")
    .update({ due_date: dueDate })
    .eq("id", task.id);
  if (error) {
    console.error("[checklist] reschedule failed:", error.code ?? "", error.message);
    return { ok: false, dueDate };
  }
  return { ok: true, dueDate, activity: logged.activity };
}
