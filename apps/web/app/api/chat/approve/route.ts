/**
 * POST /api/chat/approve
 *
 * Executes a tool that was previously gated by needsApproval.
 * The frontend sends the original tool call details after the user confirms.
 *
 * Body: { toolName: string, args: Record<string, unknown> }
 * Returns: { result: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePro } from "@/lib/require-pro";
import { createAgentTools, NEEDS_APPROVAL_TOOLS } from "@/lib/ai/tools";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Parse & validate ────────────────────────────────────────────────────
  let toolName: unknown, args: unknown;
  try {
    ({ toolName, args } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof toolName !== "string" || !toolName) {
    return NextResponse.json({ error: "Missing toolName" }, { status: 400 });
  }
  if (!args || typeof args !== "object") {
    return NextResponse.json({ error: "Missing args" }, { status: 400 });
  }

  // Only allow execution of tools that are in the approval gate set
  if (!NEEDS_APPROVAL_TOOLS.has(toolName)) {
    log.warn({ toolName }, "[approve] Attempted to approve non-gated tool");
    return NextResponse.json({ error: "Tool does not require approval" }, { status: 403 });
  }

  // ── Execute the tool ────────────────────────────────────────────────────
  try {
    const allTools = createAgentTools(supabase, user.id);
    const targetTool = allTools[toolName];

    if (!targetTool || !("execute" in targetTool) || typeof targetTool.execute !== "function") {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    log.info({ toolName, userId: user.id }, "[approve] Executing approved tool");

    // The execute function expects the parsed args object.
    // Pass a minimal options object — the tool only uses the args.
    const executeFn = targetTool.execute as (args: unknown, options?: unknown) => Promise<unknown>;
    const result = await executeFn(args, {
      toolCallId: `approved-${Date.now()}`,
      messages: [],
      abortSignal: new AbortController().signal,
    });

    log.info({ toolName, userId: user.id }, "[approve] Tool executed successfully");

    return NextResponse.json({ result: String(result) });
  } catch (err) {
    // Full error details stay in the server log (Sentry-captured via log.error).
    // Client receives a generic message to avoid leaking internals (DB schema
    // hints, column names, constraint details, etc.) to an authenticated user.
    log.error({ toolName, err, userId: user.id }, "[approve] Tool execution failed");
    return NextResponse.json(
      { error: "Tool execution failed. Please try again, or contact support if this persists." },
      { status: 500 },
    );
  }
}
