import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

/** Expense + mileage tools — Step 8: get_expenses, get_mileage_summary */
export function getExpenseTools(_supabase: SupabaseClient, _userId: string): McpTool[] {
  return []; // Implemented in Step 8
}
