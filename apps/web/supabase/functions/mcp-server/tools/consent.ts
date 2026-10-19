import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import {
  CASL_IMPLIED_CONSENT_MONTHS,
  CASL_INQUIRY_CONSENT_MONTHS,
  CONSENT_LAPSED_CALL_DAYS,
  CONSENT_LAPSING_WARNING_DAYS,
  CONSENT_METHODS,
  consentStateLabel,
  consentStatus,
  type ChannelConsent,
} from "../../_shared/core/engines/casl-consent-engine.ts";
import {
  CONSENT_RECORD_COLUMNS,
  atlanticConsentClock,
  consentInputsByClient,
  creditCoBuyers,
} from "../../_shared/core/lib/consent-ledger.ts";
import {
  loadClientConsent,
  recordClientConsent,
  withdrawClientConsent,
} from "../../_shared/core/lib/consent-writes.ts";
import { atlanticISODate, daysBetweenISO } from "../../_shared/core/lib/local-date.ts";

/**
 * CASL consent ledger (00183) for the Claude Connector: the same status
 * (consentStatus, packages/core) and the same writers the web, the phone and
 * Flight Crew use. Only the agent records consent: record_consent is for
 * consent the agent says the client gave them, never inferred from notes,
 * replies or activity. Information, not legal advice.
 */

const RULES =
  `Under CASL, implied consent from a purchase lasts ${CASL_IMPLIED_CONSENT_MONTHS / 12} years from the last closing and from an inquiry ${CASL_INQUIRY_CONSENT_MONTHS} months; express consent lasts until it is withdrawn; an unsubscribe blocks that channel until express consent is given again. A message asking for consent is itself a commercial message, so a consent request can only go by email or text while implied consent holds.`;

function channelJson(ch: ChannelConsent) {
  return {
    status: ch.state,
    label: consentStateLabel(ch),
    can_draft: ch.canMessage,
    basis: ch.basis,
    since: ch.since,
    implied_until: ch.impliedUntil,
    lapses_on: ch.lapsesOn,
    days_left: ch.daysLeft,
    reason: ch.reason,
  };
}

const text = (body: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** Every row for the user, in pages of 1,000 (a request stops there). */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const channelsSchema = {
  type: "array",
  items: { type: "string", enum: ["email", "sms"] },
  minItems: 1,
  maxItems: 2,
  description: "email, sms (texts), or both.",
};
const methodSchema = {
  type: "string",
  enum: [...CONSENT_METHODS],
  description: "How the client said it: in_person, verbal (phone call), written, email_reply, text_reply, web_form. Required.",
};
const dateSchema = { type: "string", description: "YYYY-MM-DD. Required. Not in the future." };

export function getConsentTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_client_consent ────────────────────────────────────────────────
    {
      name: "get_client_consent",
      description:
        `Returns one client's CASL consent per channel (email, texts): express, implied until a date, lapsed (call only), unsubscribed (call only) or no record, with the reason, plus the ledger records behind it. The same status Agent Runway's drafters use. ${RULES}`,
      inputSchema: {
        type: "object",
        properties: { client_id: { type: "string", description: "Client UUID (from get_clients)." } },
        required: ["client_id"],
        additionalProperties: false,
      },
      annotations: { title: "Client Consent (CASL)", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const { client_id } = args as { client_id: string };
        const data = await loadClientConsent(supabase, userId, client_id);
        if (!data) return fail("Client not found.");
        const status = consentStatus({ ...data.inputs, today: atlanticISODate() });
        return text({
          client: data.clientName,
          email: channelJson(status.email),
          texts: channelJson(status.sms),
          last_closing: status.lastClose,
          records: data.records.map((r) => ({
            channel: r.channel,
            basis: r.basis,
            source: r.source === "website" ? `website sign-up (${r.kind})` : "recorded by the agent",
            method: r.method,
            given_on: atlanticISODate(new Date(r.consented_at)),
            wording: r.consent_text || null,
            note: r.evidence_note,
            withdrawn_on: r.withdrawn_at ? atlanticISODate(new Date(r.withdrawn_at)) : null,
          })),
          note: "Information about CASL as Agent Runway applies it, not legal advice.",
        });
      },
    },

    // ── list_consent_lapsing ──────────────────────────────────────────────
    {
      name: "list_consent_lapsing",
      description:
        `Lists past clients whose implied consent from their purchase ends within the next N days (default ${CONSENT_LAPSING_WARNING_DAYS}), and those whose consent ended in the last ${CONSENT_LAPSED_CALL_DAYS} days. Clients with express consent on record or who unsubscribed are left out. Before the end date a consent request can go by email or text (Agent Runway drafts it in Flight Control); after it, the ask is a phone call. ${RULES}`,
      inputSchema: {
        type: "object",
        properties: { days: { type: "number", description: `Days ahead to look (1 to 180, default ${CONSENT_LAPSING_WARNING_DAYS}).` } },
        additionalProperties: false,
      },
      annotations: { title: "Consent Ending Soon (CASL)", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const days = Math.min(180, Math.max(1, Math.round(Number((args as { days?: number }).days ?? CONSENT_LAPSING_WARNING_DAYS))));
        const [clients, records, coParties, ledger] = await Promise.all([
          readAll<{ id: string; name: string | null; email_opt_out_at: string | null; sms_opt_out_at: string | null }>((f, t) =>
            supabase.from("clients").select("id, name, email_opt_out_at, sms_opt_out_at")
              .eq("user_id", userId).is("archived_at", null).order("id").range(f, t)),
          readAll<{ id: string; client_id: string | null; close_date: string | null; condition_status: string | null }>((f, t) =>
            supabase.from("client_records").select("id, client_id, close_date, condition_status")
              .eq("user_id", userId).not("close_date", "is", null).not("client_id", "is", null).order("id").range(f, t)),
          readAll<{ client_record_id: string | null; co_client_id: string | null }>((f, t) =>
            supabase.from("client_record_co_parties").select("id, client_record_id, co_client_id")
              .eq("user_id", userId).order("id").range(f, t)),
          readAll<{ client_id: string; channel: string; basis: string; source: string; kind: string; consented_at: string; withdrawn_at: string | null }>((f, t) =>
            supabase.from("client_email_consents").select(CONSENT_RECORD_COLUMNS)
              .eq("user_id", userId).order("id").range(f, t)),
        ]);
        const today = atlanticISODate();
        const names = new Map(clients.map((c) => [c.id, c.name?.trim() || "Unnamed client"]));
        const inputs = consentInputsByClient(clients, creditCoBuyers(records, coParties), ledger);
        const ending: { client_id: string; name: string; last_closing: string | null; lapses_on: string; days_left: number | null }[] = [];
        const ended: { client_id: string; name: string; last_closing: string | null; lapsed_on: string }[] = [];
        for (const [id, input] of inputs) {
          const email = consentStatus({ ...input, today }).email;
          if (email.basis !== "purchase" || !email.lapsesOn) continue;
          if (email.state === "implied" && (email.daysLeft ?? Infinity) <= days) {
            ending.push({ client_id: id, name: names.get(id) ?? "", last_closing: email.since, lapses_on: email.lapsesOn, days_left: email.daysLeft });
          } else if (email.state === "lapsed" && daysBetweenISO(email.lapsesOn, today) < CONSENT_LAPSED_CALL_DAYS) {
            ended.push({ client_id: id, name: names.get(id) ?? "", last_closing: email.since, lapsed_on: email.lapsesOn });
          }
        }
        ending.sort((a, b) => a.lapses_on.localeCompare(b.lapses_on));
        ended.sort((a, b) => a.lapsed_on.localeCompare(b.lapsed_on));
        return text({
          as_of: today,
          ending_soon: ending,
          ended_recently: ended,
          note: "Information about CASL as Agent Runway applies it, not legal advice.",
        });
      },
    },

    // ── record_consent ────────────────────────────────────────────────────
    {
      name: "record_consent",
      description:
        `Records CASL consent a client gave the agent, on email, texts or both. Use ONLY when the agent says the client agreed (express) or made an inquiry (implied, ${CASL_INQUIRY_CONSENT_MONTHS} months). Never infer consent from notes, email replies or activity. method and date are required; ask the agent if they weren't given. Include the client's words (wording) or where the proof is (note); one of the two is required. Express consent dated before an unsubscribe is refused; given after it, it lifts it. Express consent reopens drafting for a past client whose implied consent has lapsed. Records are never edited; withdraw_consent ends them.`,
      inputSchema: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "Client UUID (from get_clients)." },
          channels: channelsSchema,
          basis: { type: "string", enum: ["express", "implied_inquiry"], description: "express = they said yes; implied_inquiry = they made an inquiry." },
          method: methodSchema,
          date: dateSchema,
          wording: { type: "string", description: "What they agreed to, in their words." },
          note: { type: "string", description: "Where the proof is (a saved email, a signed form)." },
        },
        required: ["client_id", "channels", "basis", "method", "date"],
        additionalProperties: false,
      },
      annotations: { title: "Record Consent (CASL)", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: async (args) => {
        const a = args as { client_id: string; channels: string[]; basis: string; method: string; date: string; wording?: string; note?: string };
        const res = await recordClientConsent(supabase, userId, {
          clientId: a.client_id, channels: a.channels ?? [], basis: a.basis, method: a.method, date: a.date,
          wording: a.wording ?? null, note: a.note ?? null, recordedVia: "mcp",
        }, atlanticConsentClock());
        if (!res.ok) return fail(res.error);
        return text({ recorded: true, message: res.message, warning: res.warning });
      },
    },

    // ── withdraw_consent ──────────────────────────────────────────────────
    {
      name: "withdraw_consent",
      description:
        "Records that a client asked the agent to stop emailing or texting them, on email, texts or both. method and date are required. Afterwards Agent Runway drafts nothing on those channels for the client and skips drafts already waiting. Under CASL an unsubscribe takes effect without delay, within 10 business days at the latest.",
      inputSchema: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "Client UUID (from get_clients)." },
          channels: channelsSchema,
          method: methodSchema,
          date: dateSchema,
          note: { type: "string", description: "Optional context." },
        },
        required: ["client_id", "channels", "method", "date"],
        additionalProperties: false,
      },
      annotations: { title: "Record Withdrawal (CASL)", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: async (args) => {
        const a = args as { client_id: string; channels: string[]; method: string; date: string; note?: string };
        const res = await withdrawClientConsent(supabase, userId, {
          clientId: a.client_id, channels: a.channels ?? [], method: a.method, date: a.date,
          note: a.note ?? null, recordedVia: "mcp",
        }, atlanticConsentClock());
        if (!res.ok) return fail(res.error);
        return text({ recorded: true, message: res.message, warning: res.warning });
      },
    },
  ];
}
