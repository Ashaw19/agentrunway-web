import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileContent } from "./profile-content";
import { computeGCI, type HistoryItem, type Transaction } from "@/lib/types/database";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: settings }, { data: transactions }, { data: historyData }, { data: orgMembership }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("date, sale_price, commission_pct, team_split_pct, gci_override")
      .eq("user_id", user.id)
      .eq("status", "closed"),
    supabase
      .from("history_items")
      .select("year, annual_gci")
      .eq("user_id", user.id)
      .order("year", { ascending: false }),
    supabase
      .from("organization_members")
      .select("role, status, joined_at, created_at, organizations(name)")
      .eq("user_id", user.id)
      .in("status", ["active", "pending"])
      .limit(1)
      .maybeSingle(),
  ]);

  // YTD stats — cast partial rows since computeGCI only needs these 5 fields
  type TxPartial = Pick<Transaction, "date" | "sale_price" | "commission_pct" | "team_split_pct" | "gci_override">;
  const txRows = (transactions ?? []) as TxPartial[];
  const currentYear = new Date().getFullYear();
  const ytdTx = txRows.filter((tx) => tx.date.startsWith(String(currentYear)));
  const ytdGCI = ytdTx.reduce((sum, tx) => sum + computeGCI(tx as Transaction), 0);
  const ytdDeals = ytdTx.length;
  const avgDeal = ytdDeals > 0 ? ytdGCI / ytdDeals : 0;
  const lifetimeDeals = txRows.length;
  const lifetimeGCI = txRows.reduce((sum, tx) => sum + computeGCI(tx as Transaction), 0);

  // Best year: compare history + current year
  const historyItems = (historyData ?? []) as HistoryItem[];
  const allYearGCIs = [
    ...historyItems.map((h) => ({ year: h.year, gci: h.annual_gci })),
    { year: currentYear, gci: ytdGCI },
  ].filter((y) => y.gci > 0);
  const bestYearEntry = allYearGCIs.sort((a, b) => b.gci - a.gci)[0] ?? null;

  // Shape org membership for display
  const orgInfo = orgMembership
    ? {
        orgName: (orgMembership.organizations as unknown as { name: string })?.name ?? "Unknown",
        role: orgMembership.role as string,
        status: orgMembership.status as string,
        memberSince: orgMembership.joined_at ?? orgMembership.created_at,
      }
    : null;

  return (
    <ProfileContent
      email={user.email ?? ""}
      settings={settings}
      ytdGCI={ytdGCI}
      ytdDeals={ytdDeals}
      avgDeal={avgDeal}
      lifetimeDeals={lifetimeDeals}
      lifetimeGCI={lifetimeGCI}
      historyItems={historyItems}
      bestYear={bestYearEntry}
      orgInfo={orgInfo}
    />
  );
}
