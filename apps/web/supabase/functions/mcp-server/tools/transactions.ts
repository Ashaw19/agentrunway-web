import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

/** Transaction tools — Step 5: get_transactions, get_transaction_summary */
export function getTransactionTools(_supabase: SupabaseClient, _userId: string): McpTool[] {
  return []; // Implemented in Step 5
}
