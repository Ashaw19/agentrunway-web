import { streamText, stepCountIs } from "ai";
import { NextRequest } from "next/server";

export const maxDuration = 120;
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { buildPersonaPrefix } from "@/lib/flight-crew/system-prompts";
import { DEFAULT_PERSONA, type Persona } from "@/lib/flight-crew/personas";
import { CANONICAL_TAX_DISCLAIMER } from "@/lib/flight-crew/constants";
import {
  flightCrewEnabled,
  navigatorEnabled,
  dispatcherEnabled,
} from "@/lib/flags";
import { AGENT_RUNWAY_VOICE } from "@/lib/outreach-prompts";
import { requirePro } from "@/lib/require-pro";
import { computeGCI, computeWeightedGCI, computeAgentGross, computeTxFees } from "@/lib/types/database";
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
import { computeCashPosition, type CashPositionResult } from "@agent-runway/core/engines/cash-position-engine";
import {
  computePipelineMonthlyIncome,
  computeProjectedNetForTax,
} from "@agent-runway/core/engines/effective-cash";
import { compute as computeRunwayScore, type RunwayScoreResult } from "@agent-runway/core/engines/runway-score-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { calculate as calculateTax, type CanadianTaxResult, gstHstRate, gstHstLabel } from "@agent-runway/core/engines/canadian-tax-engine";
import { computeHSTCollected } from "@agent-runway/core/engines/hst-engine";
import { compare as benchmarkCompare, COHORT_LABELS, type BenchmarkResult } from "@agent-runway/core/engines/benchmark-engine";
import { probabilityBands, type ProbabilityBands } from "@agent-runway/core/engines/probabilistic-forecast-engine";
import { computeWhereYouStand, type WhereYouStandResult } from "@agent-runway/core/engines/where-you-stand-engine";
import {
  computeBaselines,
  detectAllDeviations,
  experienceTier,
  deviationPromptFragment,
} from "@agent-runway/core/engines/deviation-engine";
import { generateInsights, type Insight } from "@agent-runway/core/engines/insights-engine";
import { totalRecurringMonthly, totalRecurringYTD, totalRecurringHSTYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import { getCurrentFilingPeriod, deadlineUrgency } from "@agent-runway/core/engines/filing-period-engine";

import type { RecurringExpense, FilingFrequency } from "@/lib/types/database";
import { generateTeamComparativeInsights } from "@agent-runway/core/engines";
import { classifyTopic, classifyTopicMulti, PAGE_TO_TOPICS, TOPIC_ACTION_LINKS, type TroubleshootingTopic } from "@/lib/troubleshooting-classifier";
import { getPlaybooks } from "@/lib/troubleshooting-playbooks";
import { buildDiagnostics } from "@/lib/chat-diagnostics";
import { logChatAnalytics, countTopicFollowUps } from "@/lib/chat-analytics";
import { models, heliconeHeaders, TASK_BUDGETS_BETA_HEADER } from "@/lib/ai/provider";
import { selectModelTier } from "@/lib/ai/router";
import { buildPromptParts, injectCanary, validateNavigatorOutput } from "@/lib/ai/security";
import { fetchMemories, addMemory } from "@/lib/ai/memory";
import { createPersonaAgentTools, NEEDS_APPROVAL_TOOLS, APPROVAL_DESCRIPTIONS } from "@/lib/ai/tools";
import type { Province, Transaction as CoreTransaction, ContactActivity } from "@agent-runway/core/types/database";

/** Returns a safe user-facing message for AI stream errors without leaking internal details. */
function safeUserErrorMessage(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("rate limit") || d.includes("429")) return "⚠️ The AI is currently busy. Please wait a moment and try again.";
  if (d.includes("overloaded") || d.includes("503")) return "⚠️ The AI service is temporarily overloaded. Please try again shortly.";
  if (d.includes("context length") || d.includes("too long") || d.includes("token")) return "⚠️ Your conversation is too long for the AI to process. Try starting a new chat.";
  if (d.includes("content policy") || d.includes("safety")) return "⚠️ The AI declined to respond to this request.";
  if (d.includes("timeout") || d.includes("timed out")) return "⚠️ The AI took too long to respond. Please try again.";
  return "⚠️ Something went wrong with the AI. Please try again.";
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  // ── 1. Auth guard ────────────────────────────────────────────────────────
  // Cookie-based auth (web) is the primary path. Mobile clients (Expo) hit
  // this same endpoint with a `Authorization: Bearer <access_token>` header
  // — fall back to admin-client token validation when no cookie session is
  // present. Mobile uses the admin client only for `auth.getUser(token)`;
  // subsequent DB reads continue to flow through `supabase` (cookie client)
  // for the web path, and through a token-scoped client for the mobile path
  // so RLS still applies.
  // See `memory/project_mobile_parity_audit_2026-05-26.md` gap #1.
  const cookieClient = await createClient();
  // eslint-disable-next-line prefer-const
  let { data: { user } } = await cookieClient.auth.getUser();
  // Use the broader @supabase/supabase-js SupabaseClient type since both the
  // cookie-based (@supabase/ssr) client and the bearer-scoped JS client
  // implement the same query surface (.from / .rpc / .auth.getUser).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: SupabaseClient = cookieClient as any;

  if (!user) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const accessToken = authHeader.slice(7);
      const admin = createAdminClient();
      const { data: { user: bearerUser } } = await admin.auth.getUser(accessToken);
      if (bearerUser) {
        user = bearerUser;
        // Token-scoped client: RLS evaluated as the authenticated user, not
        // service-role. Matches the pattern used by /api/mobile/* routes —
        // subsequent .from() reads respect the same row-level policies the
        // cookie path enforces.
        supabase = createJsClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${accessToken}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );
      }
    }
  }

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
      "Flight Crew is not configured yet. Please add your ANTHROPIC_API_KEY to Vercel environment variables.",
      { status: 503 },
    );
  }

  let parsedBody: { messages?: unknown; currentPage?: unknown; persona?: unknown };
  try {
    parsedBody = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }
  const { messages, currentPage, persona: personaRaw } = parsedBody;

  if (!Array.isArray(messages)) {
    return new Response("Invalid request body", { status: 400 });
  }

  // Flight Crew: validate persona, default to Captain for legacy clients
  // that don't send the field.
  const requestedPersona: Persona =
    personaRaw === "captain" || personaRaw === "navigator" || personaRaw === "dispatcher"
      ? personaRaw
      : DEFAULT_PERSONA;

  // ── Flight Crew feature flags: graceful degradation to Captain ──────────
  // Evaluate the three Flight Crew flags (master + per-persona). Any
  // persona-gating flag that's false silently downgrades that persona's
  // request to Captain — no error surfaced to the user. `flightCrewEnabled`
  // is a master kill-switch: when false, every request becomes Captain.
  // Flags are evaluated server-side via the Flags SDK; defaults are `true`,
  // so if the provider is unreachable we fail open (Flight Crew stays on).
  const [crewOn, navOn, dispatchOn] = await Promise.all([
    flightCrewEnabled().catch(() => true),
    navigatorEnabled().catch(() => true),
    dispatcherEnabled().catch(() => true),
  ]);

  let persona: Persona = requestedPersona;
  if (!crewOn) {
    persona = "captain";
  } else if (requestedPersona === "navigator" && !navOn) {
    persona = "captain";
  } else if (requestedPersona === "dispatcher" && !dispatchOn) {
    persona = "captain";
  }

  if (persona !== requestedPersona) {
    // Sentry/log trail: we want visibility when a flag-driven downgrade fires.
    log.info(
      {
        requestId,
        userId: user.id,
        requested: requestedPersona,
        served: persona,
        reason: !crewOn ? "flight_crew_disabled" : `${requestedPersona}_disabled`,
      },
      "[chat] Flight Crew persona downgraded via feature flag",
    );
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
    const todayISO = new Date().toISOString().split("T")[0];
    const ytdStart = `${new Date().getFullYear()}-01-01`;
    const settled = await Promise.allSettled([
        supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),                                                                  // 0
        supabase.from("transactions").select("date, sale_price, commission_pct, team_split_pct, gci_override").eq("user_id", user.id).eq("status", "closed"), // 1
        supabase.from("pipeline_deals").select("estimated_price, estimated_commission_pct, probability_override, stage").eq("user_id", user.id),       // 2
        supabase.from("expense_categories").select("key, expense_items(key, ytd_amount, monthly_recurring)").eq("user_id", user.id),                   // 3
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("archived_at", null).in("status", ["boarding", "in_flight"]).lt("last_contact_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()), // 4
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("archived_at", null).in("status", ["boarding", "in_flight"]).lt("last_contact_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()), // 5
        supabase.from("receipt_expenses").select("total_amount").eq("user_id", user.id).gte("expense_date", ytdStart),                                 // 6
        supabase.from("recurring_expenses").select("*").eq("user_id", user.id).eq("is_active", true),                                                  // 7
        supabase.from("receipt_expenses").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("expense_date", ytdStart),            // 8
        supabase.from("receipt_expenses").select("total_amount, tax_amount, category_key, expense_date").eq("user_id", user.id).gte("expense_date", ytdStart), // 9
        // ── Phase 2 context injection queries ──
        supabase.from("contact_tasks").select("id, title, due_date, priority, client_id").eq("user_id", user.id).is("completed_at", null).order("due_date", { ascending: true }).limit(10), // 10: open tasks
        supabase.from("outreach_queue").select("id, status", { count: "exact", head: false }).eq("user_id", user.id).in("status", ["draft", "ready"]),  // 11: pending outreach
        supabase.from("mileage_logs").select("km, deduction").eq("user_id", user.id).gte("trip_date", ytdStart),                                       // 12: YTD mileage
        supabase.from("referrals").select("direction, status, actual_fee_paid, estimated_value").eq("user_id", user.id).gte("referral_date", ytdStart), // 13: YTD referrals
        supabase.from("t2125_cca_assets").select("description, cca_class, original_cost, opening_ucc").eq("user_id", user.id),                            // 14: CCA assets
        supabase.from("listing_appointments").select("id, property_address, status, appointment_date, client_id").eq("user_id", user.id).in("status", ["scheduled", "active"]).order("appointment_date", { ascending: true }).limit(10), // 15: upcoming listing appointments
        supabase.from("property_showings").select("id, property_address, showing_date, client_id, client_rating").eq("user_id", user.id).gte("showing_date", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]).order("showing_date", { ascending: false }).limit(10), // 16: recent property showings
      ]);
    // Safely extract results — individual query failures won't kill the entire chat
    const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === "fulfilled" ? r.value : fallback;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emptyResult = { data: null, count: null } as any;
    const { data: settings } = val(settled[0], emptyResult);
    const { data: transactions } = val(settled[1], emptyResult);
    const { data: pipeline } = val(settled[2], emptyResult);
    const { data: expenseCategories } = val(settled[3], emptyResult);
    const { count: staleClientCount } = val(settled[4], emptyResult);
    const { count: staleClientCount14 } = val(settled[5], emptyResult);
    const { data: receiptRows } = val(settled[6], emptyResult);
    const { data: recurringExpRows } = val(settled[7], emptyResult);
    const { count: receiptCount } = val(settled[8], emptyResult);
    const { data: receiptDetailsRows } = val(settled[9], emptyResult);
    const { data: openTasksRows } = val(settled[10], emptyResult);
    const { data: outreachRows } = val(settled[11], emptyResult);
    const { data: mileageRows } = val(settled[12], emptyResult);
    const { data: referralRows } = val(settled[13], emptyResult);
    const { data: ccaRows } = val(settled[14], emptyResult);
    const { data: listingApptRows } = val(settled[15], emptyResult);
    const { data: showingRows } = val(settled[16], emptyResult);
    const recurringExps = (recurringExpRows ?? []) as RecurringExpense[];
    const recurringExpMonthly = totalRecurringMonthly(recurringExps);
    const recurringExpYTDTotal = totalRecurringYTD(recurringExps);

    if (settings && transactions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ytdTx = transactions.filter((tx: any) => tx.date.startsWith(String(currentYear)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ytdGCI = ytdTx.reduce((sum: number, tx: any) => sum + computeGCI(tx), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineWeighted = (pipeline ?? []).reduce((sum: number, d: any) => sum + computeWeightedGCI(d), 0);
      // Match dashboard expense logic: Math.max(receiptTotal, legacyRecurring * monthsElapsed) + recurringExpYTD
      const receiptTotal = (receiptRows ?? []).reduce(
        (sum: number, r: { total_amount?: number | string | null }) => sum + Number(r.total_amount ?? 0), 0,
      );
      const legacyMonthlyRecurring = (expenseCategories ?? []).reduce(
        (sum: number, cat: { expense_items?: { monthly_recurring?: number | string }[] }) =>
          sum + (cat.expense_items ?? []).reduce((s: number, i: { monthly_recurring?: number | string }) => s + Number(i.monthly_recurring ?? 0), 0),
        0,
      );
      const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
      const expNow = new Date();
      const expMonthsElapsed = expNow.getMonth() + (expNow.getDate() / 30);
      const legacyRecurringYTDEstimate = legacyMonthlyRecurring * expMonthsElapsed;
      const expensesYTD = Math.max(receiptTotal, legacyRecurringYTDEstimate) + recurringExpYTDTotal;
      const splitMatch = settings.split_preset?.match(/p(\d+)_(\d+)/);
      const splitLabel = splitMatch ? `${splitMatch[1]}% agent / ${splitMatch[2]}% brokerage` : settings.split_preset;
      // Pace vs goal is computed in the engine outputs section below using
      // agent-specific seasonal weights (matching dashboard). Removed the
      // duplicate computation here that used settings.seasonal_weights directly
      // (often null/flat), which could produce a conflicting pace percentage.

      // ── Setup gap detection (post-onboarding) ──
      const setupGaps: string[] = [];
      if (!settings.vehicle_business_use_pct || Number(settings.vehicle_business_use_pct) === 0)
        setupGaps.push("Vehicle business-use % is at 0% — mileage deductions won't calculate");
      if (!settings.home_office_business_use_pct || Number(settings.home_office_business_use_pct) === 0)
        setupGaps.push("Home office % is not set — missing potential deduction");
      if ((ccaRows ?? []).length === 0)
        setupGaps.push("No CCA assets tracked — business equipment isn't being depreciated");
      if ((recurringExpRows ?? []).length === 0)
        setupGaps.push("No recurring expenses set up — monthly subscriptions like MLS fees aren't being tracked");
      if (!(transactions ?? []).some((tx: Record<string, unknown>) => !String(tx.date).startsWith(String(currentYear))))
        setupGaps.push("No historical transactions — year-over-year comparison and personal records need past data (import at /history)");
      const ytdMileageKm = (mileageRows ?? []).reduce((s: number, t: { km: number }) => s + Number(t.km), 0);
      if (ytdMileageKm === 0)
        setupGaps.push("No mileage logged YTD — driving to showings/meetings is a CRA-deductible expense");

      financialContext = [
        `Current Year: ${currentYear}`,
        `YTD GCI: ${fmtCurrency(ytdGCI)}`,
        `Closed Deals YTD: ${ytdTx.length}`,
        ytdTx.length > 0 ? `Average Deal GCI: ${fmtCurrency(ytdGCI / ytdTx.length)}` : null,
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
        // ── Phase 2: Additional context from new queries ──
        (() => {
          const tasks = (openTasksRows ?? []) as { id: string; title: string; due_date: string; priority: string }[];
          if (tasks.length === 0) return null;
          const overdue = tasks.filter(t => t.due_date < todayISO).length;
          const upcoming = tasks.slice(0, 3).map(t => `"${t.title}" (due ${t.due_date}${t.priority === "high" ? " ⚡" : ""})`).join(", ");
          return `Open Tasks: ${tasks.length} open${overdue > 0 ? ` (${overdue} overdue)` : ""}. Next: ${upcoming}`;
        })(),
        (() => {
          const items = (outreachRows ?? []) as { status: string }[];
          if (items.length === 0) return null;
          const drafts = items.filter(i => i.status === "draft").length;
          const ready = items.filter(i => i.status === "ready").length;
          return `Outreach Queue: ${drafts} drafts, ${ready} ready to send`;
        })(),
        (() => {
          const trips = (mileageRows ?? []) as { km: number; deduction: number }[];
          if (trips.length === 0) return null;
          const totalKm = trips.reduce((s, t) => s + Number(t.km), 0);
          const totalDed = trips.reduce((s, t) => s + Number(t.deduction), 0);
          return `Mileage YTD: ${totalKm.toFixed(0)} km across ${trips.length} trips — ${fmtCurrency(totalDed)} deduction`;
        })(),
        (() => {
          const refs = (referralRows ?? []) as { direction: string; status: string; actual_fee_paid: number | null; estimated_value: number | null }[];
          if (refs.length === 0) return null;
          const inbound = refs.filter(r => r.direction === "inbound").length;
          const outbound = refs.filter(r => r.direction === "outbound").length;
          const feesPaid = refs.reduce((s, r) => s + Number(r.actual_fee_paid ?? 0), 0);
          return `Referrals YTD: ${inbound} inbound, ${outbound} outbound${feesPaid > 0 ? `, ${fmtCurrency(feesPaid)} in fees` : ""}`;
        })(),
        (() => {
          const assets = (ccaRows ?? []) as { description: string; cca_class: string; original_cost: number; opening_ucc: number }[];
          if (assets.length === 0) return null;
          const totalUCC = assets.reduce((s, a) => s + Number(a.opening_ucc), 0);
          return `CCA Assets: ${assets.length} asset${assets.length > 1 ? "s" : ""}, ${fmtCurrency(totalUCC)} undepreciated capital cost`;
        })(),
        (() => {
          const appts = (listingApptRows ?? []) as { id: string; property_address: string; status: string; appointment_date: string }[];
          if (appts.length === 0) return null;
          const upcoming = appts.map(a => `"${a.property_address}" (${a.appointment_date}, ${a.status})`).join(", ");
          return `Upcoming Listing Appointments: ${appts.length} — ${upcoming}`;
        })(),
        (() => {
          const shows = (showingRows ?? []) as { id: string; property_address: string; showing_date: string; client_rating: number | null }[];
          if (shows.length === 0) return null;
          const topRated = shows.filter(s => s.client_rating != null).sort((a, b) => (b.client_rating ?? 0) - (a.client_rating ?? 0))[0];
          return `Recent Showings (14 days): ${shows.length} showing${shows.length > 1 ? "s" : ""}${topRated ? `. Highest rated: "${topRated.property_address}" at ${topRated.client_rating}/5` : ""}`;
        })(),
        // Setup gaps (post-onboarding)
        setupGaps.length > 0 ? `\n[SETUP GAPS — incomplete profile items]:\n${setupGaps.map(g => `  • ${g}`).join("\n")}` : null,
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
            .select("year, annual_tx, annual_gci, annual_expenses, quarter_gci")
            .eq("user_id", user.id),
        ]);

        // Zero-data guard — on a brand-new account, the engines would emit a
        // wall of misleading zeros ("0% of goal", "D grade", "$0 projected
        // year-end"). Skip engine computation entirely and inject a clear
        // onboarding hint so the AI knows to welcome the user instead of
        // reciting a deficit.
        const hasEngineData =
          (transactions ?? []).length > 0 ||
          (pipeline ?? []).length > 0 ||
          (historyItems ?? []).length > 0 ||
          expensesYTD > 0;
        if (!hasEngineData) {
          financialContext +=
            "\n\n── ACCOUNT STATE ──\n" +
            "This user has no business activity logged yet (no closed transactions, no pipeline deals, no history, no expenses). " +
            "Do not cite goal %, projections, runway score, benchmark percentile, or survival figures — those are all meaningless without data. " +
            "Welcome them, explain what Agent Runway can do for them, and guide them toward logging their first transaction or importing history.";
          throw new Error("ZERO_DATA_SKIP_ENGINES"); // jump to catch block cleanly
        }

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

        // national_quarter_pcts may be stored as percentages [25,25,25,25] or fractions [0.25,...].
        // Normalize to fractions (sum ≈ 1) for the engine.
        const rawNationalPcts = settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
        const nationalWeights = (() => {
          const sum = rawNationalPcts.reduce((a: number, b: number) => a + b, 0);
          if (sum > 2) return rawNationalPcts.map((v: number) => v / sum); // stored as percentages, normalize
          return rawNationalPcts; // already fractions
        })();
        const engineSeasonalWeights = agentSeasonalWeights
          ?? (settings.use_national_seasonality ? nationalWeights : [0.25, 0.25, 0.25, 0.25]);
        const engineFraction = seasonalFractionElapsed(engineSeasonalWeights);
        const seasonalSource = agentSeasonalWeights ? "agent (5-yr pattern)" : settings.use_national_seasonality ? "national" : "default";

        // Cast transactions to the shape engines expect
        const txForEngines = (transactions ?? []).map((tx: Record<string, unknown>) => ({
          ...tx,
          status: "closed" as const,
        })) as unknown as CoreTransaction[];
        const _ytdTxForEngines = txForEngines.filter(
          (tx) => tx.date.startsWith(String(currentYear)),
        );

        // Shared computations
        const avgDealGCI = ytdTx.length > 0 ? ytdGCI / ytdTx.length : 0;
        const pipelineCount = pipeline?.length ?? 0;
        const remaining = daysRemaining();
        const _elapsedDays = dayOfYear();

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

        // 2. Canadian Tax Engine — projected net income after expenses.
        // Moved above survival because cashPosition below needs ytdTaxSetAside.
        // agentPct is still used downstream (HST withholding example strings).
        const splitMatch2 = settings.split_preset?.match(/p(\d+)_(\d+)/);
        const agentPct = splitMatch2 ? Number(splitMatch2[1]) / 100 : 1;
        // D-2 fix (Audit 1 2026-04-22): replaced old inline formula
        // `projGCI * agentPct - (expensesYTD / engineFraction)` with canonical
        // helper. Old formula ignored tx fees + monthly brokerage × 12, and
        // double-applied season scaling via `expensesYTD / engineFraction`.
        // This now matches dashboard-content.tsx:596-603 exactly.
        const projectedNetIncome = computeProjectedNetForTax({
          projectedGCI: projGCI,
          expensesYTD,
          monthlyRecurring,
          settings,
        });
        const taxResult: CanadianTaxResult = calculateTax(
          projectedNetIncome,
          (settings.province ?? "ontario") as Province,
          projDeals,
        );

        // 3. Cash Position Engine — implied business cash from YTD activity.
        // CRITICAL: must mirror dashboard-content.tsx:615-634 exactly so chat
        // and dashboard never disagree on the Survival/Runway Score inputs.
        // Prior bug: chat passed settings.cash_reserve (raw manual field) into
        // survivalResult, while dashboard passed cashPosition.effectiveCash.
        // That let Survival swing from 95/100 (strong) on the dashboard to
        // 25/100 (critical) in Captain's answer for the same agent, same
        // moment — then Captain gave alarmist "build up your buffer" advice
        // on a wrong number. See feedback_data_consistency_protocol.md.
        const now = new Date();
        const hstRateValue = gstHstRate((settings.province ?? "ontario") as Province);
        // D-4 fix (Audit 1 2026-04-22): canonical HST helper. Previous inline
        // formula `ytdGCI * hstRate` missed the `brokerageWithholdsHst` case
        // (when the brokerage collects and remits, the agent's cash-flow view
        // is $0 collected). `computeHSTCollected` returns 0 when
        // !registered OR brokerage withholds. See hst-engine.ts.
        const ytdHstCollected = computeHSTCollected({
          ytdGCI,
          hstRate: hstRateValue,
          isRegistered: settings.gst_hst_registered || !!settings.business_number,
          brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
        });
        const ytdHstOnExpenses = settings.gst_hst_paid_on_expenses
          ? expensesYTD * (hstRateValue / (1 + hstRateValue))
          : 0;
        const { agentGross: cpAgentGross } = computeAgentGross(
          ytdGCI,
          settings.split_preset,
          settings.post_cap_threshold_gci,
          settings.post_cap_agent_pct,
          settings.post_cap_brokerage_pct,
        );
        const cpTxFees = computeTxFees(ytdGCI, settings.tx_fee_rate_pct, settings.tx_fee_annual_cap);
        const cpBrokerageFees = (settings.monthly_brokerage_fee ?? 0) * (now.getMonth() + 1);
        const cpYtdAgentNet = Math.max(0, cpAgentGross - cpTxFees - cpBrokerageFees);
        const cashPosition: CashPositionResult = computeCashPosition({
          ytdGCI,
          ytdAgentNet: cpYtdAgentNet,
          ytdExpenses: expensesYTD,
          ytdTaxSetAside: taxResult.totalBurden * Math.min(engineFraction, 1),
          ytdHstCollected,
          ytdHstOnExpenses,
          brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
          manualCashReserve: settings.cash_reserve ?? 0,
          fractionElapsed: engineFraction,
        });

        // 4. Survival Engine — uses implied cash (cashPosition.effectiveCash),
        // NOT the raw cash_reserve field. Matches dashboard-content.tsx:637-642.
        // Pipeline monthly income via canonical helper (D-1, Audit 1 2026-04-22):
        // must match dashboard's weighted / remainingMonths formula — not the
        // pre-fix heuristic (pipelineWeighted * 0.5) / 12.
        const pipelineMonthlyEst = computePipelineMonthlyIncome(pipelineWeighted, engineFraction);
        const survival: SurvivalResult = survivalResult(
          settings.monthly_brokerage_fee ?? 0,
          monthlyRecurring,
          cashPosition.effectiveCash,
          pipelineMonthlyEst,
        );

        // 5. Health Report + Runway Score Engine
        const healthReport = buildHealthReport(
          ytdGCI, settings.goal_gci ?? 0, engineFraction, pipelineWeighted, expensesYTD,
        );

        // 6. Benchmark Engine
        const benchmark: BenchmarkResult = benchmarkCompare(
          projGCI, settings.experience_years ?? null,
        );

        // 7. Runway Score (composite) — now built from the same Survival input
        // the dashboard used, so the two surfaces return identical scores.
        const runwayScore: RunwayScoreResult = computeRunwayScore(
          healthReport, benchmark.percentile, survival.months,
        );

        // 7. Probabilistic Forecast Engine
        const bands: ProbabilityBands = probabilityBands(
          txForEngines, projGCI, engineFraction,
        );

        // 8. Where You Stand Engine
        // (Market-momentum input retired with the licensed market data layer.)
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
          marketMomentum: null,
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
          // Engine only reads year/annual_gci/annual_tx — wider HistoryItem fields
          // (id, user_id, quarter_gci, etc.) aren't needed here, so cast through unknown.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          historyItems: (historyItems ?? []) as any,
          runwayScore: runwayScore.score,
          runwayGrade: runwayScore.grade,
          runwayStateLabel: runwayScore.stateLabel,
          runwayWeakestLabel: healthReport.weakestLabel,
        }, 5);

        // ── Build computed outputs context string ──────────────────────────
        const engineLines: (string | null)[] = [
          "",
          "── COMPUTED ENGINE OUTPUTS (use these exact figures, do not recalculate) ──",
          `Seasonality Source: ${seasonalSource}`,
          `Seasonal Fraction Elapsed: ${(engineFraction * 100).toFixed(1)}% of year's expected production`,
          `Projected Year-End GCI: ${fmtCurrency(projGCI)} (uses ${seasonalSource} seasonal weighting)`,
          `Without Seasonality (naive linear): ${fmtCurrency(naiveProjection)}`,
          `Projected Year-End Deals: ${projDeals}`,
          `Pace Status: ${(() => { const ep = settings.goal_gci > 0 ? paceVsGoalPercent(settings.goal_gci, ytdGCI, engineFraction) : 0; return `${ep >= 0 ? "+" : ""}${Math.round(ep)}% ${ep >= 0 ? "ahead of" : "behind"} seasonal pace`; })()}`,
          `Trend: ${trend === "up" ? "Up" : trend === "down" ? "Down" : "Flat"}`,
          settings.goal_gci > 0 ? `Daily Pace Needed: ${fmtCurrency(dailyPace)}/day to hit goal (${remaining} days remaining)` : null,
          "",
          `Runway Score: ${runwayScore.score}/100 (${runwayScore.stateLabel})`,
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

        // ── Tax Intelligence Block ──────────────────────────────────────────
        // Pre-computed tax insights the Flight Crew can surface proactively.
        // Rule: NEVER encourage higher claims or suggest specific percentages
        // for vehicle/home-office business-use. Only promote responsible documentation.
        const taxIntelLines: (string | null)[] = [
          "",
          "── TAX INTELLIGENCE (surface these proactively when relevant) ──",
        ];

        // 1. Missing Deduction Detection — flag $0 categories likely to have real spend
        if (ytdTx.length >= 3) {
          const allItemKeys = new Set<string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (expenseCategories ?? []).forEach((cat: any) => {
            (cat.expense_items ?? []).forEach((item: { key: string; ytd_amount?: number | string; monthly_recurring?: number | string }) => {
              if (Number(item.ytd_amount ?? 0) > 0 || Number(item.monthly_recurring ?? 0) > 0) {
                allItemKeys.add(item.key);
              }
            });
          });
          // Also count recurring expenses by category
          recurringExps.forEach((re) => { if (re.category_key) allItemKeys.add(re.category_key); });

          const CORE_CATEGORIES: Record<string, string> = {
            vehicle: "Vehicle expenses (gas, insurance, lease)",
            marketing: "Marketing & advertising",
            office: "Office & technology",
            professional: "Professional fees (MLS, licensing, E&O)",
          };
          const missingCats: string[] = [];
          for (const [prefix, label] of Object.entries(CORE_CATEGORIES)) {
            const hasAny = [...allItemKeys].some((k) => k.startsWith(prefix));
            if (!hasAny) missingCats.push(label);
          }
          if (missingCats.length > 0) {
            taxIntelLines.push(
              `[MISSING DEDUCTIONS] Agent has ${ytdTx.length} closed deals YTD with $0 recorded in: ${missingCats.join(", ")}. ` +
              `CRA T2125 permits deductions in these categories when substantiated by receipts. ` +
              `State the data neutrally — describe the zero balance, cite T2125 categories, name no amounts.`,
            );
          }
        }

        // 2. Tax Installment Cash Flow Planning
        {
          const quarterlyInstalment = taxResult.quarterlyEstimate;
          const perDealSetAside = taxResult.perDealSetAside;
          const currentQ = getCurrentQuarter();
          const _nextInstalmentQ = currentQ < 4 ? currentQ + 1 : 1;
          const nextInstalmentLabel = currentQ === 1 ? "June 15" : currentQ === 2 ? "Sep 15" : currentQ === 3 ? "Dec 15" : "Mar 15";
          if (quarterlyInstalment > 500) {
            taxIntelLines.push(
              `[INSTALMENT PLANNING] Quarterly instalment estimate: ${fmtCurrency(quarterlyInstalment)}. ` +
              `Next CRA instalment date: ${nextInstalmentLabel}. ` +
              `Per-deal equivalent at current pace: ${fmtCurrency(perDealSetAside)}. ` +
              `${CANONICAL_TAX_DISCLAIMER}`,
            );
          }
        }

        // 3. GST/HST Refund vs. Owing Forecast
        {
          // D-4 fix (Audit 1 2026-04-22): replaced broken inline formula
          // `ytdGCI * agentPct * hstRate` with the canonical helper. HST is
          // charged on the full commission invoiced to the client — the
          // agent/brokerage split affects who collects, not the HST base.
          // Using the helper also eliminates the prior self-contradiction
          // where this block disagreed with the earlier `ytdHstCollected`
          // computation at ~line 538 in the same response. See hst-engine.ts.
          const filingFreq = (settings.filing_frequency ?? "quarterly") as FilingFrequency;
          const hstRateLocal = gstHstRate((settings.province ?? "ontario") as Parameters<typeof gstHstRate>[0]);
          const totalHSTCollected = computeHSTCollected({
            ytdGCI,
            hstRate: hstRateLocal,
            isRegistered: settings.gst_hst_registered || !!settings.business_number,
            brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
          });
          const receiptDetails = (receiptDetailsRows ?? []) as { total_amount?: number | null; tax_amount?: number | null; category_key?: string | null }[];
          const receiptITCs = receiptDetails.reduce((sum, r) => sum + Number(r.tax_amount ?? 0), 0);
          const recurringITCs = totalRecurringHSTYTD(recurringExps);
          const totalITCsClaimed = receiptITCs + recurringITCs;
          const netHST = totalHSTCollected - totalITCsClaimed;
          if (ytdGCI > 0) {
            const hstLabelLocal = gstHstLabel((settings.province ?? "ontario") as Parameters<typeof gstHstLabel>[0]);
            const contextLine = settings.brokerage_withholds_hst
              ? `Brokerage withholds ${hstLabelLocal} and remits to CRA — agent-side collected view is $0. ` +
                `The filing view (T2125 / GST34) still reports the collected amount on invoiced GCI — that's a filing matter, not a cash-flow one. `
              : !(settings.gst_hst_registered || !!settings.business_number)
                ? `Agent is not registered for ${hstLabelLocal}. CRA requires registration when taxable supplies exceed $30,000 over four consecutive calendar quarters. `
                : "";
            taxIntelLines.push(
              `[GST/HST FORECAST] ${contextLine}` +
              `Estimated ${hstLabelLocal} collected YTD: ~${fmtCurrency(totalHSTCollected)}. ` +
              `ITCs estimated from receipts: ${fmtCurrency(totalITCsClaimed)}. ` +
              `Estimated net ${netHST >= 0 ? "payable" : "refundable"}: ${fmtCurrency(Math.abs(netHST))}. ` +
              `Filing frequency: ${filingFreq}. ` +
              (receiptCount != null && receiptCount < ytdTx.length * 3
                ? `Receipt capture rate: ${receiptCount} receipts vs ${ytdTx.length} deals. Every business receipt may support an ITC. `
                : "") +
              `${CANONICAL_TAX_DISCLAIMER}`,
            );
          }
        }

        // 4. Expense Ratio Trend Warning (YoY comparison)
        {
          const currentRatio = ytdGCI > 0 ? expensesYTD / ytdGCI : 0;
          const priorYears = (historyItems ?? [])
            .filter((h: { year: number; annual_gci: number; annual_expenses?: number }) =>
              h.year < currentYear && h.annual_gci > 0)
            .sort((a: { year: number }, b: { year: number }) => b.year - a.year);
          if (priorYears.length > 0 && ytdGCI > 0) {
            const lastYear = priorYears[0] as { year: number; annual_gci: number; annual_expenses?: number };
            const priorRatio = lastYear.annual_gci > 0 && (lastYear.annual_expenses ?? 0) > 0
              ? (lastYear.annual_expenses ?? 0) / lastYear.annual_gci
              : null;
            if (priorRatio != null && currentRatio > priorRatio + 0.05) {
              taxIntelLines.push(
                `[EXPENSE TREND] Current expense ratio: ${(currentRatio * 100).toFixed(1)}%. ` +
                `Prior year (${lastYear.year}) expense ratio: ${(priorRatio * 100).toFixed(1)}%. ` +
                `Year-over-year delta: +${((currentRatio - priorRatio) * 100).toFixed(1)} percentage points. ` +
                `Describe the numerical change only — draw no qualitative judgment on the trend.`,
              );
            }
          }
        }

        // 5. Incorporation Decision Support
        if (projectedNetIncome > 50000 && (settings.business_structure ?? "sole_proprietor") !== "corporation") {
          taxIntelLines.push(
            `[INCORPORATION SIGNAL] Projected net income: ${fmtCurrency(projectedNetIncome)}. ` +
            `Agent's current structure: ${settings.business_structure ?? "sole proprietor"}. ` +
            `CRA small-business deduction and corporate tax rates differ from personal marginal rates at this income level. ` +
            `State the structure comparison as rule and math only — do not characterize incorporation as advisable or appropriate. ` +
            `${CANONICAL_TAX_DISCLAIMER}`,
          );
        }

        // 6. Receipt Capture Compliance Score
        {
          const totalClaimableItems = (expenseCategories ?? []).reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sum: number, cat: any) => sum + (cat.expense_items ?? []).filter(
              (i: { ytd_amount?: number | string }) => Number(i.ytd_amount ?? 0) > 0,
            ).length,
            0,
          ) + recurringExps.length;
          const capturedReceipts = receiptCount ?? 0;
          if (totalClaimableItems > 0) {
            const docRate = totalClaimableItems > 0
              ? Math.min(100, Math.round((capturedReceipts / Math.max(totalClaimableItems, 1)) * 100))
              : 0;
            taxIntelLines.push(
              `[DOCUMENTATION] Documentation coverage: ${docRate}%. ` +
              `${capturedReceipts} receipts captured YTD against ${totalClaimableItems} expense items with amounts. ` +
              `CRA T2125 guidance requires receipts to substantiate claims. ` +
              `State the coverage percentage neutrally — apply no qualitative label to the rate.`,
            );
          }
        }

        // 7. Seasonal Tax Set-Aside Adjustments
        {
          const currentQ = getCurrentQuarter();
          const qFraction = engineSeasonalWeights[currentQ - 1];
          if (qFraction > 0.30 && ytdTx.length > 0) {
            // This is a heavy quarter — agent earning disproportionately
            const qDeals = ytdTx.filter((tx: { date: string }) => {
              const m = new Date(tx.date).getMonth();
              return Math.floor(m / 3) + 1 === currentQ;
            }).length;
            if (qDeals >= 2) {
              // Estimate Q-specific tax liability at marginal rate against Q's share of projected year-end GCI
              const qProjectedGCI = projGCI * qFraction;
              const qEstimatedTaxLiability = qProjectedGCI * taxResult.effectiveRate;
              taxIntelLines.push(
                `[SEASONAL COMMISSION PATTERN] Q${currentQ} seasonal weight: ${(qFraction * 100).toFixed(0)}% of annual. ` +
                `Agent closed ${qDeals} deals in Q${currentQ}. ` +
                `Estimated tax liability on this quarter's projected GCI at marginal rate ${(taxResult.effectiveRate * 100).toFixed(1)}%: ~${fmtCurrency(qEstimatedTaxLiability)}. ` +
                `Per-deal equivalent: ${fmtCurrency(taxResult.perDealSetAside)}. ` +
                `State the math only — describe no action.`,
              );
            }
          }
        }

        // 8. CCA (Depreciation) Reminders
        {
          // Check if any hardware/equipment items have spend but no CCA assets tracked
          const hasEquipmentSpend = [...(expenseCategories ?? [])].some(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (cat: any) => (cat.expense_items ?? []).some(
              (i: { key: string; ytd_amount?: number | string }) =>
                i.key === "office_hardware" && Number(i.ytd_amount ?? 0) > 500,
            ),
          );
          if (hasEquipmentSpend) {
            taxIntelLines.push(
              `[CCA OPPORTUNITY] Agent has hardware/equipment expenses over $500 YTD. ` +
              `CRA T2125 treats larger capital purchases (laptop, camera, signage) as depreciable assets under the Capital Cost Allowance regime ` +
              `(Class 50 for computers/peripherals at 55% declining balance, Class 8 for office equipment at 20%) rather than current-year expenses. ` +
              `State the rule only — do not characterize CCA treatment as more or less advantageous than expensing.`,
            );
          }
        }

        // 9. Filing Deadline Countdown
        {
          const filingFreq = (settings.filing_frequency ?? "quarterly") as FilingFrequency;
          try {
            const currentPeriod = getCurrentFilingPeriod(filingFreq);
            const deadlineInfo = deadlineUrgency(currentPeriod.deadline);
            if (deadlineInfo.daysUntil <= 30 && deadlineInfo.daysUntil > 0) {
              taxIntelLines.push(
                `[FILING DEADLINE] ${filingFreq.charAt(0).toUpperCase() + filingFreq.slice(1)} GST/HST return ` +
                `for ${currentPeriod.label} is due ${currentPeriod.deadline} (${deadlineInfo.label}). ` +
                `Days remaining: ${deadlineInfo.daysUntil}. ` +
                `The Tax page includes a GST34 pre-fill tool. State the date and available tool only — use no urgency language.`,
              );
            } else if (deadlineInfo.daysUntil <= 0) {
              taxIntelLines.push(
                `[OVERDUE FILING] ${filingFreq.charAt(0).toUpperCase() + filingFreq.slice(1)} GST/HST return ` +
                `for ${currentPeriod.label} was due ${currentPeriod.deadline} (${deadlineInfo.label}). ` +
                `CRA charges interest at the prescribed rate plus a late-filing penalty (1% of balance owing + 0.25% per month, up to 12 months, per ETA s.280) from the day after the due date. ` +
                `State the rule and the date only.`,
              );
            }
          } catch {
            // Non-critical — filing period computation may fail if settings are incomplete
          }
        }

        taxIntelLines.push("── END TAX INTELLIGENCE ──");
        engineLines.push(...taxIntelLines);

        // ── Per-Paycheque Allocation Guidance ──────────────────────────────
        // Tells the AI how to advise the agent on splitting each commission cheque
        {
          const hstRate = gstHstRate((settings.province ?? "ontario") as Parameters<typeof gstHstRate>[0]);
          const hstLabel = gstHstLabel((settings.province ?? "ontario") as Parameters<typeof gstHstLabel>[0]);
          const brokerageWithholdsHst = settings.brokerage_withholds_hst === true;
          const marginalRate = projectedNetIncome > 0
            ? Math.min(0.53, (taxResult?.totalTax ?? 0) / projectedNetIncome)
            : 0.30; // default 30% if no data yet

          const allocLines: string[] = [];
          allocLines.push("── PAYCHEQUE ALLOCATION GUIDANCE ──");
          allocLines.push(
            `[SETUP] Province: ${settings.province}. ${hstLabel} rate: ${(hstRate * 100).toFixed(1)}%. ` +
            `Brokerage withholds HST: ${brokerageWithholdsHst ? "YES — agent receives net-of-HST cheques" : "NO — agent receives full amount including HST"}. ` +
            `Estimated marginal tax rate: ${(marginalRate * 100).toFixed(0)}%.`
          );

          // D-4 fix (Audit 1 2026-04-22): example math used `(10000 * agentPct) * hstRate`
          // in the non-withholding case — same base class of bug as the
          // earlier self-contradiction. HST is charged on the full commission
          // invoiced to the client, not on the agent's split portion. Examples
          // now compute HST on the $10,000 invoiced commission. Also softened
          // "recommend / set aside" wording per
          // memory/feedback_tax_information_not_advice.md — forbidden verbs.
          // Math below uses a canonical perDealGCI = $10,000 illustrative.
          const exampleGCI = 10_000;
          const exampleHST = computeHSTCollected({
            ytdGCI: exampleGCI,
            hstRate,
            // Force registered=true for illustrative math regardless of
            // current user state — this is a worked example, not a
            // statement about the agent.
            isRegistered: true,
            brokerageWithholdsHst,
          });
          const exampleAgentGross = exampleGCI * agentPct;
          const exampleTaxReserve = exampleAgentGross * marginalRate;
          const exampleTakeHomeWithholding = Math.max(0, exampleAgentGross - exampleTaxReserve);
          const exampleTakeHomeAgentHandled = Math.max(
            0,
            exampleAgentGross - exampleTaxReserve,
          );
          if (brokerageWithholdsHst) {
            allocLines.push(
              `[ALLOCATION MODEL — HST WITHHELD BY BROKERAGE] The brokerage collects ${hstLabel} on the invoiced commission and remits to CRA. ` +
              `The agent receives their split of the pre-${hstLabel} commission. ` +
              `Of the commission the agent receives, ~${(marginalRate * 100).toFixed(0)}% typically covers federal + provincial income tax at their projected marginal rate. ` +
              `Illustrative example: $${exampleGCI.toLocaleString()} gross commission at ${(agentPct * 100).toFixed(0)}% split — agent receives $${exampleAgentGross.toFixed(0)} (${hstLabel} of ~$${exampleHST === 0 ? (exampleGCI * hstRate).toFixed(0) : exampleHST.toFixed(0)} handled by the brokerage). ` +
              `At ~${(marginalRate * 100).toFixed(0)}% marginal rate, income tax portion ~$${exampleTaxReserve.toFixed(0)}; remainder ~$${exampleTakeHomeWithholding.toFixed(0)}. ` +
              `${CANONICAL_TAX_DISCLAIMER}`
            );
          } else {
            allocLines.push(
              `[ALLOCATION MODEL — AGENT HANDLES HST] The agent receives the full commission including ${hstLabel} on their split portion (the ${hstLabel} portion is collected for CRA — it does not belong to the agent). ` +
              `At the agent's projected marginal rate of ~${(marginalRate * 100).toFixed(0)}%, income tax on the pre-${hstLabel} commission is approximately that percentage of the agent's split. ` +
              `Illustrative example: $${exampleGCI.toLocaleString()} gross commission at ${(agentPct * 100).toFixed(0)}% split — ${hstLabel} on the full invoiced commission is ~$${exampleHST.toFixed(0)} (belongs to CRA), agent's split portion is $${exampleAgentGross.toFixed(0)}. ` +
              `At ~${(marginalRate * 100).toFixed(0)}% marginal rate, income tax portion of the agent's split ~$${exampleTaxReserve.toFixed(0)}; remainder after income tax ~$${exampleTakeHomeAgentHandled.toFixed(0)}. ` +
              `Note: ${hstLabel} is calculated on the invoiced commission, not on the agent's split — the agent/brokerage split affects who keeps what, not the ${hstLabel} base. ` +
              `The ${hstLabel} portion represents trust funds collected on CRA's behalf; under the Excise Tax Act s.222, amounts collected are deemed held in trust for the Crown. ` +
              `CRA charges interest at the prescribed rate on unremitted amounts from the day after the remittance due date.`
            );
          }

          allocLines.push(
            `[GUIDANCE TONE] When discussing paycheque allocation, state specific dollar amounts from the agent's actual commission amount, split, and province. ` +
            `Distinguish between the portion that belongs to the agent post-tax and the portion earmarked for CRA (income tax + HST trust funds). ` +
            `For basic allocation math the engine covers, state the math directly. ` +
            `End tax-emitting responses with the canonical tax disclaimer: ${CANONICAL_TAX_DISCLAIMER}`
          );
          allocLines.push("── END PAYCHEQUE ALLOCATION GUIDANCE ──");
          engineLines.push(...allocLines);
        }

        engineLines.push("── END COMPUTED ENGINE OUTPUTS ──");

        financialContext += "\n\n" + engineLines.filter(Boolean).join("\n");
      } catch (engineErr) {
        // ZERO_DATA_SKIP_ENGINES is an intentional early-exit for brand-new
        // accounts — not a failure, so we don't log it as a warning.
        if ((engineErr as Error)?.message !== "ZERO_DATA_SKIP_ENGINES") {
          // Engine computation is non-critical — the AI still has raw financial data
          log.warn({ err: engineErr }, "[chat] Engine computation failed, continuing with raw data");
        }
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

        // ── Leader nudge: flag inactive members in first week ─────────────
        const isLeaderOrOwner = membership.role === "owner" || membership.role === "admin" || membership.role === "team_leader";
        if (isLeaderOrOwner && teamPerf.length > 1) {
          const inactiveMembers = teamPerf.filter(
            (m) =>
              m.user_id !== user.id &&
              (m.deal_count ?? 0) === 0 &&
              (m.pipeline_count ?? 0) === 0,
          );
          if (inactiveMembers.length > 0) {
            const names = inactiveMembers
              .map((m) => m.agent_name?.split(" ")[0] ?? "an agent")
              .join(", ");
            financialContext += `\n\n[INACTIVE MEMBERS] ${inactiveMembers.length} of ${teamPerf.length - 1} agents ` +
              `(${names}) have no transactions or pipeline deals yet. ` +
              `If the topic is relevant, gently suggest the leader check in with them about getting started — ` +
              `entering even one pipeline deal or past transaction helps unlock their dashboard insights. ` +
              `Keep the tone encouraging, not critical.`;
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
    .map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 4000) }))
    .filter((m) => m.content.length > 0); // Drop empty messages — Anthropic rejects them
  // Keep the most recent messages that fit within the budget
  let totalChars = 0;
  let startIdx = filtered.length;
  for (let i = filtered.length - 1; i >= 0; i--) {
    totalChars += filtered[i].content.length;
    if (totalChars > MAX_CONVERSATION_CHARS) break;
    startIdx = i;
  }
  const safeMessages = filtered.slice(startIdx);

  // Anthropic requires the first message to be from the user.
  // Strip leading assistant messages (greeting/nudge).
  while (safeMessages.length > 0 && safeMessages[0].role !== "user") {
    safeMessages.shift();
  }

  // Guard: need at least one user message
  if (safeMessages.length === 0) {
    return new Response("No messages to process. Please try again.", { status: 400 });
  }

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
4. A note: "If this still doesn't look right, reach out to support@agentrunway.ca with this summary and we'll investigate your account directly."
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

  // Dynamic max_tokens: must be generous enough for multi-step tool calls.
  // Each tool call step (search → update → response) needs output tokens for
  // the tool_use JSON block + reasoning. 600 was too low and caused silent failures.
  const maxTokens = tier === "complex" ? 4096 : tier === "fast" ? 2048 : 3000;

  // ── 7. Build system prompt (XML-structured, cache-optimized) ─────────────
  // Static content FIRST (cached at 90% discount), dynamic content LAST.
  //
  // Flight Crew: buildPersonaPrefix(persona) returns the shared constitution
  // + the active persona's identity, voice tuning, and handoff rules. This
  // prefix is prepended to the existing identity so the rest of the prompt
  // assembly (knowledge base, guidelines, voice guide) stays intact.
  const personaPrefix = buildPersonaPrefix(persona);

  const identity = `${personaPrefix}

You are part of Agent Runway's Flight Crew — an agentic business OS for Canadian real estate agents.

Important: All outputs you generate are estimates for informational purposes only. You do not provide financial, tax, or legal advice. Always remind users to consult their accountant or professional advisor for decisions.`;

  const guidelines = `CORE GUIDELINES:
- Answer questions clearly and concisely (3-5 sentences unless a breakdown is requested)
- Cite specific numbers from the business data when relevant — always prefer their actual figures over generic statements
- Give actionable, specific observations tailored to Canadian real estate agents
- When users ask about platform features, metrics, or terms, explain them accurately using the knowledge base
- When discussing taxes, end tax-emitting responses with the canonical tax disclaimer: ${CANONICAL_TAX_DISCLAIMER}. Never tell users to claim specific deductions or file specific forms.
- TAX COMPLIANCE RULE (MANDATORY): NEVER encourage agents to increase claim percentages for vehicle business-use, home office, or any other deduction. NEVER suggest what percentage they should claim. NEVER compare their percentages to benchmarks or other agents. Treat all user-entered claim percentages as facts — do not comment on whether they seem high or low. When referring to CRA documentation requirements, STATE the rule in engine/CRA-source terms ("CRA requires supporting documentation for claimed deductions under ITA s.230 and ETA s.169 for ITCs") — do NOT translate the rule into a directive or command addressed to the user. When surfacing tax intelligence, describe documentation state, deadlines, and CRA rules — never prescribe what the agent should do, and never frame claims as something to maximize.
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
- Cash / survival runway under 3 months → state the Survival engine's own label (the engine emits its classification); do not editorialize or add alarmist commentary
- If they're close to hitting their annual goal → acknowledge momentum positively
- Tax Intelligence items tagged [MISSING DEDUCTIONS], [INSTALMENT PLANNING], [GST/HST FORECAST], [DOCUMENTATION], [FILING DEADLINE], [OVERDUE FILING], etc. → surface these naturally when discussing finances, taxes, or expenses. Don't dump all at once — weave them in when contextually relevant.
- Missing deductions or low documentation → frame as "you may want to capture receipts for..." not "you should claim..."
- Filing deadlines within 30 days or overdue → always mention, with action items
- Open tasks are overdue (from context data) → mention it naturally: "I see you have X overdue tasks..."
- Outreach queue has pending items → when relevant, suggest reviewing Flight Control
- Mileage is at 0 but agent discusses showings/meetings → suggest logging mileage for CRA deductions
- No recurring expenses set up but agent mentions monthly subscriptions → suggest using createRecurringExpense
- CCA assets are empty but agent mentions buying equipment → suggest tracking it for depreciation

POST-ONBOARDING SETUP GAPS:
When the agent's context data includes [SETUP GAPS], these represent profile items that are still at defaults after onboarding. On the FIRST message of a new session, naturally mention 1-2 of the most impactful gaps. Don't dump the whole list — pick the ones that affect their numbers most (vehicle use %, mileage, recurring expenses, historical data). Frame it helpfully:
- "I noticed your vehicle business-use is at 0% — if you drive to showings or meetings, setting this in **Settings** (/settings) will unlock your mileage deductions."
- "You don't have any recurring expenses set up yet. Do you pay monthly for anything like MLS fees, Mailchimp, or a CRM? I can set those up for you."
After the first mention, don't repeat the same gaps in subsequent messages unless the user asks.

FOLLOW-UP SUGGESTION TAGS:
After completing actions, you may append up to 3 follow-up suggestion tags that the UI will render as clickable chips. Format: [SUGGEST: short action text]. Keep them under 30 characters. Examples:
- After creating a client: [SUGGEST: Add Sarah's email] [SUGGEST: Create a task for Sarah]
- After logging an expense: [SUGGEST: Show expense breakdown] [SUGGEST: Check my tax estimate]
- After a performance summary: [SUGGEST: Compare to last month] [SUGGEST: Show pipeline health]
Only include suggestions when they're genuinely useful next steps. Don't force them on every response.

IMPORTANT: On the very first message from the agent, if their data shows a notable pattern (behind pace, high expenses, stale clients), proactively open with that insight rather than waiting to be asked. Frame it conversationally: "Looking at your numbers, I noticed..." Proactively surface notable patterns and data points.

IMPORTANT: Use the Computed Engine Outputs section in the business data as your source of truth for projections, scores, tax estimates, benchmarks, probability bands, and insights. Do not recalculate these figures — they come from the platform's specialized engines (seasonal models, multi-bracket tax calculations, cohort benchmarking). You may explain the methodology or add qualitative context, but always reference the engine-computed numbers. If the Computed Engine Outputs section is not present, fall back to the raw financial data above.

AGENTIC ACTIONS — You have tools to act on the agent's behalf. Always searchClients first before any client action.

CORE TOOLS: searchClients, searchPipelineDeals, searchTransactions, searchExpenses, searchListingAppointments, searchCCAAssets, searchClientsByFilter, getClientSummary, getQuickStats, createClient, updateClientDetails, updateClientNotes, updateClientStatus, updateClientTags, updateClientTone, linkClientReferral, createPipelineDeal, updatePipelineDealStage, updatePipelineDealValue, logContactActivity, createContactTask, createRecurringExpense, deleteRecurringExpense, logExpense, updateExpense, logMileage, recordReferral, recordTransaction, updateTransaction, addCCAAsset, updateListingAppointment.

Every write tool listed above is gated by an approval card — just call the tool when the agent describes the intent. The user sees a Confirm/Cancel card and the tool only runs on Confirm.

TOOL TRIGGERS:
- New client → searchClients (dedup) → createClient. Chain with createPipelineDeal if deal mentioned.
- Update client info → searchClients → updateClientDetails (for structured fields like email, phone, budget, timeframe, buyer search area)
- NOTES — CRITICAL: When the user mentions ANY context, backstory, preferences, or qualitative details about a client (referral story, how they met, what they want, personal details, special circumstances), you MUST call updateClientNotes to save it. ALWAYS chain updateClientNotes alongside updateClientDetails when extra context is provided. Notes capture everything that doesn't fit in a structured field.
- BUYER SEARCH AREA vs HOME CITY: When a client is "looking in" or "interested in" a location, use buyerTargetArea (NOT city). The city field is ONLY for the client's home address. Example: "Jan is looking in St. Andrews" → buyerTargetArea: "St. Andrews". "Jan lives in Rothesay" → city: "Rothesay".
- Update client status → searchClients → updateClientStatus
- Update client tags/tone → searchClients → updateClientTags or updateClientTone
- Referral link → searchClients (both) → linkClientReferral
- New deal → searchClients → createPipelineDeal. Move stage → searchPipelineDeals → updatePipelineDealStage. Change estimated price → searchPipelineDeals → updatePipelineDealValue.
- Log call/email/meeting → searchClients → logContactActivity
- Follow-up reminder → searchClients → createContactTask
- Log expense → logExpense (categorized receipts like gas, marketing, office supplies). For complex multi-receipt uploads or OCR, direct to /expenses. Edit an expense → searchExpenses → updateExpense.
- Log mileage → logMileage (km driven, date, trip purpose).
- Record referral → recordReferral (inbound or outbound, partner name, client name, fee %).
- Recurring expense → createRecurringExpense. Delete → deleteRecurringExpense.
- Record closed deal → recordTransaction (address, client, side, close date, sale price + commission% OR exact GCI). Edit an existing transaction → searchTransactions → updateTransaction.
- Buy business equipment (laptop, camera, car, office furniture) → addCCAAsset with the right CCA class (8=office/furniture 20%, 10=vehicles 30%, 10.1=passenger vehicles >$37K 30%, 12=software/tools <$500 100%, 50=computers 55%).
- Listing update ("that listing at 44 Main went live" / "sold" / "expired") → searchListingAppointments → updateListingAppointment.
- Client summary → searchClients → getClientSummary
- Filter clients → searchClientsByFilter
- Quick counts → getQuickStats
- For features not covered by core tools (property showings, flight plans, outreach), direct the agent to the relevant page.

EXECUTION RULES:
- ALWAYS search before acting — never guess IDs
- Chain multiple tools without asking between steps. Do it all, then report.
- After createClient: note missing fields (email, phone, lead source). Link to /crm.
- After createPipelineDeal: suggest adding close date. Link to /pipeline.
- After logContactActivity/createContactTask: confirm and note where it appears.
- After any action: mention relevant follow-up steps and page links.
- Use [SUGGEST: action] tags (max 3, under 30 chars) for useful next steps.

PAGES: Dashboard(/dashboard), Transactions(/transactions), Pipeline(/pipeline), Expenses(/expenses), Altimeter(/altimeter), Overhead(/overhead), Forecast(/forecast), Reports(/reports), CRM(/crm), Flight Control(/flight-control), Referrals(/referrals), Social(/social), Settings(/settings), Guide(/guide).

Be the expert — explain metrics, suggest features, direct to pages. Think about their business alongside them.`;


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

  // Anthropic prompt caching: pass system as array of SystemModelMessages.
  // Static prefix (identity + knowledge base + guidelines + voice guide) is marked
  // with cacheControl: ephemeral → 90% token discount on cache hits after first request.
  // Dynamic suffix (user data, troubleshooting, page context, canary) changes per request.
  const systemForClaude = [
    {
      role: "system" as const,
      content: staticPart,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" as const } },
      },
    },
    {
      role: "system" as const,
      content: injectCanary(dynamicPart),
    },
  ];


  try {
    // ── 8. Stream response via Vercel AI SDK ────────────────────────────────
    // Primary: Claude (selected tier) via Anthropic
    // Fallback: Groq Llama if Anthropic fails
    const abortController = new AbortController();
    const abortTimeout = setTimeout(() => abortController.abort(), 90_000);

    let result;
    try {
      result = streamText({
        model: selectedModel,
        // Cache-optimised system: static prefix marked ephemeral (90% token discount on hits),
        // dynamic suffix with user data and canary sent uncached per-request.
        system: systemForClaude,
        // Merge consecutive same-role messages (Anthropic requires alternating roles)
        messages: safeMessages.reduce<{ role: "user" | "assistant"; content: string }[]>((acc, m) => {
          const role = m.role as "user" | "assistant";
          const last = acc[acc.length - 1];
          if (last && last.role === role) {
            last.content += "\n\n" + m.content;
          } else {
            acc.push({ role, content: m.content });
          }
          return acc;
        }, []),
        // Tools:
        // - webSearch: Anthropic-native search (server-side, CA locale)
        // - agent write tools: persona-partitioned (see createPersonaAgentTools).
        //   Captain gets getQuickStats only; Navigator gets money tools;
        //   Dispatcher gets people+pipeline tools. This enforces the handoff
        //   rule at the tool layer — Captain physically cannot list clients
        //   or search transactions, so it must hand off when asked.
        // maxSteps: allows tool calls + follow-up response in the same stream.
        tools: {
          // NOTE: webSearch temporarily disabled to isolate tool-call issues.
          // Re-enable once basic tool use is confirmed working.
          // webSearch: anthropic.tools.webSearch_20260209({
          //   maxUses: 3,
          //   userLocation: { type: "approximate", country: "CA", timezone: "America/Toronto" },
          // }),
          ...createPersonaAgentTools(supabase, user.id, persona),
        },
        stopWhen: stepCountIs(10),
        // NOTE: tried stopSequences=["passing it over.", ...] as a belt-and-
        // suspenders server-side cap on over-generation, but the AI SDK
        // strips the stop sequence from the streamed output, so the client
        // bubble ends at "Dispatcher handles client follow-up —" without the
        // "passing it over." tail. detectHandoff then can't find the trigger
        // phrase and no routing fires. Client-side truncation in
        // detectHandoff.displayText handles over-generation reliably on its
        // own; the server-side cap isn't worth the interaction cost.
        maxOutputTokens: maxTokens,
        // Opus 4.7 rejects non-default temperature values (throws 400); omit for complex tier.
        ...(tier !== "complex" ? { temperature: 0.7 } : {}),
        // Task Budgets (public beta) — Opus-only soft-cap of 40K tokens per
        // agentic turn, with the model self-regulating toward graceful close
        // as the budget depletes. The task budget itself is injected into
        // the request body by the Opus provider's fetch passthrough (see
        // lib/ai/provider.ts). This providerOptions entry ensures the
        // matching `anthropic-beta` header is sent by the SDK — belt and
        // suspenders with the fetch-layer header merge.
        // Paired with `maxOutputTokens` above as the hard ceiling.
        ...(tier === "complex"
          ? {
              providerOptions: {
                anthropic: {
                  anthropicBeta: [TASK_BUDGETS_BETA_HEADER],
                },
              },
            }
          : {}),
        abortSignal: abortController.signal,
        headers: heliconeHeaders({
          userId: user.id,
          feature: "chat",
          sessionId: requestId,
        }),
        onFinish: ({ text }) => {
          // ── Navigator post-stream validation (safety net) ────────────────
          // Persona system prompts are the primary enforcement for the
          // tax-information-not-advice rule. This is an infrastructure-layer
          // backstop: if prescriptive-advice language slips through, log it
          // for tuning; if the canonical disclaimer is missing on a
          // tax-related response, append it before persisting to Mem0 so
          // future recalls carry it. Runs only for Navigator — Captain and
          // Dispatcher have their own rules enforced via prompts.
          // Non-blocking: the user has already seen the raw stream. This
          // only affects what gets stored for future context recall.
          let persistedText = text;
          if (persona === "navigator") {
            try {
              const result = validateNavigatorOutput(text);
              if (!result.valid) {
                log.warn(
                  { requestId, userId: user.id, issues: result.issues },
                  "[chat] Navigator output validation flagged issues",
                );
                // Mirror to console for Vercel runtime logs (Helicone-independent)
                console.warn(
                  "[chat] Navigator validation issues:",
                  result.issues,
                );
              }
              persistedText = result.text;
            } catch (err) {
              // Validator must never break chat persistence
              log.warn(
                { err, requestId },
                "[chat] Navigator validator threw — falling back to raw text",
              );
            }
          }

          // Store this exchange to Mem0 — fire-and-forget, never blocks the response
          addMemory(user.id, [
            { role: "user", content: String(latestUserMessage) },
            { role: "assistant", content: persistedText },
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
          // Merge consecutive same-role messages (Groq/Llama also requires alternating roles)
          messages: safeMessages.reduce<{ role: "user" | "assistant"; content: string }[]>((acc, m) => {
            const role = m.role as "user" | "assistant";
            const last = acc[acc.length - 1];
            if (last && last.role === role) {
              last.content += "\n\n" + m.content;
            } else {
              acc.push({ role, content: m.content });
            }
            return acc;
          }, []),
          tools: createPersonaAgentTools(supabase, user.id, persona),
          stopWhen: stepCountIs(10),
          maxOutputTokens: maxTokens,
          temperature: 0.7,
          abortSignal: abortController.signal,
        });
      } else {
        throw primaryError;
      }
    }

    // Don't clear abort timeout here — streamText() returns lazily before the API call starts.
    // The 90s timeout protects against Anthropic hanging. It will be cleared inside the
    // ReadableStream once chunks start flowing, or it fires and aborts the stream.

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

    // Custom stream that sends both text deltas and tool-call events.
    // Format: `0:"text"\n` for text, `9:{"toolName":"x"}\n` for tool calls.
    // This lets the frontend show progress during multi-step tool calls
    // instead of appearing to hang.
    const encoder = new TextEncoder();
    let firstChunkReceived = false;
    let chunkCount = 0;
    let textChunks = 0;
    let toolCallChunks = 0;
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.fullStream) {
            chunkCount++;
            // Clear abort timeout once first chunk arrives (API is responding)
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              clearTimeout(abortTimeout);
              log.info({ requestId, chunkType: chunk.type }, "[chat] First stream chunk received");
            }
            if (chunk.type === "text-delta") {
              textChunks++;
              controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk.text)}\n`));
            } else if (chunk.type === "tool-call") {
              toolCallChunks++;
              // Check if this tool requires user approval before executing
              if (NEEDS_APPROVAL_TOOLS.has(chunk.toolName)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toolArgs = (chunk as any).args ?? (chunk as any).input ?? {};
                const descFn = APPROVAL_DESCRIPTIONS[chunk.toolName];
                const description = descFn ? descFn(toolArgs as Record<string, unknown>) : `Execute ${chunk.toolName}`;
                log.info({ requestId, toolName: chunk.toolName }, "[chat] Tool call (approval required)");
                controller.enqueue(encoder.encode(`b:${JSON.stringify({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  args: toolArgs,
                  description,
                })}\n`));
              } else {
                log.info({ requestId, toolName: chunk.toolName }, "[chat] Tool call");
                controller.enqueue(encoder.encode(`9:${JSON.stringify({ toolName: chunk.toolName })}\n`));
              }
            } else if (chunk.type === "error") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const errObj = (chunk as any).error;
              const errDetail = errObj instanceof Error ? errObj.message : typeof errObj === "string" ? errObj : JSON.stringify(errObj);
              log.error({ requestId, error: errObj, errorDetail: errDetail }, "[chat] Stream error event");
              console.error("[chat] Stream error event:", errDetail);
              const errMsg = safeUserErrorMessage(errDetail);
              controller.enqueue(encoder.encode(`0:${JSON.stringify(errMsg)}\n`));
              return; // Stop processing — don't hit the empty-stream fallback
            }
          }
          log.info({ requestId, chunkCount, textChunks, toolCallChunks }, "[chat] Stream completed");
          // If stream completed but produced no text at all, send a diagnostic message
          if (textChunks === 0 && toolCallChunks === 0) {
            console.error("[chat] Stream empty — no text or tool calls produced. Chunks:", chunkCount);
            const emptyMsg = "I received your message but couldn't generate a response. This may be a temporary issue — please try again.";
            controller.enqueue(encoder.encode(`0:${JSON.stringify(emptyMsg)}\n`));
          }
        } catch (err) {
          const errDetail = err instanceof Error ? err.message : String(err);
          log.error({ err, requestId, chunkCount, textChunks, toolCallChunks }, "[chat] Stream error");
          console.error("[chat] Stream catch:", errDetail, "chunks:", chunkCount);
          // Send diagnostic error message so we can debug
          const errMsg = safeUserErrorMessage(errDetail);
          controller.enqueue(encoder.encode(`0:${JSON.stringify(errMsg)}\n`));
        } finally {
          clearTimeout(abortTimeout);
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
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
