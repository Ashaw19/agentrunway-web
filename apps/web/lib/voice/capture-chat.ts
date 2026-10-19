/**
 * A capture proposal as Flight Crew's captureNote tool returns it to the
 * model: each proposed write with the exact arguments for its write tool,
 * or what the agent still has to pick. The model then calls each write tool,
 * and each one shows the agent the usual approval card (needsApproval), so
 * nothing is saved without a Confirm. Pure, so it is tested on its own
 * (lib/voice/__tests__/capture-chat.test.ts).
 */

import { checkWrite } from "@agent-runway/core/lib/capture/proposals";
import { CAPTURE_TOOL_CREW, type CaptureProposal, type ProposedWrite } from "@agent-runway/core/lib/capture/types";
import { isReceiptCategoryKey } from "@/lib/types/receipt";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";

const CREW_NAME = { dispatcher: "Dispatcher", navigator: "Navigator" } as const;

function candidatesLine(w: ProposedWrite): string | null {
  if (w.client && !w.client.selectedId && !w.client.newClientWriteId && w.client.candidates.length > 0) {
    const list = w.client.candidates
      // The Atlantic day: cutting the timestamp at "T" is the UTC day (the next one from 8 pm).
      .map((c) => `${c.name} (clientId ${c.id}${c.lastContactAt ? `, last contact ${atlanticISODate(new Date(c.lastContactAt))}` : ""})`)
      .join("; ");
    return `"${w.client.spoken ?? "the client"}" could be: ${list}. Ask the agent which one. Never pick the first.`;
  }
  if (w.deal && !w.deal.selectedId && w.deal.candidates.length > 0) {
    const list = w.deal.candidates.map((d) => `${[d.address, d.clientName].filter(Boolean).join(" — ")} (dealId ${d.id}, ${d.stage})`).join("; ");
    return `"${w.deal.spoken ?? "the deal"}" could be: ${list}. Ask the agent which one.`;
  }
  return null;
}

/** The tool result text: a summary line, then one block per proposed write. */
export function formatCaptureForChat(p: CaptureProposal): string {
  const lines: string[] = [];
  lines.push(`Proposed from the note. NOTHING IS SAVED YET. Today is ${p.today} (Atlantic).`);
  if (p.writes.length === 0) {
    lines.push("No client activity, task, deal change, trip, expense or new client was found in the note.");
  }

  p.writes.forEach((w, i) => {
    const crew = CREW_NAME[CAPTURE_TOOL_CREW[w.tool]];
    const newClient = w.client?.newClientWriteId
      ? p.writes.find((x) => x.id === w.client?.newClientWriteId)
      : null;
    const head = `${i + 1}. ${w.tool} (${crew})`;
    if (!w.include) {
      lines.push(`${head}: proposed OFF. ${w.warnings.join(" ")} Only call it if the agent asks for it.`);
      lines.push(`   args: ${JSON.stringify(w.args)}`);
      return;
    }
    const pick = candidatesLine(w);
    const problems = checkWrite(w, { isExpenseCategoryKey: isReceiptCategoryKey });
    if (pick) {
      lines.push(`${head}: NEEDS A PICK. ${pick} Then call ${w.tool} with these args and their clientId/clientName (or dealId/dealDescription).`);
    } else if (newClient) {
      lines.push(`${head}: about the NEW client in item ${p.writes.indexOf(newClient) + 1}. Call createClient first, then call ${w.tool} with the clientId it returns.`);
    } else if (problems.length > 0) {
      lines.push(`${head}: NEEDS INFO. ${problems.join(" ")} Ask the agent, then call ${w.tool}.`);
    } else {
      lines.push(`${head}: ready.`);
    }
    if (w.warnings.length > 0) lines.push(`   check: ${w.warnings.join(" ")}`);
    lines.push(`   args: ${JSON.stringify(w.args)}`);
  });

  if (p.notes.length > 0) lines.push(`Not proposed: ${p.notes.join(" ")}`);
  lines.push(
    "Next: show the agent this list in plain words, then call each write tool in your lane with exactly these args (each one shows the agent an approval card, so call it rather than asking first). " +
    "Dispatcher writes clients, activities, Checklist items and deals; Navigator writes trips, expenses and closed deals. " +
    "For writes in the other persona's lane, finish yours and hand off in one sentence; that persona calls captureNote on the same note and saves only its own. " +
    "Never invent a clientId or dealId.",
  );
  return lines.join("\n");
}
