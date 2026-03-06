import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileContent } from "./profile-content";
import { computeGCI } from "@/lib/types/database";

export const metadata = { title: "Profile — Agent Runway" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: settings }, { data: transactions }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed"),
  ]);

  // YTD stats
  const currentYear = new Date().getFullYear();
  const ytdTx = (transactions ?? []).filter((tx) =>
    tx.date.startsWith(String(currentYear)),
  );
  const ytdGCI = ytdTx.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const ytdDeals = ytdTx.length;
  const avgDeal = ytdDeals > 0 ? ytdGCI / ytdDeals : 0;
  const lifetimeDeals = (transactions ?? []).length;

  return (
    <ProfileContent
      email={user.email ?? ""}
      settings={settings}
      ytdGCI={ytdGCI}
      ytdDeals={ytdDeals}
      avgDeal={avgDeal}
      lifetimeDeals={lifetimeDeals}
    />
  );
}
