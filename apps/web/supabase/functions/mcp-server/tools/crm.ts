import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

export function getCrmTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_clients ──────────────────────────────────────────────────────
    {
      name: "get_clients",
      description:
        "Returns the agent's CRM client list. Filter by flight status (boarding/scheduled/in_flight/cruising) or search by name. Returns name, status, contact info, and property interest.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["boarding", "scheduled", "in_flight", "cruising"],
            description: "Filter by client flight status. Omit for all.",
          },
          search: { type: "string", description: "Search clients by name (partial match)." },
          limit: { type: "number", description: "Maximum records to return (default 50, max 200)." },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "CRM Clients",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { status, search, limit = 50 } = args as { status?: string; search?: string; limit?: number };
        const cap = Math.min(limit, 200);

        let query = supabase
          .from("clients")
          .select("id, name, status, email, phone, city, province_region, property_interest, property_interest_type, timeframe, preferred_contact, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(cap);

        if (status) query = query.eq("status", status);
        if (search) query = query.ilike("name_search", `%${search.toLowerCase()}%`);

        const { data, error } = await query;
        if (error) throw error;

        const clients = (data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          email: c.email,
          phone: c.phone,
          city: c.city,
          province: c.province_region,
          property_interest: c.property_interest,
          property_interest_type: c.property_interest_type,
          timeframe: c.timeframe,
          preferred_contact: c.preferred_contact,
          last_updated: c.updated_at?.split("T")[0],
        }));

        // Status breakdown
        const byStatus: Record<string, number> = {};
        for (const c of clients) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              count: clients.length,
              filters: { status: status ?? "all", search: search ?? null, limit: cap },
              by_status: byStatus,
              clients,
            }, null, 2),
          }],
        };
      },
    },

    // ── get_client_detail ────────────────────────────────────────────────
    {
      name: "get_client_detail",
      description:
        "Returns detailed information for a specific client including contact info, property interest, recent activities, and linked pipeline deals.",
      inputSchema: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "The client UUID (from get_clients)." },
          client_name: { type: "string", description: "Search by client name if ID is unknown." },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Client Detail",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { client_id, client_name } = args as { client_id?: string; client_name?: string };

        if (!client_id && !client_name) {
          throw new Error("Provide either client_id or client_name.");
        }

        // Resolve client
        let clientData: Record<string, unknown> | null = null;
        if (client_id) {
          const { data } = await supabase
            .from("clients")
            .select("*")
            .eq("user_id", userId)
            .eq("id", client_id)
            .maybeSingle();
          clientData = data;
        } else {
          const { data } = await supabase
            .from("clients")
            .select("*")
            .eq("user_id", userId)
            .ilike("name_search", `%${client_name!.toLowerCase()}%`)
            .limit(1)
            .maybeSingle();
          clientData = data;
        }

        if (!clientData) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ found: false, message: "No client found matching the provided identifier." }, null, 2),
            }],
          };
        }

        const cid = clientData.id as string;

        // Fetch activities + pipeline in parallel
        const [activitiesRes, pipelineRes] = await Promise.all([
          supabase
            .from("crm_activities")
            .select("type, note, created_at")
            .eq("client_id", cid)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("pipeline_deals")
            .select("address, stage, estimated_price, estimated_commission_pct, expected_close_date")
            .eq("client_id", cid)
            .eq("user_id", userId)
            .neq("stage", "closed"),
        ]);

        const activities = (activitiesRes.data ?? []).map((a) => ({
          type: a.type,
          note: a.note,
          date: (a.created_at as string)?.split("T")[0],
        }));

        const pipelineDeals = (pipelineRes.data ?? []).map((d) => ({
          address: d.address,
          stage: d.stage,
          estimated_gci: Math.round((d.estimated_price ?? 0) * (d.estimated_commission_pct ?? 0.025)),
          expected_close_date: d.expected_close_date,
        }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id: clientData.id,
              name: clientData.name,
              status: clientData.status,
              email: clientData.email,
              phone: clientData.phone,
              city: clientData.city,
              province: clientData.province_region,
              property_interest: clientData.property_interest,
              property_interest_type: clientData.property_interest_type,
              timeframe: clientData.timeframe,
              preferred_contact: clientData.preferred_contact,
              created_at: (clientData.created_at as string)?.split("T")[0],
              last_updated: (clientData.updated_at as string)?.split("T")[0],
              recent_activities: activities,
              active_pipeline_deals: pipelineDeals,
            }, null, 2),
          }],
        };
      },
    },
  ];
}
