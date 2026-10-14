/**
 * Recording a pipeline deal as closed: the one write every deal-close screen
 * makes (the web dashboard's Closing Day prompt, web Transactions → Pipeline →
 * Close, the phone app's Deals → Close deal). Lives in core so the phone runs
 * this same code with its own signed-in client (RLS applies to both).
 *
 *   1. A closed `transactions` row carrying `pipeline_deal_id`.
 *   2. The pipeline row kept at stage='closed', with the original estimate
 *      preserved for forecast accuracy (/pipeline).
 *
 * If step 2 fails, step 1 is undone. The pipeline row is never deleted:
 * deleting it nulls the transaction's link (FK ON DELETE SET NULL), drops the
 * deal from forecast accuracy, and the Closing Day prompt can no longer tell
 * the deal was recorded (dealsAwaitingCloseConfirmation). Until 2026-10-14
 * the prompt deleted the row and wrote an unlinked transaction, so a deal
 * closed from the Transactions tab came back to the prompt and could be
 * recorded twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineDeal, TransactionSide } from "../types/database";

export interface PipelineDealClose {
  userId: string;
  deal: Pick<PipelineDeal, "id" | "address" | "estimated_price" | "original_estimated_price">;
  clientName: string;
  salePrice: number;
  /** Fraction, e.g. 0.025. */
  commissionPct: number;
  side: TransactionSide;
  /** YYYY-MM-DD. */
  date: string;
}

export type PipelineDealCloseResult =
  | { ok: true; transactionId: string }
  /** "transaction": nothing was written. "pipeline": the transaction was undone. */
  | { ok: false; failedAt: "transaction" | "pipeline"; code?: string };

export async function recordPipelineDealClose(
  supabase: SupabaseClient,
  { userId, deal, clientName, salePrice, commissionPct, side, date }: PipelineDealClose,
): Promise<PipelineDealCloseResult> {
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      address: deal.address,
      client_name: clientName,
      sale_price: salePrice,
      commission_pct: commissionPct,
      side,
      status: "closed",
      date,
      source: "manual",
      pipeline_deal_id: deal.id,
    })
    .select("id")
    .single();
  if (txErr || !tx) return { ok: false, failedAt: "transaction", code: txErr?.code };

  const { error: closeErr } = await supabase
    .from("pipeline_deals")
    .update({
      stage: "closed",
      // Preserve the original estimate for accuracy tracking: one write, no TOCTOU.
      original_estimated_price: deal.original_estimated_price ?? deal.estimated_price,
    })
    .eq("id", deal.id)
    .eq("user_id", userId);
  if (closeErr) {
    await supabase.from("transactions").delete().eq("id", tx.id).eq("user_id", userId);
    return { ok: false, failedAt: "pipeline", code: closeErr.code };
  }

  return { ok: true, transactionId: tx.id };
}
