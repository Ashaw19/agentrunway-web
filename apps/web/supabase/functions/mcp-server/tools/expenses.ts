import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { CANONICAL_TAX_DISCLAIMER_SHORT } from "../lib/constants.ts";
import { loadExpenseInputs } from "../lib/expense-inputs.ts";
import {
  recurringMonthlyEquivalent,
  recurringYTD,
} from "../../_shared/core/engines/recurring-expense-engine.ts";
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
    // so `total_ytd` equals get_dashboard_kpis' `ytd_expenses`. Until
    // 2026-10-13 this tool listed `expense_items.ytd_amount`, a column the
    // app no longer writes: receipts and recurring expenses were missing.
    {
      name: "get_expenses",
      description:
        "Returns the agent's YTD business expenses by category and line item (receipts and recurring expenses), plus monthly recurring totals. For a GST/HST registrant the amounts are net of the GST/HST claimed as input tax credits. Home Office bills count at the home office share. ESTIMATE ONLY — not tax advice.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Business Expenses",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const { taxCtx, today, todayISO, recurringNet, items, totals } =
          await loadExpenseInputs(supabase, userId);

        const itemByKey = new Map(items.map((i) => [i.key, i]));
        // A receipt or recurring expense is filed under an item key
        // ("vehicle_fuel") or, on older rows, a category key ("vehicle").
        const categoryTitleByKey = new Map<string, string>();
        for (const item of items) {
          if (item.expense_categories) {
            categoryTitleByKey.set(item.expense_categories.key, item.expense_categories.title);
          }
        }
        const categoryOf = (key: string | null) =>
          (key && (itemByKey.get(key)?.expense_categories?.title ?? categoryTitleByKey.get(key))) || "Other";

        // One line per expense item: this year's receipts filed under it, and
        // any monthly estimate typed on it (the older way to enter a cost).
        const lines: ExpenseLine[] = items.map((item) => ({
          key: item.key,
          title: item.title,
          category: item.expense_categories?.title ?? "Other",
          ytd_amount: totals.receipts.byKey[item.key] ?? 0,
          monthly_recurring: Number(item.monthly_recurring ?? 0),
        }));

        // Receipts filed under a key that has no expense item, and receipts
        // saved with no category at all: both are in the total, so both get
        // a line.
        for (const [key, amount] of Object.entries(totals.receipts.byKey)) {
          if (itemByKey.has(key)) continue;
          lines.push({ key, title: key, category: categoryOf(key), ytd_amount: amount, monthly_recurring: 0 });
        }
        if (totals.receipts.uncategorized > 0) {
          lines.push({
            key: null,
            title: "Uncategorized receipts",
            category: "Uncategorized",
            ytd_amount: totals.receipts.uncategorized,
            monthly_recurring: 0,
          });
        }

        // One line per active recurring expense, under its item's category.
        for (const re of recurringNet) {
          lines.push({
            key: re.category_key,
            title: re.name,
            category: categoryOf(re.category_key),
            ytd_amount: recurringYTD(re, today),
            monthly_recurring: recurringMonthlyEquivalent(re),
          });
        }

        // The total takes the larger of receipts and the monthly estimates.
        // When the estimates are larger, the difference is in the total but
        // on no line above: list it, so the lines always add up to total_ytd.
        const estimatesAboveReceipts = totals.legacyRecurringYTDEstimate - totals.receiptYTD;
        if (estimatesAboveReceipts > 0) {
          lines.push({
            key: null,
            title: "Monthly estimates above receipts",
            category: "Monthly estimates",
            ytd_amount: estimatesAboveReceipts,
            monthly_recurring: 0,
          });
        }

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
              // How total_ytd is built. The lines below are receipts and
              // recurring expenses, plus one line for the monthly estimates
              // when they exceed the receipts.
              ytd_components: {
                receipts: round2(totals.receiptYTD),
                recurring: round2(totals.recurringYTD),
                monthly_estimates: round2(totals.legacyRecurringYTDEstimate),
                formula: "total_ytd = the larger of receipts and monthly_estimates, plus recurring",
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
