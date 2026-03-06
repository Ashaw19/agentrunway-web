import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ExpensesContent } from "./expenses-content";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [categoriesResult, itemsResult, settingsResult, txResult] = await Promise.all([
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
  ]);

  // Join items into their categories
  const categories = (categoriesResult.data ?? []).map((cat) => ({
    ...cat,
    items: (itemsResult.data ?? []).filter((item) => item.category_id === cat.id),
  }));

  return (
    <ExpensesContent
      initialCategories={categories}
      settings={settingsResult.data}
      transactions={txResult.data ?? []}
    />
  );
}
