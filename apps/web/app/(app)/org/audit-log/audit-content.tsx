"use client";

import { useState } from "react";
import { Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuditLog } from "@/lib/actions/org-actions";
import type { SecurityAuditEntry } from "@/lib/types/organizations";
import { AUDIT_ACTION_LABELS } from "@/lib/types/organizations";

interface Props {
  orgId: string;
  initialEntries: SecurityAuditEntry[];
  totalCount: number;
}

const PAGE_SIZE = 50;

export function AuditContent({ orgId, initialEntries, totalCount }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  async function loadPage(newPage: number) {
    setLoading(true);
    const { data, error } = await getAuditLog(orgId, newPage, PAGE_SIZE);
    if (!error && data) {
      setEntries(data.entries);
      setPage(newPage);
    }
    setLoading(false);
  }

  const actionColor = (action: string) => {
    if (action.includes("removed") || action.includes("departed") || action.includes("revoked"))
      return "text-rose-500 bg-rose-500/10";
    if (action.includes("invited") || action.includes("joined") || action.includes("granted"))
      return "text-emerald-500 bg-emerald-500/10";
    if (action.includes("changed"))
      return "text-amber-500 bg-amber-500/10";
    return "text-blue-500 bg-blue-500/10";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {totalCount} events
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Immutable record of all organization actions. Cannot be edited or
          deleted.
        </p>
      </div>

      {/* Log Table */}
      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Timestamp</th>
                <th className="px-5 py-3 text-left font-medium">Action</th>
                <th className="px-5 py-3 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-8 text-center text-muted-foreground"
                  >
                    No audit events yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${actionColor(entry.action)}`}
                      >
                        {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {entry.metadata && Object.keys(entry.metadata).length > 0
                        ? Object.entries(entry.metadata)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => loadPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1 || loading}
                onClick={() => loadPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed">
        This log is append-only and cannot be modified or deleted. All member
        actions, consent changes, and data access events are recorded
        automatically.
      </p>
    </div>
  );
}
