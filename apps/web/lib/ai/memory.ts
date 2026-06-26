/**
 * Mem0 Memory Layer
 *
 * Gives the Flight Crew persistent, per-user memory across conversations.
 * Memories are extracted automatically from each conversation and retrieved
 * on the next request — the AI knows who you are without re-reading history.
 *
 * Gracefully degrades: if MEM0_API_KEY is not set, all functions are no-ops.
 */

import MemoryClient from "mem0ai";

let _client: MemoryClient | null = null;

function getClient(): MemoryClient | null {
  if (!process.env.MEM0_API_KEY) return null;
  if (!_client) {
    _client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });
  }
  return _client;
}

/**
 * Fetch memories relevant to the current user message.
 * Returns a formatted string ready to inject into the system prompt,
 * or an empty string if Mem0 is not configured or has no memories yet.
 */
export async function fetchMemories(
  userId: string,
  query: string,
): Promise<string> {
  const client = getClient();
  if (!client) return "";

  try {
    // mem0ai v3: `limit` -> `topK`; entity scoping (user_id) moved out of the
    // top level into a `filters` object. v3's search() actively THROWS if you
    // pass `user_id`/`userId` at the top level (rejectTopLevelEntityParams).
    // The response shape also changed: v2 returned Memory[] directly, v3 wraps
    // it as `{ results: Memory[] }`. Verified against node_modules/mem0ai
    // dist/index.d.ts (search signature) + dist/index.mjs (runtime payload).
    const response = await client.search(query, {
      topK: 12,
      filters: { user_id: userId },
    });

    const results = response?.results;
    if (!results || results.length === 0) return "";

    const lines = results
      .filter((r) => r.memory)
      .map((r) => `- ${r.memory}`)
      .join("\n");

    return lines || "";
  } catch {
    // Non-critical — never break the chat if memory fetch fails
    return "";
  }
}

/**
 * Store a completed conversation exchange to Mem0.
 * Mem0 automatically extracts and deduplicates facts from the messages.
 * Call fire-and-forget — do not await in the hot path.
 */
export async function addMemory(
  userId: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    // mem0ai v3: snake_case -> camelCase options. add() takes the entity id as
    // a top-level camelCase `userId` (EntityOptions), NOT inside `filters` and
    // NOT as snake_case `user_id`. (Unlike search(), add() does NOT reject a
    // top-level entity param, but the typed surface is `userId`.) Verified
    // against node_modules/mem0ai dist/index.d.ts (AddMemoryOptions extends
    // EntityOptions { userId? }).
    await client.add(messages, { userId });
  } catch {
    // Non-critical — never break the chat if memory storage fails
  }
}
