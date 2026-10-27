"use client";

/**
 * DuplicateReviewDialog — review clusters of likely-duplicate clients and
 * merge or dismiss each one.
 *
 * WHY THIS EXISTS: the CSV importer's only duplicate check is a silent,
 * automatic name-only match with no review step — a genuine duplicate
 * (different spelling, same email/phone) slips through as two separate
 * client rows, and the user is never given a chance to merge or delete
 * either one. This component is the human-in-the-loop review surface for
 * clusters produced by lib/crm/duplicate-detection.ts.
 *
 * Since 2026-10-27 it also lists near-matches (findPossibleDuplicatePairs):
 * one card with only an email and one with only a phone for the same
 * person, nicknames, an email address carrying the name. "Not the same
 * person" is remembered (client_duplicate_dismissals, 00190) through the
 * parent's onDismiss, so family members don't come back on every visit.
 *
 * This component owns ONLY display + selection state. It never touches
 * Supabase directly — the parent (clients-content.tsx) supplies the
 * detected clusters and an onMerge callback that calls fn_merge_clients
 * (migration 00162) and updates local client state. Keeping data access in
 * the parent keeps this component pure and easy to reason about in
 * isolation.
 *
 * Merging is semi-irreversible (linked history moves to the primary; the
 * duplicate is archived, not deleted, but its history doesn't move back on
 * its own) — every merge requires an explicit inline confirm step, matching
 * the house pattern for destructive actions (see the Delete Client dialog
 * in clients-content.tsx).
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Mail, Phone, Loader2, GitMerge, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  pickSuggestedPrimary,
  type DuplicateCluster,
  type MatchReason,
  type NearMatchReason,
  type PossibleDuplicatePair,
} from "@/lib/crm/duplicate-detection";

export interface DuplicateReviewClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

interface DuplicateReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusters: DuplicateCluster[];
  /** Near-matches, shown under "Might be the same person". */
  possiblePairs: PossibleDuplicatePair[];
  clients: DuplicateReviewClient[];
  /** Perform the merge (parent calls fn_merge_clients + updates local state).
   *  Resolves with an error message on failure, or null on success. */
  onMerge: (primaryId: string, duplicateIds: string[]) => Promise<string | null>;
  /** Remember "Not the same person" for the group. Resolves false on failure. */
  onDismiss: (clientIds: string[]) => Promise<boolean>;
}

const MATCH_LABELS: Record<MatchReason, string> = {
  name: "Same name",
  email: "Same email",
  phone: "Same phone",
};

const NEAR_LABELS: Record<NearMatchReason, string> = {
  contact_split: "One has the email, one the phone",
  same_last_name: "Same last name",
  first_names_match: "First names match",
  email_has_name: "Email has their name",
};

interface ReviewGroup {
  key: string;
  clientIds: string[];
  labels: string[];
}

function addedOn(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime())
    ? ""
    : `Added ${d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
}

function clusterKey(clientIds: string[]): string {
  return [...clientIds].sort().join(",");
}

export function DuplicateReviewDialog({
  open,
  onOpenChange,
  clusters,
  possiblePairs,
  clients,
  onMerge,
  onDismiss,
}: DuplicateReviewDialogProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selectedPrimary, setSelectedPrimary] = useState<Record<string, string>>({});
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const clientsById = new Map(clients.map((c) => [c.id, c]));
  const exactGroups: ReviewGroup[] = clusters
    .map((c) => ({ key: clusterKey(c.clientIds), clientIds: c.clientIds, labels: c.matchedOn.map((r) => MATCH_LABELS[r]) }))
    .filter((g) => !dismissed.has(g.key));
  const nearGroups: ReviewGroup[] = possiblePairs
    .map((p) => ({ key: clusterKey(p.clientIds), clientIds: [...p.clientIds], labels: p.reasons.map((r) => NEAR_LABELS[r]) }))
    .filter((g) => !dismissed.has(g.key));

  function primaryFor(group: ReviewGroup): string {
    return selectedPrimary[group.key] ?? pickSuggestedPrimary(clients, group.clientIds);
  }

  function selectPrimary(group: ReviewGroup, clientId: string) {
    setSelectedPrimary((prev) => ({ ...prev, [group.key]: clientId }));
  }

  async function dismiss(group: ReviewGroup) {
    setDismissed((prev) => new Set(prev).add(group.key));
    setConfirmingKey((prev) => (prev === group.key ? null : prev));
    const saved = await onDismiss(group.clientIds);
    // Not saved: show it again so the answer isn't silently lost.
    if (!saved) {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(group.key);
        return next;
      });
    }
  }

  async function confirmMerge(group: ReviewGroup) {
    const key = group.key;
    const primaryId = primaryFor(group);
    const duplicateIds = group.clientIds.filter((id) => id !== primaryId);
    setMergingKey(key);
    const error = await onMerge(primaryId, duplicateIds);
    setMergingKey(null);
    setConfirmingKey(null);
    if (!error) {
      setDismissed((prev) => new Set(prev).add(key));
    }
    // On error, the parent is responsible for surfacing a toast; the cluster
    // stays visible so the user can retry.
  }

  function renderGroup(group: ReviewGroup) {
    const key = group.key;
    const primaryId = primaryFor(group);
    const isConfirming = confirmingKey === key;
    const isMerging = mergingKey === key;
    const candidates = group.clientIds
      .map((id) => clientsById.get(id))
      .filter((c): c is DuplicateReviewClient => !!c);
    const others = candidates.length - 1;

    return (
      <div key={key} className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {group.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">
              {label}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">
            {candidates.length} records
          </span>
        </div>

        <div className="space-y-1.5">
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={isConfirming || isMerging}
              onClick={() => selectPrimary(group, c.id)}
              className={cn(
                "w-full text-left rounded-md border px-3 py-2 text-sm transition-all",
                c.id === primaryId
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                {c.id === primaryId && (
                  <span className="text-xs text-primary shrink-0">Keep this one</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                {c.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {c.email}
                  </span>
                )}
                {c.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </span>
                )}
                {!c.email && !c.phone && <span>No email or phone</span>}
                <span className="ml-auto">{addedOn(c.created_at)}</span>
              </div>
            </button>
          ))}
        </div>

        {isConfirming ? (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-xs text-amber-900">
              This moves all history from the other {others === 1 ? "record" : `${others} records`} into{" "}
              <strong>{clientsById.get(primaryId)?.name}</strong> and archives{" "}
              {others === 1 ? "it" : "them"}. Where{" "}
              <strong>{clientsById.get(primaryId)?.name}</strong> has none, it also gets{" "}
              {others === 1 ? "its" : "their"} phone or email, a second email or number, birthday,
              address and notes. This can&apos;t be undone automatically.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmingKey(null)} disabled={isMerging}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => confirmMerge(group)} disabled={isMerging}>
                {isMerging ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Merging…
                  </>
                ) : (
                  <>
                    <GitMerge className="mr-1.5 h-3.5 w-3.5" /> Confirm Merge
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => dismiss(group)}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Not the same person
            </Button>
            <Button size="sm" onClick={() => setConfirmingKey(key)}>
              <GitMerge className="mr-1.5 h-3.5 w-3.5" /> Merge {candidates.length} Records
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-500" />
            Possible Duplicate Clients
          </DialogTitle>
          <DialogDescription>
            Choose which record to keep and merge: their history (deals, notes, activity)
            moves to the record you keep, and merged records are archived, not deleted.
            &ldquo;Not the same person&rdquo; is remembered.
          </DialogDescription>
        </DialogHeader>

        {exactGroups.length === 0 && nearGroups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No possible duplicates found in your active client list.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {exactGroups.length > 0 && (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Same name, email or phone
                </h3>
                {exactGroups.map(renderGroup)}
              </>
            )}
            {nearGroups.length > 0 && (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Might be the same person
                </h3>
                {nearGroups.map(renderGroup)}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
