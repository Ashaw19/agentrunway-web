import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

/** Analytics tools — Step 4: get_dashboard_kpis, get_runway_score, get_forecast, get_tax_estimate */
export function getAnalyticsTools(_supabase: SupabaseClient, _userId: string): McpTool[] {
  return []; // Implemented in Step 4
}
