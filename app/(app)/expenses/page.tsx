import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ExpensesContent } from "./expenses-content";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Default categories mirroring the iOS app exactly ─────────────────────────
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
      .single();

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

  const [categoriesResult, itemsResult, settingsResult, txResult, receiptTotalsResult, receiptsResult] = await Promise.all([
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
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("date", `${new Date().getFullYear()}-01-01`),
    // All current-year receipts for YTD totals (lightweight — just the two fields we need)
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${year}-01-01`),
    // Last 50 receipts for the display log (full row)
    supabase
      .from("receipt_expenses")
      .select("*")
      .eq("user_id", user.id)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
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

  // Join items into their categories
  const categories = cats.map((cat) => ({
    ...cat,
    items: items.filter((item) => item.category_id === cat.id),
  }));

  return (
    <ExpensesContent
      initialCategories={categories}
      settings={settingsResult.data}
      transactions={txResult.data ?? []}
      initialReceipts={receiptsResult.data ?? []}
      receiptTotalsByKey={receiptTotalsByKey}
    />
  );
}
