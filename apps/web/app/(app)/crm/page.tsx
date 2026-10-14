import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { redirect } from "next/navigation";
import { ClientsContent } from "./clients-content";
import { computeGCI, type Client, type ClientRecord, type ContactActivity, type ContactTask, type UserSettings, type ClientRelationship, type ClientRecordCoParty, type FlightPlan, type FlightPlanStep, type PropertyShowing, type ListingAppointment, type RecurringExpense, type Transaction } from "@/lib/types/database";
import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { yearTaxEstimate } from "@agent-runway/core/engines/deal-tax-portion";
import { incomeReportingMethod, taxYearGCIAdjustment } from "@agent-runway/core/engines/tax-year";
import { loadTaxYearCarryIn } from "@/lib/tax-year-carry-in";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";


/**
 * Threshold: if a user has more than this many clients, skip sending them
 * in the RSC payload and let the client component fetch them directly.
 * This avoids massive RSC payloads that can crash the browser or timeout.
 */
const CLIENT_SIDE_FETCH_THRESHOLD = 500;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: openClientId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const today = atlanticNoon();
  const taxYear = today.getFullYear();

  // ── Step 1: Fetch settings first to determine data source ───────────────
  const { data: settingsData } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const settings = settingsData as UserSettings | null;

  // ── Check client count to decide fetch strategy ─────────────────────────
  const { count: clientCount } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const useClientSideFetch = (clientCount ?? 0) > CLIENT_SIDE_FETCH_THRESHOLD;

  // ── Live Supabase queries ───────────────────────────────────────────────
  const queries = [
    // Only fetch clients server-side if below threshold
    useClientSideFetch
      ? Promise.resolve({ data: [], error: null })
      : fetchAllRows((from, to) =>
          supabase
            .from("clients")
            .select("*")
            .eq("user_id", user.id)
            .order("name")
            .order("id")
            .range(from, to)),
    // Every deal record, in pages: one request stops at 1,000 rows.
    fetchAllRows((from, to) =>
      supabase
        .from("client_records")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false })
        .order("name")
        .order("id")
        .range(from, to)),
    // Last 500 activities across all clients (for analytics + activity feed)
    supabase
      .from("contact_activities")
      .select("*")
      .eq("user_id", user.id)
      .order("activity_date", { ascending: false })
      .limit(500),
    // All open tasks (not completed) for task panel + dashboard
    fetchAllRows((from, to) =>
      supabase
        .from("contact_tasks")
        .select("*")
        .eq("user_id", user.id)
        .is("completed_at", null)
        .order("due_date", { ascending: true })
        .order("id")
        .range(from, to)),
    supabase
      .from("expense_items")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("client_relationships")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("client_record_co_parties")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("flight_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("flight_plan_steps")
      .select("*")
      .eq("user_id", user.id)
      .order("step_order", { ascending: true })
      .limit(10000),
    supabase
      .from("property_showings")
      .select("*")
      .eq("user_id", user.id)
      .order("showing_date", { ascending: false })
      .limit(10000),
    supabase
      .from("listing_appointments")
      .select("*")
      .eq("user_id", user.id)
      .order("appointment_date", { ascending: false })
      .limit(10000),
    // The five reads below, with expense_items and the scheduled/active
    // listing appointments above, are the dashboard page's queries: the
    // client tiers' tax factor and runway months use the dashboard's net
    // income for tax and monthly expenses.
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("date", `${taxYear}-01-01`)
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
  ] as const;

  // A cash-method agent's earlier closings paid this year: the tax estimate's
  // carry-in (tax-year-carry-in.ts). Empty for accrual.
  const taxYearCarryInPromise = loadTaxYearCarryIn(supabase, user.id, settings, taxYear);
  const [clientsResult, recordsResult, activitiesResult, tasksResult, expensesResult, relationshipsResult, coPartiesResult, flightPlansResult, flightPlanStepsResult, showingsResult, listingApptsResult, transactionsResult, pipelineResult, historyResult, receiptTotalsResult, recurringExpResult] = await Promise.all(queries);
  const taxYearCarryIn = await taxYearCarryInPromise;

  // Year-to-date expenses, what is still to come and the monthly figure: the
  // dashboard's one engine call (t2125-expenses-engine), net of the ITCs a
  // registrant claims.
  const expenseTotals = ytdExpenseTotals({
    receipts: receiptTotalsResult.data,
    recurring: (recurringExpResult.data ?? []) as RecurringExpense[],
    expenseItems: expensesResult.data,
    ctx: expenseTaxContext(settings),
    now: today,
  });

  // Projected net income for tax: the dashboard's (core/engines/deal-tax-portion).
  const listingAppointments = (listingApptsResult.data ?? []) as ListingAppointment[];
  const transactions = (transactionsResult.data ?? []) as Transaction[];
  const netForTax = settings
    ? yearTaxEstimate({
        settings,
        ytdGCI: transactions.reduce((sum, tx) => sum + computeGCI(tx), 0),
        ytdDealCount: transactions.length,
        pipelineDeals: pipelineResult.data ?? [],
        listings: listingAppointments.filter((l) => l.status === "scheduled" || l.status === "active"),
        historyItems: historyResult.data ?? [],
        expensesYTD: expenseTotals.expensesYTD,
        expensesRemaining: expenseTotals.expensesRemaining,
        taxYearGCIAdjustment: taxYearGCIAdjustment(
          [...transactions, ...taxYearCarryIn],
          incomeReportingMethod(settings),
          taxYear,
        ),
        now: today,
      }).netForTax
    : 0;

  return (
    <ClientsContent
      clients={(clientsResult.data ?? []) as Client[]}
      records={(recordsResult.data ?? []) as ClientRecord[]}
      activities={(activitiesResult.data ?? []) as ContactActivity[]}
      tasks={(tasksResult.data ?? []) as ContactTask[]}
      settings={settings}
      netForTax={netForTax}
      monthlyRecurring={expenseTotals.monthlyRecurring}
      relationships={(relationshipsResult.data ?? []) as ClientRelationship[]}
      coParties={(coPartiesResult.data ?? []) as ClientRecordCoParty[]}
      flightPlans={(flightPlansResult.data ?? []) as FlightPlan[]}
      flightPlanSteps={(flightPlanStepsResult.data ?? []) as FlightPlanStep[]}
      showings={(showingsResult.data ?? []) as PropertyShowing[]}
      listingAppointments={listingAppointments}
      userId={user.id}
      openClientId={openClientId ?? null}
    />
  );
}
