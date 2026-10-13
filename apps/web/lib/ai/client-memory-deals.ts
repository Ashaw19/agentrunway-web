/**
 * lib/ai/client-memory-deals.ts
 *
 * How a client's Deal History (client_records) reaches the memory prompt.
 * No server imports, so the engine, the backfill script and the CRM client
 * panel share one definition of: which columns are read, which deals closed,
 * and which Deal History edits outdate a stored profile.
 *
 * A collapsed deal never closed (see excludeCollapsedDeals in core). It is
 * listed apart as fell through, without its GCI, so the profile can speak to
 * what the client went through without recording a purchase that never
 * happened.
 */

import { excludeCollapsedDeals } from "@agent-runway/core/types/database";

/**
 * The select for the memory fetch: the client_records columns the prompt
 * reads. It carries condition_status: without it the closed / fell-through
 * split below is a no-op.
 */
export const MEMORY_DEAL_COLUMNS = "side, source, address, close_date, gci, condition_status";

const MEMORY_DEAL_FIELDS = MEMORY_DEAL_COLUMNS.split(", ");

export interface MemoryDeal {
  side: string | null;
  source: string | null;
  address: string | null;
  close_date: string | null;
  gci: number | null;
  condition_status: string | null;
}

/**
 * True when editing this Deal History field changes what the memory prompt
 * says (marking a deal Collapsed, say), so the stored profile is outdated.
 */
export function dealFieldFeedsMemory(field: string): boolean {
  return MEMORY_DEAL_FIELDS.includes(field);
}

/** The memory prompt's deal sections: closed deals, then deals that fell through. */
export function dealHistoryPrompt(deals: readonly MemoryDeal[]): string {
  const closed = excludeCollapsedDeals(deals);
  const closedSet = new Set(closed);
  const fellThrough = deals.filter((d) => !closedSet.has(d));

  let prompt = "";

  if (closed.length > 0) {
    prompt += `\n## Transaction History (${closed.length} closed deal${closed.length === 1 ? "" : "s"})\n`;
    for (const tx of closed) {
      const parts = [tx.close_date ?? "date unknown"];
      if (tx.side) parts.push(tx.side);
      if (tx.address) parts.push(tx.address);
      if (tx.gci) parts.push(`GCI $${Number(tx.gci).toLocaleString()}`);
      if (tx.source) parts.push(`source: ${tx.source}`);
      prompt += `- [${parts.join(" — ")}]\n`;
    }
  }

  if (fellThrough.length > 0) {
    prompt += `\n## Deals That Fell Through (${fellThrough.length}, never closed)\n`;
    prompt += `These deals collapsed before closing. The client did not buy or sell the property and no commission was earned. Do not describe them as a past purchase or sale. The date is when the deal was due to close, not a close_date. They are still context for what the client has been through.\n`;
    for (const tx of fellThrough) {
      const parts = [tx.close_date ? `was due to close ${tx.close_date}` : "date unknown"];
      if (tx.side) parts.push(tx.side);
      if (tx.address) parts.push(tx.address);
      if (tx.source) parts.push(`source: ${tx.source}`);
      prompt += `- [${parts.join(" — ")}]\n`;
    }
  }

  return prompt;
}
