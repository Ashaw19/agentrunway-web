import type { McpServer } from "npm:@modelcontextprotocol/sdk@1/server/mcp.js";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { registerAnalyticsTools } from "./analytics.ts";
import { registerTransactionTools } from "./transactions.ts";
import { registerPipelineTools } from "./pipeline.ts";
import { registerCrmTools } from "./crm.ts";
import { registerExpenseTools } from "./expenses.ts";
import { registerOutreachTools } from "./outreach.ts";
import { registerSettingsTools } from "./settings.ts";

export function registerAllTools(
  server: McpServer,
  supabase: SupabaseClient,
  userId: string,
): void {
  registerAnalyticsTools(server, supabase, userId);   // Step 4
  registerTransactionTools(server, supabase, userId); // Step 5
  registerPipelineTools(server, supabase, userId);    // Step 6
  registerCrmTools(server, supabase, userId);         // Step 7
  registerExpenseTools(server, supabase, userId);     // Step 8
  registerOutreachTools(server, supabase, userId);    // Step 9
  registerSettingsTools(server, supabase, userId);    // Step 9
}
