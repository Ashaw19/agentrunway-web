import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { CANONICAL_TAX_DISCLAIMER_SHORT } from "../lib/constants.ts";
import { loadExpenseInputs, vehicleUseSummary } from "../lib/expense-inputs.ts";
import { expenseTaxContext } from "../../_shared/core/engines/expense-totals-engine.ts";
import { expenseCategoryResolver } from "../../_shared/core/engines/t2125-expenses-engine.ts";
import {
  allowanceRateFigure,
  vehicleBusinessUseFor,
} from "../../_shared/core/engines/vehicle-logbook-engine.ts";
import { atlanticISODate, atlanticYear } from "../../_shared/core/lib/local-date.ts";
import { loadLogbookRowsOrNull } from "../../_shared/core/lib/vehicle-logbook-rows.ts";
import { ALLOWANCE_RATE_NOTE } from "../../_shared/core/tax-copy/cra-rules.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One response holds at most 1,000 rows (PostgREST max_rows), so lists are read in pages. */
const PAGE = 1000;

/** A `mileage_logs` row as get_mileage_summary reads it. */
interface TripRow {
  id: string;
  trip_date: string;
  description: string | null;
  from_location: string | null;
  to_location: string | null;
  km: number | string | null;
  purpose: string | null;
  vehicle_id: string | null;
  odometer_start: number | string | null;
  odometer_end: number | string | null;
}

const TRIP_COLUMNS =
  "id, trip_date, description, from_location, to_location, km, purpose, vehicle_id, odometer_start, odometer_end";

const numOrNull = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface ExpenseLine {
  key: string | null;
  title: string;
  category: string;
  ytd_amount: number;
  monthly_recurring: number;
  /** A recurring expense's end date, when it has one. */
  end_date?: string;
}

export function getExpenseTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_expenses ─────────────────────────────────────────────────────
    // Totals are the dashboard's (lib/expense-inputs.ts → ytdExpenseTotals),
    // so `total_ytd` equals get_dashboard_kpis' `ytd_expenses`, and the lines
    // are the engine's own (`totals.tracked.lines`), so they add up to it.
    // Until 2026-10-13 this tool listed `expense_items.ytd_amount`, a column
    // the app no longer writes: receipts and recurring expenses were missing.
    // `next_year_expenses` is the dashboard's next-year plan figure
    // (`totals.expensesNextYear`). It replaced `projected_annual_recurring`,
    // the monthly figure × 12, which counted a recurring expense with an end
    // date for the whole of next year.
    {
      name: "get_expenses",
      description:
        "Returns the agent's YTD business expenses by category and line item (receipts, monthly estimates and recurring expenses), plus monthly recurring totals. For a GST/HST registrant the amounts are net of the GST/HST claimed as input tax credits. Home Office bills count at the home office share. A recurring expense with an end_date counts its charges up to that date; once the date has passed its monthly_recurring is 0 and it is out of the monthly totals. next_year_expenses is the business expenses expected next calendar year, the figure the dashboard's next-year plan deducts: each recurring expense by the charge dates that fall in that year (so one with an end_date stops counting at it, and one that starts during the year counts from its start date) plus 12 months of the monthly estimates. It is not total_monthly_recurring x 12. ESTIMATE ONLY — not tax advice.",
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
        const recurringById = new Map(recurring.map((re) => [re.id, re]));
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
          const re = line.source === "recurring" ? recurringById.get(line.recurringId ?? "") : undefined;
          const title = line.source === "recurring"
            ? (re?.name ?? "Recurring expense")
            // A key with no expense item (a category-level key, an item since removed).
            : (itemByKey.get(line.key ?? "")?.title ?? line.key ?? "Other");
          return {
            key: line.key,
            title,
            category: categoryOf(line.key),
            ytd_amount: line.rawAmount,
            // $0 for a recurring expense whose end date has passed (the engine's rule).
            monthly_recurring: line.monthlyAmount,
            ...(re?.end_date ? { end_date: re.end_date } : {}),
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
              // Next calendar year, as the dashboard's next-year plan counts
              // it. Not total_monthly_recurring × 12: a recurring expense has
              // dates, so it counts by its charge dates in that year.
              next_year_expenses: {
                year: today.getFullYear() + 1,
                total: round2(totals.expensesNextYear),
                recurring: round2(totals.recurringNextYear),
                formula: "total = recurring + 12 months of the monthly estimates on expense items. recurring = each recurring expense's charge dates that fall in that year, from its start date and up to its end_date when it has one. Receipts are not projected.",
              },
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
    // Until 2026-10-18 this reported `total_deduction`, the sum of the stored
    // `deduction` column (km × the per-km rate saved on each trip, 2025's
    // $0.72 whatever the year), and called it the "CRA deduction amount".
    // That figure is CRA's reasonable per-km ALLOWANCE an employer can pay an
    // employee: a benchmark, not the T2125 motor vehicle deduction (the
    // business part of the vehicle's actual costs). It is now
    // `allowance_rate_figure`, worked out by the engine from the year's km at
    // that year's rates (allowanceRateFigure) and labelled ALLOWANCE_RATE_NOTE,
    // with the vehicle business-use share the year's figures apply beside it.
    // The year's trips are read in pages: one request stops at 1,000 rows.
    {
      name: "get_mileage_summary",
      description:
        "Returns the agent's business mileage log for a year (default: the current year): total business km, the trip count, and vehicle_business_use, the vehicle business-use share the app applies for that year (computed from the CRA logbook when it covers the year, else the share declared in Settings; pct is a percentage). allowance_rate_figure is the year's business km x CRA's reasonable per-km allowance rates (allowance_rates_year is the year of the rates used: the latest CRA has published when it has not published that year's). It is a benchmark of what an employer could pay an employee for the same driving, not the T2125 motor vehicle expense, which is the business part of the vehicle's actual costs (fuel, insurance, maintenance, lease or capital cost allowance). include_trips adds the 50 most recent trips. ESTIMATE ONLY — not tax advice.",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "number", description: "Year to query (default: current year)." },
          include_trips: { type: "boolean", description: "Include the 50 most recent trip records (default false)." },
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
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          return {
            content: [{ type: "text" as const, text: "year is a calendar year such as 2026." }],
            isError: true,
          };
        }

        // Every trip in the year, newest first, a page at a time.
        const readTrips = async (): Promise<TripRow[]> => {
          const trips: TripRow[] = [];
          for (let from = 0; ; from += PAGE) {
            const { data, error } = await supabase
              .from("mileage_logs")
              .select(TRIP_COLUMNS)
              .eq("user_id", userId)
              .gte("trip_date", `${year}-01-01`)
              .lte("trip_date", `${year}-12-31`)
              .order("trip_date", { ascending: false })
              .order("id", { ascending: false })
              .range(from, from + PAGE - 1);
            if (error) throw error;
            const page = (data ?? []) as TripRow[];
            trips.push(...page);
            if (page.length < PAGE) return trips;
          }
        };

        const [logs, settingsRes, logbookRows] = await Promise.all([
          readTrips(),
          // The expense context's slice (expenseTaxContext).
          supabase
            .from("user_settings")
            .select("gst_hst_registered, vehicle_business_use_pct, home_office_business_use_pct")
            .eq("user_id", userId)
            .maybeSingle(),
          // Never rejects: null when the rows can't be read (the declared share).
          loadLogbookRowsOrNull(supabase, userId, year),
        ]);
        if (settingsRes.error) throw settingsRes.error;

        const totalKm = Math.round(logs.reduce((s, l) => s + (numOrNull(l.km) ?? 0), 0) * 10) / 10;
        const figure = allowanceRateFigure(totalKm, year);
        // The share the year's expense figures apply: expenseTaxContext's, as
        // in loadExpenseInputs (it always sets it; the fallback is the same call).
        const today = atlanticISODate();
        const ctx = expenseTaxContext(settingsRes.data, { rows: logbookRows, year, today });
        const vehicleUse = ctx.vehicleBusinessUse ?? vehicleBusinessUseFor(settingsRes.data, logbookRows, year, today);

        const result: Record<string, unknown> = {
          disclaimer: CANONICAL_TAX_DISCLAIMER_SHORT,
          year,
          total_km: totalKm,
          trip_count: logs.length,
          vehicle_business_use: vehicleUseSummary(vehicleUse),
          allowance_rate_figure: round2(figure.amount),
          allowance_rates_year: figure.rates.year,
          allowance_rates: {
            first_5000_km_per_km: figure.rates.first5000,
            after_5000_km_per_km: figure.rates.beyond5000,
          },
          allowance_rate_note: ALLOWANCE_RATE_NOTE,
        };

        if (include_trips) {
          result.trips = logs.slice(0, 50).map((l) => ({
            date: l.trip_date,
            description: l.description,
            from_location: l.from_location,
            to_location: l.to_location,
            km: numOrNull(l.km),
            purpose: l.purpose,
            // Null on trips logged before vehicles existed: they count for the default vehicle.
            vehicle_id: l.vehicle_id,
            odometer_start: numOrNull(l.odometer_start),
            odometer_end: numOrNull(l.odometer_end),
          }));
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    },
  ];
}
