/**
 * GET /api/cron/routine-check
 *
 * Vercel Cron, daily at 11:00 UTC (7:00 Atlantic), after the night's other
 * jobs. Reads the latest heartbeat per unattended routine (routine_heartbeats,
 * 00191) against ROUTINE_REGISTRY and emails the alert address about any
 * routine that is overdue, has never reported, or last ended in an error.
 * A routine whose first run isn't due yet is not an alert, and the same
 * problems are emailed once, then again only a week later if still open
 * (shouldEmailAlert): 2026-11-25, 23 identical false alarms in a row.
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
  ALERT_REMINDER_DAYS,
  heartbeatAlertLines,
  heartbeatReport,
  routineCheckNote,
  shouldEmailAlert,
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

  // The last time this check emailed, and what about.
  const since = new Date(now.getTime() - (ALERT_REMINDER_DAYS + 1) * 86_400_000).toISOString();
  const { data: lastRows, error: lastErr } = await admin
    .from("routine_heartbeats")
    .select("finished_at, note")
    .eq("routine_id", SELF)
    .like("note", "%emailed=true%")
    .gte("finished_at", since)
    .order("finished_at", { ascending: false })
    .limit(1);
  if (lastErr) console.error("[routine-check] last-email read failed:", lastErr.code ?? "", lastErr.message);
  const last = lastRows?.[0] ? { at: lastRows[0].finished_at as string, note: (lastRows[0].note as string | null) ?? null } : null;

  let emailed = false;
  if (shouldEmailAlert(report, last, now)) {
    const to = await alertRecipient(admin);
    if (to && resend) {
      const subject = `Agent Runway: ${lines.length} routine${lines.length === 1 ? "" : "s"} need${lines.length === 1 ? "s" : ""} attention`;
      const text = [
        "These unattended routines have not reported as expected:",
        "",
        ...lines.map((l) => `- ${l}`),
        "",
        "A routine that was deleted, is failing before it reports, or is stuck on a usage limit shows up here. Check the Scheduled list in the Claude desktop app and the Vercel cron logs.",
        `You won't get this again unless something new goes wrong, or in ${ALERT_REMINDER_DAYS} days if it's still not fixed.`,
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

  await writeHeartbeat(SELF, "ok", routineCheckNote(report, emailed), admin);
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
