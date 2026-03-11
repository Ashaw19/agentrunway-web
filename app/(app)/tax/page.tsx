import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TaxContent } from "./tax-content";

export default async function TaxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const year = new Date().getFullYear();

  const [settingsResult, txResult, itemsResult, ccaResult, receiptTotalsResult] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("date", `${year}-01-01`),
    supabase
      .from("expense_items")
      .select("key, monthly_recurring")
      .eq("user_id", user.id),
    supabase
      .from("t2125_cca_assets")
      .select("*")
      .eq("user_id", user.id)
      .order("acquisition_date"),
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${year}-01-01`),
  ]);

  // Build expense amounts: receipts YTD + recurring projected to year-end
  const now = new Date();
  const monthsElapsed = now.getMonth() + (now.getDate() / 30); // approximate
  const monthsRemaining = Math.max(0, 12 - monthsElapsed);

  // Aggregate receipt totals per key
  const receiptTotalsByKey: Record<string, number> = {};
  for (const r of receiptTotalsResult.data ?? []) {
    if (r.category_key && r.total_amount != null) {
      receiptTotalsByKey[r.category_key] =
        (receiptTotalsByKey[r.category_key] ?? 0) + Number(r.total_amount);
    }
  }

  // Combine: YTD receipts + projected recurring for remaining months
  const expenseAmounts: Record<string, number> = { ...receiptTotalsByKey };
  for (const item of itemsResult.data ?? []) {
    if (item.monthly_recurring > 0) {
      expenseAmounts[item.key] =
        (expenseAmounts[item.key] ?? 0) + item.monthly_recurring * monthsRemaining;
    }
  }

  return (
    <TaxContent
      settings={settingsResult.data}
      transactions={txResult.data ?? []}
      expenseAmounts={expenseAmounts}
      ccaAssets={ccaResult.data ?? []}
      taxYear={year}
      userId={user.id}
    />
  );
}
