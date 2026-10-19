/**
 * POST /api/outreach/send
 *
 * Refuses every send. Agent Runway does not send email on the agent's
 * behalf: drafts are reviewed in Flight Control and sent from the agent's
 * own email (Copy, or Open in Email). Sending from Agent Runway stays off
 * until a sending provider and a CASL review are in place (the 2026-10-18
 * research report lists it as blocked).
 *
 * History: until 00183 this route read consent_records (00099), which
 * nothing ever wrote, so every send was refused with NO_CONSENT. Routing it
 * through the consent ledger would have made it start sending for clients
 * with implied consent, so it now refuses outright and says why.
 * Guard test: lib/__tests__/outreach-send-routes.test.ts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SENDING_DISABLED_MESSAGE =
  "Agent Runway doesn't send email for you. Review the draft in Flight Control, then send it from your own email (Copy, or Open in Email).";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: SENDING_DISABLED_MESSAGE, code: "SENDING_DISABLED" }, { status: 403 });
}
