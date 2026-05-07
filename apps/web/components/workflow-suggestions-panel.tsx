"use client";

/**
 * WorkflowSuggestionsPanel
 *
 * Phase 2.3 of the HML gap-closure plan: surfaces the Flight Status
 * workflow library inline on the CRM client detail panel.
 *
 * For the client's current Flight Status (Boarding / Scheduled / In-Flight
 * / Cruising), we show the matching system templates. The agent clicks
 * "Draft" to generate a personalized email via /api/workflow/generate-draft;
 * the result is rendered inline with copy-to-clipboard, "Mark as sent",
 * and "Dismiss" controls. No auto-send. No email integration. Drafts are
 * text the agent copies into their own email client.
 *
 * Trigger-event mapping (spec, Phase 2.3):
 *   new_lead              → Boarding
 *   showing_scheduled     → Scheduled
 *   listing_active        → In-Flight (seller flow)
 *   transaction_milestone → In-Flight (buyer flow — accepted offer)
 *   anniversary           → any client with at least one closed record
 *                           (offered everywhere, since the agent can decide
 *                           if it's the right moment — typically Cruising)
 *   closing_day           → Cruising
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Copy, Check, X, MailCheck } from "lucide-react";
import { toast } from "sonner";
import type {
  ClientStatus,
  WorkflowTemplate,
  WorkflowTriggerEvent,
} from "@agent-runway/core/types/database";

interface Props {
  clientId: string;
  clientName: string;
  flightStatus: ClientStatus;
  /** True when this client has at least one closed client_record. Drives the
   *  anniversary template's eligibility. */
  hasClosedRecord: boolean;
}

/**
 * For a given Flight Status (and closed-record flag), which trigger events
 * should the panel offer? Stage-only templates are gated to the matching
 * stage; anniversary is offered for any client with a closed record (the
 * agent reads the moment).
 */
function triggerEventsForStatus(
  status: ClientStatus,
  hasClosedRecord: boolean,
): WorkflowTriggerEvent[] {
  const events: WorkflowTriggerEvent[] = [];
  switch (status) {
    case "boarding":
      events.push("new_lead");
      break;
    case "scheduled":
      events.push("showing_scheduled");
      break;
    case "in_flight":
      events.push("listing_active", "transaction_milestone");
      break;
    case "cruising":
      events.push("closing_day");
      break;
  }
  if (hasClosedRecord) events.push("anniversary");
  return events;
}

interface DraftState {
  templateId: string;
  loading: boolean;
  draft: { id: string; subject: string; body: string } | null;
  copied: boolean;
}

export function WorkflowSuggestionsPanel({
  clientId,
  clientName,
  flightStatus,
  hasClosedRecord,
}: Props) {
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const supabase = useMemo(() => createClient(), []);
  const events = useMemo(
    () => triggerEventsForStatus(flightStatus, hasClosedRecord),
    [flightStatus, hasClosedRecord],
  );

  // Load templates matching this client's stage
  useEffect(() => {
    let cancelled = false;
    if (events.length === 0) {
      setTemplates([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select("*")
        .in("trigger_event", events)
        .eq("is_active", true)
        .order("name");
      if (cancelled) return;
      if (error) {
        console.error("[WorkflowSuggestionsPanel] load templates error:", error);
        setTemplates([]);
        return;
      }
      setTemplates((data ?? []) as WorkflowTemplate[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, events]);

  if (templates === null) {
    return (
      <div className="rounded-2xl border border-blue-200/60 bg-blue-50/30 dark:bg-blue-950/10 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading Flight Plan templates…
        </div>
      </div>
    );
  }

  if (templates.length === 0) {
    // No templates for this stage — render nothing so the panel doesn't take
    // visual weight when there's nothing to do.
    return null;
  }

  const handleDraft = async (template: WorkflowTemplate) => {
    setDrafts((prev) => ({
      ...prev,
      [template.id]: {
        templateId: template.id,
        loading: true,
        draft: prev[template.id]?.draft ?? null,
        copied: false,
      },
    }));

    try {
      const res = await fetch("/api/workflow/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, template_id: template.id }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "Couldn't generate draft. Try again in a moment.");
        setDrafts((prev) => ({
          ...prev,
          [template.id]: { templateId: template.id, loading: false, draft: null, copied: false },
        }));
        return;
      }

      const data = (await res.json()) as {
        draft_id: string;
        subject: string;
        body: string;
      };
      setDrafts((prev) => ({
        ...prev,
        [template.id]: {
          templateId: template.id,
          loading: false,
          draft: { id: data.draft_id, subject: data.subject, body: data.body },
          copied: false,
        },
      }));
      toast.success(`Draft ready for ${clientName}`);
    } catch (err) {
      console.error("[WorkflowSuggestionsPanel] draft error:", err);
      toast.error("Couldn't generate draft. Try again in a moment.");
      setDrafts((prev) => ({
        ...prev,
        [template.id]: { templateId: template.id, loading: false, draft: null, copied: false },
      }));
    }
  };

  const handleCopy = async (templateId: string) => {
    const state = drafts[templateId];
    if (!state?.draft) return;
    const text = `Subject: ${state.draft.subject}\n\n${state.draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setDrafts((prev) => ({
        ...prev,
        [templateId]: { ...prev[templateId], copied: true },
      }));
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select the text manually");
    }
  };

  const handleStatusUpdate = async (
    templateId: string,
    draftId: string,
    status: "sent" | "dismissed",
  ) => {
    try {
      const res = await fetch(`/api/workflow/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error("Couldn't update draft status");
        return;
      }
      toast.success(status === "sent" ? "Marked as sent" : "Dismissed");
      // Clear the draft from the panel so it stops showing
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[templateId];
        return next;
      });
    } catch (err) {
      console.error("[WorkflowSuggestionsPanel] status update error:", err);
      toast.error("Couldn't update draft status");
    }
  };

  return (
    <div className="rounded-2xl border border-blue-200/60 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-2">
        <div className="h-5 w-5 rounded-md bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        </div>
        Flight Plan Templates
        <span className="ml-auto text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
          {templates.length} available · drafts only, never auto-sent
        </span>
      </h3>

      <div className="space-y-2">
        {templates.map((tmpl) => {
          const state = drafts[tmpl.id];
          return (
            <div
              key={tmpl.id}
              className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-card p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">{tmpl.name}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1.5"
                  disabled={state?.loading}
                  onClick={() => handleDraft(tmpl)}
                >
                  {state?.loading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {state?.draft ? "Re-draft" : "Draft"}
                </Button>
              </div>

              {state?.draft && (
                <div className="space-y-2 pt-1">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Subject
                  </div>
                  <div className="text-xs font-medium bg-muted/40 rounded-md px-2 py-1.5 break-words">
                    {state.draft.subject}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Body
                  </div>
                  <div className="text-xs whitespace-pre-wrap bg-muted/40 rounded-md px-2 py-1.5 break-words max-h-72 overflow-y-auto">
                    {state.draft.body}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-[11px] gap-1.5"
                      onClick={() => handleCopy(tmpl.id)}
                    >
                      {state.copied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {state.copied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1.5"
                      onClick={() => handleStatusUpdate(tmpl.id, state.draft!.id, "sent")}
                    >
                      <MailCheck className="h-3 w-3" />
                      Mark as sent
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] gap-1.5 text-muted-foreground"
                      onClick={() =>
                        handleStatusUpdate(tmpl.id, state.draft!.id, "dismissed")
                      }
                    >
                      <X className="h-3 w-3" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
