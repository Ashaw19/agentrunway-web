import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AltimeterContent } from "./altimeter-content";
import type { HistoryItem } from "@/lib/types/database";
import { CREA_BOARDS, fetchBoardData, type LocalMarketData } from "@/lib/crea-board";

export default async function AltimeterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dashYear = new Date().getFullYear();

  const [txResult, pipelineResult, settingsResult, historyResult] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${dashYear}-01-01`)
        .order("date", { ascending: false }),
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("history_items")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false }),
    ]);

  // Fetch live CREA board data if the user has selected a board
  let boardMarketData: LocalMarketData | null = null;
  const boardCode = settingsResult.data?.board_code ?? "";
  if (boardCode) {
    const board = CREA_BOARDS.find((b) => b.slug === boardCode);
    if (board) {
      try {
        boardMarketData = await fetchBoardData(board);
      } catch {
        // Board data is non-critical — continue without it
      }
    }
  }

  return (
    <AltimeterContent
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      settings={settingsResult.data}
      historyItems={(historyResult.data ?? []) as HistoryItem[]}
      boardMarketData={boardMarketData}
      boardSubregion={settingsResult.data?.board_subregion ?? ""}
      subscriptionTier={settingsResult.data?.subscription_tier ?? "starter"}
    />
  );
}
