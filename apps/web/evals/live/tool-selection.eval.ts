/**
 * EVAL (live model): Flight Crew picks the right tool.
 *
 * 30+ realistic requests (fixtures/tool-requests.ts), each sent to the
 * persona the router would choose, with that persona's real tool set and
 * system prompt (buildPersonaPrefix + the knowledge base). Binary check per
 * request: the model's FIRST tool call is one of the accepted tools (or no
 * tool, where answering directly is fine). Tools are offered without their
 * `execute`, so nothing runs and nothing is written.
 *
 * Skips without ANTHROPIC_API_KEY. Uses the pinned default model (the chat
 * route's usual tier); this suite is how a model change gets judged.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateText, tool, type ToolSet } from "ai";
import { aiCallHeaders, models } from "@/lib/ai/provider";
import { setAIRunRecorderForTests } from "@/lib/ai/run-ledger";
import { createPersonaAgentTools } from "@/lib/ai/tools";
import { buildPersonaPrefix } from "@/lib/flight-crew/system-prompts";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { fakeSupabase } from "@/lib/ai/__tests__/helpers/fake-supabase";
import { LIVE, LIVE_SKIP_NOTE } from "../fixtures/live";
import { TOOL_REQUESTS, type EvalPersona } from "../fixtures/tool-requests";

/** The persona's tools as the model sees them, with nothing to run. */
function offeredTools(persona: EvalPersona): ToolSet {
  const { client } = fakeSupabase({});
  const real = createPersonaAgentTools(client, "eval-user-1", persona);
  return Object.fromEntries(
    Object.entries(real).map(([name, t]) => [name, tool({ description: t.description, inputSchema: t.inputSchema as never })]),
  );
}

function system(persona: EvalPersona): string {
  return `${buildPersonaPrefix(persona)}\n\nYou are Flight Crew inside Agent Runway, for a Canadian real estate agent in Saint John, New Brunswick. Today is Wednesday, October 14, 2026.\n\n${KNOWLEDGE_BASE}`;
}

describe.skipIf(!LIVE)(`EVAL live: tool selection on ${TOOL_REQUESTS.length} requests${LIVE_SKIP_NOTE}`, () => {
  // Evals never write to the AI run ledger.
  beforeAll(() => setAIRunRecorderForTests(() => {}));
  afterAll(() => setAIRunRecorderForTests(null));

  it("has at least 30 requests", () => {
    expect(TOOL_REQUESTS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(TOOL_REQUESTS)("[$persona] $request", async (c) => {
    const result = await generateText({
      model: models.default,
      system: system(c.persona),
      prompt: c.request,
      tools: offeredTools(c.persona),
      temperature: 0,
      maxOutputTokens: 600,
      headers: aiCallHeaders({ feature: "eval-tool-selection" }),
    });
    const first = result.toolCalls[0]?.toolName ?? null;
    if (first === null) {
      expect({ request: c.request, first, answeredWithoutTool: c.none === true }).toEqual({ request: c.request, first, answeredWithoutTool: true });
    } else {
      expect({ request: c.request, first, accepted: c.first.includes(first) }).toEqual({ request: c.request, first, accepted: true });
    }
  });
});
