import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

export function getExpenseTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_expenses ─────────────────────────────────────────────────────
    {
      name: "get_expenses",
      description:
        "Returns the agent's YTD business expenses by category and line item, plus monthly recurring totals.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Business Expenses",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const { data, error } = await supabase
          .from("expense_items")
          .select(`
            key, title, ytd_amount, monthly_recurring,
            expense_categories(key, title)
          `)
          .eq("user_id", userId)
          .order("ytd_amount", { ascending: false });

        if (error) throw error;

        const items = (data ?? []).map((item) => ({
          key: item.key,
          title: item.title,
          category: (item.expense_categories as Record<string, string> | null)?.title ?? "Unknown",
          ytd_amount: item.ytd_amount ?? 0,
          monthly_recurring: item.monthly_recurring ?? 0,
        }));

        const totalYTD = items.reduce((s, i) => s + i.ytd_amount, 0);
        const totalMonthlyRecurring = items.reduce((s, i) => s + i.monthly_recurring, 0);

        // Group by category
        const byCategory: Record<string, { ytd: number; monthly: number; items: string[] }> = {};
        for (const item of items) {
          if (!byCategory[item.category]) byCategory[item.category] = { ytd: 0, monthly: 0, items: [] };
          byCategory[item.category].ytd += item.ytd_amount;
          byCategory[item.category].monthly += item.monthly_recurring;
          if (item.ytd_amount > 0) byCategory[item.category].items.push(item.title);
        }

        const categorySummary = Object.entries(byCategory)
          .map(([category, d]) => ({ category, ytd_total: Math.round(d.ytd * 100) / 100, monthly_recurring: Math.round(d.monthly * 100) / 100, top_items: d.items.slice(0, 3) }))
          .sort((a, b) => b.ytd_total - a.ytd_total);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              total_ytd: Math.round(totalYTD * 100) / 100,
              total_monthly_recurring: Math.round(totalMonthlyRecurring * 100) / 100,
              projected_annual_recurring: Math.round(totalMonthlyRecurring * 12 * 100) / 100,
              by_category: categorySummary,
              all_items: items.filter((i) => i.ytd_amount > 0 || i.monthly_recurring > 0),
            }, null, 2),
          }],
        };
      },
    },

    // ── get_mileage_summary ──────────────────────────────────────────────
    {
      name: "get_mileage_summary",
      description:
        "Returns the agent's business mileage log summary for the current year: total km driven, CRA deduction amount, and recent trips.",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "number", description: "Year to query (default: current year)." },
          include_trips: { type: "boolean", description: "Include individual trip records (default false)." },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Mileage Summary",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { year = new Date().getFullYear(), include_trips = false } = args as { year?: number; include_trips?: boolean };

        const { data, error } = await supabase
          .from("mileage_logs")
          .select("trip_date, description, from_location, to_location, km, deduction, cra_rate_per_km, purpose")
          .eq("user_id", userId)
          .gte("trip_date", `${year}-01-01`)
          .lte("trip_date", `${year}-12-31`)
          .order("trip_date", { ascending: false });

        if (error) throw error;

        const logs = data ?? [];
        const totalKm = logs.reduce((s, l) => s + (l.km ?? 0), 0);
        const totalDeduction = logs.reduce((s, l) => s + (l.deduction ?? 0), 0);

        // CRA 2025: $0.72/km for first 5,000 km, $0.66/km after
        const craRate = logs[0]?.cra_rate_per_km ?? 0.72;

        const result: Record<string, unknown> = {
          year,
          total_km: Math.round(totalKm * 10) / 10,
          total_deduction: Math.round(totalDeduction * 100) / 100,
          trip_count: logs.length,
          cra_rate_per_km: craRate,
        };

        if (include_trips) {
          result.trips = logs.slice(0, 50).map((l) => ({
            date: l.trip_date,
            description: l.description,
            km: l.km,
            deduction: l.deduction,
            purpose: l.purpose,
          }));
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    },
  ];
}
