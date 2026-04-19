import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ExpensesContent } from "./expenses-content";
import { computeIsPro } from "@/lib/compute-is-pro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaidItem, PlaidTransaction, PipelineDeal, HistoryItem, RecurringExpense } from "@/lib/types/database";

// ── Default expense categories ───────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  {
    key: "vehicle",
    title: "Vehicle",
    sort_order: 0,
    items: [
      { key: "vehicle_payment",  title: "Vehicle Payment",  sort_order: 0 },
      { key: "vehicle_insurance", title: "Insurance",        sort_order: 1 },
      { key: "vehicle_fuel",     title: "Fuel",             sort_order: 2 },
      { key: "vehicle_service",  title: "Service & Repairs", sort_order: 3 },
    ],
  },
  {
    key: "marketing",
    title: "Marketing",
    sort_order: 1,
    items: [
      { key: "marketing_ads",         title: "Ads (Meta/Google)",      sort_order: 0 },
      { key: "marketing_photography", title: "Photography & Video",     sort_order: 1 },
      { key: "marketing_print",       title: "Print (Signs, Flyers)",   sort_order: 2 },
      { key: "marketing_gifts",       title: "Client Gifts",            sort_order: 3 },
    ],
  },
  {
    key: "office_tech",
    title: "Office & Tech",
    sort_order: 2,
    items: [
      { key: "office_supplies",  title: "Office Supplies",        sort_order: 0 },
      { key: "office_software",  title: "Software Subscriptions", sort_order: 1 },
      { key: "office_phone",     title: "Phone & Internet",       sort_order: 2 },
      { key: "office_hardware",  title: "Hardware & Equipment",   sort_order: 3 },
    ],
  },
  {
    key: "professional",
    title: "Professional Fees",
    sort_order: 3,
    items: [
      { key: "prof_board_mls",  title: "Board / MLS Dues",       sort_order: 0 },
      { key: "prof_licensing",  title: "Licensing & Renewals",   sort_order: 1 },
      { key: "prof_eo",         title: "E&O Insurance",          sort_order: 2 },
      { key: "prof_accounting", title: "Accounting & Bookkeeping", sort_order: 3 },
    ],
  },
  {
    key: "education",
    title: "Education",
    sort_order: 4,
    items: [
      { key: "edu_courses",     title: "Courses & Coaching", sort_order: 0 },
      { key: "edu_conferences", title: "Conferences",        sort_order: 1 },
      { key: "edu_books",       title: "Books & Materials",  sort_order: 2 },
    ],
  },
  {
    key: "meals",
    title: "Meals",
    sort_order: 5,
    items: [
      { key: "meals_client", title: "Client Meals", sort_order: 0 },
      { key: "meals_team",   title: "Team Meals",   sort_order: 1 },
    ],
  },
  {
    key: "entertainment",
    title: "Entertainment",
    sort_order: 6,
    items: [
      { key: "ent_client", title: "Client Entertainment", sort_order: 0 },
      { key: "ent_events", title: "Events & Tickets",     sort_order: 1 },
    ],
  },
  {
    key: "other",
    title: "Other",
    sort_order: 7,
    items: [
      { key: "other_misc", title: "Miscellaneous", sort_order: 0 },
    ],
  },
  // Seeded for all users; shown only when has_employees = true
  {
    key: "payroll",
    title: "Payroll & HR",
    sort_order: 8,
    items: [
      { key: "payroll_wages",        title: "Admin wages",          sort_order: 0 },
      { key: "payroll_employer_cpp", title: "Employer CPP",         sort_order: 1 },
      { key: "payroll_employer_ei",  title: "Employer EI",          sort_order: 2 },
      { key: "payroll_wsib",         title: "WSIB / WCB",           sort_order: 3 },
      { key: "payroll_benefits",     title: "Group benefits",       sort_order: 4 },
      { key: "payroll_service_fees", title: "Payroll service fees", sort_order: 5 },
    ],
  },
  // Seeded for all users; shown only when is_incorporated = true
  {
    key: "corp_admin",
    title: "Corporate Admin",
    sort_order: 9,
    items: [
      { key: "corp_accounting",    title: "Corporate accounting",   sort_order: 0 },
      { key: "corp_legal",         title: "Legal & corporate",      sort_order: 1 },
      { key: "corp_annual_filing", title: "Annual registry filing", sort_order: 2 },
      { key: "corp_bank_fees",     title: "Business banking fees",  sort_order: 3 },
      { key: "corp_insurance_gl",  title: "Commercial liability",   sort_order: 4 },
      { key: "corp_insurance_do",  title: "D&O insurance",          sort_order: 5 },
    ],
  },
];

// ── Seed helper — inserts all 8 categories + 24 items for a user ──────────────
async function seedDefaultCategories(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
) {
  for (const cat of DEFAULT_CATEGORIES) {
    const { data: catRow, error } = await supabase
      .from("expense_categories")
      .insert({
        user_id: userId,
        key: cat.key,
        title: cat.title,
        sort_order: cat.sort_order,
      })
      .select()
      .maybeSingle();

    if (catRow && !error) {
      await supabase.from("expense_items").insert(
        cat.items.map((item) => ({
          user_id: userId,
          category_id: catRow.id,
          key: item.key,
          title: item.title,
          sort_order: item.sort_order,
          ytd_amount: 0,
          monthly_recurring: 0,
        })),
      );
    }
  }
}

export default async function ExpensesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const year = new Date().getFullYear();

  // Server-side Plaid credential check
  const plaidConfigured = !!(
    process.env.PLAID_CLIENT_ID &&
    process.env.PLAID_SECRET &&
    process.env.PLAID_ENV
  );

  const [
    categoriesResult, itemsResult, settingsResult, txResult,
    receiptTotalsResult, receiptsResult, historyResult,
    mileageResult, plaidItemsResult, plaidTxResult,
    expItemsResult, expCatResult,
    pipelineResult, fullHistoryResult, recurringExpResult,
  ] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order")
      .limit(10000),
    supabase
      .from("expense_items")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order")
      .limit(10000),
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("date", `${new Date().getFullYear()}-01-01`)
      .limit(10000),
    // All current-year receipts for YTD totals (lightweight — just the two fields we need)
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${year}-01-01`)
      .limit(10000),
    // Last 50 receipts for the display log (full row)
    supabase
      .from("receipt_expenses")
      .select("*")
      .eq("user_id", user.id)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    // Prior year history for YoY comparison (last 4 years excluding current)
    supabase
      .from("history_items")
      .select("year, annual_gci, annual_expenses, annual_mileage_km, annual_mileage_deduct")
      .eq("user_id", user.id)
      .lt("year", year)
      .order("year", { ascending: false })
      .limit(4),
    // Current-year mileage logs for the Mileage tab
    supabase
      .from("mileage_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("trip_date", `${year}-01-01`)
      .order("trip_date", { ascending: false })
      .limit(10000),
    // Connected bank accounts for the Bank Imports tab
    supabase
      .from("plaid_items")
      // access_token is intentionally excluded — server-only credential
      .select("id, user_id, plaid_item_id, institution_id, institution_name, sync_cursor, last_synced_at, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    // Plaid transactions (last 500) for the Bank Imports tab
    supabase
      .from("plaid_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false })
      .limit(500),
    // Expense sub-categories for the Bank Imports category dropdown
    supabase
      .from("expense_items")
      .select("id, key, title, category_id")
      .eq("user_id", user.id)
      .order("sort_order")
      .limit(10000),
    // Expense categories for grouping the dropdown
    supabase
      .from("expense_categories")
      .select("id, key, title, sort_order")
      .eq("user_id", user.id)
      .order("sort_order")
      .limit(10000),
    // Pipeline deals — required for Survival/Runway Score parity with dashboard
    supabase
      .from("pipeline_deals")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    // Full history (with quarter_gci) — required for agent-specific seasonality parity
    supabase
      .from("history_items")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .limit(100),
    // Active recurring expenses — required to match dashboard monthly_recurring
    supabase
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(10000),
  ]);

  // Aggregate receipt totals per sub-category key for the current year
  const receiptTotalsByKey: Record<string, number> = {};
  for (const r of receiptTotalsResult.data ?? []) {
    if (r.category_key && r.total_amount != null) {
      receiptTotalsByKey[r.category_key] =
        (receiptTotalsByKey[r.category_key] ?? 0) + Number(r.total_amount);
    }
  }

  let cats = categoriesResult.data ?? [];
  let items = itemsResult.data ?? [];

  // Auto-seed the default expense structure if this user has none yet.
  // (Accounts created before the DB trigger was in place land here.)
  if (cats.length === 0) {
    await seedDefaultCategories(supabase, user.id);
    // Re-fetch so the page renders with full data
    const [newCats, newItems] = await Promise.all([
      supabase
        .from("expense_categories")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order"),
      supabase
        .from("expense_items")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order"),
    ]);
    cats = newCats.data ?? [];
    items = newItems.data ?? [];
  }

  // Join items into their categories, filtering out conditional categories
  // based on user's business structure flags so they don't appear until enabled.
  const settings = settingsResult.data;
  const isPro = await computeIsPro(supabase, user.id, settings);
  const categories = cats
    .map((cat) => ({
      ...cat,
      items: items.filter((item) => item.category_id === cat.id),
    }))
    .filter((cat) => {
      if (cat.key === "payroll"    && !settings?.has_employees)   return false;
      if (cat.key === "corp_admin" && !settings?.is_incorporated) return false;
      return true;
    });

  return (
    <ExpensesContent
      initialCategories={categories}
      settings={settings}
      isPro={isPro}
      transactions={txResult.data ?? []}
      initialReceipts={receiptsResult.data ?? []}
      receiptTotalsByKey={receiptTotalsByKey}
      priorYearHistory={historyResult.data ?? []}
      currentYear={year}
      mileageLogs={mileageResult.data ?? []}
      plaidItems={(plaidItemsResult.data ?? []) as PlaidItem[]}
      plaidTransactions={(plaidTxResult.data ?? []) as PlaidTransaction[]}
      plaidExpenseItems={expItemsResult.data ?? []}
      plaidExpenseCategories={expCatResult.data ?? []}
      plaidConfigured={plaidConfigured}
      pipelineDeals={(pipelineResult.data ?? []) as PipelineDeal[]}
      historyItems={(fullHistoryResult.data ?? []) as HistoryItem[]}
      recurringExpenses={(recurringExpResult.data ?? []) as RecurringExpense[]}
    />
  );
}
