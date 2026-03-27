import OpenAI from "openai";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";
import { generateTeamComparativeInsights } from "@agent-runway/core/engines";

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  // ── 1. Auth guard ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── 2. Rate limit: 30 AI messages per 60-minute window ──────────────────
  const rl = await checkRateLimit(user.id, "chat", 30, 60);
  if (!rl.allowed) {
    return new Response("Too many requests. Please wait before sending more messages.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  // ── 3. Config guard ──────────────────────────────────────────────────────
  if (!process.env.GROQ_API_KEY) {
    return new Response(
      "AI advisor is not configured yet. Please add your GROQ_API_KEY to Vercel environment variables.",
      { status: 503 },
    );
  }

  // Groq uses an OpenAI-compatible API — just swap baseURL and model
  const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const { messages, currentPage } = await req.json();

  if (!Array.isArray(messages)) {
    return new Response("Invalid request body", { status: 400 });
  }

  // ── 4. Build financial context server-side (never trust client-provided data) ─
  let financialContext = "No user data available.";
  try {
    const currentYear = new Date().getFullYear();
    const [{ data: settings }, { data: transactions }, { data: pipeline }, { data: expenseCategories }, { count: staleClientCount }] =
      await Promise.all([
        supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
        supabase.from("transactions").select("date, sale_price, commission_pct, team_split_pct, gci_override").eq("user_id", user.id).eq("status", "closed"),
        supabase.from("pipeline_deals").select("estimated_price, estimated_commission_pct, probability_override, stage").eq("user_id", user.id),
        supabase.from("expense_categories").select("expense_items(ytd_amount, monthly_recurring)").eq("user_id", user.id),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("archived_at", null).in("status", ["boarding", "taxiing", "approach", "in_flight"]).lt("last_contact_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

    if (settings && transactions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ytdTx = transactions.filter((tx: any) => tx.date.startsWith(String(currentYear)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ytdGCI = ytdTx.reduce((sum: number, tx: any) => sum + computeGCI(tx), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineWeighted = (pipeline ?? []).reduce((sum: number, d: any) => sum + computeWeightedGCI(d), 0);
      const expensesYTD = (expenseCategories ?? []).reduce(
        (sum: number, cat: { expense_items?: { ytd_amount?: number | string }[] }) =>
          sum + (cat.expense_items ?? []).reduce((s: number, i: { ytd_amount?: number | string }) => s + Number(i.ytd_amount ?? 0), 0),
        0,
      );
      const monthlyRecurring = (expenseCategories ?? []).reduce(
        (sum: number, cat: { expense_items?: { monthly_recurring?: number | string }[] }) =>
          sum + (cat.expense_items ?? []).reduce((s: number, i: { monthly_recurring?: number | string }) => s + Number(i.monthly_recurring ?? 0), 0),
        0,
      );
      const splitMatch = settings.split_preset?.match(/p(\d+)_(\d+)/);
      const splitLabel = splitMatch ? `${splitMatch[1]}% agent / ${splitMatch[2]}% brokerage` : settings.split_preset;
      financialContext = [
        `Current Year: ${currentYear}`,
        `YTD GCI: ${fmtCurrency(ytdGCI)}`,
        `Closed Deals YTD: ${ytdTx.length}`,
        ytdTx.length > 0 ? `Average Deal GCI: ${fmtCurrency(ytdGCI / ytdTx.length)}` : null,
        `Pipeline (Probability-Weighted GCI): ${fmtCurrency(pipelineWeighted)} across ${pipeline?.length ?? 0} active deals`,
        `Province: ${settings.province}`,
        `Commission Split: ${splitLabel}`,
        settings.monthly_brokerage_fee > 0 ? `Monthly Brokerage Fee: ${fmtCurrency(settings.monthly_brokerage_fee)}` : null,
        settings.tx_fee_rate_pct > 0 ? `Transaction Fee Rate: ${(settings.tx_fee_rate_pct * 100).toFixed(1)}%${settings.tx_fee_annual_cap > 0 ? ` (cap: ${fmtCurrency(settings.tx_fee_annual_cap)}/yr)` : ""}` : null,
        `Cash Reserve: ${fmtCurrency(settings.cash_reserve ?? 0)}`,
        settings.goal_gci > 0 ? `Annual GCI Goal: ${fmtCurrency(settings.goal_gci)}` : "Annual GCI Goal: Not set",
        settings.experience_years != null ? `Years of Experience: ${settings.experience_years}` : null,
        expensesYTD > 0 ? `YTD Business Expenses: ${fmtCurrency(expensesYTD)}` : null,
        monthlyRecurring > 0 ? `Monthly Recurring Expenses: ${fmtCurrency(monthlyRecurring)}` : null,
        staleClientCount != null && staleClientCount > 0 ? `Stale Active Clients (no contact 30+ days): ${staleClientCount}` : null,
      ].filter(Boolean).join("\n");
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

  // Strip any system-role messages from the client — only user/assistant allowed.
  // Cap each message to 4000 chars and limit total conversation to ~80K chars
  // to leave room for the system prompt (~30K) within Groq's 128K context.
  const MAX_CONVERSATION_CHARS = 80_000;
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

  // Sanitize currentPage to a plain path segment — prevents prompt injection
  const safePage = typeof currentPage === "string"
    ? currentPage.replace(/[^a-z0-9/\-_]/gi, "").slice(0, 64)
    : "";

  const pageContext = safePage
    ? `\nThe user is currently viewing the "${safePage.replace(/^\//, "")}" page. Prioritize answers relevant to what they're looking at.`
    : "";

  const systemPrompt = `You are an expert AI business advisor for a Canadian real estate agent using Agent Runway — a financial analytics platform.

You have access to the following live business data for this agent:
${financialContext}
${pageContext}

You also have comprehensive knowledge of the Agent Runway platform. Use the following reference to answer ANY question about features, metrics, computations, terms, tax rules, or how things work:
${KNOWLEDGE_BASE}

CORE GUIDELINES:
- Answer questions clearly and concisely (3-5 sentences unless a breakdown is requested)
- Cite specific numbers from the business data when relevant — always prefer their actual figures over generic statements
- Give actionable, specific advice tailored to Canadian real estate agents
- When users ask about platform features, metrics, or terms, explain them accurately using the knowledge base
- When discussing taxes, always remind the user that these are estimates only — NOT professional tax advice. Recommend consulting a qualified Canadian accountant or tax professional for tax decisions. Never tell users to claim specific deductions or file specific forms.
- Speak in a direct, expert tone — like a trusted business advisor, not a chatbot
- If you don't have enough data to answer precisely, say so and suggest what data to add
- Keep responses short and scannable. Prefer bullet points over long paragraphs.

PROACTIVE INSIGHTS:
When the agent's data shows any of these patterns, surface them naturally in your response — not as alarms, but as observations a good advisor would notice:
- YTD GCI significantly below seasonal pace → mention it and suggest pipeline review
- Expense ratio above 35% → flag it and offer to dig into the cause
- Stale active clients (30+ days no contact) exist → suggest Flight Control outreach sweep
- Pipeline is thin relative to goal → recommend adding pipeline deals or outreach
- Cash / survival runway under 3 months → treat as urgent, name it clearly
- If they're close to hitting their annual goal → acknowledge momentum positively

IMPORTANT: On the very first message from the agent, if their data shows a notable pattern (behind pace, high expenses, stale clients), proactively open with that insight rather than waiting to be asked. Frame it conversationally: "Looking at your numbers, I noticed..." A good advisor doesn't wait to be asked — they lead with what matters.`;


  try {
    // Abort if Groq doesn't respond within 15 seconds
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...safeMessages,
      ],
      max_tokens: 600,
      temperature: 0.7,
    }, { signal: controller.signal });

    clearTimeout(timeout);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(ctrl) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              ctrl.enqueue(encoder.encode(text));
            }
          }
        } finally {
          ctrl.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log.error({ err: error, requestId }, "[chat] Groq error");
    return new Response("AI service temporarily unavailable. Please try again.", { status: 500 });
  }
}
