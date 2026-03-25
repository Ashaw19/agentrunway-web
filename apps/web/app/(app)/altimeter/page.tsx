import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AltimeterContent } from "./altimeter-content";
import type { HistoryItem, Transaction, PipelineDeal } from "@/lib/types/database";
import { CREA_BOARDS, fetchBoardData, type LocalMarketData } from "@/lib/crea-board";
import { isSandboxActive, getSandboxData, mergeSandboxSettings } from "@/lib/sandbox-resolver";

export default async function AltimeterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dashYear = new Date().getFullYear();

  // Always fetch settings first — needed to determine sandbox mode
  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  let transactions: Transaction[] = [];
  let pipelineDeals: PipelineDeal[] = [];
  let settings = settingsResult.data;
  let historyItems: HistoryItem[] = [];

  if (isSandboxActive(settings)) {
    // ── Sandbox mode: use embedded demo data ──
    const sandbox = getSandboxData(settings);
    transactions = sandbox.transactions ?? [];
    pipelineDeals = sandbox.pipelineDeals ?? [];
    historyItems = (sandbox.historyItems ?? []) as HistoryItem[];
    settings = mergeSandboxSettings(settings);
  } else {
    // ── Live mode: query Supabase ──
    const [txResult, pipelineResult, historyResult] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${dashYear}-01-01`)
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
    ]);

    transactions = txResult.data ?? [];
    pipelineDeals = pipelineResult.data ?? [];
    historyItems = (historyResult.data ?? []) as HistoryItem[];
  }

  // Fetch live CREA board data if the user has selected a board
  // (always real — external market data, not sandboxed)
  let boardMarketData: LocalMarketData | null = null;
  const boardCode = settings?.board_code ?? "";
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
      transactions={transactions}
      pipelineDeals={pipelineDeals}
      settings={settings}
      historyItems={historyItems}
      boardMarketData={boardMarketData}
      boardSubregion={settings?.board_subregion ?? ""}
      subscriptionTier={settings?.subscription_tier ?? "starter"}
    />
  );
}
