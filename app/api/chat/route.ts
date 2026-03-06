import OpenAI from "openai";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      "AI advisor is not configured yet. Please add your OPENAI_API_KEY to Vercel environment variables.",
      { status: 503 },
    );
  }

  // Lazily initialize so the module loads without a key during build
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { messages, financialContext } = await req.json();

  if (!Array.isArray(messages)) {
    return new Response("Invalid request body", { status: 400 });
  }

  const systemPrompt = `You are an expert AI business advisor for a Canadian real estate agent using Agent Runway — a financial analytics platform.

You have access to the following live business data for this agent:
${financialContext}

Guidelines:
- Answer questions clearly and concisely (3-5 sentences unless a breakdown is requested)
- Cite specific numbers from the business data when relevant
- Give actionable, specific advice tailored to Canadian real estate agents
- When discussing taxes, note that you're providing estimates only, not professional tax advice
- Speak in a supportive, expert tone — like a knowledgeable business coach
- If you don't have enough data to answer precisely, say so and suggest what data to add`;

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
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
    console.error("OpenAI error:", error);
    // Surface the real OpenAI error message so it appears in the chat bubble
    const message =
      error instanceof Error ? error.message : "Unknown error from OpenAI";
    return new Response(message, { status: 500 });
  }
}
