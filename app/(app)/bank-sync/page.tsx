import { createClient }      from "@/lib/supabase/server";
import { redirect }           from "next/navigation";
import { BankSyncContent }    from "./bank-sync-content";
import type { PlaidItem, PlaidTransaction } from "@/lib/types/database";

export default async function BankSyncPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [itemsResult, txResult, expItemsResult, expCatResult] = await Promise.all([
    // Connected bank accounts
    supabase
      .from("plaid_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),

    // All pending + recently-actioned transactions (last 500, newest first)
    supabase
      .from("plaid_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false })
      .limit(500),

    // Expense sub-categories (for category dropdown)
    supabase
      .from("expense_items")
      .select("id, key, title, category_id")
      .eq("user_id", user.id)
      .order("sort_order"),

    // Expense categories (for grouping the dropdown)
    supabase
      .from("expense_categories")
      .select("id, key, title, sort_order")
      .eq("user_id", user.id)
      .order("sort_order"),
  ]);

  return (
    <BankSyncContent
      items={(itemsResult.data ?? []) as PlaidItem[]}
      transactions={(txResult.data ?? []) as PlaidTransaction[]}
      expenseItems={expItemsResult.data ?? []}
      expenseCategories={expCatResult.data ?? []}
    />
  );
}
