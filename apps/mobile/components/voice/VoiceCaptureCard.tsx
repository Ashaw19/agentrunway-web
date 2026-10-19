/**
 * VoiceCaptureCard — the confirm card for a voice note.
 *
 * Shows what was heard and each proposed write with every field editable,
 * and a Remove on each. When a name fits several clients (or deals) the card
 * shows a picker and nothing is chosen for the agent. Confirm saves the
 * writes through the Flight Crew tools' writers (lib/voice-capture.ts →
 * core record-writers); Cancel saves nothing. After a save each item says
 * Saved, Waiting to sync or Not saved (with why), and a failed item can be
 * fixed and saved again.
 *
 * A plain View (no Modal), so a client's profile sheet can show it in place;
 * VoiceCaptureSheet wraps it in a sheet for the Clients and Deals lists.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { checkWrite, pickClient, pickDeal, summarizeSave, type SaveResult } from "@agent-runway/core/lib/capture/proposals";
import { shortDayLabel } from "@agent-runway/core/lib/capture/dates";
import { nameScore } from "@agent-runway/core/lib/capture/resolve";
import {
  CAPTURE_DEAL_STAGES,
  type CaptureProposal,
  type ClientCandidate,
  type DealCandidate,
  type ProposedWrite,
} from "@agent-runway/core/lib/capture/types";
import { localISODate } from "@agent-runway/core/lib/local-date";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { EXPENSE_CATEGORY_LABELS, isExpenseCategoryKey } from "@/lib/expense-categories";
import { saveCapture } from "@/lib/voice-capture";
import { useDataStore } from "@/stores/data-store";
import { useToastStore } from "@/stores/toast-store";
import { useColors, Space, Radius, Type } from "@/lib/theme";

type Colors = ReturnType<typeof useColors>;

const TITLES: Record<ProposedWrite["tool"], { title: string; icon: keyof typeof Ionicons.glyphMap }> = {
  logContactActivity: { title: "Activity", icon: "chatbubbles-outline" },
  createContactTask: { title: "Checklist item", icon: "checkbox-outline" },
  updatePipelineDealStage: { title: "Deal stage", icon: "git-branch-outline" },
  updatePipelineDealCloseDate: { title: "Expected close date", icon: "calendar-outline" },
  logMileage: { title: "Trip", icon: "car-outline" },
  logExpense: { title: "Expense", icon: "receipt-outline" },
  createClient: { title: "New client", icon: "person-add-outline" },
  recordTransaction: { title: "Closed deal", icon: "trophy-outline" },
};

const ACTIVITY_TYPES = ["call", "text", "email", "showing", "meeting", "offer", "note"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;
const SIDES = ["buyer", "seller", "both"] as const;
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const patch = (w: ProposedWrite, p: Record<string, unknown>): ProposedWrite => ({ ...w, args: { ...w.args, ...p } }) as ProposedWrite;

interface Props {
  proposal: CaptureProposal;
  onClose: () => void;
}

export function VoiceCaptureCard({ proposal, onClose }: Props) {
  const c = useColors();
  const [writes, setWrites] = useState<ProposedWrite[]>(proposal.writes);
  const [results, setResults] = useState<Record<string, SaveResult>>({});
  const [saving, setSaving] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const done = (id: string) => results[id]?.status === "saved" || results[id]?.status === "queued";
  const pending = writes.filter((w) => w.include && !done(w.id));
  const problems = useMemo(
    () => Object.fromEntries(writes.map((w) => [w.id, checkWrite(w, { isExpenseCategoryKey })])),
    [writes],
  );
  const blocked = pending.filter((w) => problems[w.id].length > 0).length;
  const allDone = Object.keys(results).length > 0 && pending.length === 0;

  const update = (next: ProposedWrite) => setWrites((ws) => ws.map((w) => (w.id === next.id ? next : w)));

  const confirm = async () => {
    if (saving || pending.length === 0 || blocked > 0) return;
    setSaving(true);
    try {
      const out = await saveCapture(pending);
      setResults((r) => ({ ...r, ...Object.fromEntries(out.map((x) => [x.writeId, x])) }));
      const s = summarizeSave(out);
      useToastStore.getState().show(s.text, s.failed > 0 ? "error" : s.queued > 0 ? "info" : "success");
      void Haptics.notificationAsync(s.failed > 0 ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: Space.md, paddingBottom: Space.lg }}>
      {/* What was heard */}
      <Pressable
        onPress={() => setShowTranscript((v) => !v)}
        style={{ padding: Space.md, borderRadius: Radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder }}
      >
        <Text style={[Type.label, { color: c.textDim, marginBottom: 4 }]}>What I heard</Text>
        <Text style={[Type.body, { color: c.textSecondary }]} numberOfLines={showTranscript ? undefined : 3}>
          &ldquo;{proposal.transcriptCleaned || proposal.transcript}&rdquo;
        </Text>
      </Pressable>

      {writes.length === 0 && (
        <Text style={[Type.body, { color: c.textMuted }]}>
          Nothing to save was found in that note. Try naming the client and what happened, like &ldquo;Called Sarah Lee, follow up Friday.&rdquo;
        </Text>
      )}
      {proposal.notes.length > 0 && (
        <View style={{ gap: 4 }}>
          {proposal.notes.map((n, i) => (
            <Text key={i} style={[Type.caption, { color: c.textDim }]}>• {n}</Text>
          ))}
        </View>
      )}

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

      {/* Actions */}
      {allDone ? (
        <Button label="Done" variant="primary" icon="checkmark" onPress={onClose} />
      ) : (
        <View style={{ gap: Space.sm }}>
          {blocked > 0 && (
            <Text style={[Type.caption, { color: c.warning }]}>
              {blocked === 1 ? "1 item needs a pick or a field before it can be saved." : `${blocked} items need a pick or a field before they can be saved.`}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: Space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label={Object.keys(results).length ? "Close" : "Cancel"} variant="ghost" onPress={onClose} disabled={saving} />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                label={pending.length === 0 ? "Nothing to save" : Object.keys(results).length ? `Save the rest (${pending.length})` : `Confirm and save ${pending.length}`}
                variant="primary"
                icon="checkmark"
                loading={saving}
                disabled={saving || pending.length === 0 || blocked > 0}
                onPress={confirm}
              />
            </View>
          </View>
          {Object.keys(results).length === 0 && (
            <Text style={[Type.micro, { color: c.textDim }]}>Nothing is saved until you confirm. The recording was deleted after it was read.</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── One proposed write ───────────────────────────────────────────────────────

interface WriteCardProps {
  w: ProposedWrite;
  all: ProposedWrite[];
  today: string;
  problems: string[];
  result?: SaveResult;
  locked: boolean;
  onChange: (w: ProposedWrite) => void;
  onSetAll: (ws: ProposedWrite[]) => void;
}

function WriteCard({ w, all, today, problems, result, locked, onChange, onSetAll }: WriteCardProps) {
  const c = useColors();
  const meta = TITLES[w.tool];
  const removed = !w.include && !result;
  const tone = result?.status === "saved" ? c.success : result?.status === "queued" ? c.blue : result?.status === "failed" ? c.danger : null;

  if (removed) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: Space.md, borderRadius: Radius.md, borderWidth: 1, borderColor: c.cardBorder, borderStyle: "dashed" }}>
        <Text style={[Type.caption, { color: c.textDim, flex: 1 }]}>{meta.title} removed{w.warnings[0] ? `: ${w.warnings[0]}` : ""}</Text>
        <Pressable onPress={() => onChange({ ...w, include: true })} hitSlop={Space.sm} accessibilityRole="button">
          <Text style={[Type.bodyBold, { color: c.primary }]}>Add back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ padding: Space.md, gap: Space.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: tone ?? c.cardBorder, backgroundColor: c.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm }}>
        <Ionicons name={meta.icon} size={18} color={c.primary} />
        <Text style={[Type.bodyBold, { color: c.text, flex: 1 }]}>{meta.title}</Text>
        {!locked && (
          <Pressable onPress={() => onChange({ ...w, include: false })} hitSlop={Space.sm} accessibilityRole="button" accessibilityLabel={`Remove ${meta.title}`}>
            <Text style={[Type.caption, { color: c.textDim }]}>Remove</Text>
          </Pressable>
        )}
      </View>

      {result && (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Ionicons
            name={result.status === "saved" ? "checkmark-circle" : result.status === "queued" ? "cloud-upload-outline" : "alert-circle"}
            size={16}
            color={tone ?? c.textDim}
          />
          <Text style={[Type.caption, { color: tone ?? c.textDim, flex: 1 }]}>
            {result.status === "saved" ? "Saved" : result.status === "queued" ? "Waiting to sync" : `Not saved: ${result.message}`}
          </Text>
        </View>
      )}

      {w.warnings.map((m, i) => (
        <Text key={i} style={[Type.caption, { color: c.warning }]}>{m}</Text>
      ))}

      <View pointerEvents={locked ? "none" : "auto"} style={{ gap: Space.sm, opacity: locked ? 0.6 : 1 }}>
        <Fields w={w} all={all} today={today} onChange={onChange} onSetAll={onSetAll} />
      </View>

      {!locked && problems.length > 0 && (
        <Text style={[Type.caption, { color: c.danger }]}>{problems.join(" ")}</Text>
      )}
    </View>
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
          {w.args.type === "note" && <Hint>A note is a memo. It doesn&apos;t count as contact.</Hint>}
          <Input label="What happened" value={w.args.description} onChange={(description) => set({ description })} multiline />
          <DateField
            label="Date"
            value={w.args.activityDate ?? today}
            onChange={(d) => set({ activityDate: d === today ? undefined : d })}
          />
        </>
      );
    case "createContactTask":
      return (
        <>
          <ClientPicker w={w} all={all} onSetAll={onSetAll} />
          <Input label="Title" value={w.args.title} onChange={(title) => set({ title })} />
          <DateField label="Due" value={w.args.dueDate} onChange={(dueDate) => set({ dueDate })} pastShortcuts={false} />
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
          <DateField label="Expected close" value={w.args.closeDate} onChange={(closeDate) => set({ closeDate })} pastShortcuts={false} />
        </>
      );
    case "logMileage":
      return (
        <>
          <NumberField label="Kilometres" value={w.args.km || undefined} onChange={(km) => set({ km: km ?? 0 })} />
          <Input label="Purpose" value={w.args.description} onChange={(description) => set({ description })} />
          <Input label="From (optional)" value={w.args.fromLocation ?? ""} onChange={(v) => set({ fromLocation: v || undefined })} />
          <Input label="To (optional)" value={w.args.toLocation ?? ""} onChange={(v) => set({ toLocation: v || undefined })} />
          <DateField label="Date" value={w.args.tripDate} onChange={(tripDate) => set({ tripDate })} />
        </>
      );
    case "logExpense":
      return (
        <>
          <NumberField label="Total paid ($)" value={w.args.amount || undefined} onChange={(amount) => set({ amount: amount ?? 0 })} />
          <Input label="Paid to" value={w.args.vendor} onChange={(vendor) => set({ vendor })} />
          <CategoryPicker value={w.args.categoryKey} onPick={(categoryKey) => set({ categoryKey })} />
          <NumberField
            label="GST/HST ($, only if it's on the receipt)"
            value={w.args.taxAmount}
            onChange={(taxAmount) => set({ taxAmount })}
          />
          <Input label="Note (optional)" value={w.args.notes ?? ""} onChange={(v) => set({ notes: v || undefined })} />
          <DateField label="Date" value={w.args.expenseDate} onChange={(expenseDate) => set({ expenseDate })} />
        </>
      );
    case "createClient":
      return (
        <>
          <Input label="Name" value={w.args.name} onChange={(name) => set({ name })} />
          <Input label="Phone (optional)" value={w.args.phone ?? ""} onChange={(v) => set({ phone: v || undefined })} keyboardType="phone-pad" />
          <Input label="Email (optional)" value={w.args.email ?? ""} onChange={(v) => set({ email: v || undefined })} keyboardType="email-address" />
          <Input label="Notes (optional)" value={w.args.notes ?? ""} onChange={(v) => set({ notes: v || undefined })} multiline />
        </>
      );
    case "recordTransaction":
      return (
        <>
          <Input label="Address" value={w.args.address} onChange={(address) => set({ address })} />
          <Input label="Client" value={w.args.clientName} onChange={(clientName) => set({ clientName })} />
          <Chips options={SIDES} value={w.args.side} onPick={(side) => set({ side })} />
          <DateField label="Closed" value={w.args.closeDate} onChange={(closeDate) => set({ closeDate })} />
          <NumberField label="Sale price ($)" value={w.args.salePrice} onChange={(salePrice) => set({ salePrice })} />
          <NumberField label="Commission (%)" value={w.args.commissionPct} onChange={(commissionPct) => set({ commissionPct })} />
          <NumberField label="Or the exact GCI ($)" value={w.args.gciOverride} onChange={(gciOverride) => set({ gciOverride })} />
        </>
      );
  }
}

// ── Pickers and fields ───────────────────────────────────────────────────────

function Hint({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[Type.caption, { color: c.textDim }]}>{children}</Text>;
}

function Chips<T extends string>({ options, value, onPick }: { options: readonly T[]; value: T; onPick: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onPick(o)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: Space.md, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: on ? c.primary : c.cardBorder, backgroundColor: on ? c.primaryDim : "transparent" }}
          >
            <Text style={[Type.caption, { color: on ? c.primary : c.textMuted }]}>{label(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A number typed as text, so "12." can be typed. Blank = undefined. */
function NumberField({ label: text, value, onChange }: { label: string; value: number | undefined; onChange: (n: number | undefined) => void }) {
  const [raw, setRaw] = useState(value === undefined ? "" : String(value));
  return (
    <Input
      label={text}
      value={raw}
      keyboardType="decimal-pad"
      onChange={(t) => {
        setRaw(t);
        const n = Number(t.replace(/[$,\s]/g, ""));
        onChange(t.trim() === "" || !Number.isFinite(n) ? undefined : n);
      }}
    />
  );
}

function CategoryPicker({ value, onPick }: { value: string; onPick: (key: string) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(!value);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[Type.caption, { color: c.textMuted }]}>Category</Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: Space.md, borderRadius: Radius.md, borderWidth: 1, borderColor: value ? c.cardBorder : c.warning }}
      >
        <Text style={[Type.body, { color: value ? c.text : c.textDim }]}>{value ? EXPENSE_CATEGORY_LABELS[value] ?? value : "Pick a category"}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={c.textDim} />
      </Pressable>
      {open && (
        <View style={{ maxHeight: 220, borderRadius: Radius.md, borderWidth: 1, borderColor: c.cardBorder, overflow: "hidden" }}>
          {/* A plain list: the sheet already scrolls. */}
          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, name]) => (
            <Pressable key={key} onPress={() => { onPick(key); setOpen(false); }} style={{ paddingHorizontal: Space.md, paddingVertical: 10, backgroundColor: key === value ? c.primaryDim : "transparent" }}>
              <Text style={[Type.caption, { color: key === value ? c.primary : c.text }]}>{name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function candidateLine(cand: ClientCandidate): string {
  if (cand.match === "context") return "this profile";
  if (cand.match === "deal") return "on that deal";
  if (cand.lastContactAt) return `last contact ${shortDayLabel(localISODate(new Date(cand.lastContactAt)))}`;
  return "no contact yet";
}

function PickRow({ title, sub, selected, onPress, c }: { title: string; sub?: string; selected?: boolean; onPress: () => void; c: Colors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, paddingVertical: 8, paddingHorizontal: Space.sm, borderRadius: Radius.md, backgroundColor: selected ? c.primaryDim : "transparent" }}
    >
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={18} color={selected ? c.primary : c.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={[Type.body, { color: c.text }]}>{title}</Text>
        {sub ? <Text style={[Type.micro, { color: c.textDim }]}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function ClientPicker({ w, all, onSetAll }: { w: ProposedWrite; all: ProposedWrite[]; onSetAll: (ws: ProposedWrite[]) => void }) {
  const c = useColors();
  const clients = useDataStore((s) => s.clients);
  const choice = w.client;
  const [open, setOpen] = useState(!!choice && !choice.selectedId && !choice.newClientWriteId && !choice.noClient);
  const [query, setQuery] = useState("");
  if (!choice) return null;

  const newWrite = choice.newClientOffer ? all.find((x) => x.id === choice.newClientOffer && x.tool === "createClient") : null;
  const newName = newWrite?.tool === "createClient" ? newWrite.args.name : null;
  const picked = choice.candidates.find((x) => x.id === choice.selectedId);
  const pickedName = picked?.name ?? (choice.newClientWriteId ? `${newName ?? "New client"} (new)` : choice.noClient ? "No client" : null);

  const searchResults = query.trim().length >= 2
    ? clients
        .filter((cl) => !cl.archived_at && nameScore(query, cl.name) > 0)
        .slice(0, 6)
        .map((cl): ClientCandidate => ({ id: cl.id, name: cl.name, status: cl.status, lastContactAt: cl.last_contact_at, match: "partial" }))
    : [];

  const choose = (pick: Parameters<typeof pickClient>[2]) => {
    onSetAll(pickClient(all, w.id, pick));
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={{ gap: 4 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", gap: Space.sm }}>
        <Ionicons name="person-circle-outline" size={18} color={pickedName ? c.primary : c.warning} />
        <Text style={[Type.bodyBold, { color: pickedName ? c.text : c.warning, flex: 1 }]}>
          {pickedName ?? (choice.spoken ? `Which ${choice.spoken}?` : "Which client?")}
        </Text>
        <Text style={[Type.caption, { color: c.primary }]}>{open ? "Done" : pickedName ? "Change" : "Pick"}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: 2, paddingLeft: Space.xs }}>
          {choice.spoken && choice.candidates.length > 1 && !choice.selectedId && (
            <Hint>&ldquo;{choice.spoken}&rdquo; matches {choice.candidates.length} clients. Most recently contacted first.</Hint>
          )}
          {choice.spoken && choice.candidates.length === 0 && !newName && (
            <Hint>No client named &ldquo;{choice.spoken}&rdquo;. Search below.</Hint>
          )}
          {choice.candidates.map((cand) => (
            <PickRow key={cand.id} c={c} title={cand.name} sub={candidateLine(cand)} selected={cand.id === choice.selectedId} onPress={() => choose({ kind: "existing", candidate: cand })} />
          ))}
          {newName && choice.newClientOffer && (
            <PickRow c={c} title={`${newName} (new client in this note)`} selected={!!choice.newClientWriteId} onPress={() => choose({ kind: "new", writeId: choice.newClientOffer!, name: newName })} />
          )}
          {choice.optional && (
            <PickRow c={c} title="No client (a general to-do)" selected={choice.noClient} onPress={() => choose({ kind: "none" })} />
          )}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your clients"
            placeholderTextColor={c.textDim}
            autoCorrect={false}
            style={[Type.body, { color: c.text, padding: Space.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: c.cardBorder, marginTop: 4 }]}
          />
          {searchResults.map((cand) => (
            <PickRow key={`s-${cand.id}`} c={c} title={cand.name} sub={candidateLine(cand)} onPress={() => choose({ kind: "existing", candidate: cand })} />
          ))}
        </View>
      )}
    </View>
  );
}

function DealPicker({ w, all, onSetAll }: { w: ProposedWrite; all: ProposedWrite[]; onSetAll: (ws: ProposedWrite[]) => void }) {
  const c = useColors();
  const pipeline = useDataStore((s) => s.pipeline);
  const choice = w.deal;
  const [open, setOpen] = useState(!!choice && !choice.selectedId);
  const [query, setQuery] = useState("");
  if (!choice) return null;
  const picked = choice.candidates.find((d) => d.id === choice.selectedId);
  const describe = (d: DealCandidate) => [d.address, d.clientName].filter(Boolean).join(" — ") || "Untitled deal";

  const q = query.trim().toLowerCase();
  const searchResults: DealCandidate[] = q.length >= 2
    ? pipeline
        .filter((d) => d.stage !== "closed" && `${d.address ?? ""} ${d.client_name ?? ""}`.toLowerCase().includes(q))
        .slice(0, 6)
        .map((d) => ({ id: d.id, address: d.address ?? "", clientName: d.client_name ?? "", clientId: d.client_id, stage: d.stage, expectedCloseDate: d.expected_close_date, match: "partial" }))
    : [];

  const choose = (d: DealCandidate) => {
    onSetAll(pickDeal(all, w.id, d));
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={{ gap: 4 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", gap: Space.sm }}>
        <Ionicons name="home-outline" size={18} color={picked ? c.primary : c.warning} />
        <Text style={[Type.bodyBold, { color: picked ? c.text : c.warning, flex: 1 }]}>
          {picked ? describe(picked) : choice.spoken ? `Which deal for "${choice.spoken}"?` : "Which deal?"}
        </Text>
        <Text style={[Type.caption, { color: c.primary }]}>{open ? "Done" : picked ? "Change" : "Pick"}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: 2, paddingLeft: Space.xs }}>
          {choice.candidates.length === 0 && <Hint>No active deal matched. Search below.</Hint>}
          {choice.candidates.map((d) => (
            <PickRow key={d.id} c={c} title={describe(d)} sub={`${label(d.stage)}${d.expectedCloseDate ? ` · closing ${shortDayLabel(d.expectedCloseDate)}` : ""}`} selected={d.id === choice.selectedId} onPress={() => choose(d)} />
          ))}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your deals"
            placeholderTextColor={c.textDim}
            autoCorrect={false}
            style={[Type.body, { color: c.text, padding: Space.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: c.cardBorder, marginTop: 4 }]}
          />
          {searchResults.map((d) => (
            <PickRow key={`s-${d.id}`} c={c} title={describe(d)} sub={label(d.stage)} onPress={() => choose(d)} />
          ))}
        </View>
      )}
    </View>
  );
}
