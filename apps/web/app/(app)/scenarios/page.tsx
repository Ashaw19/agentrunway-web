import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ScenariosContent } from "./scenarios-content";
import type { HistoryItem, ListingAppointment, Transaction, PipelineDeal, RecurringExpense } from "@/lib/types/database";
import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { buildScenarioSeed } from "@/lib/scenario-seed";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import { loadCapYearCarryOver } from "@/lib/cap-year-carry-over";

export type { ScenarioSeedData } from "@/lib/scenario-seed";

export default async function ScenariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const today = atlanticNoon();
  const currentYear = today.getFullYear();

  // ── Step 1: Fetch settings ──────────────────────────────────────────────
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // The dashboard's carry-over: a REAL agent's closed deals before January 1
  // in the anniversary year that contains it (cap-year-carry-over.ts).
  const carryOverPromise = loadCapYearCarryOver(supabase, user.id, settingsRow, currentYear);

  // ── Live Supabase queries ──────────────────────────────────────────
  // The dashboard page's queries: the seed is the dashboard's projection.
  const [txResult, pipelineResult, expItemResult, receiptResult, recurringExpResult, historyResult, listingResult] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "closed")
          .gte("date", `${currentYear}-01-01`)
          .limit(10000),
        supabase
          .from("pipeline_deals")
          .select("*")
          .eq("user_id", user.id)
          .limit(10000),
        supabase
          .from("expense_items")
          .select("*")
          .eq("user_id", user.id)
          .limit(10000),
        supabase
          .from("receipt_expenses")
          .select("category_key, total_amount, tax_amount")
          .eq("user_id", user.id)
          .gte("expense_date", `${currentYear}-01-01`)
          .limit(10000),
        supabase
          .from("recurring_expenses")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(10000),
        // The agent's own seasonal pattern, once two years carry quarterly GCI.
        supabase
          .from("history_items")
          .select("*")
          .eq("user_id", user.id)
          .order("year", { ascending: false })
          .limit(10000),
        // The dashboard's listing query: its projected GCI counts scheduled
        // and active listing appointments.
        supabase
          .from("listing_appointments")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["scheduled", "active"])
          .limit(10000),
      ]);

  // Year-to-date expenses, the monthly figure and what is still to come
  // this year: the dashboard's one engine call (t2125-expenses-engine).
  // Receipts, the per-item monthly figures and the Recurring Expenses list,
  // net of the ITCs a registrant claims.
  const expenses = ytdExpenseTotals({
    receipts: receiptResult.data,
    recurring: (recurringExpResult.data ?? []) as RecurringExpense[],
    expenseItems: expItemResult.data,
    ctx: expenseTaxContext(settingsRow),
    now: today,
  });

  const carryOverTx = await carryOverPromise;

  // The dashboard's projection, seasonal weights, deal count, cash and
  // benchmark (lib/scenario-seed.ts).
  const seed = buildScenarioSeed({
    settings: settingsRow ?? null,
    transactions: (txResult.data ?? []) as Transaction[],
    carryOverTx,
    pipelineDeals: (pipelineResult.data ?? []) as PipelineDeal[],
    listings: (listingResult.data ?? []) as ListingAppointment[],
    historyItems: (historyResult.data ?? []) as HistoryItem[],
    expenses,
  });

  return <ScenariosContent seed={seed} />;
}
