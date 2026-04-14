import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

/** CRM tools — Step 7: get_clients, get_client_detail */
export function getCrmTools(_supabase: SupabaseClient, _userId: string): McpTool[] {
  return []; // Implemented in Step 7
}
