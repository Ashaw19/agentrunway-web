import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

/** Outreach tools — Step 9: get_flight_control_priorities */
export function getOutreachTools(_supabase: SupabaseClient, _userId: string): McpTool[] {
  return []; // Implemented in Step 9
}
