import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TransactionsContent } from "./transactions-content";
import { SPLIT_PRESET_AGENT_PCT, type ListingAppointment, type RecurringExpense, type SplitPreset } from "@/lib/types/database";
import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import { loadVehicleLogbook } from "@/lib/vehicle-logbook/load";


export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const today = atlanticNoon();
  const taxYear = today.getFullYear();
  // The vehicle business-use share comes from the logbook when it covers the
  // year (expenseTaxContext → vehicle-logbook-engine), the setting otherwise.
  const logbookPromise = loadVehicleLogbook(supabase, user.id, taxYear);

  // Fetch settings first
  const { data: settingsRaw } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const [
    { data: transactions },
    { data: pipelineDeals },
    { data: historyItems },
    // The four reads below feed the tax row on the deal-close celebration:
    // the dashboard page's queries, so the year's tax estimate is the
    // dashboard's (core/engines/deal-tax-portion).
    { data: receiptTotals },
    { data: recurringExpenses },
    { data: expenseItems },
    { data: activeListings },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(10000),
    supabase
      .from("pipeline_deals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("history_items")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .limit(10000),
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount, tax_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${taxYear}-01-01`)
      .limit(10000),
    supabase
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(10000),
    supabase
      .from("expense_items")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("listing_appointments")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["scheduled", "active"])
      .limit(10000),
  ]);

  // Year-to-date expenses and what is still to come: the dashboard's one
  // engine call (t2125-expenses-engine), net of the ITCs a registrant claims.
  const expenseCtx = expenseTaxContext(settingsRaw, await logbookPromise);
  const expenseTotals = ytdExpenseTotals({
    receipts: receiptTotals,
    recurring: (recurringExpenses ?? []) as RecurringExpense[],
    expenseItems,
    ctx: expenseCtx,
    now: today,
  });

  // Convert the user's saved split preset (e.g. "p75_25") to a decimal (0.75)
  const settingsSplit: number | null = settingsRaw?.split_preset
    ? (SPLIT_PRESET_AGENT_PCT[settingsRaw.split_preset as SplitPreset] ?? null)
    : null;

  return (
    <TransactionsContent
      initialTransactions={transactions ?? []}
      initialPipelineDeals={pipelineDeals ?? []}
      historyItems={historyItems ?? []}
      settingsSplit={settingsSplit}
      settings={settingsRaw ?? null}
      initialTab={params?.tab ?? "deals"}
      expensesYTD={expenseTotals.expensesYTD}
      expensesRemaining={expenseTotals.expensesRemaining}
      activeListings={(activeListings ?? []) as ListingAppointment[]}
    />
  );
}
