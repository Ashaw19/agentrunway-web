/**
 * POST /api/workflow/generate-draft
 *
 * Generates an email draft from a Flight Status workflow_templates row for a
 * specific client. Phase 2.3 of the HML gap-closure plan.
 *
 * Body: { client_id: uuid, template_id: uuid }
 *
 * Behaviour:
 *   - Loads the template (must be either a system row with user_id IS NULL,
 *     or one this user owns — RLS enforces this on SELECT).
 *   - Loads the client (RLS scoped to the user).
 *   - Calls draftWorkflowMessage from @/lib/ai/draft-services to produce
 *     subject + body and insert a workflow_drafts row.
 *   - Returns { draft_id, subject, body } on success.
 *
 * CASL posture: drafts are text the agent reviews and copies into their own
 * email client. There is NO email-sending mechanism here. NO auto-send.
 *
 * Rate limit: 20 generations per hour per user.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { draftWorkflowMessage } from "@/lib/ai/draft-services";
import type { WorkflowTemplate } from "@agent-runway/core/types/database";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "workflow_draft", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { client_id?: string; template_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { client_id, template_id } = body;
  if (!client_id || !template_id) {
    return NextResponse.json(
      { error: "client_id and template_id are required" },
      { status: 400 },
    );
  }

  // Load the template (RLS allows: system rows OR the user's own rows)
  const { data: template, error: templateError } = await supabase
    .from("workflow_templates")
    .select("*")
    .eq("id", template_id)
    .maybeSingle();

  if (templateError) {
    console.error("[workflow/generate-draft] Template fetch error:", templateError);
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (!template.is_active) {
    return NextResponse.json({ error: "Template is inactive" }, { status: 400 });
  }

  const result = await draftWorkflowMessage({
    supabase,
    userId: user.id,
    clientId: client_id,
    template: template as WorkflowTemplate,
  });

  if (result.status === "error") {
    const isAuthIssue = result.reason === "Client not found or access denied";
    return NextResponse.json(
      { error: result.reason ?? "Failed to draft message" },
      { status: isAuthIssue ? 403 : 400, headers: rateLimitHeaders(rl) },
    );
  }

  return NextResponse.json(
    {
      draft_id: result.draftId,
      subject: result.subject,
      body: result.body,
      client_name: result.clientName,
    },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
}
