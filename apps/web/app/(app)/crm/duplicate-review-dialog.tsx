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
import { pickSuggestedPrimary, type DuplicateCluster, type MatchReason } from "@/lib/crm/duplicate-detection";

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
  clients: DuplicateReviewClient[];
  /** Perform the merge (parent calls fn_merge_clients + updates local state).
   *  Resolves with an error message on failure, or null on success. */
  onMerge: (primaryId: string, duplicateIds: string[]) => Promise<string | null>;
}

const MATCH_LABELS: Record<MatchReason, string> = {
  name: "Same name",
  email: "Same email",
  phone: "Same phone",
};

function clusterKey(clientIds: string[]): string {
  return [...clientIds].sort().join(",");
}

export function DuplicateReviewDialog({
  open,
  onOpenChange,
  clusters,
  clients,
  onMerge,
}: DuplicateReviewDialogProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selectedPrimary, setSelectedPrimary] = useState<Record<string, string>>({});
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const clientsById = new Map(clients.map((c) => [c.id, c]));
  const visibleClusters = clusters.filter((c) => !dismissed.has(clusterKey(c.clientIds)));

  function primaryFor(cluster: DuplicateCluster): string {
    const key = clusterKey(cluster.clientIds);
    return selectedPrimary[key] ?? pickSuggestedPrimary(clients, cluster.clientIds);
  }

  function selectPrimary(cluster: DuplicateCluster, clientId: string) {
    setSelectedPrimary((prev) => ({ ...prev, [clusterKey(cluster.clientIds)]: clientId }));
  }

  function dismiss(cluster: DuplicateCluster) {
    const key = clusterKey(cluster.clientIds);
    setDismissed((prev) => new Set(prev).add(key));
    setConfirmingKey((prev) => (prev === key ? null : prev));
  }

  async function confirmMerge(cluster: DuplicateCluster) {
    const key = clusterKey(cluster.clientIds);
    const primaryId = primaryFor(cluster);
    const duplicateIds = cluster.clientIds.filter((id) => id !== primaryId);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-500" />
            Possible Duplicate Clients
          </DialogTitle>
          <DialogDescription>
            Grouped by matching name, email, or phone. Review each group, choose which
            record to keep, and merge — their history (deals, notes, activity) moves to
            the record you keep. Merged records are archived, not deleted.
          </DialogDescription>
        </DialogHeader>

        {visibleClusters.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No possible duplicates found in your active client list.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {visibleClusters.map((cluster) => {
              const key = clusterKey(cluster.clientIds);
              const primaryId = primaryFor(cluster);
              const isConfirming = confirmingKey === key;
              const isMerging = mergingKey === key;
              const candidates = cluster.clientIds
                .map((id) => clientsById.get(id))
                .filter((c): c is DuplicateReviewClient => !!c);

              return (
                <div key={key} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {cluster.matchedOn.map((reason) => (
                      <Badge key={reason} variant="secondary" className="text-xs">
                        {MATCH_LABELS[reason]}
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
                        onClick={() => selectPrimary(cluster, c.id)}
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
                        </div>
                      </button>
                    ))}
                  </div>

                  {isConfirming ? (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2">
                      <p className="text-xs text-amber-900">
                        This will move all history from the other {candidates.length - 1 === 1 ? "record" : `${candidates.length - 1} records`} into{" "}
                        <strong>{clientsById.get(primaryId)?.name}</strong> and archive{" "}
                        {candidates.length - 1 === 1 ? "it" : "them"}. This can&apos;t be
                        undone automatically.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmingKey(null)} disabled={isMerging}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => confirmMerge(cluster)} disabled={isMerging}>
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
                      <Button variant="ghost" size="sm" onClick={() => dismiss(cluster)}>
                        <X className="mr-1.5 h-3.5 w-3.5" /> Not Duplicates
                      </Button>
                      <Button size="sm" onClick={() => setConfirmingKey(key)}>
                        <GitMerge className="mr-1.5 h-3.5 w-3.5" /> Merge {candidates.length} Records
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
