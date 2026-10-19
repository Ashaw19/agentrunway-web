/**
 * The phone dashboard's "Next up" payload (GET /api/next-up). Flight Crew
 * and the MCP server read the same one, so every surface shows the same day.
 *
 *   handful   today's handful (lib/crm/next-up-handful.ts: Flight Control's
 *             picks, pinned per client), each with whether it can be texted
 *   snoozed   handful clients on Later, with their number
 *   urgent    the always-on-top counts: new leads, overdue tasks, deal
 *             deadlines (core lib/next-up/rules)
 *
 * A card's text status is checked under CASL when the payload is built: core
 * consentStatus on the text channel (lib/crm/consent-gate.ts, the gate every
 * drafter runs), and for a consent-lapsing card the consent request's own
 * window and sign-off, as draftTextForClient checks them. A lapsed past
 * client, an SMS opt-out or a consent record that can't be read is
 * call_only: no Text button. Checked before a waiting draft is offered, so a
 * text drafted before an opt-out is never "ready".
 *
 * This builder never drafts and never sends; the route drafts the
 * draftable cards after it responds. Its only writes are the handful's own
 * (persist), none with persist false.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { activePipelineDeals, type TopOpportunity } from "@agent-runway/core/types/database";
import { addDaysISO, atlanticISODate } from "@agent-runway/core/lib/local-date";
import {
  DEAL_DEADLINE_DAYS,
  HANDFUL_TARGET,
  NEW_LEAD_HOURS,
  conditionDeadlineDays,
  dealDeadlineDays,
  isNewLead,
  textPurposeFor,
} from "@agent-runway/core/lib/next-up/rules";
import type { HandfulItem, HandfulTextStatus, NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import { loadNextUpHandful } from "@/lib/crm/next-up-handful";
import {
  consentBlockReason,
  consentRequestTextSignOff,
  consentRequestWindow,
  readClientConsent,
  type ConsentSender,
} from "@/lib/crm/consent-gate";
import { TEXT_OPPORTUNITY_TYPE, pickTextPhone } from "@/lib/ai/draft-text";
import { fetchAllIn, fetchAllRows } from "@/lib/supabase/fetch-all";

interface PhoneRow {
  id:                   string;
  name:                 string | null;
  phone:                string | null;
  phone_type:           string | null;
  secondary_phone:      string | null;
  secondary_phone_type: string | null;
}

interface QueuedText {
  id:         string;
  client_id:  string;
  status:     string;
  ai_body:    string | null;
  final_body: string | null;
}

type TextSender = ConsentSender & { textFooter: boolean };

/** The number to call: the texting number (mobile first), else any number on file. */
function callNumber(row: PhoneRow | undefined): string | null {
  if (!row) return null;
  return pickTextPhone(row) ?? (row.phone?.trim() || null) ?? (row.secondary_phone?.trim() || null);
}

/**
 * Whether a card can offer Text, first match wins:
 *   consent can't be read, or refuses a text today        call_only
 *   a consent request outside its window or unsignable    call_only
 *   no number with at least 10 digits                     no_phone
 *   already texted today                                  call_only
 *   today's text drafted and waiting                      ready
 *   otherwise                                             draftable
 */
async function textStatusFor(
  supabase: SupabaseClient,
  userId:   string,
  pick:     TopOpportunity,
  row:      PhoneRow | undefined,
  queued:   QueuedText | undefined,
  today:    string,
  sender:   () => Promise<TextSender>,
): Promise<HandfulTextStatus> {
  const name = pick.client_name?.trim() || row?.name?.trim() || "This client";

  const consent = await readClientConsent(supabase, userId, pick.client_id);
  if (!consent.ok) return { status: "call_only", reason: consent.reason };
  const blocked = consentBlockReason(consent.inputs, "sms", null, name, today);
  if (blocked) return { status: "call_only", reason: blocked };

  if (textPurposeFor(pick.opportunity_type) === "consent_request") {
    const window = consentRequestWindow(consent.inputs, "sms", name, today);
    if (!window.ok) return { status: "call_only", reason: window.reason };
    const signOff = consentRequestTextSignOff(await sender());
    if (!signOff.ok) return { status: "call_only", reason: signOff.reason };
  }

  if (!row || !pickTextPhone(row)) return { status: "no_phone" };

  if (queued?.status === "sent") return { status: "call_only", reason: `You already texted ${name} today.` };
  const body = queued?.status === "ready" ? (queued.final_body ?? queued.ai_body ?? "") : "";
  if (queued && body.trim()) return { status: "ready", queue_id: queued.id, body };
  return { status: "draftable" };
}

/**
 * The always-on-top counts, by the core rules the phone's builder uses.
 * A count that can't be read is 0 (logged): the handful is still served.
 */
async function urgentCounts(
  supabase: SupabaseClient,
  userId:   string,
  now:      Date,
  today:    string,
): Promise<NextUpPayload["urgent"]> {
  const leadsSince = new Date(now.getTime() - NEW_LEAD_HOURS * 3_600_000);
  const windowEnd = addDaysISO(today, DEAL_DEADLINE_DAYS);

  const [leadsRes, tasksRes, dealsRes, conditionsRes] = await Promise.all([
    fetchAllRows<{ id: string; status: string; last_contact_at: string | null; created_at: string; archived_at: string | null }>(
      (from, to) => supabase
        .from("clients")
        .select("id, status, last_contact_at, created_at, archived_at")
        .eq("user_id", userId)
        .eq("status", "boarding")
        .is("last_contact_at", null)
        .is("archived_at", null)
        .gte("created_at", leadsSince.toISOString())
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("contact_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("completed_at", null)
      .lt("due_date", today),
    supabase
      .from("pipeline_deals")
      .select("id, stage, expected_close_date")
      .eq("user_id", userId)
      .gte("expected_close_date", today)
      .lte("expected_close_date", windowEnd),
    fetchAllRows<{ id: string; condition_date: string | null; condition_status: string | null }>(
      (from, to) => supabase
        .from("client_records")
        .select("id, condition_date, condition_status")
        .eq("user_id", userId)
        .gte("condition_date", today)
        .lte("condition_date", windowEnd)
        .order("id")
        .range(from, to),
    ),
  ]);

  const failed = (what: string, error: { message: string } | null) => {
    if (error) console.error(`[next-up] ${what} not counted: ${error.message}`);
    return !!error;
  };

  const newLeads = failed("new leads", leadsRes.error)
    ? 0
    : leadsRes.data.filter((c) => isNewLead(c, now)).length;
  const overdueTasks = failed("overdue tasks", tasksRes.error) ? 0 : (tasksRes.count ?? 0);
  const deals = failed("deal deadlines", dealsRes.error)
    ? 0
    : activePipelineDeals((dealsRes.data ?? []) as { stage: string; expected_close_date: string | null }[])
        .filter((d) => dealDeadlineDays(d, today) !== null).length;
  const conditions = failed("condition deadlines", conditionsRes.error)
    ? 0
    : conditionsRes.data.filter((r) => conditionDeadlineDays(r, today) !== null).length;

  return { new_leads: newLeads, overdue_tasks: overdueTasks, deal_deadlines: deals + conditions };
}

/**
 * Today's Next up for the user. `persist` false reads only (Flight Crew,
 * MCP): the handful isn't synced. Nothing here drafts or sends.
 */
export async function buildNextUpPayload(
  userId:   string,
  supabase: SupabaseClient,
  opts:     { persist: boolean; now: Date },
): Promise<NextUpPayload> {
  const { now } = opts;
  const today = atlanticISODate(now);

  const [handful, urgent] = await Promise.all([
    loadNextUpHandful(userId, supabase, { persist: opts.persist, now }),
    urgentCounts(supabase, userId, now, today),
  ]);
  const day = handful.day;
  const picks = handful.opportunities.slice(0, HANDFUL_TARGET);
  const pickIds = picks.map((p) => p.client_id);
  const clientIds = [...new Set([...pickIds, ...handful.snoozed.map((s) => s.client_id)])];

  // One read each: the clients' numbers (no request with no ids), and
  // today's texts for the handful (at most one a client a day).
  const [phonesRes, queuedRes] = await Promise.all([
    fetchAllIn<string, PhoneRow>(
      clientIds,
      (chunk, from, to) => supabase
        .from("clients")
        .select("id, name, phone, phone_type, secondary_phone, secondary_phone_type")
        .eq("user_id", userId)
        .in("id", chunk)
        .order("id")
        .range(from, to),
    ),
    pickIds.length === 0
      ? Promise.resolve({ data: [] as QueuedText[], error: null })
      : supabase
          .from("outreach_queue")
          .select("id, client_id, status, ai_body, final_body")
          .eq("user_id", userId)
          .eq("channel", "sms")
          .eq("opportunity_type", TEXT_OPPORTUNITY_TYPE)
          .eq("trigger_date", day)
          .in("client_id", pickIds),
  ]);
  if (phonesRes.error) console.error(`[next-up] phone numbers not read: ${phonesRes.error.message}`);
  // Unread, a waiting text shows as draftable; the drafter then finds it
  // and returns it instead of writing another.
  if (queuedRes.error) console.error(`[next-up] today's texts not read: ${queuedRes.error.message}`);

  const rows = new Map(phonesRes.data.map((r) => [r.id, r]));
  const queued = new Map(((queuedRes.data ?? []) as QueuedText[]).map((q) => [q.client_id, q]));

  // The consent request's sign-off reads the agent's settings, once, and
  // only when a card needs it. As in draftTextForClient: a missing row keeps
  // the footer on; a missing name or address refuses the ask.
  let senderRead: Promise<TextSender> | null = null;
  const sender = () => (senderRead ??= (async () => {
    const { data } = await supabase
      .from("user_settings")
      .select("display_name, brokerage_name, text_footer, email_signature, mailing_address, phone")
      .eq("user_id", userId)
      .maybeSingle();
    const s = data as {
      display_name?: string | null; brokerage_name?: string | null; text_footer?: boolean | null;
      email_signature?: string | null; mailing_address?: string | null; phone?: string | null;
    } | null;
    return {
      displayName:    s?.display_name?.trim() || "",
      brokerage:      s?.brokerage_name?.trim() || "",
      phone:          s?.phone,
      mailingAddress: s?.mailing_address,
      emailSignature: s?.email_signature,
      textFooter:     s?.text_footer !== false,
    };
  })());

  const statuses = await Promise.all(picks.map((p) =>
    textStatusFor(supabase, userId, p, rows.get(p.client_id), queued.get(p.client_id), day, sender)));

  const items: HandfulItem[] = picks.map((p, i) => ({
    client_id:        p.client_id,
    client_name:      p.client_name,
    opportunity_type: p.opportunity_type,
    trigger_date:     p.trigger_date.slice(0, 10),
    label:            p.label,
    why_now:          p.why_now,
    contact_channel:  p.contact_channel,
    phone:            callNumber(rows.get(p.client_id)),
    text:             statuses[i],
  }));

  return {
    day,
    target:       HANDFUL_TARGET,
    done_today:   handful.doneToday,
    generated_at: now.toISOString(),
    handful:      items,
    snoozed:      handful.snoozed.map((s) => ({ ...s, phone: callNumber(rows.get(s.client_id)) })),
    urgent,
  };
}
