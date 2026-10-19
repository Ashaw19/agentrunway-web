"use client";

/**
 * VoiceCaptureDialog: the web voice button's confirm card.
 *
 * The same proposal as the iPhone card (POST /api/voice-extract → core
 * capture pipeline): each proposed write with every field editable and a
 * Remove, a picker when a name fits several clients or deals (nothing is
 * chosen for the agent), and Confirm saving through core record-writers, the
 * Flight Crew tools' writers. Cancel saves nothing.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Loader2, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { RECEIPT_CATEGORY_GROUPS, isReceiptCategoryKey, receiptCategoryFullLabel } from "@/lib/types/receipt";
import { useVoiceDraft } from "@/lib/voice/voice-draft-context";
import { legacyDraftFor } from "@/lib/voice/legacy-draft";
import { localISODate } from "@agent-runway/core/lib/local-date";
import { shortDayLabel } from "@agent-runway/core/lib/capture/dates";
import {
  applyCaptureWrites,
  checkWrite,
  isSettled,
  pickClient,
  pickDeal,
  settleSavedClients,
  summarizeSave,
  type ClientPick,
  type SaveResult,
} from "@agent-runway/core/lib/capture/proposals";
import { rankClientCandidates, rankDealCandidates, searchClients, searchDeals } from "@agent-runway/core/lib/capture/resolve";
import {
  CAPTURE_DEAL_STAGES,
  type CaptureProposal,
  type ClientCandidate,
  type DealCandidate,
  type ProposedWrite,
} from "@agent-runway/core/lib/capture/types";

const TITLES: Record<ProposedWrite["tool"], string> = {
  logContactActivity: "Activity",
  createContactTask: "Checklist item",
  updatePipelineDealStage: "Deal stage",
  updatePipelineDealCloseDate: "Expected close date",
  logMileage: "Trip",
  logExpense: "Expense",
  createClient: "New client",
  recordTransaction: "Closed deal",
};
const ACTIVITY_TYPES = ["call", "text", "email", "showing", "meeting", "offer", "note"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;
const SIDES = ["buyer", "seller", "both"] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const patch = (w: ProposedWrite, p: Record<string, unknown>): ProposedWrite => ({ ...w, args: { ...w.args, ...p } }) as ProposedWrite;
const num = (v: string): number | undefined => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? undefined : n;
};

/** Where "Open in the full form" goes for a single new client, expense or closed deal. */
const FULL_FORM: Partial<Record<ProposedWrite["tool"], string>> = {
  createClient: "/crm?voice=1",
  logExpense: "/expenses?voice=1",
  recordTransaction: "/transactions?voice=1",
};

export function VoiceCaptureDialog({ proposal, onClose }: { proposal: CaptureProposal | null; onClose: () => void }) {
  return (
    <Dialog open={!!proposal} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* A click outside doesn't close it (the edits would be lost); Cancel, X and Escape do. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Review your note</DialogTitle>
          <DialogDescription>Nothing is saved until you confirm.</DialogDescription>
        </DialogHeader>
        {proposal && <CaptureBody key={proposal.transcript} proposal={proposal} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CaptureBody({ proposal, onClose }: { proposal: CaptureProposal; onClose: () => void }) {
  const router = useRouter();
  const { setDraft } = useVoiceDraft();
  const [writes, setWrites] = useState<ProposedWrite[]>(proposal.writes);
  const [results, setResults] = useState<Record<string, SaveResult>>({});
  const [saving, setSaving] = useState(false);

  // Saved, or a new client already on file (the note went on them): nothing more to do.
  const done = (id: string) => isSettled(results[id]);
  const pending = writes.filter((w) => w.include && !done(w.id));
  const problems = useMemo(
    () => Object.fromEntries(writes.map((w) => [w.id, checkWrite(w, { isExpenseCategoryKey: isReceiptCategoryKey })])),
    [writes],
  );
  const blocked = pending.filter((w) => problems[w.id].length > 0).length;
  const saved = Object.keys(results).length > 0;
  const update = (next: ProposedWrite) => setWrites((ws) => ws.map((w) => (w.id === next.id ? next : w)));

  const confirm = async () => {
    if (saving || pending.length === 0 || blocked > 0) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in again to save.");
        return;
      }
      // Row ids from the last try: a write that reached the database before
      // its reply was lost is saved once, not twice.
      const rowIds = Object.fromEntries(
        Object.values(results).filter((r) => r.rowId).map((r) => [r.writeId, r.rowId!]),
      );
      const out = await applyCaptureWrites(supabase, user.id, pending, { today: proposal.today || localISODate(), rowIds });
      setResults((r) => ({ ...r, ...Object.fromEntries(out.map((x) => [x.writeId, x])) }));
      // Items about a new client that saved now point at that client.
      setWrites((ws) => settleSavedClients(ws, out));
      const s = summarizeSave(out);
      if (s.failed > 0) toast.error(s.text);
      else toast.success(s.text);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const single = writes.length === 1 ? writes[0] : null;
  const openFullForm = single && FULL_FORM[single.tool] && !saved
    ? () => {
        const draft = legacyDraftFor(single, proposal.transcriptCleaned);
        if (!draft) return;
        setDraft(draft);
        onClose();
        router.push(FULL_FORM[single.tool]!);
      }
    : null;

  return (
    <div className="space-y-3">
      <details className="rounded-md border bg-muted/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">What I heard</summary>
        <p className="mt-1 text-sm italic">&ldquo;{proposal.transcriptCleaned || proposal.transcript}&rdquo;</p>
      </details>

      {writes.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing to save was found in that note. Try naming the client and what happened.</p>
      )}
      {proposal.notes.map((n, i) => (
        <p key={i} className="text-xs text-muted-foreground">• {n}</p>
      ))}

      {writes.map((w) => (
        <WriteCard
          key={w.id}
          w={w}
          all={writes}
          today={proposal.today || localISODate()}
          problems={problems[w.id]}
          result={results[w.id]}
          locked={done(w.id) || saving}
          onChange={update}
          onSetAll={setWrites}
        />
      ))}

      {blocked > 0 && (
        <p className="text-xs text-amber-600">
          {blocked === 1 ? "1 item needs a pick or a field before it can be saved." : `${blocked} items need a pick or a field before they can be saved.`}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {openFullForm && (
          <Button variant="ghost" size="sm" onClick={openFullForm} className="mr-auto">Open in the full form</Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
          {saved ? "Close" : "Cancel"}
        </Button>
        {pending.length > 0 && (
          <Button size="sm" onClick={confirm} disabled={saving || blocked > 0}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
            {saved ? `Save the rest (${pending.length})` : `Confirm and save ${pending.length}`}
          </Button>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  w: ProposedWrite;
  all: ProposedWrite[];
  today: string;
  problems: string[];
  result?: SaveResult;
  locked: boolean;
  onChange: (w: ProposedWrite) => void;
  onSetAll: (ws: ProposedWrite[]) => void;
}

function WriteCard({ w, all, today, problems, result, locked, onChange, onSetAll }: CardProps) {
  if (!w.include && !result) {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <span>{TITLES[w.tool]} removed{w.warnings[0] ? `: ${w.warnings[0]}` : ""}</span>
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange({ ...w, include: true })}>Add back</button>
      </div>
    );
  }
  return (
    <div className={cn(
      "space-y-2 rounded-lg border p-3",
      result?.status === "saved" && "border-emerald-500/50",
      result?.status === "queued" && "border-blue-500/50",
      result?.status === "failed" && "border-red-500/50",
    )}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{TITLES[w.tool]}</span>
        {!locked && (
          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange({ ...w, include: false })}>
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
      {result && (
        <p className={cn("flex items-center gap-1 text-xs", result.status === "failed" ? "text-red-600" : "text-emerald-600")}>
          {result.status === "failed" ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {result.status === "saved" ? "Saved" : result.status === "queued" ? "Waiting to sync" : `Not saved: ${result.message}`}
        </p>
      )}
      {w.warnings.map((m, i) => <p key={i} className="text-xs text-amber-600">{m}</p>)}
      <fieldset disabled={locked} className={cn("space-y-2", locked && "opacity-60")}>
        <Fields w={w} all={all} today={today} onChange={onChange} onSetAll={onSetAll} />
      </fieldset>
      {!locked && problems.length > 0 && <p className="text-xs text-red-600">{problems.join(" ")}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Chips<T extends string>({ options, value, onPick }: { options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          aria-pressed={o === value}
          className={cn("rounded-full border px-2.5 py-0.5 text-xs", o === value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
        >
          {cap(o)}
        </button>
      ))}
    </div>
  );
}

function Fields({ w, all, today, onChange, onSetAll }: { w: ProposedWrite; all: ProposedWrite[]; today: string; onChange: (w: ProposedWrite) => void; onSetAll: (ws: ProposedWrite[]) => void }) {
  const set = (p: Record<string, unknown>) => onChange(patch(w, p));
  switch (w.tool) {
    case "logContactActivity":
      return (
        <>
          <ClientPicker w={w} all={all} onSetAll={onSetAll} />
          <Chips options={ACTIVITY_TYPES} value={w.args.type} onPick={(type) => set({ type })} />
          {w.args.type === "note" && <p className="text-xs text-muted-foreground">A note is a memo. It doesn&apos;t count as contact.</p>}
          <Field label="What happened"><Textarea value={w.args.description} onChange={(e) => set({ description: e.target.value })} rows={2} /></Field>
          <Field label="Date"><Input type="date" value={w.args.activityDate ?? today} onChange={(e) => set({ activityDate: e.target.value === today ? undefined : e.target.value })} /></Field>
        </>
      );
    case "createContactTask":
      return (
        <>
          <ClientPicker w={w} all={all} onSetAll={onSetAll} />
          <Field label="Title"><Input value={w.args.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Due"><Input type="date" value={w.args.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
          <Chips options={PRIORITIES} value={w.args.priority} onPick={(priority) => set({ priority })} />
        </>
      );
    case "updatePipelineDealStage":
      return (
        <>
          <DealPicker w={w} all={all} onSetAll={onSetAll} />
          <Chips options={CAPTURE_DEAL_STAGES} value={w.args.stage} onPick={(stage) => set({ stage })} />
        </>
      );
    case "updatePipelineDealCloseDate":
      return (
        <>
          <DealPicker w={w} all={all} onSetAll={onSetAll} />
          <Field label="Expected close"><Input type="date" value={w.args.closeDate} onChange={(e) => set({ closeDate: e.target.value })} /></Field>
        </>
      );
    case "logMileage":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Kilometres"><Input inputMode="decimal" defaultValue={w.args.km || ""} onChange={(e) => set({ km: num(e.target.value) ?? 0 })} /></Field>
            <Field label="Date"><Input type="date" value={w.args.tripDate} onChange={(e) => set({ tripDate: e.target.value })} /></Field>
          </div>
          {w.args.km > 1000 && <p className="text-xs text-amber-600">That&apos;s a long trip. Check the kilometres.</p>}
          <Field label="Purpose"><Input value={w.args.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From (optional)"><Input value={w.args.fromLocation ?? ""} onChange={(e) => set({ fromLocation: e.target.value || undefined })} /></Field>
            <Field label="To (optional)"><Input value={w.args.toLocation ?? ""} onChange={(e) => set({ toLocation: e.target.value || undefined })} /></Field>
          </div>
        </>
      );
    case "logExpense":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Total paid ($)"><Input inputMode="decimal" defaultValue={w.args.amount || ""} onChange={(e) => set({ amount: num(e.target.value) ?? 0 })} /></Field>
            <Field label="Date"><Input type="date" value={w.args.expenseDate} onChange={(e) => set({ expenseDate: e.target.value })} /></Field>
          </div>
          <Field label="Paid to"><Input value={w.args.vendor} onChange={(e) => set({ vendor: e.target.value })} /></Field>
          <Field label="Category">
            <select
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={w.args.categoryKey}
              onChange={(e) => set({ categoryKey: e.target.value })}
            >
              <option value="">Pick a category</option>
              {RECEIPT_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((i) => <option key={i.key} value={i.key}>{receiptCategoryFullLabel(i.key)}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="GST/HST ($, only if it's on the receipt)"><Input inputMode="decimal" defaultValue={w.args.taxAmount ?? ""} onChange={(e) => set({ taxAmount: num(e.target.value) })} /></Field>
          <Field label="Note (optional)"><Input value={w.args.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
        </>
      );
    case "createClient":
      return (
        <>
          <Field label="Name"><Input value={w.args.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone (optional)"><Input value={w.args.phone ?? ""} onChange={(e) => set({ phone: e.target.value || undefined })} /></Field>
            <Field label="Email (optional)"><Input value={w.args.email ?? ""} onChange={(e) => set({ email: e.target.value || undefined })} /></Field>
          </div>
          <Field label="Notes (optional)"><Textarea value={w.args.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} rows={2} /></Field>
        </>
      );
    case "recordTransaction":
      return (
        <>
          <Field label="Address"><Input value={w.args.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Client"><Input value={w.args.clientName} onChange={(e) => set({ clientName: e.target.value })} /></Field>
            <Field label="Closed"><Input type="date" value={w.args.closeDate} onChange={(e) => set({ closeDate: e.target.value })} /></Field>
          </div>
          <Chips options={SIDES} value={w.args.side} onPick={(side) => set({ side })} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Sale price ($)"><Input inputMode="decimal" defaultValue={w.args.salePrice ?? ""} onChange={(e) => set({ salePrice: num(e.target.value) })} /></Field>
            <Field label="Commission (%)"><Input inputMode="decimal" defaultValue={w.args.commissionPct ?? ""} onChange={(e) => set({ commissionPct: num(e.target.value) })} /></Field>
            <Field label="Or GCI ($)"><Input inputMode="decimal" defaultValue={w.args.gciOverride ?? ""} onChange={(e) => set({ gciOverride: num(e.target.value) })} /></Field>
          </div>
        </>
      );
  }
}

function candidateSub(c: ClientCandidate): string {
  if (c.match === "context") return "this profile";
  if (c.match === "deal") return "on that deal";
  return c.lastContactAt ? `last contact ${shortDayLabel(localISODate(new Date(c.lastContactAt)))}` : "no contact yet";
}

function ClientPicker({ w, all, onSetAll }: { w: ProposedWrite; all: ProposedWrite[]; onSetAll: (ws: ProposedWrite[]) => void }) {
  const choice = w.client;
  const [open, setOpen] = useState(!!choice && !choice.selectedId && !choice.newClientWriteId && !choice.noClient);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ClientCandidate[]>([]);
  if (!choice) return null;
  const newWrite = choice.newClientOffer ? all.find((x) => x.id === choice.newClientOffer && x.tool === "createClient") : null;
  const newName = newWrite?.tool === "createClient" ? newWrite.args.name : null;
  const picked = choice.candidates.find((c) => c.id === choice.selectedId);
  const pickedName = picked?.name ?? (choice.newClientWriteId ? `${newName ?? "New client"} (new)` : choice.noClient ? "No client" : null);

  const choose = (pick: ClientPick) => {
    onSetAll(pickClient(all, w.id, pick));
    setOpen(false);
    setQuery("");
    setFound([]);
  };
  const search = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || query.trim().length < 2) return;
    setFound(rankClientCandidates(query, (await searchClients(supabase, user.id, query)).rows));
  };

  return (
    <div className="space-y-1 rounded-md bg-muted/30 p-2">
      <div className="flex items-center justify-between text-sm">
        <span className={cn("font-medium", !pickedName && "text-amber-600")}>
          {pickedName ?? (choice.spoken ? `Which ${choice.spoken}?` : "Which client?")}
        </span>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen((o) => !o)}>{open ? "Done" : pickedName ? "Change" : "Pick"}</button>
      </div>
      {open && (
        <div className="space-y-1">
          {choice.spoken && choice.candidates.length > 1 && !choice.selectedId && (
            <p className="text-xs text-muted-foreground">&ldquo;{choice.spoken}&rdquo; matches {choice.candidates.length} clients. Most recently contacted first.</p>
          )}
          {choice.truncated && (
            <p className="text-xs text-amber-600">More clients may match than are listed. Search to find the one you mean.</p>
          )}
          {[...choice.candidates, ...found.filter((f) => !choice.candidates.some((c) => c.id === f.id))].map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" checked={c.id === choice.selectedId} onChange={() => choose({ kind: "existing", candidate: c })} />
              <span>{c.name}</span>
              <span className="text-xs text-muted-foreground">{candidateSub(c)}</span>
            </label>
          ))}
          {newName && choice.newClientOffer && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" checked={!!choice.newClientWriteId} onChange={() => choose({ kind: "new", writeId: choice.newClientOffer!, name: newName })} />
              <span>{newName} (new client in this note)</span>
            </label>
          )}
          {choice.optional && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" checked={choice.noClient} onChange={() => choose({ kind: "none" })} />
              <span>No client (a general to-do)</span>
            </label>
          )}
          <div className="flex gap-1">
            <Input placeholder="Search your clients" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} className="h-8 text-sm" />
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void search()}><Search className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DealPicker({ w, all, onSetAll }: { w: ProposedWrite; all: ProposedWrite[]; onSetAll: (ws: ProposedWrite[]) => void }) {
  const choice = w.deal;
  const [open, setOpen] = useState(!!choice && !choice.selectedId);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<DealCandidate[]>([]);
  if (!choice) return null;
  const describe = (d: DealCandidate) => [d.address, d.clientName].filter(Boolean).join(" — ") || "Untitled deal";
  const picked = choice.candidates.find((d) => d.id === choice.selectedId);
  const choose = (d: DealCandidate) => {
    onSetAll(pickDeal(all, w.id, d));
    setOpen(false);
  };
  const search = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || query.trim().length < 2) return;
    setFound(rankDealCandidates(query, (await searchDeals(supabase, user.id)).rows));
  };
  return (
    <div className="space-y-1 rounded-md bg-muted/30 p-2">
      <div className="flex items-center justify-between text-sm">
        <span className={cn("font-medium", !picked && "text-amber-600")}>{picked ? describe(picked) : choice.spoken ? `Which deal for "${choice.spoken}"?` : "Which deal?"}</span>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen((o) => !o)}>{open ? "Done" : picked ? "Change" : "Pick"}</button>
      </div>
      {open && (
        <div className="space-y-1">
          {choice.candidates.length === 0 && found.length === 0 && <p className="text-xs text-muted-foreground">No active deal matched. Search below.</p>}
          {[...choice.candidates, ...found.filter((f) => !choice.candidates.some((c) => c.id === f.id))].map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" checked={d.id === choice.selectedId} onChange={() => choose(d)} />
              <span>{describe(d)}</span>
              <span className="text-xs text-muted-foreground">{cap(d.stage)}</span>
            </label>
          ))}
          <div className="flex gap-1">
            <Input placeholder="Search your deals" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} className="h-8 text-sm" />
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void search()}><Search className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
