/**
 * PATCH /api/workflow/drafts/[id]
 *
 * Update the lifecycle status of a workflow_drafts row. Used by the
 * WorkflowSuggestionsPanel to mark a draft as sent (after the agent copies
 * it into their email client) or dismissed (no longer relevant).
 *
 * Body: { status: 'sent' | 'dismissed' }
 *
 * RLS scopes the row to the authenticated user — the 404 path is the
 * "row doesn't exist OR isn't yours" branch.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-helpers";
import type { WorkflowDraftStatus } from "@agent-runway/core/types/database";

const VALID_STATUSES: ReadonlyArray<WorkflowDraftStatus> = ["sent", "dismissed"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, userId } = auth;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: { status?: WorkflowDraftStatus };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const status = body.status;
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const { data: updated, error } = await supabase
      .from("workflow_drafts")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error("[workflow/drafts PATCH] error:", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error("[workflow/drafts PATCH] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
