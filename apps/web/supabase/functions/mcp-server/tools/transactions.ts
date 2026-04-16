import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

export function getTransactionTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_transactions ──────────────────────────────────────────────────
    {
      name: "get_transactions",
      description:
        "Returns the agent's closed transactions. Optionally filter by year, status, or limit. Each record includes address, sale price, GCI, side (buyer/seller/both), and date.",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "number", description: "Filter to a specific year (e.g. 2025). Omit for all time." },
          limit: { type: "number", description: "Maximum number of records to return (default 50, max 200)." },
          status: { type: "string", enum: ["closed", "pending", "fallen"], description: "Filter by status. Omit for all." },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Transactions",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { year, limit = 50, status } = args as { year?: number; limit?: number; status?: string };
        const cap = Math.min(limit, 200);

        let query = supabase
          .from("transactions")
          .select("id, date, address, sale_price, commission_pct, gci_override, team_split_pct, side, status, client_name, notes")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(cap);

        if (status) query = query.eq("status", status);
        if (year) {
          query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const transactions = (data ?? []).map((tx) => {
          const gci = tx.gci_override != null
            ? tx.gci_override
            : (tx.sale_price ?? 0) * (tx.commission_pct ?? 0.025) *
              (tx.team_split_pct != null && tx.team_split_pct > 0 ? tx.team_split_pct : 1);
          return {
            id: tx.id,
            date: tx.date,
            address: tx.address,
            sale_price: tx.sale_price,
            gci: Math.round(gci),
            commission_pct: tx.commission_pct,
            side: tx.side,
            status: tx.status,
            client_name: tx.client_name,
          };
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              count: transactions.length,
              filters: { year: year ?? "all", status: status ?? "all", limit: cap },
              transactions,
            }, null, 2),
          }],
        };
      },
    },

    // ── get_transaction_summary ──────────────────────────────────────────
    {
      name: "get_transaction_summary",
      description:
        "Returns an aggregate summary of the agent's transactions by year: total GCI, deal count, average sale price, and side breakdown (buyer/seller/both).",
      inputSchema: {
        type: "object",
        properties: {
          years: { type: "number", description: "Number of past years to include (default 3, max 10)." },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Transaction Summary by Year",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { years = 3 } = args as { years?: number };
        const cap = Math.min(years, 10);
        const fromYear = new Date().getFullYear() - cap + 1;

        const { data, error } = await supabase
          .from("transactions")
          .select("date, sale_price, commission_pct, gci_override, team_split_pct, side, status")
          .eq("user_id", userId)
          .eq("status", "closed")
          .gte("date", `${fromYear}-01-01`)
          .order("date", { ascending: true });

        if (error) throw error;

        // Group by year
        const byYear: Record<number, { gci: number; count: number; volume: number; buyer: number; seller: number; both: number }> = {};
        for (const tx of data ?? []) {
          const y = parseInt((tx.date as string).slice(0, 4));
          if (!byYear[y]) byYear[y] = { gci: 0, count: 0, volume: 0, buyer: 0, seller: 0, both: 0 };
          const gci = tx.gci_override != null
            ? tx.gci_override
            : (tx.sale_price ?? 0) * (tx.commission_pct ?? 0.025) *
              (tx.team_split_pct != null && tx.team_split_pct > 0 ? tx.team_split_pct : 1);
          byYear[y].gci += gci;
          byYear[y].count += 1;
          byYear[y].volume += tx.sale_price ?? 0;
          if (tx.side === "buyer") byYear[y].buyer++;
          else if (tx.side === "seller") byYear[y].seller++;
          else byYear[y].both++;
        }

        const summary = Object.entries(byYear)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([year, d]) => ({
            year: Number(year),
            total_gci: Math.round(d.gci),
            deal_count: d.count,
            avg_sale_price: d.count > 0 ? Math.round(d.volume / d.count) : 0,
            total_volume: Math.round(d.volume),
            avg_gci_per_deal: d.count > 0 ? Math.round(d.gci / d.count) : 0,
            sides: { buyer: d.buyer, seller: d.seller, both: d.both },
          }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ years: cap, summary }, null, 2),
          }],
        };
      },
    },
  ];
}
