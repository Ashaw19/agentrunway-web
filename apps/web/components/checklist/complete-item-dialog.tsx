"use client";

/**
 * Tick-off pop-up for a checklist item that has a client.
 *
 * One component everywhere a client item can be ticked (Checklist page,
 * client profile Tasks, dashboard tasks card), so the outcome is always
 * recorded the same way:
 *   - Save to their profile → contact logged (counts as contact), item done
 *   - Couldn't reach them   → note logged (not contact), item moves to tomorrow
 *   - Just mark done        → item done, nothing logged
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Phone, MessageSquare, Mail, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { markMemoryStaleClient } from "@/lib/ai/mark-memory-stale";
import { CLIENT_STATUS_LABELS, type ClientStatus, type ContactActivity, type ContactTask } from "@/lib/types/database";
import {
  CHECKLIST_CONTACT_METHODS,
  METHOD_LABEL,
  type ChecklistContactMethod,
} from "@/lib/checklist/checklist";
import {
  completeWithContact,
  logAttemptAndReschedule,
  markItemDone,
  reopenItem,
} from "@/lib/checklist/actions";

const METHOD_ICON: Record<ChecklistContactMethod, LucideIcon> = {
  call:    Phone,
  text:    MessageSquare,
  email:   Mail,
  meeting: Users,
};

export interface CompleteItemDialogProps {
  /** The item being ticked off. Null closes the dialog. Must have a client_id. */
  task:          ContactTask | null;
  clientName:    string;
  onClose:       () => void;
  /** Item is done (any outcome that completes it). `activity` is set when one was logged. */
  onCompleted:   (
    task:       ContactTask,
    patch:      Pick<ContactTask, "completed_at" | "completed_via">,
    activity?:  ContactActivity,
    newStatus?: string | null,
  ) => void;
  /** "Couldn't reach them" moved the item and logged a note. */
  onRescheduled: (task: ContactTask, dueDate: string, activity?: ContactActivity) => void;
  /** "Just mark done" was undone from the toast. Omit to hide Undo. */
  onReopened?:   (task: ContactTask) => void;
}

export function CompleteItemDialog({
  task,
  clientName,
  onClose,
  onCompleted,
  onRescheduled,
  onReopened,
}: CompleteItemDialogProps) {
  const [method, setMethod] = useState<ChecklistContactMethod>("call");
  const [note,   setNote]   = useState("");
  const [saving, setSaving] = useState<null | "contact" | "attempt" | "done">(null);
  const [error,  setError]  = useState<string | null>(null);

  // Fresh form for each item.
  useEffect(() => {
    if (task) { setMethod("call"); setNote(""); setError(null); setSaving(null); }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;
  const name = clientName || "this client";

  async function saveContact() {
    if (!task) return;
    setSaving("contact"); setError(null);
    const res = await completeWithContact(createClient(), task, method, note);
    setSaving(null);
    if (res.status === "failed") {
      setError("That didn't save. Try again.");
      return;
    }
    if (task.client_id) markMemoryStaleClient(task.client_id);
    if (res.status === "logged_not_done") {
      toast.error(`Logged on ${name}'s profile, but the item is still on your list. Tap it and choose Just mark done.`);
      onClose();
      return;
    }
    onCompleted(task, { completed_at: res.completed_at, completed_via: method }, res.activity, res.newStatus);
    const promoted = res.newStatus && res.newStatus !== res.priorStatus;
    toast.success(`Saved to ${name}'s profile and ticked off.`, promoted ? {
      description: `Moved to ${CLIENT_STATUS_LABELS[res.newStatus as ClientStatus] ?? res.newStatus} because you were in touch.`,
    } : undefined);
    onClose();
  }

  async function saveAttempt() {
    if (!task) return;
    setSaving("attempt"); setError(null);
    const res = await logAttemptAndReschedule(createClient(), task, method, note);
    setSaving(null);
    if (!res.ok) {
      setError("That didn't save. Try again.");
      return;
    }
    if (task.client_id) markMemoryStaleClient(task.client_id);
    onRescheduled(task, res.dueDate, res.activity);
    toast.success(`Noted on ${name}'s profile. Moved to tomorrow.`);
    onClose();
  }

  async function justDone() {
    if (!task) return;
    setSaving("done"); setError(null);
    const supabase = createClient();
    const res = await markItemDone(supabase, task.id, "done");
    setSaving(null);
    if (!res) {
      setError("That didn't save. Try again.");
      return;
    }
    const done = task;
    onCompleted(done, { completed_at: res.completed_at, completed_via: "done" });
    toast.success("Ticked off.", onReopened ? {
      action: {
        label: "Undo",
        onClick: async () => {
          if (await reopenItem(supabase, done.id)) onReopened(done);
          else toast.error("Couldn't undo. Try again.");
        },
      },
    } : undefined);
    onClose();
  }

  const busy = saving !== null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{task.title}</DialogTitle>
          <DialogDescription>How did it go with {name}?</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">How you reached them, or tried to</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Contact method">
              {CHECKLIST_CONTACT_METHODS.map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ring-1 transition-colors",
                      method === m
                        ? "bg-primary/10 ring-primary/50 text-foreground font-medium"
                        : "ring-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {METHOD_LABEL[m]}
                  </button>
                );
              })}
            </div>
          </div>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What did you talk about? (optional)"
            className="text-sm resize-none"
          />

          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

          <Button className="w-full" disabled={busy} onClick={saveContact}>
            {saving === "contact" ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save to their profile"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={saveAttempt}>
              {saving === "attempt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Couldn't reach them"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={justDone}>
              {saving === "done" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Just mark done"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Saving logs it on their profile and takes them off Flight Control for 14 days.
            Couldn&apos;t reach them adds a note and moves this to tomorrow.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
