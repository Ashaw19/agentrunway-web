import OpenAI from "openai";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";

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

  const { messages, financialContext, currentPage } = await req.json();

  if (!Array.isArray(messages)) {
    return new Response("Invalid request body", { status: 400 });
  }

  // Strip any system-role messages from the client — only user/assistant allowed
  const safeMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20) // cap conversation history to last 20 messages
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

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

Guidelines:
- Answer questions clearly and concisely (3-5 sentences unless a breakdown is requested)
- Cite specific numbers from the business data when relevant
- Give actionable, specific advice tailored to Canadian real estate agents
- When users ask about platform features, metrics, or terms, explain them accurately using the knowledge base
- When discussing taxes, always remind the user that these are estimates only — NOT professional tax advice. Recommend consulting a qualified Canadian accountant or tax professional for tax decisions. Never tell users to claim specific deductions or file specific forms.
- Speak in a supportive, expert tone — like a knowledgeable business coach
- If you don't have enough data to answer precisely, say so and suggest what data to add`;

  try {
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...safeMessages,
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } finally {
          controller.close();
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
