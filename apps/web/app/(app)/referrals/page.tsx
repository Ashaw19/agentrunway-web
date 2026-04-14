import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReferralsContent } from "./referrals-content";
import { computeIsPro } from "@/lib/compute-is-pro";

export default async function ReferralsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("subscription_tier, subscription_status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const isPro =
    settings?.is_admin || await computeIsPro(supabase, user.id, settings);

  const { data: referrals } = await supabase
    .from("referrals")
    .select("*")
    .eq("user_id", user.id)
    .order("referral_date", { ascending: false })
    .limit(10000);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, address, date, status")
    .eq("user_id", user.id)
    .eq("status", "closed")
    .order("date", { ascending: false })
    .limit(500);

  return (
    <ReferralsContent
      referrals={referrals ?? []}
      transactions={transactions ?? []}
      isPro={isPro}
      userId={user.id}
    />
  );
}
