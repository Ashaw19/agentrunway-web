import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

/** Pipeline tools — Step 6: get_pipeline, get_pipeline_forecast */
export function getPipelineTools(_supabase: SupabaseClient, _userId: string): McpTool[] {
  return []; // Implemented in Step 6
}
