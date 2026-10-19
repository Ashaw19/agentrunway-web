/**
 * A Flight Plan's email or text step, checked against CASL consent before
 * it becomes a message (consent ledger, 00183). An email step queues a draft
 * in Flight Control and a text step adds a "send text" reminder; when the
 * client's consent doesn't cover that channel on the step's day
 * (unsubscribed, implied consent lapsed with no express consent on record),
 * the step becomes a Checklist call instead, with the reason, so it isn't
 * lost and nothing goes out without consent. Unreadable consent fails
 * closed the same way.
 *
 * Status: consentStatus() in packages/core. Pure, so the CRM's Flight Plan
 * runner (crm/clients-content.tsx) and the tests share it.
 */

import { consentRefusalReason, consentStatus } from "@agent-runway/core/engines/casl-consent-engine";
import type { ConsentInputs } from "@agent-runway/core/lib/consent-ledger";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";

export type FlightPlanStepOutcome =
  | { kind: "message" }
  | { kind: "call_task"; title: string; notes: string };

export function flightPlanMessageStep(input: {
  action:     "email" | "text";
  inputs:     ConsentInputs | null;
  clientName: string;
  planName:   string;
  /** YYYY-MM-DD the step is due: the day the message would go out. */
  dueDate:    string;
  today?:     string;
}): FlightPlanStepOutcome {
  const today = input.today ?? atlanticISODate();
  const title = `Call ${input.clientName} (Flight Plan: ${input.planName})`;
  if (!input.inputs) {
    return {
      kind: "call_task",
      title,
      notes: `Agent Runway couldn't read ${input.clientName}'s consent, so this ${input.action} step became a call.`,
    };
  }
  const day = input.dueDate > today ? input.dueDate : today;
  const status = consentStatus({ ...input.inputs, today: day });
  const ch = input.action === "email" ? status.email : status.sms;
  if (ch.canMessage) return { kind: "message" };
  return { kind: "call_task", title, notes: `${consentRefusalReason(ch, input.clientName)} (Flight Plan ${input.action} step.)` };
}
