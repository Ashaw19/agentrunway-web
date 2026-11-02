/**
 * GET /api/cron/routine-check
 *
 * Vercel Cron, daily at 11:00 UTC (7:00 Atlantic), after the night's other
 * jobs. Reads the latest heartbeat per unattended routine (routine_heartbeats,
 * 00191) against ROUTINE_REGISTRY and emails the alert address about any
 * routine that is overdue, has never reported, or last ended in an error.
 *
 * Why: silence looked like success for three months (Finn and Owen were
 * deleted some time after 2026-07-29; nobody knew until 2026-11-02).
 *
 * The recipient is ALERT_EMAIL, else the auth email of the user named by
 * ALERT_USER_ID, else the sole account's owner (DEFAULT_ALERT_USER_ID: Andrew
 * is Agent Runway's only user, 2026-11-02). Without an email, the result is
 * logged and nothing is sent.
 * It writes its own heartbeat too, so a dead checker is also noticed on the
 * next day it runs (and shows in the response if hit by hand).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { writeHeartbeat } from "@/lib/cron/heartbeat";
import {
  ROUTINE_REGISTRY,
  heartbeatAlertLines,
  heartbeatReport,
  type HeartbeatRow,
} from "@agent-runway/core/engines/routine-heartbeats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SELF = "cron:routine-check";
/** Andrew's account: the alert goes to its sign-in email unless ALERT_EMAIL or ALERT_USER_ID says otherwise. */
const DEFAULT_ALERT_USER_ID = "d8b15ce4-fd01-491c-9257-d61082d5af3f";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // The latest beat per routine. 90 days is kept; one row per routine is read.
  const ids = ROUTINE_REGISTRY.map((r) => r.id);
  const { data, error } = await admin
    .from("routine_heartbeats")
    .select("routine_id, finished_at, outcome, note")
    .in("routine_id", ids)
    .order("finished_at", { ascending: false })
    .limit(ids.length * 20);
  if (error) {
    console.error("[routine-check] heartbeats read failed:", error.code ?? "", error.message);
    await writeHeartbeat(SELF, "error", `read failed: ${error.message}`, admin);
    return NextResponse.json({ error: "Failed to read heartbeats" }, { status: 500 });
  }

  const report = heartbeatReport(ROUTINE_REGISTRY, (data ?? []) as HeartbeatRow[], now);
  const lines = heartbeatAlertLines(report);

  let emailed = false;
  if (lines.length > 0) {
    const to = await alertRecipient(admin);
    if (to && resend) {
      const subject = `Agent Runway: ${lines.length} routine${lines.length === 1 ? "" : "s"} need${lines.length === 1 ? "s" : ""} attention`;
      const text = [
        "These unattended routines have not reported as expected:",
        "",
        ...lines.map((l) => `- ${l}`),
        "",
        "A routine that was deleted, is failing before it reports, or is stuck on a usage limit shows up here. Check the Scheduled list in the Claude desktop app and the Vercel cron logs.",
        `Checked ${now.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
      ].join("\n");
      try {
        await resend.emails.send({ from: FROM_ADDRESS, to, subject, text });
        emailed = true;
      } catch (err) {
        console.error("[routine-check] alert email failed:", err);
      }
    } else {
      console.warn("[routine-check] attention needed but no recipient or Resend:", lines);
    }
  }

  await writeHeartbeat(SELF, "ok", `${report.attention.length} needing attention; emailed=${emailed}`, admin);
  return NextResponse.json({
    checked: report.statuses.length,
    attention: report.attention.map((s) => ({ id: s.id, state: s.state, hoursSince: s.hoursSince })),
    emailed,
  });
}

async function alertRecipient(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const fixed = process.env.ALERT_EMAIL?.trim();
  if (fixed) return fixed;
  const userId = process.env.ALERT_USER_ID?.trim() || DEFAULT_ALERT_USER_ID;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}
