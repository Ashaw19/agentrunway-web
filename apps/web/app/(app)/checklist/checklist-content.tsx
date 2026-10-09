"use client";

/**
 * Checklist page: the agent's to-do list, and what got done this week.
 *
 * Items are contact_tasks rows, so they also show on the client profile, the
 * dashboard tasks card and to Flight Crew. Ticking an item with a client opens
 * the shared CompleteItemDialog, which records the outcome on their profile.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckSquare, ListChecks, Loader2, Plus, Square, Trash2, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ContactTask } from "@/lib/types/database";
import { CompleteItemDialog } from "@/components/checklist/complete-item-dialog";
import { addChecklistItem, markItemDone, reopenItem } from "@/lib/checklist/actions";
import {
  addDaysIso,
  doneLabel,
  doneThisWeek,
  dueLabel,
  groupOpenItems,
  overdueLabel,
  todayLocalIso,
} from "@/lib/checklist/checklist";

export interface ChecklistClient {
  id:          string;
  name:        string;
  archived_at: string | null;
}

export function ChecklistContent({
  initialItems,
  clients,
  loadFailed,
}: {
  initialItems: ContactTask[];
  clients:      ChecklistClient[];
  loadFailed:   boolean;
}) {
  const [items, setItems] = useState<ContactTask[]>(initialItems);
  const [ticking, setTicking] = useState<ContactTask | null>(null);

  const today = todayLocalIso();
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const groups = useMemo(() => groupOpenItems(items, today), [items, today]);
  const done = useMemo(() => doneThisWeek(items), [items]);
  const openCount = groups.overdue.length + groups.today.length + groups.upcoming.length;

  const patch = (id: string, change: Partial<ContactTask>) =>
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...change } : t)));

  async function tick(task: ContactTask) {
    if (task.client_id) { setTicking(task); return; }
    const supabase = createClient();
    const res = await markItemDone(supabase, task.id, "done");
    if (!res) { toast.error("Couldn't tick that off. Try again."); return; }
    patch(task.id, { completed_at: res.completed_at, completed_via: "done" });
    toast.success("Ticked off.", {
      action: { label: "Undo", onClick: () => void reopen(task, true) },
    });
  }

  async function reopen(task: ContactTask, quiet = false) {
    if (!(await reopenItem(createClient(), task.id))) {
      toast.error("Couldn't put it back on your list. Try again.");
      return;
    }
    patch(task.id, { completed_at: null, completed_via: null });
    if (!quiet) {
      toast.success(task.completed_via && task.completed_via !== "done"
        ? "Back on your list. The contact stays logged on their profile."
        : "Back on your list.");
    }
  }

  async function remove(task: ContactTask) {
    const supabase = createClient();
    const { error } = await supabase.from("contact_tasks").delete().eq("id", task.id);
    if (error) { toast.error("Couldn't delete it. Try again."); return; }
    setItems((prev) => prev.filter((t) => t.id !== task.id));
    toast.success("Deleted.", {
      action: {
        label: "Undo",
        onClick: async () => {
          const back = await addChecklistItem(supabase, {
            title: task.title, clientId: task.client_id, dueDate: task.due_date,
            priority: task.priority, notes: task.notes,
          });
          if (back) setItems((prev) => [...prev, back]);
          else toast.error("Couldn't bring it back. Add it again.");
        },
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" aria-hidden />
            Checklist
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            What&apos;s on your plate, and what you got done.
          </p>
        </div>
        <span className={cn(
          "shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1",
          done.length > 0
            ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300"
            : "bg-muted text-muted-foreground ring-border",
        )}>
          {done.length} done this week
        </span>
      </div>

      {loadFailed && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Some of your list didn&apos;t load. Refresh the page to try again.
        </p>
      )}

      <AddItemForm
        clients={clients}
        today={today}
        onAdded={(task) => setItems((prev) => [...prev, task])}
      />

      {openCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">Your list is clear</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add something above, or tap Add to checklist on a Flight Control card or a client&apos;s profile.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <Group label="Overdue" tone="danger" items={groups.overdue} today={today} clientName={clientName} onTick={tick} onDelete={remove} />
          <Group label="Today" items={groups.today} today={today} clientName={clientName} onTick={tick} onDelete={remove} />
          <Group label="Coming up" items={groups.upcoming} today={today} clientName={clientName} onTick={tick} onDelete={remove} />
        </div>
      )}

      {done.length > 0 && (
        <section aria-label="Done this week">
          <h2 className="text-xs font-semibold text-muted-foreground mb-1.5">Done this week</h2>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => reopen(t)}
                  className="shrink-0 text-emerald-600 hover:text-muted-foreground"
                  aria-label={`Put "${t.title}" back on your list`}
                  title="Put back on your list"
                >
                  <CheckSquare className="h-5 w-5" />
                </button>
                <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground line-through">{t.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{doneLabel(t)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CompleteItemDialog
        task={ticking}
        clientName={ticking?.client_id ? clientName.get(ticking.client_id) ?? "" : ""}
        onClose={() => setTicking(null)}
        onCompleted={(task, change) => patch(task.id, change)}
        onRescheduled={(task, dueDate) => patch(task.id, { due_date: dueDate })}
        onReopened={(task) => patch(task.id, { completed_at: null, completed_via: null })}
      />
    </div>
  );
}

// ── One group (Overdue / Today / Coming up) ────────────────────────────────

function Group({
  label,
  tone,
  items,
  today,
  clientName,
  onTick,
  onDelete,
}: {
  label:      string;
  tone?:      "danger";
  items:      ContactTask[];
  today:      string;
  clientName: Map<string, string>;
  onTick:     (t: ContactTask) => void;
  onDelete:   (t: ContactTask) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={label}>
      <h2 className={cn("text-xs font-semibold mb-1.5", tone === "danger" ? "text-red-600" : "text-muted-foreground")}>
        {label} <span className="font-normal">· {items.length}</span>
      </h2>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
        {items.map((t) => {
          const name = t.client_id ? clientName.get(t.client_id) : undefined;
          return (
            <li key={t.id} className="group flex items-start gap-3 px-3 py-2.5">
              <button
                type="button"
                onClick={() => onTick(t)}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                aria-label={`Tick off "${t.title}"`}
                title="Tick off"
              >
                <Square className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug break-words">
                  {t.title}
                  {t.priority === "high" && (
                    <span className="ml-1.5 align-middle rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300">
                      high
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {t.client_id && (
                    <Link href={`/crm?client=${t.client_id}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                      <User className="h-3 w-3" aria-hidden />
                      {name ?? "Client"}
                    </Link>
                  )}
                  <span className={cn(t.due_date < today && "text-red-600 font-medium")}>
                    {t.due_date < today ? overdueLabel(t.due_date, today) : dueLabel(t.due_date, today)}
                  </span>
                </p>
                {t.notes && <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{t.notes}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDelete(t)}
                className="mt-0.5 shrink-0 text-muted-foreground/60 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 transition-opacity"
                aria-label={`Delete "${t.title}"`}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Add an item ─────────────────────────────────────────────────────────────

function AddItemForm({
  clients,
  today,
  onAdded,
}: {
  clients: ChecklistClient[];
  today:   string;
  onAdded: (t: ContactTask) => void;
}) {
  const [title, setTitle]       = useState("");
  const [due, setDue]           = useState(today);
  const [client, setClient]     = useState<ChecklistClient | null>(null);
  const [search, setSearch]     = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving]     = useState(false);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => !c.archived_at && c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, search]);

  async function add() {
    if (!title.trim() || saving) return;
    setSaving(true);
    const task = await addChecklistItem(createClient(), { title, clientId: client?.id ?? null, dueDate: due || today });
    setSaving(false);
    if (!task) { toast.error("Couldn't add that. Try again."); return; }
    onAdded(task);
    setTitle(""); setClient(null); setSearch(""); setDue(today);
  }

  const tomorrow = addDaysIso(today, 1);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2.5">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void add(); }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add something to do"
          aria-label="New checklist item"
          maxLength={200}
          className="h-9 text-sm"
        />
        <Button type="submit" size="sm" className="h-9 gap-1.5 shrink-0" disabled={!title.trim() || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {/* Optional client */}
        {client ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs ring-1 ring-primary/25">
            <User className="h-3 w-3" aria-hidden />
            {client.name}
            <button type="button" onClick={() => setClient(null)} aria-label="Remove client" className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowPicker(true); }}
              onFocus={() => setShowPicker(true)}
              onBlur={() => setTimeout(() => setShowPicker(false), 150)}
              placeholder="Client (optional)"
              aria-label="Link a client (optional)"
              className="h-8 w-48 text-xs"
            />
            {showPicker && search.trim() && (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                {matches.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No client by that name</p>
                ) : matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setClient(c);
                      setSearch("");
                      setShowPicker(false);
                      if (!title.trim()) setTitle(`Contact ${c.name}`);
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Due date */}
        <div className="flex items-center gap-1" role="group" aria-label="Due date">
          {[{ label: "Today", value: today }, { label: "Tomorrow", value: tomorrow }].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setDue(o.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs ring-1 transition-colors",
                due === o.value ? "bg-primary/10 ring-primary/40 font-medium" : "ring-border text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
          <Input
            type="date"
            value={due}
            min={today}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Pick a due date"
            className={cn("h-8 w-[9.5rem] text-xs", due !== today && due !== tomorrow && "ring-1 ring-primary/40")}
          />
        </div>
      </div>
    </div>
  );
}
