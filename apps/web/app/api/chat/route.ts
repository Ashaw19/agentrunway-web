import { streamText } from "ai";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { AGENT_RUNWAY_VOICE } from "@/lib/outreach-prompts";
import { requirePro } from "@/lib/require-pro";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";
import {
  seasonalFractionElapsed,
  paceVsGoalPercent,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  dailyPaceRequired,
  daysRemaining,
  dayOfYear,
  trendDirection,
  currentQuarter as getCurrentQuarter,
} from "@agent-runway/core/engines/projection-engine";
import { survivalResult, type SurvivalResult } from "@agent-runway/core/engines/survival-engine";
import { compute as computeRunwayScore, type RunwayScoreResult } from "@agent-runway/core/engines/runway-score-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { calculate as calculateTax, type CanadianTaxResult } from "@agent-runway/core/engines/canadian-tax-engine";
import { compare as benchmarkCompare, COHORT_LABELS, type BenchmarkResult } from "@agent-runway/core/engines/benchmark-engine";
import { probabilityBands, type ProbabilityBands } from "@agent-runway/core/engines/probabilistic-forecast-engine";
import { computeWhereYouStand, BAND_LABELS, MOMENTUM_LABELS, type WhereYouStandResult } from "@agent-runway/core/engines/where-you-stand-engine";
import {
  computeBaselines,
  detectAllDeviations,
  experienceTier,
  deviationPromptFragment,
} from "@agent-runway/core/engines/deviation-engine";
import { generateInsights, type Insight } from "@agent-runway/core/engines/insights-engine";
import { CREA_BOARDS, fetchBoardData, computeMarketMomentum } from "@/lib/crea-board";
import { generateTeamComparativeInsights } from "@agent-runway/core/engines";
import { classifyTopic, classifyTopicMulti, PAGE_TO_TOPICS, TOPIC_ACTION_LINKS, type TroubleshootingTopic } from "@/lib/troubleshooting-classifier";
import { getPlaybooks } from "@/lib/troubleshooting-playbooks";
import { buildDiagnostics } from "@/lib/chat-diagnostics";
import { logChatAnalytics, countTopicFollowUps } from "@/lib/chat-analytics";
import { models, heliconeHeaders, anthropic } from "@/lib/ai/provider";
import { selectModelTier } from "@/lib/ai/router";
import { buildPromptParts, injectCanary, scanAndRedactPII } from "@/lib/ai/security";
import { fetchMemories, addMemory } from "@/lib/ai/memory";
import { createAgentTools } from "@/lib/ai/tools";
import type { Province, Transaction as CoreTransaction, ContactActivity } from "@agent-runway/core/types/database";

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  // ── 1. Auth guard ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── 2. Rate limit: 30 AI messages per 60-minute window ──────────────────
  const rl = await checkRateLimit(user.id, "chat", 30, 60);
  if (!rl.allowed) {
    return new Response("Too many requests. Please wait before sending more messages.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  // ── 3. Config guard ──────────────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "AI assistant is not configured yet. Please add your ANTHROPIC_API_KEY to Vercel environment variables.",
      { status: 503 },
    );
  }

  const { messages, currentPage } = await req.json();

  if (!Array.isArray(messages)) {
    return new Response("Invalid request body", { status: 400 });
  }

  // Sanitize currentPage to a plain path segment — prevents prompt injection
  const safePage = typeof currentPage === "string"
    ? currentPage.replace(/[^a-z0-9/\-_]/gi, "").slice(0, 64)
    : "";

  // ── 4. Topic classification — route to relevant troubleshooting playbook ─
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const matchedTopics = classifyTopicMulti(String(latestUserMessage));
  let topTopics: TroubleshootingTopic[] = matchedTopics.slice(0, 2).map((m) => m.topic);

  // Enhancement #5: Sticky topic context — if current message is vague but
  // recent messages had a strong topic, carry that topic forward. This handles
  // follow-ups like "what about the pipeline part?" after asking about runway score.
  if (topTopics.length === 0) {
    const userMessages = messages.filter((m: { role: string }) => m.role === "user").reverse();
    for (const prevMsg of userMessages.slice(1, 4)) {
      const prevTopics = classifyTopicMulti(String(prevMsg.content));
      if (prevTopics.length > 0) {
        topTopics = prevTopics.slice(0, 2).map((m) => m.topic);
        break;
      }
    }
  }

  // Enhancement #1: Page-aware auto-injection — if classifier found nothing
  // (or only weak matches), use the current page as a topic signal.
  if (topTopics.length === 0 && safePage) {
    const pageTopics = PAGE_TO_TOPICS[safePage];
    if (pageTopics) {
      topTopics = pageTopics.slice(0, 2);
    }
  }

  const isTroubleshooting = topTopics.length > 0;

  // Enhancement #4: Escalation detection — if user has 4+ follow-ups on
  // the same topic, they're likely stuck. We'll inject escalation guidance.
  const preFollowUps = countTopicFollowUps(
    messages.filter((m: { role: string }) => m.role === "user" || m.role === "assistant"),
    classifyTopic,
    topTopics[0] ?? "general",
  );
  const isEscalation = preFollowUps >= 4;

  // Start memory fetch in parallel with everything else — non-blocking, graceful no-op if not configured
  const memoriesPromise = fetchMemories(user.id, String(latestUserMessage));

  // Build troubleshooting context (playbooks + live diagnostics) in parallel with financial context
  let troubleshootingContext = "";
  const troubleshootingPromise = isTroubleshooting
    ? (async () => {
        const [playbooks, diagnostics] = await Promise.all([
          Promise.resolve(getPlaybooks(topTopics)),
          buildDiagnostics(user.id, topTopics),
        ]);
        troubleshootingContext = playbooks + diagnostics;
      })()
    : Promise.resolve();

  // ── 5. Build financial context server-side (never trust client-provided data) ─
  let financialContext = "No user data available.";
  try {
    const currentYear = new Date().getFullYear();
    const [{ data: settings }, { data: transactions }, { data: pipeline }, { data: expenseCategories }, { count: staleClientCount }, { count: staleClientCount14 }, { data: receiptRows }] =
      await Promise.all([
        supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
        supabase.from("transactions").select("date, sale_price, commission_pct, team_split_pct, gci_override").eq("user_id", user.id).eq("status", "closed"),
        supabase.from("pipeline_deals").select("estimated_price, estimated_commission_pct, probability_override, stage").eq("user_id", user.id),
        supabase.from("expense_categories").select("expense_items(ytd_amount, monthly_recurring)").eq("user_id", user.id),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("archived_at", null).in("status", ["boarding", "in_flight"]).lt("last_contact_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("archived_at", null).in("status", ["boarding", "in_flight"]).lt("last_contact_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from("receipt_expenses").select("total_amount").eq("user_id", user.id).gte("expense_date", `${new Date().getFullYear()}-01-01`),
      ]);

    if (settings && transactions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ytdTx = transactions.filter((tx: any) => tx.date.startsWith(String(currentYear)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ytdGCI = ytdTx.reduce((sum: number, tx: any) => sum + computeGCI(tx), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineWeighted = (pipeline ?? []).reduce((sum: number, d: any) => sum + computeWeightedGCI(d), 0);
      // Match dashboard expense logic: Math.max(receiptTotal, monthlyRecurring * monthsElapsed)
      const receiptTotal = (receiptRows ?? []).reduce(
        (sum: number, r: { total_amount?: number | string | null }) => sum + Number(r.total_amount ?? 0), 0,
      );
      const monthlyRecurring = (expenseCategories ?? []).reduce(
        (sum: number, cat: { expense_items?: { monthly_recurring?: number | string }[] }) =>
          sum + (cat.expense_items ?? []).reduce((s: number, i: { monthly_recurring?: number | string }) => s + Number(i.monthly_recurring ?? 0), 0),
        0,
      );
      const expNow = new Date();
      const expMonthsElapsed = expNow.getMonth() + (expNow.getDate() / 30);
      const recurringYTDEstimate = monthlyRecurring * expMonthsElapsed;
      const expensesYTD = Math.max(receiptTotal, recurringYTDEstimate);
      const splitMatch = settings.split_preset?.match(/p(\d+)_(\d+)/);
      const splitLabel = splitMatch ? `${splitMatch[1]}% agent / ${splitMatch[2]}% brokerage` : settings.split_preset;
      // Pace vs goal is computed in the engine outputs section below using
      // agent-specific seasonal weights (matching dashboard). Removed the
      // duplicate computation here that used settings.seasonal_weights directly
      // (often null/flat), which could produce a conflicting pace percentage.

      // ── Board comparison (same engine as dashboard "Your Pace" card) ──
      let boardPaceLabel: string | null = null;
      const boardCode = settings.board_code ?? "";
      if (boardCode) {
        try {
          const board = CREA_BOARDS.find((b) => b.slug === boardCode);
          if (board) {
            const { data: historyRows } = await supabase
              .from("history_items")
              .select("year, annual_tx, annual_gci")
              .eq("user_id", user.id);
            const boardData = await fetchBoardData(board);
            if (boardData) {
              const mm = computeMarketMomentum(boardCode, ytdTx.length, ytdGCI, boardData, historyRows ?? [], currentYear);
              if (mm.avgDealsPerAgentPerYear != null && mm.agentAnnualizedDeals != null) {
                const ratio = mm.avgDealsPerAgentPerYear > 0 ? mm.agentAnnualizedDeals / mm.avgDealsPerAgentPerYear : 0;
                const label = ratio >= 1.15 ? "above" : ratio <= 0.85 ? "below" : "at";
                boardPaceLabel = `Board Comparison (${mm.boardName}): You're on pace for ~${mm.agentAnnualizedDeals} deals/yr, which is ${ratio.toFixed(1)}× the average agent on your board (~${mm.avgDealsPerAgentPerYear.toFixed(1)} deals/yr). You are ${label} the board average.${mm.boardSalesYoYPct != null ? ` Board market trend: ${mm.boardSalesYoYPct >= 0 ? "+" : ""}${mm.boardSalesYoYPct.toFixed(0)}% YoY.` : ""}`;
              }
            }
          }
        } catch {
          // Non-critical — board data may be temporarily unavailable
        }
      }

      financialContext = [
        `Current Year: ${currentYear}`,
        `YTD GCI: ${fmtCurrency(ytdGCI)}`,
        `Closed Deals YTD: ${ytdTx.length}`,
        ytdTx.length > 0 ? `Average Deal GCI: ${fmtCurrency(ytdGCI / ytdTx.length)}` : null,
        boardPaceLabel,
        `Pipeline (Probability-Weighted GCI, deal-stage only): ${fmtCurrency(pipelineWeighted)} across ${pipeline?.length ?? 0} active deals`,
        `Note: Pipeline figure above includes deal-stage pipeline only. Listing appointments and early-stage buyers are tracked separately on the Pipeline page.`,
        `Province: ${settings.province}`,
        `Commission Split: ${splitLabel}`,
        settings.monthly_brokerage_fee > 0 ? `Monthly Brokerage Fee: ${fmtCurrency(settings.monthly_brokerage_fee)}` : null,
        settings.tx_fee_rate_pct > 0 ? `Transaction Fee Rate: ${(settings.tx_fee_rate_pct * 100).toFixed(1)}%${settings.tx_fee_annual_cap > 0 ? ` (cap: ${fmtCurrency(settings.tx_fee_annual_cap)}/yr)` : ""}` : null,
        `Cash Reserve: ${fmtCurrency(settings.cash_reserve ?? 0)}`,
        settings.goal_gci > 0 ? `Annual GCI Goal: ${fmtCurrency(settings.goal_gci)}` : "Annual GCI Goal: Not set",
        settings.experience_years != null ? `Years of Experience: ${settings.experience_years}` : null,
        expensesYTD > 0 ? `YTD Business Expenses: ${fmtCurrency(expensesYTD)}` : null,
        monthlyRecurring > 0 ? `Monthly Recurring Expenses: ${fmtCurrency(monthlyRecurring)}` : null,
        staleClientCount14 != null && staleClientCount14 > 0 ? `Stale Clients (14+ days, dashboard threshold): ${staleClientCount14}` : null,
        staleClientCount != null && staleClientCount > 0 ? `Stale Clients (30+ days, CRM threshold): ${staleClientCount}` : null,
      ].filter(Boolean).join("\n");

      // ── Compute engine outputs (parallel, fault-tolerant) ──────────────
      // These give the AI the same pre-computed numbers the dashboard shows,
      // preventing it from doing its own (potentially wrong) math.
      try {
        // Fetch additional data needed by some engines (activities + history)
        const [{ data: activities }, { data: historyItems }] = await Promise.all([
          supabase
            .from("contact_activities")
            .select("id, user_id, client_id, type, description, activity_date, created_at")
            .eq("user_id", user.id),
          supabase
            .from("history_items")
            .select("year, annual_tx, annual_gci, quarter_gci")
            .eq("user_id", user.id),
        ]);

        // ── Compute agent-specific seasonal weights (same logic as dashboard) ──
        // This ensures the AI uses the same seasonality as the dashboard projection card.
        const agentSeasonalWeights = (() => {
          const withData = (historyItems ?? []).filter((h: Record<string, unknown>) =>
            (h.quarter_gci as number[] | null)?.some((v: number) => (v ?? 0) > 0),
          );
          if (withData.length < 2) return null;
          const avgQ = [0, 1, 2, 3].map((q) =>
            withData.reduce((sum: number, h: Record<string, unknown>) =>
              sum + (((h.quarter_gci as number[])?.[q]) ?? 0), 0) / withData.length,
          );
          const total = avgQ.reduce((a, b) => a + b, 0);
          return total > 0 ? avgQ.map((v) => v / total) : null;
        })();

        const engineSeasonalWeights = agentSeasonalWeights
          ?? (settings.use_national_seasonality
            ? (settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
            : [0.25, 0.25, 0.25, 0.25]);
        const engineFraction = seasonalFractionElapsed(engineSeasonalWeights);
        const seasonalSource = agentSeasonalWeights ? "agent (5-yr pattern)" : settings.use_national_seasonality ? "national" : "default";

        // Cast transactions to the shape engines expect
        const txForEngines = (transactions ?? []).map((tx: Record<string, unknown>) => ({
          ...tx,
          status: "closed" as const,
        })) as unknown as CoreTransaction[];
        const ytdTxForEngines = txForEngines.filter(
          (tx) => tx.date.startsWith(String(currentYear)),
        );

        // Shared computations
        const avgDealGCI = ytdTx.length > 0 ? ytdGCI / ytdTx.length : 0;
        const pipelineCount = pipeline?.length ?? 0;
        const remaining = daysRemaining();
        const elapsedDays = dayOfYear();

        // 1. Projection Engine — uses engineFraction (agent-specific seasonal weights)
        const projGCI = projectedYearEndGCI(
          ytdGCI, pipelineWeighted, engineFraction, settings.goal_gci ?? 0,
        );
        const projDeals = projectedYearEndTransactions(
          ytdTx.length, pipelineCount, engineFraction,
        );
        const trend = trendDirection(txForEngines);
        const dailyPace = settings.goal_gci > 0
          ? dailyPaceRequired(settings.goal_gci, ytdGCI, remaining)
          : 0;

        // Also compute a naive (non-seasonal) projection so AI can contrast
        const naiveFraction = Math.max(dayOfYear() / 365, 0.01);
        const naiveProjection = ytdGCI / naiveFraction;

        // 2. Survival Engine — include pipeline income same as dashboard
        const pipelineMonthlyEst = engineFraction > 0 ? (pipelineWeighted * 0.5) / 12 : 0;
        const survival: SurvivalResult = survivalResult(
          settings.monthly_brokerage_fee ?? 0,
          monthlyRecurring,
          settings.cash_reserve ?? 0,
          pipelineMonthlyEst,
        );

        // 3. Health Report + Runway Score Engine
        const healthReport = buildHealthReport(
          ytdGCI, settings.goal_gci ?? 0, engineFraction, pipelineWeighted, expensesYTD,
        );

        // 4. Benchmark Engine
        const benchmark: BenchmarkResult = benchmarkCompare(
          projGCI, settings.experience_years ?? null,
        );

        // 5. Runway Score (composite)
        const runwayScore: RunwayScoreResult = computeRunwayScore(
          healthReport, benchmark.percentile, survival.months,
        );

        // 6. Canadian Tax Engine — projected net income after expenses
        const splitMatch2 = settings.split_preset?.match(/p(\d+)_(\d+)/);
        const agentPct = splitMatch2 ? Number(splitMatch2[1]) / 100 : 1;
        const annualizedExpenses = engineFraction > 0 ? expensesYTD / engineFraction : expensesYTD;
        const projectedNetIncome = Math.max(0, projGCI * agentPct - annualizedExpenses);
        const taxResult: CanadianTaxResult = calculateTax(
          projectedNetIncome,
          (settings.province ?? "ontario") as Province,
          projDeals,
        );

        // 7. Probabilistic Forecast Engine
        const bands: ProbabilityBands = probabilityBands(
          txForEngines, projGCI, engineFraction,
        );

        // 8. Board / Market Momentum for Where You Stand
        let marketMomentumForWYS: Parameters<typeof computeWhereYouStand>[0]["marketMomentum"] = null;
        const boardCode2 = settings.board_code ?? "";
        if (boardCode2) {
          try {
            const board = CREA_BOARDS.find((b) => b.slug === boardCode2);
            if (board) {
              const boardData = await fetchBoardData(board);
              if (boardData) {
                const mm = computeMarketMomentum(
                  boardCode2, ytdTx.length, ytdGCI, boardData, historyItems ?? [], currentYear,
                );
                marketMomentumForWYS = mm;
              }
            }
          } catch {
            // Non-critical
          }
        }

        // 9. Where You Stand Engine
        const cohort = benchmark.cohort;
        const hasPriorYear = (historyItems ?? []).some(
          (h: { year: number; annual_gci: number }) => h.year < currentYear && h.annual_gci > 0,
        );
        const wysResult: WhereYouStandResult = computeWhereYouStand({
          ytdGCI,
          ytdDealCount: ytdTx.length,
          projectedGCI: projGCI,
          avgDealGCI: avgDealGCI,
          goalGCI: settings.goal_gci ?? 0,
          fraction: engineFraction,
          benchmark,
          marketMomentum: marketMomentumForWYS,
          experienceYears: settings.experience_years ?? null,
          cohort,
          hasPriorYearData: hasPriorYear,
          currentQuarter: getCurrentQuarter(),
        });

        // 10. Deviation Engine
        const tier = experienceTier(settings.experience_years);
        const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
        const currentMonthlyGCI = ytdGCI / monthsElapsed;
        const currentMonthlyDeals = ytdTx.length / monthsElapsed;
        const currentExpenseRatio = ytdGCI > 0 ? expensesYTD / ytdGCI : 0;

        // Count activities for current period
        const currentMonthlyTouchpoints = (activities ?? []).length / Math.max(1, monthsElapsed);

        const baselines = computeBaselines(
          txForEngines,
          (activities ?? []) as unknown as ContactActivity[],
          monthlyRecurring,
          currentMonthlyGCI,
        );
        const deviations = detectAllDeviations(
          baselines,
          currentMonthlyGCI,
          currentMonthlyDeals,
          currentExpenseRatio,
          currentMonthlyTouchpoints,
        );
        const deviationFragment = deviationPromptFragment(deviations, tier);

        // 11. Insights Engine
        const insights: Insight[] = generateInsights({
          transactions: txForEngines,
          pipelineDeals: (pipeline ?? []).map((d: Record<string, unknown>) => ({
            ...d,
            probability_override: d.probability_override as number | null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any,
          goalGCI: settings.goal_gci ?? 0,
          seasonalWeights: engineSeasonalWeights,
          expensesYTD,
          monthlyRecurringExpenses: monthlyRecurring,
          capIsConfigured: false,
          hasHitCap: false,
          gciRemainingToCap: 0,
          postCapAgentPct: 0,
          estimatedCapMonth: null,
          forecastReadiness: settings.goal_gci > 0 ? 0.8 : 0.2,
          historyItems: (historyItems ?? []) as { year: number; annual_tx: number; annual_gci: number }[],
          runwayScore: runwayScore.score,
          runwayGrade: runwayScore.grade,
          runwayWeakestLabel: healthReport.weakestLabel,
        }, 5);

        // ── Build computed outputs context string ──────────────────────────
        const engineLines: string[] = [
          "",
          "── COMPUTED ENGINE OUTPUTS (use these exact figures, do not recalculate) ──",
          `Seasonality Source: ${seasonalSource}`,
          `Seasonal Fraction Elapsed: ${(engineFraction * 100).toFixed(1)}% of year's expected production`,
          `Projected Year-End GCI: ${fmtCurrency(projGCI)} (uses ${seasonalSource} seasonal weighting)`,
          `Without Seasonality (naive linear): ${fmtCurrency(naiveProjection)}`,
          `Projected Year-End Deals: ${projDeals}`,
          `Pace Status: ${(() => { const ep = settings.goal_gci > 0 ? paceVsGoalPercent(settings.goal_gci, ytdGCI, engineFraction) : pacePercent; return `${ep >= 0 ? "+" : ""}${Math.round(ep)}% ${ep >= 0 ? "ahead of" : "behind"} seasonal pace`; })()}`,
          `Trend: ${trend === "up" ? "Up" : trend === "down" ? "Down" : "Flat"}`,
          settings.goal_gci > 0 ? `Daily Pace Needed: ${fmtCurrency(dailyPace)}/day to hit goal (${remaining} days remaining)` : null,
          "",
          `Runway Score: ${runwayScore.score}/100 (Grade: ${runwayScore.grade})`,
          ...runwayScore.components.map((c) => `  - ${c.label}: ${c.score}/100 (weight: ${c.weight})`),
          "",
          // Expense data completeness context — helps AI judge if expense score is realistic
          (() => {
            const expenseItemCount = (expenseCategories ?? []).reduce(
              (sum: number, cat: { expense_items?: unknown[] }) => sum + (cat.expense_items ?? []).length, 0,
            );
            const catWithItems = (expenseCategories ?? []).filter(
              (cat: { expense_items?: unknown[] }) => (cat.expense_items ?? []).length > 0,
            ).length;
            const expenseRatio = ytdGCI > 0 ? (expensesYTD / ytdGCI * 100) : 0;
            const lines = [
              `Expense Data: ${fmtCurrency(expensesYTD)} YTD across ${expenseItemCount} items in ${catWithItems} categories (expense-to-GCI ratio: ${expenseRatio.toFixed(1)}%)`,
              `  Typical Canadian real estate agent expense ratio: 25-35% of GCI`,
            ];
            if (ytdGCI > 0 && expenseRatio < 20) {
              lines.push(`  ⚠ Expense ratio (${expenseRatio.toFixed(1)}%) is unusually low — likely indicates incomplete expense tracking, not actual low costs. Most agents have desk fees, insurance, marketing, vehicle, MLS dues, and other costs. Gently note this to the user.`);
            }
            return lines.join("\n");
          })(),
          "",
          `Survival: ${survival.label} (Risk: ${survival.riskLevel === "notConfigured" ? "Not Configured" : survival.riskLevel.charAt(0).toUpperCase() + survival.riskLevel.slice(1)}, includes pipeline income estimate)`,
          survival.monthlyBurn > 0 ? `  Monthly Burn: ${fmtCurrency(survival.monthlyBurn)}` : null,
          "",
          `Tax Estimates (${settings.business_structure ?? "sole proprietor"}, ${settings.province}):`,
          `  - Projected Net Self-Employment Income: ${fmtCurrency(projectedNetIncome)}`,
          `  - Effective Rate: ${(taxResult.effectiveRate * 100).toFixed(1)}%`,
          `  - Total Tax + CPP Burden: ${fmtCurrency(taxResult.totalBurden)}`,
          projDeals > 0 ? `  - Per-Deal Set-Aside: ${fmtCurrency(taxResult.perDealSetAside)}` : null,
          `  - Quarterly Instalment: ${fmtCurrency(taxResult.quarterlyEstimate)}`,
          "",
          `Benchmark: ${benchmark.percentile}th percentile in ${COHORT_LABELS[benchmark.cohort]} cohort${settings.experience_years != null ? ` (${settings.experience_years} years experience)` : ""}`,
          benchmark.distanceToNextTier != null && benchmark.nextTierLabel
            ? `  Distance to ${benchmark.nextTierLabel}: ${fmtCurrency(benchmark.distanceToNextTier)} more projected GCI`
            : null,
          "",
          "Probability Bands (year-end GCI):",
          `  - Pessimistic (P25): ${fmtCurrency(bands.p25)}`,
          `  - Base (P50): ${fmtCurrency(bands.p50)}`,
          `  - Optimistic (P75): ${fmtCurrency(bands.p75)}`,
          `  - Confidence: ${bands.confidence} (${bands.monthsOfData} months of data)`,
          "",
          `Where You Stand: ${wysResult.bandLabel} — ${wysResult.identityLine}`,
          `Momentum: ${wysResult.momentumLabel}${wysResult.momentumDetail ? ` — ${wysResult.momentumDetail}` : ""}`,
          wysResult.distanceLine ? `Next Tier: ${wysResult.distanceLine}` : null,
          wysResult.diagnosisLine ? `Diagnosis: ${wysResult.diagnosisLine}` : null,
        ];

        // Deviation fragment (only included if deviations exist)
        if (deviationFragment) {
          engineLines.push("", deviationFragment);
        }

        // Top insights
        if (insights.length > 0) {
          engineLines.push("", "Top Insights:");
          insights.forEach((ins, i) => {
            engineLines.push(`${i + 1}. [${ins.type.toUpperCase()}] ${ins.title}: ${ins.message}`);
          });
        }

        engineLines.push("── END COMPUTED ENGINE OUTPUTS ──");

        financialContext += "\n\n" + engineLines.filter(Boolean).join("\n");
      } catch (engineErr) {
        // Engine computation is non-critical — the AI still has raw financial data
        log.warn({ err: engineErr }, "[chat] Engine computation failed, continuing with raw data");
      }
    }

    // ── Team context (if user belongs to an org) ────────────────────────
    const { data: membership } = await supabase
      .from("organization_members")
      .select("org_id, role, organizations(name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membership?.org_id) {
      const [{ data: teamPerf }, { data: activityData }] = await Promise.all([
        supabase
          .from("org_agent_performance")
          .select("user_id, agent_name, role, ytd_gci, deal_count, pipeline_count, pipeline_value, goal_gci")
          .eq("org_id", membership.org_id),
        supabase.rpc("fn_org_crm_activity_summary", { p_org_id: membership.org_id }),
      ]);

      if (teamPerf && teamPerf.length > 1) {
        const leader = teamPerf.find(
          (m) => m.role === "owner" || m.role === "team_leader"
        );
        const leaderName = leader?.agent_name?.split(" ")[0] ?? "your team lead";
        const orgData = membership.organizations as unknown as { name: string } | { name: string }[] | null;
        const teamName = (Array.isArray(orgData) ? orgData[0]?.name : orgData?.name) ?? "your team";

        const avgGci    = teamPerf.reduce((s, m) => s + (m.ytd_gci ?? 0), 0) / teamPerf.length;
        const avgDeals  = teamPerf.reduce((s, m) => s + (m.deal_count ?? 0), 0) / teamPerf.length;
        const avgPipeline = teamPerf.reduce((s, m) => s + (m.pipeline_count ?? 0), 0) / teamPerf.length;
        const avgPipelineValue = teamPerf.reduce((s, m) => s + (m.pipeline_value ?? 0), 0) / teamPerf.length;

        // Find this user's row in the team view
        const myRow = teamPerf.find((m) => m.user_id === user.id);
        const myActivity = (activityData ?? []).find((a: { user_id: string }) => a.user_id === user.id);
        const avgTouchpoints = activityData && (activityData as { total_activities: number }[]).length > 0
          ? (activityData as { total_activities: number }[]).reduce((s, a) => s + (a.total_activities ?? 0), 0) / (activityData as unknown[]).length
          : 0;

        financialContext += `\n\nTEAM CONTEXT (${teamName}, ${teamPerf.length} agents):
Team Leader: ${leaderName}
Team Avg YTD GCI: ${fmtCurrency(avgGci)}
Team Avg Closed Deals: ${Math.round(avgDeals)}
Team Avg Pipeline Deals: ${Math.round(avgPipeline)}
IMPORTANT: When comparing this agent to team averages, always reference ${leaderName} by name (not "team lead" or "your manager"). Suggest discussions with ${leaderName} when coaching opportunities arise.`;

        // ── T5: Team comparative insights ─────────────────────────────────
        if (myRow) {
          const dayOfYear = Math.floor(
            (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
          );
          const seasonalFraction = Math.max(dayOfYear / 365, 0.01);

          const comparativeInsights = generateTeamComparativeInsights({
            agent: {
              ytd_gci:        myRow.ytd_gci ?? 0,
              deal_count:     myRow.deal_count ?? 0,
              pipeline_count: myRow.pipeline_count ?? 0,
              pipeline_value: myRow.pipeline_value ?? 0,
              goal_gci:       myRow.goal_gci ?? null,
              expense_ratio:  null, // Tier 3 — not exposed
              ytd_touchpoints: myActivity?.total_activities ?? 0,
            },
            team: {
              avg_ytd_gci:        avgGci,
              avg_deal_count:     avgDeals,
              avg_pipeline_count: avgPipeline,
              avg_pipeline_value: avgPipelineValue,
              avg_expense_ratio:  null,
              avg_ytd_touchpoints: avgTouchpoints,
              member_count:       teamPerf.length,
            },
            leaderFirstName: leaderName,
            teamName,
            seasonalFraction,
          }, 3);

          if (comparativeInsights.length > 0) {
            financialContext += `\n\nTEAM COMPARATIVE INSIGHTS (pre-computed — surface these when relevant):\n` +
              comparativeInsights
                .map((i) => `[${i.severity.toUpperCase()}] ${i.title}: ${i.message}`)
                .join("\n");
          }
        }
      }
    }
  } catch {
    financialContext = "Business data temporarily unavailable.";
  }

  // Wait for troubleshooting context and memories to finish building
  const [memoriesText] = await Promise.all([memoriesPromise, troubleshootingPromise]);

  // Prepend remembered facts about this agent to the financial context
  if (memoriesText) {
    financialContext = `REMEMBERED ABOUT THIS AGENT (from past conversations — use to personalize responses):\n${memoriesText}\n\n---\n\n` + financialContext;
  }

  // Strip any system-role messages from the client — only user/assistant allowed.
  // Cap each message to 4000 chars and limit total conversation to ~200K chars.
  // Claude's 1M context is much larger than Groq's 128K — we can keep more history.
  const MAX_CONVERSATION_CHARS = 200_000;
  const filtered = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  // Keep the most recent messages that fit within the budget
  let totalChars = 0;
  let startIdx = filtered.length;
  for (let i = filtered.length - 1; i >= 0; i--) {
    totalChars += filtered[i].content.length;
    if (totalChars > MAX_CONVERSATION_CHARS) break;
    startIdx = i;
  }
  const safeMessages = filtered.slice(startIdx);

  const pageContext = safePage
    ? `\nThe user is currently viewing the "${safePage.replace(/^\//, "")}" page. Prioritize answers relevant to what they're looking at.`
    : "";

  // ── 6. Build troubleshooting injection ───────────────────────────────────
  // Enhancement #3: Build deep link references for the matched topics
  const actionLinks = topTopics
    .flatMap((t) => TOPIC_ACTION_LINKS[t] ?? [])
    .filter((link, i, arr) => arr.findIndex((l) => l.href === link.href) === i); // dedupe
  const deepLinksBlock = actionLinks.length > 0
    ? `\nRELEVANT PAGE LINKS (use these in your response when suggesting the user take action):
${actionLinks.map((l) => `- [${l.label}](${l.href})`).join("\n")}
When suggesting fixes, include the relevant link in markdown format so the user can navigate directly.`
    : "";

  // Enhancement #4: Escalation block when user is stuck
  const escalationBlock = isEscalation
    ? `\n\nESCALATION DETECTED: The user has asked ${preFollowUps}+ follow-up questions on this topic and may be stuck.
Instead of another explanation, provide:
1. A structured summary of what you've diagnosed so far
2. The specific data points that seem unusual
3. 2-3 concrete actions they can take right now
4. A note: "If this still doesn't look right, reach out to support@agentrunway.com with this summary and we'll investigate your account directly."
Keep your tone supportive, not defensive.`
    : "";

  const troubleshootingInjection = troubleshootingContext
    ? `\n\n--- TOPIC-SPECIFIC TROUBLESHOOTING GUIDE ---
The user's message matched these topics: [${topTopics.join(", ")}].
Use the following playbook(s) and diagnostic data to give a precise, data-backed answer.
When explaining calculations, walk through the steps using THEIR numbers from the diagnostic data.
If their numbers reveal the cause of their issue, name it directly.
${deepLinksBlock}
${troubleshootingContext}${escalationBlock}
--- END TROUBLESHOOTING GUIDE ---`
    : "";


  // ── 6b. Model routing — select tier based on topic + message complexity ──
  const { tier, model: selectedModel } = selectModelTier(
    topTopics,
    String(latestUserMessage),
    isTroubleshooting,
  );

  // Dynamic max_tokens: troubleshooting needs more room, complex tier gets more
  const maxTokens = isTroubleshooting ? 1200 : tier === "complex" ? 1000 : 600;

  // ── 7. Build system prompt (XML-structured, cache-optimized) ─────────────
  // Static content FIRST (cached at 90% discount), dynamic content LAST
  const identity = `You are an AI business assistant for a Canadian real estate agent using Agent Runway — a financial analytics platform.

Important: All outputs you generate are estimates for informational purposes only. You do not provide financial, tax, or legal advice. Always remind users to consult their accountant or professional advisor for decisions.`;

  const guidelines = `CORE GUIDELINES:
- Answer questions clearly and concisely (3-5 sentences unless a breakdown is requested)
- Cite specific numbers from the business data when relevant — always prefer their actual figures over generic statements
- Give actionable, specific observations tailored to Canadian real estate agents
- When users ask about platform features, metrics, or terms, explain them accurately using the knowledge base
- When discussing taxes, always remind the user that these are estimates only — NOT professional tax advice. Recommend consulting a qualified Canadian accountant or tax professional for tax decisions. Never tell users to claim specific deductions or file specific forms.
- Speak in a direct, expert tone — like a knowledgeable business tool, not a chatbot
- If you don't have enough data to answer precisely, say so and suggest what data to add
- Keep responses short and scannable. Prefer bullet points over long paragraphs.
${isTroubleshooting ? "- TROUBLESHOOTING MODE: Walk through the relevant calculation step-by-step using the user's actual numbers from the diagnostic data. Name the specific cause if visible. Suggest the specific fix." : ""}

PROACTIVE INSIGHTS:
When the agent's data shows any of these patterns, surface them naturally in your response — not as alarms, but as observations worth noting:
- Use the "Pace vs Annual Goal" and "Board Comparison" data provided — do NOT calculate your own pace or market position. When discussing the agent's pace, reference their position relative to the average agent on their board (the "Your Pace" metric on their dashboard). If pace vs goal is significantly negative, mention it and suggest pipeline review
- Expense ratio above 35% → flag it and offer to dig into the cause
- Stale active clients (30+ days no contact) exist → suggest Flight Control outreach sweep
- Pipeline is thin relative to goal → recommend adding pipeline deals or outreach
- Cash / survival runway under 3 months → treat as urgent, name it clearly
- If they're close to hitting their annual goal → acknowledge momentum positively

IMPORTANT: On the very first message from the agent, if their data shows a notable pattern (behind pace, high expenses, stale clients), proactively open with that insight rather than waiting to be asked. Frame it conversationally: "Looking at your numbers, I noticed..." Proactively surface notable patterns and data points.

IMPORTANT: Use the Computed Engine Outputs section in the business data as your source of truth for projections, scores, tax estimates, benchmarks, probability bands, and insights. Do not recalculate these figures — they come from the platform's specialized engines (seasonal models, multi-bracket tax calculations, cohort benchmarking). You may explain the methodology or add qualitative context, but always reference the engine-computed numbers. If the Computed Engine Outputs section is not present, fall back to the raw financial data above.

WRITE ACTIONS — You have tools to act on the agent's behalf:
- When an agent tells you they contacted, met, or interacted with a client → call logContactActivity (search for the client first with searchClients)
- When an agent mentions a client's status should change → call updateClientStatus
- When an agent shares new client details (budget change, timeframe, financing) → call updateClientDetails
- When an agent adds information about a client → call updateClientNotes
- When a deal stage changes → call updatePipelineDealStage (search for deal first with searchPipelineDeals)
- When a deal's probability, value, or close date changes → call the relevant update tool
- When an agent mentions logging an expense → call logExpense (returns preview, confirm before executing)
- When an agent mentions a closed transaction/commission → call recordTransaction (returns preview, confirm before executing)
- When an agent revises their annual GCI goal → call updateGCIGoal
- ALWAYS search first (searchClients or searchPipelineDeals) before taking any action — never guess IDs
- For confirm-required tools: when confirmed is false you receive a preview string — present it naturally ("I'm about to record... does that look right?") then call again with confirmed: true after their "yes"
- After completing an action, briefly acknowledge what you did and follow up with a relevant insight if one exists`;

  // ── Build prompt parts (static cached prefix + dynamic per-request suffix) ─
  // Static part: identity + knowledge_base + guidelines + voice_guide
  //   → marked with cache_control: ephemeral → Anthropic caches at 90% token discount
  // Dynamic part: agent_data + troubleshooting + page_context + rules_reminder
  //   → changes per user/request, never cached
  const { staticPart, dynamicPart } = buildPromptParts({
    identity,
    knowledgeBase: KNOWLEDGE_BASE,
    guidelines,
    financialContext,
    troubleshooting: troubleshootingInjection || undefined,
    pageContext: pageContext || undefined,
    voiceGuide: AGENT_RUNWAY_VOICE,
  });

  // Full concatenated string for Groq fallback (Groq doesn't support cache_control)
  const systemPrompt = `${staticPart}\n\n${injectCanary(dynamicPart)}`;

  // Array format for Claude — static portion marked for caching
  const systemForClaude = [
    {
      type: "text" as const,
      text: staticPart,
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    {
      type: "text" as const,
      text: injectCanary(dynamicPart),
    },
  ];


  try {
    // ── 8. Stream response via Vercel AI SDK ────────────────────────────────
    // Primary: Claude (selected tier) via Anthropic
    // Fallback: Groq Llama if Anthropic fails
    const abortController = new AbortController();
    const abortTimeout = setTimeout(() => abortController.abort(), 30_000);

    let result;
    try {
      result = streamText({
        model: selectedModel,
        // Cache-optimised system: static prefix marked ephemeral (90% token discount on hits),
        // dynamic suffix with user data and canary sent uncached per-request.
        system: systemForClaude,
        messages: safeMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        // Tools:
        // - webSearch: Anthropic-native search (server-side, CA locale)
        // - agent write tools: CRM, pipeline, expense, transaction actions
        // maxSteps: allows tool calls + follow-up response in the same stream.
        tools: {
          webSearch: anthropic.tools.webSearch_20260209({
            maxUses: 3,
            userLocation: {
              type: "approximate",
              country: "CA",
              timezone: "America/Toronto",
            },
          }),
          ...createAgentTools(supabase, user.id),
        },
        maxSteps: 10,
        maxTokens,
        temperature: 0.7,
        abortSignal: abortController.signal,
        headers: heliconeHeaders({
          userId: user.id,
          feature: "chat",
          sessionId: requestId,
        }),
        onFinish: ({ text }) => {
          // Store this exchange to Mem0 — fire-and-forget, never blocks the response
          addMemory(user.id, [
            { role: "user", content: String(latestUserMessage) },
            { role: "assistant", content: text },
          ]).catch(() => {});
        },
      });
    } catch (primaryError) {
      // Fallback to Groq if Anthropic fails
      log.warn({ err: primaryError, tier, requestId }, "[chat] Claude failed, falling back to Groq");
      if (process.env.GROQ_API_KEY) {
        result = streamText({
          model: models.fallback,
          system: systemPrompt,
          messages: safeMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          maxTokens,
          temperature: 0.7,
          abortSignal: abortController.signal,
        });
      } else {
        throw primaryError;
      }
    }

    clearTimeout(abortTimeout);

    // ── 9. Log analytics (fire-and-forget — never blocks response) ─────────
    const userMsgCount = safeMessages.filter((m) => m.role === "user").length;
    logChatAnalytics(supabase, {
      userId: user.id,
      message: String(latestUserMessage),
      primaryTopic: topTopics[0] ?? "general",
      secondaryTopic: topTopics[1] ?? null,
      classifierScore: matchedTopics[0]?.score ?? 0,
      hadDiagnostics: troubleshootingContext.includes("["),
      hadPlaybook: isTroubleshooting,
      followUpCount: preFollowUps,
      sessionMessageCount: userMsgCount,
      currentPage: safePage || null,
      wasEscalation: isEscalation,
    }).catch(() => {}); // Swallow errors — analytics must never break chat

    // Return as plain text stream (compatible with existing frontend reader)
    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "X-AI-Model-Tier": tier,
      },
    });
  } catch (error) {
    log.error({ err: error, requestId }, "[chat] AI service error");
    return new Response("AI service temporarily unavailable. Please try again.", { status: 500 });
  }
}
