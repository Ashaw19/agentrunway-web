/**
 * A proposed write as the older pre-filled forms take it (VoiceDraft), for
 * the web card's "Open in the full form" on a note that is one new client,
 * one expense or one closed deal. The Add Client, Quick Add Expense and New
 * Transaction dialogs read it from VoiceDraftProvider and show it tinted for
 * review, as they did before the confirm card.
 */

import type { ProposedWrite } from "@agent-runway/core/lib/capture/types";
import type { VoiceDraft } from "./types";

export function legacyDraftFor(w: ProposedWrite, transcriptCleaned: string): VoiceDraft | null {
  const base = { confidence: "medium" as const, transcript_cleaned: transcriptCleaned, missingFields: [], needsReview: true };
  switch (w.tool) {
    case "createClient":
      return {
        ...base,
        intent: "new_client",
        client: {
          fullName: w.args.name || null,
          email: w.args.email ?? null,
          phone: w.args.phone ?? null,
          street1: null,
          street2: null,
          city: w.args.city ?? null,
          province: null,
          country: "Canada",
          postalCode: null,
          source: null,
          tags: w.args.side === "buyer" ? ["Buyer"] : w.args.side === "seller" ? ["Seller"] : [],
          notes: w.args.notes ?? null,
        },
      };
    case "logExpense":
      return {
        ...base,
        intent: "new_expense",
        expense: {
          category_key: w.args.categoryKey || null,
          amount: w.args.amount || null,
          vendor: w.args.vendor || null,
          description: w.args.notes ?? null,
          date: w.args.expenseDate,
        },
      };
    case "recordTransaction":
      return {
        ...base,
        intent: "new_transaction",
        transaction: {
          date: w.args.closeDate,
          address: w.args.address || null,
          client_name: w.args.clientName || null,
          side: w.args.side,
          status: "closed",
          sale_price: w.args.salePrice ?? null,
          // The form takes a fraction (0.025); the tool a percentage (2.5).
          commission_pct: w.args.commissionPct !== undefined ? w.args.commissionPct / 100 : null,
          gci: w.args.gciOverride ?? null,
          notes: w.args.notes ?? null,
        },
      };
    default:
      return null;
  }
}
