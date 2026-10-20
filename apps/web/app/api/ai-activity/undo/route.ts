/**
 * POST /api/ai-activity/undo
 *
 * Undo one AI change: everything one Flight Crew tool call wrote. Called by
 * the web AI activity page (session cookie) and the phone's Flight Crew → AI
 * activity list (Bearer token), so it resolves the user with getRequestUser.
 *
 * Body: { toolCallId: string, expected?: string }
 *   `expected` is the fingerprint of the change the page or phone showed
 *   (AIActionView.fingerprint): the undo refuses if the change moved on since.
 * Returns: { ok, status, message, restored } from undoAIAction
 *   (packages/core/lib/ai-undo.ts). A refusal (the record changed since,
 *   something now points at it, past the 30-day window) is a 409 with the
 *   reason in `message`.
 *
 * The undo runs on the user's own client, so the target tables' RLS applies.
 * Undo isn't gated on Pro: it only puts the agent's own records back.
 */

import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { undoAIAction } from "@agent-runway/core/lib/ai-undo";
import { log } from "@/lib/logger";

export async function POST(req: Request) {
  const auth = await getRequestUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  let toolCallId: unknown, expected: unknown;
  try {
    ({ toolCallId, expected } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof toolCallId !== "string" || !toolCallId.trim() || toolCallId.length > 120) {
    return NextResponse.json({ error: "Missing toolCallId" }, { status: 400 });
  }

  try {
    const result = await undoAIAction(supabase, user.id, toolCallId.trim(), {
      expected: typeof expected === "string" && expected ? expected : undefined,
    });
    log.info({ userId: user.id, status: result.status, restored: result.restored }, "[ai-activity] undo");
    const status =
      result.ok ? 200
      : result.status === "not_found" ? 404
      : result.status === "refused" ? 409
      : 500;
    return NextResponse.json(result, { status });
  } catch (err) {
    log.error({ err, userId: user.id }, "[ai-activity] undo threw");
    return NextResponse.json(
      { ok: false, status: "failed", message: "Couldn't undo that change. Try again.", restored: 0 },
      { status: 500 },
    );
  }
}
