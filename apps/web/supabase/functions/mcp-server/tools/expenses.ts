import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { CANONICAL_TAX_DISCLAIMER_SHORT } from "../lib/constants.ts";
import { loadExpenseInputs } from "../lib/expense-inputs.ts";
import { expenseCategoryResolver } from "../../_shared/core/engines/t2125-expenses-engine.ts";
import { atlanticYear } from "../../_shared/core/lib/local-date.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

interface ExpenseLine {
  key: string | null;
  title: string;
  category: string;
  ytd_amount: number;
  monthly_recurring: number;
}

export function getExpenseTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_expenses ─────────────────────────────────────────────────────
    // Totals are the dashboard's (lib/expense-inputs.ts → ytdExpenseTotals),
    // so `total_ytd` equals get_dashboard_kpis' `ytd_expenses`, and the lines
    // are the engine's own (`totals.tracked.lines`), so they add up to it.
    // Until 2026-10-13 this tool listed `expense_items.ytd_amount`, a column
    // the app no longer writes: receipts and recurring expenses were missing.
    {
      name: "get_expenses",
      description:
        "Returns the agent's YTD business expenses by category and line item (receipts, monthly estimates and recurring expenses), plus monthly recurring totals. For a GST/HST registrant the amounts are net of the GST/HST claimed as input tax credits. Home Office bills count at the home office share. ESTIMATE ONLY — not tax advice.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Business Expenses",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const { taxCtx, today, todayISO, recurring, items, totals } =
          await loadExpenseInputs(supabase, userId);

        const itemByKey = new Map(items.map((i) => [i.key, i]));
        // Which category a key sits under is the engine's rule, the one the
        // web's category tables use (expenseCategoryResolver): the agent's own
        // item with that key, a category key itself (older rows), or the
        // seeded category a standard key belongs to when the agent has no
        // item row for it.
        const categoryTitleByKey = new Map<string, string>();
        const itemKeysByCategory = new Map<string, { key: string }[]>();
        for (const item of items) {
          if (!item.expense_categories) continue;
          categoryTitleByKey.set(item.expense_categories.key, item.expense_categories.title);
          const keys = itemKeysByCategory.get(item.expense_categories.key) ?? [];
          keys.push({ key: item.key });
          itemKeysByCategory.set(item.expense_categories.key, keys);
        }
        const categoryKeyOf = expenseCategoryResolver(
          [...itemKeysByCategory].map(([key, categoryItems]) => ({ key, items: categoryItems })),
        );
        const categoryOf = (key: string | null) =>
          categoryTitleByKey.get(categoryKeyOf(key) ?? "") ?? "Other";

        // The engine's lines, which total_ytd and total_monthly_recurring are
        // the sums of. Per expense item: this year's receipts filed under it,
        // or its monthly estimate × months so far where that is larger (the
        // estimate and the receipts describe the same spending). Then
        // receipts saved with no category, and each active recurring expense.
        const recurringName = new Map(recurring.map((re) => [re.id, re.name]));
        const lines: ExpenseLine[] = totals.tracked.lines.map((line) => {
          if (line.source === "uncategorized") {
            return {
              key: null,
              title: "Uncategorized receipts",
              category: "Uncategorized",
              ytd_amount: line.rawAmount,
              monthly_recurring: 0,
            };
          }
          const title = line.source === "recurring"
            ? (recurringName.get(line.recurringId ?? "") ?? "Recurring expense")
            // A key with no expense item (a category-level key, an item since removed).
            : (itemByKey.get(line.key ?? "")?.title ?? line.key ?? "Other");
          return {
            key: line.key,
            title,
            category: categoryOf(line.key),
            ytd_amount: line.rawAmount,
            monthly_recurring: line.monthlyAmount,
          };
        });

        // What the amounts are: a home bill is never "as paid", it counts at
        // the home office share (expense-totals-engine).
        const homeSharePct = Math.round(taxCtx.homeOfficeBusinessUsePct * 1000) / 10;
        const amountsNote = [
          taxCtx.gstHstRegistered
            ? "Net of the GST/HST claimed as input tax credits (GST/HST registrant)."
            : "As paid, GST/HST included (not registered for GST/HST).",
          homeSharePct > 0
            ? `Home Office bills count at the ${homeSharePct}% home office share, not in full.`
            : "No home office share is set, so Home Office bills count for $0.",
        ].join(" ");

        const allItems = lines
          .filter((l) => l.ytd_amount > 0 || l.monthly_recurring > 0)
          .sort((a, b) => b.ytd_amount - a.ytd_amount)
          .map((l) => ({ ...l, ytd_amount: round2(l.ytd_amount), monthly_recurring: round2(l.monthly_recurring) }));

        // Group by category
        const byCategory: Record<string, { ytd: number; monthly: number; items: string[] }> = {};
        for (const line of lines) {
          if (!byCategory[line.category]) byCategory[line.category] = { ytd: 0, monthly: 0, items: [] };
          byCategory[line.category].ytd += line.ytd_amount;
          byCategory[line.category].monthly += line.monthly_recurring;
        }
        for (const line of allItems) {
          if (line.ytd_amount > 0) byCategory[line.category].items.push(line.title);
        }

        const categorySummary = Object.entries(byCategory)
          .filter(([, d]) => d.ytd > 0 || d.monthly > 0)
          .map(([category, d]) => ({ category, ytd_total: round2(d.ytd), monthly_recurring: round2(d.monthly), top_items: d.items.slice(0, 3) }))
          .sort((a, b) => b.ytd_total - a.ytd_total);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              disclaimer: CANONICAL_TAX_DISCLAIMER_SHORT,
              as_of: todayISO,
              year: today.getFullYear(),
              amounts: amountsNote,
              total_ytd: round2(totals.expensesYTD),
              total_monthly_recurring: round2(totals.monthlyRecurring),
              projected_annual_recurring: round2(totals.monthlyRecurring * 12),
              // How total_ytd is built. An expense item's line is its
              // receipts, or its monthly estimate × months so far where that
              // is larger; the excess over receipts is listed here.
              ytd_components: {
                receipts: round2(totals.receiptYTD),
                monthly_estimates_above_receipts: round2(totals.estimatesAboveReceipts),
                recurring: round2(totals.recurringYTD),
                formula: "total_ytd = receipts + monthly_estimates_above_receipts + recurring. Per expense item, the larger of its receipts and its monthly estimate x months so far counts.",
              },
              by_category: categorySummary,
              all_items: allItems,
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
        const { year = atlanticYear(), include_trips = false } = args as { year?: number; include_trips?: boolean };

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
