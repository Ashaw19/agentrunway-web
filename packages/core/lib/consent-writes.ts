/**
 * Read and write a client's CASL consent ledger with the signed-in user's
 * own Supabase client (RLS-scoped): the web browser, the phone app, and the
 * Flight Crew tools (after the agent approves the card). The rules live in
 * ./consent-ledger.ts; the status in engines/casl-consent-engine.ts.
 *
 * Recording a withdrawal also:
 *   - sets the client's opt-out for each channel (clients.email_opt_out_at /
 *     sms_opt_out_at), which every drafter and send path reads, so the
 *     purchase-based implied consent (which has no row) is stopped too;
 *   - ends every active record on those channels;
 *   - skips the client's queued drafts on those channels (outreach_queue
 *     draft/ready → skipped), so a draft written before the withdrawal can't
 *     be sent after it from Flight Control or the phone.
 *
 * The MCP server (tools/consent.ts) calls these too, through the generated
 * _shared/core copy, which is why the client type below is structural: the
 * edge function can't resolve "@supabase/supabase-js" from packages/core.
 */

import type { ConsentLedgerRow } from "../types/database";
import type { DbClient } from "./db-client";
import {
  CONSENT_CLIENT_COLUMNS,
  CONSENT_RECORD_COLUMNS,
  checkRecordConsent,
  checkWithdrawConsent,
  consentInsertRows,
  creditCoBuyers,
  withdrawalClientPatch,
  withdrawalRowPatch,
  type ConsentClock,
  type ConsentInputs,
  type RecordConsentInput,
  type WithdrawConsentInput,
} from "./consent-ledger";

/** What the writers need from a Supabase client (the web's, the phone's, or the MCP server's). */
export type ConsentDb = DbClient;

export interface ClientConsentData {
  clientName: string;
  inputs:     ConsentInputs;
  /** Every ledger row for the client, newest first. */
  records:    ConsentLedgerRow[];
  /** The opt-out details as stored (for display). */
  optOuts: {
    email_opt_out_at:     string | null;
    email_opt_out_source: string | null;
    email_opt_out_method: string | null;
    sms_opt_out_at:       string | null;
    sms_opt_out_source:   string | null;
    sms_opt_out_method:   string | null;
  };
}

/**
 * Everything consentStatus needs for one client: their opt-outs, their own
 * closed deals plus the ones they co-bought (#278), and their ledger rows.
 * Null when the client isn't the caller's. A failed side read throws, so a
 * caller fails closed instead of reading "no record".
 */
export async function loadClientConsent(
  supabase: ConsentDb,
  userId:   string,
  clientId: string,
): Promise<ClientConsentData | null> {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(`id, name, ${CONSENT_CLIENT_COLUMNS}, email_opt_out_source, email_opt_out_method, sms_opt_out_source, sms_opt_out_method`)
    .eq("id", clientId)
    .eq("user_id", userId)
    .maybeSingle();
  if (clientError) throw new Error(`consent: client read failed: ${clientError.message}`);
  if (!client) return null;

  const [ownRes, linksRes, consentsRes] = await Promise.all([
    supabase
      .from("client_records")
      .select("id, client_id, close_date, condition_status")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .not("close_date", "is", null),
    supabase
      .from("client_record_co_parties")
      .select("client_record_id, co_client_id")
      .eq("user_id", userId)
      .eq("co_client_id", clientId),
    supabase
      .from("client_email_consents")
      .select(CONSENT_RECORD_COLUMNS)
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .order("consented_at", { ascending: false }),
  ]);
  if (ownRes.error) throw new Error(`consent: deal read failed: ${ownRes.error.message}`);
  if (linksRes.error) throw new Error(`consent: co-party read failed: ${linksRes.error.message}`);
  if (consentsRes.error) throw new Error(`consent: ledger read failed: ${consentsRes.error.message}`);

  type DealRead = { id: string; client_id: string | null; close_date: string | null; condition_status: string | null };
  const links = (linksRes.data ?? []) as { client_record_id: string | null; co_client_id: string | null }[];
  const recordIds = links
    .map((l) => l.client_record_id)
    .filter((id): id is string => typeof id === "string");
  let coBought: DealRead[] = [];
  if (recordIds.length > 0) {
    const { data, error } = await supabase
      .from("client_records")
      .select("id, client_id, close_date, condition_status")
      .eq("user_id", userId)
      .in("id", recordIds)
      .not("close_date", "is", null);
    if (error) throw new Error(`consent: co-bought deal read failed: ${error.message}`);
    coBought = (data ?? []) as DealRead[];
  }

  const own = (ownRes.data ?? []) as DealRead[];
  const deals = [
    ...own,
    ...creditCoBuyers(coBought, links).filter((d) => d.client_id === clientId),
  ];
  const c = client as Record<string, string | null>;
  return {
    clientName: (c.name ?? "").trim() || "This client",
    inputs: {
      client: { email_opt_out_at: c.email_opt_out_at ?? null, sms_opt_out_at: c.sms_opt_out_at ?? null },
      closedDeals: deals,
      consents: (consentsRes.data ?? []) as ConsentLedgerRow[],
    },
    records: (consentsRes.data ?? []) as ConsentLedgerRow[],
    optOuts: {
      email_opt_out_at:     c.email_opt_out_at ?? null,
      email_opt_out_source: c.email_opt_out_source ?? null,
      email_opt_out_method: c.email_opt_out_method ?? null,
      sms_opt_out_at:       c.sms_opt_out_at ?? null,
      sms_opt_out_source:   c.sms_opt_out_source ?? null,
      sms_opt_out_method:   c.sms_opt_out_method ?? null,
    },
  };
}

export type ConsentWriteResult =
  | { ok: true; clientName: string; message: string; warning: string | null }
  | { ok: false; error: string };

async function ownedClient(supabase: ConsentDb, userId: string, clientId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select(`id, name, ${CONSENT_CLIENT_COLUMNS}`)
    .eq("id", clientId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; name: string | null; email_opt_out_at: string | null; sms_opt_out_at: string | null } | null;
}

const CHANNEL_WORDS: Record<string, string> = { email: "email", sms: "texts" };
const channelsText = (chs: readonly string[]) => chs.map((c) => CHANNEL_WORDS[c] ?? c).join(" and ");

/** Record consent the agent was given (or an inquiry they made). */
export async function recordClientConsent(
  supabase: ConsentDb,
  userId:   string,
  input:    RecordConsentInput,
  clock:    ConsentClock,
): Promise<ConsentWriteResult> {
  try {
    const client = await ownedClient(supabase, userId, input.clientId);
    if (!client) return { ok: false, error: "Client not found." };
    const checked = checkRecordConsent(input, clock, client);
    if (!checked.ok) return checked;
    const c = checked.value;

    const { error } = await supabase.from("client_email_consents").insert(consentInsertRows(userId, c));
    if (error) {
      console.error("[consent] record failed:", error.code ?? "", error.message);
      return { ok: false, error: "Couldn't save the consent record. Try again." };
    }
    const name = client.name?.trim() || "This client";
    const what = c.basis === "express" ? "Express consent" : "Inquiry";
    return {
      ok: true,
      clientName: name,
      message: `${what} recorded for ${name} (${channelsText(c.channels)}), dated ${c.date}.`,
      warning: c.warning,
    };
  } catch (err) {
    console.error("[consent] record failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't save the consent record. Try again." };
  }
}

/** Record that the client withdrew consent / asked to stop, on the given channels. */
export async function withdrawClientConsent(
  supabase: ConsentDb,
  userId:   string,
  input:    WithdrawConsentInput,
  clock:    ConsentClock,
): Promise<ConsentWriteResult> {
  try {
    const client = await ownedClient(supabase, userId, input.clientId);
    if (!client) return { ok: false, error: "Client not found." };
    const checked = checkWithdrawConsent(input, clock);
    if (!checked.ok) return checked;
    const w = checked.value;

    // 1. The opt-out every drafter reads.
    const { error: optOutError } = await supabase
      .from("clients")
      .update(withdrawalClientPatch(w, client))
      .eq("id", w.clientId)
      .eq("user_id", userId);
    if (optOutError) {
      console.error("[consent] opt-out update failed:", optOutError.code ?? "", optOutError.message);
      return { ok: false, error: "Couldn't save the withdrawal. Try again." };
    }

    // 2. End the active records on those channels. A failure here is fatal:
    //    a record left active would read as consent in the ledger.
    const { error: rowError } = await supabase
      .from("client_email_consents")
      .update(withdrawalRowPatch(w))
      .eq("user_id", userId)
      .eq("client_id", w.clientId)
      .in("channel", w.channels)
      .is("withdrawn_at", null);
    if (rowError) {
      console.error("[consent] record withdrawal failed:", rowError.code ?? "", rowError.message);
      return { ok: false, error: "The unsubscribe is saved, but their consent records weren't all ended. Try again to finish." };
    }

    // 3. Queued drafts on those channels can no longer go out.
    const { error: queueError } = await supabase
      .from("outreach_queue")
      .update({ status: "skipped" })
      .eq("user_id", userId)
      .eq("client_id", w.clientId)
      .in("channel", w.channels)
      .in("status", ["draft", "ready"]);
    if (queueError) {
      console.error("[consent] queued drafts not skipped:", queueError.code ?? "", queueError.message);
      return { ok: false, error: "The unsubscribe is saved, but drafts waiting for them weren't all cleared. Try again to finish." };
    }

    const name = client.name?.trim() || "This client";
    return {
      ok: true,
      clientName: name,
      message: `Withdrawal recorded for ${name} (${channelsText(w.channels)}), dated ${w.date}. Agent Runway won't draft ${w.channels.length > 1 ? "emails or texts" : w.channels[0] === "sms" ? "texts" : "emails"} to them; a call is the way to reach them.`,
      warning: null,
    };
  } catch (err) {
    console.error("[consent] withdraw failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't save the withdrawal. Try again." };
  }
}
