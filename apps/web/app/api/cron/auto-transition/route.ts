/**
 * GET /api/cron/auto-transition
 *
 * Backup Vercel Cron trigger for the Landed -> Cruising auto-transition.
 * The primary schedule runs via pg_cron inside Supabase at 03:00 UTC daily.
 * This endpoint provides a redundant trigger and fires matching flight plans
 * for any transitioned clients (since flight plans were previously only
 * triggered client-side).
 *
 * Schedule: "0 3 * * *" (see vercel.json)
 * Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  // Only accept secret via headers — never query string (leaks into URL logs)
  const provided =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.headers.get("x-cron-secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Call the Supabase RPC function ───────────────────────────────────────
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("fn_auto_transition_landed_to_cruising");

  if (error) {
    console.error("[auto-transition cron] RPC error:", error);
    return NextResponse.json(
      { error: "Auto-transition failed" },
      { status: 500 },
    );
  }

  const transitioned = Array.isArray(data) ? data as { client_id: string; user_id: string }[] : [];
  const transitionedCount = transitioned.length;

  console.log(`[auto-transition] Transitioned ${transitionedCount} clients from Landed to Cruising`);

  // ── Fire flight plans for transitioned clients ─────────────────────────
  let flightPlanTasksCreated = 0;

  if (transitionedCount > 0) {
    // Get unique user IDs to batch-fetch their flight plans
    const userIds = [...new Set(transitioned.map((t) => t.user_id))];

    // Fetch active flight plans triggered by "cruising" status
    const { data: plans } = await admin
      .from("flight_plans")
      .select("id, user_id, name, trigger_tag")
      .eq("is_active", true)
      .eq("trigger_status", "cruising")
      .in("user_id", userIds);

    if (plans && plans.length > 0) {
      // Fetch steps for these plans
      const planIds = plans.map((p) => p.id);
      const { data: steps } = await admin
        .from("flight_plan_steps")
        .select("id, flight_plan_id, step_order, delay_days, action_type, template")
        .in("flight_plan_id", planIds)
        .order("step_order");

      if (steps && steps.length > 0) {
        for (const item of transitioned) {
          // Get client info for template variables and tag matching
          const { data: client } = await admin
            .from("clients")
            .select("name, tags")
            .eq("id", item.client_id)
            .single();

          const clientName = client?.name ?? "Client";
          const clientTags: string[] = client?.tags ?? [];

          // Find matching plans for this user
          const userPlans = plans.filter((p) => {
            if (p.user_id !== item.user_id) return false;
            if (p.trigger_tag && !clientTags.includes(p.trigger_tag)) return false;
            return true;
          });

          for (const plan of userPlans) {
            const planSteps = steps.filter((s) => s.flight_plan_id === plan.id);

            for (const step of planSteps) {
              if (!step.template) continue;

              const resolvedTemplate = step.template
                .replace(/\{name\}/gi, clientName)
                .replace(/\[name\]/gi, clientName)
                .replace(/\[Name\]/g, clientName);

              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + step.delay_days);
              const dueDateStr = dueDate.toISOString().slice(0, 10);

              if (step.action_type === "task" || step.action_type === "text") {
                const title = step.action_type === "text"
                  ? `📱 Send text to ${clientName}: "${resolvedTemplate.slice(0, 80)}${resolvedTemplate.length > 80 ? "…" : ""}"`
                  : resolvedTemplate;

                await admin.from("contact_tasks").insert({
                  user_id: item.user_id,
                  client_id: item.client_id,
                  title,
                  due_date: dueDateStr,
                  priority: "normal",
                  notes: `Auto-created by Flight Plan: ${plan.name}${step.action_type === "text" ? " (text step)" : ""}`,
                });
                flightPlanTasksCreated++;
              } else if (step.action_type === "email") {
                await admin.from("outreach_queue").insert({
                  user_id: item.user_id,
                  client_id: item.client_id,
                  opportunity_type: "flight_plan",
                  trigger_date: dueDateStr,
                  status: "draft",
                  ai_subject: `Flight Plan: ${plan.name}`,
                  ai_body: resolvedTemplate,
                  context: { flight_plan: plan.name, step_order: step.step_order, auto_transition: true },
                });
                flightPlanTasksCreated++;
              }
            }
          }
        }
      }
    }
  }

  console.log(`[auto-transition] Created ${flightPlanTasksCreated} flight plan items`);

  return NextResponse.json({
    ok: true,
    transitioned: transitionedCount,
    flight_plan_items_created: flightPlanTasksCreated,
    timestamp: new Date().toISOString(),
  });
}
