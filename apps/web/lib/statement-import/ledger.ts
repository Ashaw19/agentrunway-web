/**
 * Flight Crew's statement-import writes on the AI write ledger (00182).
 *
 * Confirm and match are RPC functions (fn_confirm_statement_lines,
 * fn_match_statement_line), and the ledger's fetch doesn't see inside an
 * RPC. So when one runs inside a Flight Crew tool call, the rows it can
 * touch are read before and after here and recorded under that call: the
 * lines, the expenses it added, the receipts it linked, a statement copy it
 * removed. They show on AI activity like any other change.
 *
 * Undo isn't offered for them (STATEMENT_UNDO_NOTE): a line's status, its
 * links and the expense it added move together inside the function, and
 * the Imports tab's "Back to review" is the way back. Outside a tool call (the web
 * route) nothing here reads anything.
 *
 * Capture never changes what the confirm or match does: every step is
 * guarded, and a failed read records nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonEqual } from "@agent-runway/core/lib/ai-activity";
import { currentToolWriteContext, recordToolRpcWrites, type RpcWriteEntry } from "@/lib/ai/write-ledger";

type Row = Record<string, unknown>;

export const STATEMENT_UNDO_NOTE =
  "Statement lines are put back on Expenses → Imports, not with Undo: \"Back to review\" sends a line back and removes the expense it added (a matched receipt stays).";

/** Whether this runs inside a Flight Crew tool call (so its writes go on the ledger). */
export function inToolCall(): boolean {
  return currentToolWriteContext() !== undefined;
}

/** Whole rows by id (the caller's RLS), in chunks; null when a read fails. */
export async function rowsById(
  supabase: SupabaseClient,
  userId: string,
  table: "statement_lines" | "receipt_expenses",
  ids: readonly string[],
): Promise<Map<string, Row> | null> {
  const out = new Map<string, Row>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", userId).in("id", unique.slice(i, i + 100));
    if (error) return null;
    for (const r of (data ?? []) as Row[]) out.set(String(r.id), { ...r });
  }
  return out;
}

/** Receipts a line is the statement copy of, or is linked to (by statement_line_id). */
export async function receiptsOfLines(
  supabase: SupabaseClient,
  userId: string,
  lineIds: readonly string[],
): Promise<Map<string, Row> | null> {
  const out = new Map<string, Row>();
  const unique = [...new Set(lineIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await supabase
      .from("receipt_expenses")
      .select("*")
      .eq("user_id", userId)
      .in("statement_line_id", unique.slice(i, i + 100));
    if (error) return null;
    for (const r of (data ?? []) as Row[]) out.set(String(r.id), { ...r });
  }
  return out;
}

/**
 * The ledger entries for one table: rows that changed, appeared or went,
 * comparing the reads before and after the RPC.
 */
export function diffEntries(table: string, before: Map<string, Row>, after: Map<string, Row>): RpcWriteEntry[] {
  const out: RpcWriteEntry[] = [];
  for (const [id, b] of before) {
    const a = after.get(id) ?? null;
    if (!a) out.push({ table, action: "delete", rowId: id, before: b, after: null });
    else if (!jsonEqual(a, b)) out.push({ table, action: "update", rowId: id, before: b, after: a });
  }
  for (const [id, a] of after) {
    if (!before.has(id)) out.push({ table, action: "insert", rowId: id, before: null, after: a });
  }
  return out;
}

/** Record what the RPC did, never failing the caller. */
export function recordStatementWrites(entries: readonly RpcWriteEntry[]): void {
  try {
    recordToolRpcWrites(entries, STATEMENT_UNDO_NOTE);
  } catch {
    // capture only
  }
}
