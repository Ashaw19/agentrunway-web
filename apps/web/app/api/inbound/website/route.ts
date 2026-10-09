/**
 * POST /api/inbound/website — events from the agent's own website.
 *
 * Server-to-server: the site sends `Authorization: Bearer <inbound key>`
 * (made in Settings → Website leads). The key decides which account the
 * event lands in. No cookie, no session; writes go through the admin client
 * and are scoped to that key's user_id on every statement.
 *
 * What each event does is decided in lib/inbound/website-event.ts (pure,
 * tested). This file finds the client, executes the plan and records the
 * event once: (user_id, event_id) is unique, so a retry is a no-op.
 *
 * Never logs PII: only event ids, sources and outcomes.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashInboundKey, keyFromAuthHeader } from "@/lib/inbound/keys";
import {
  phoneKey,
  planWebsiteEvent,
  websiteEventSchema,
  type MatchedClient,
  type WebsiteEvent,
} from "@/lib/inbound/website-event";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20_000;

type Admin = ReturnType<typeof createAdminClient>;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

/** ILIKE with the pattern characters escaped, so "a_b@x.ca" only matches itself. */
function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const CLIENT_COLS = "id, name, email, secondary_email, phone, secondary_phone, tags, archived_at, email_opt_out_at, updated_at";
type ClientRow = {
  id: string; name: string; email: string | null; secondary_email: string | null;
  phone: string | null; secondary_phone: string | null; tags: string[] | null;
  archived_at: string | null; email_opt_out_at: string | null; updated_at: string;
};

/**
 * Same email (primary or secondary, case-insensitive), else same phone
 * (last 10 digits). Active clients win over the Hangar; then the most
 * recently updated.
 */
async function findClient(admin: Admin, userId: string, e: WebsiteEvent): Promise<ClientRow | null> {
  const email = e.contact.email?.toLowerCase();
  const pk = phoneKey(e.contact.phone);
  let rows: ClientRow[] = [];

  if (email) {
    const pattern = likeExact(email);
    const [a, b] = await Promise.all([
      admin.from("clients").select(CLIENT_COLS).eq("user_id", userId).ilike("email", pattern).limit(20),
      admin.from("clients").select(CLIENT_COLS).eq("user_id", userId).ilike("secondary_email", pattern).limit(20),
    ]);
    if (a.error || b.error) throw new Error(`client lookup by email failed: ${a.error?.message ?? b.error?.message}`);
    rows = [...(a.data ?? []), ...(b.data ?? [])].filter(
      (c) => c.email?.toLowerCase() === email || c.secondary_email?.toLowerCase() === email,
    ) as ClientRow[];
  }
  if (rows.length === 0 && pk) {
    const tail = `%${pk.slice(-4)}%`;
    const [a, b] = await Promise.all([
      admin.from("clients").select(CLIENT_COLS).eq("user_id", userId).ilike("phone", tail).limit(50),
      admin.from("clients").select(CLIENT_COLS).eq("user_id", userId).ilike("secondary_phone", tail).limit(50),
    ]);
    if (a.error || b.error) throw new Error(`client lookup by phone failed: ${a.error?.message ?? b.error?.message}`);
    rows = [...(a.data ?? []), ...(b.data ?? [])].filter(
      (c) => phoneKey(c.phone) === pk || phoneKey(c.secondary_phone) === pk,
    ) as ClientRow[];
  }
  if (rows.length === 0) return null;
  rows.sort((x, y) =>
    Number(Boolean(x.archived_at)) - Number(Boolean(y.archived_at))
    || y.updated_at.localeCompare(x.updated_at));
  return rows[0];
}

export async function POST(req: Request) {
  // ── Who is this? ───────────────────────────────────────────────────────
  const key = keyFromAuthHeader(req.headers.get("authorization"));
  if (!key) return json(401, { error: "Missing or malformed key." });

  const admin = createAdminClient();
  const { data: keyRow, error: keyErr } = await admin
    .from("inbound_keys")
    .select("id, user_id")
    .eq("key_hash", hashInboundKey(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (keyErr) {
    console.error("[inbound/website] key lookup failed:", keyErr.code ?? "", keyErr.message);
    return json(500, { error: "Try again." });
  }
  if (!keyRow) return json(401, { error: "Unknown or revoked key." });
  const userId = keyRow.user_id as string;

  const rl = await checkRateLimit(userId, "inbound-website", 120, 10);
  if (!rl.allowed) return json(429, { error: "Too many events. Try again shortly." });

  // ── What happened? ─────────────────────────────────────────────────────
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "Event too large." });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return json(400, { error: "Body must be JSON." }); }
  const result = websiteEventSchema.safeParse(parsed);
  if (!result.success) {
    return json(400, { error: "Invalid event.", issues: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) });
  }
  const event = result.data;
  const source = event.type === "lead" ? event.source : `unsubscribe:${event.scope}`;

  // A retry of an event already handled: same answer, nothing written.
  const { data: seen } = await admin
    .from("inbound_events")
    .select("outcome, client_id")
    .eq("user_id", userId)
    .eq("source_event_id", event.event_id)
    .maybeSingle();
  if (seen) return json(200, { ok: true, duplicate: true, outcome: seen.outcome });

  try {
    const row = await findClient(admin, userId, event);
    let match: MatchedClient | null = null;
    if (row) {
      const { count } = await admin
        .from("contact_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("client_id", row.id)
        .is("completed_at", null);
      match = {
        id: row.id, name: row.name, email: row.email, phone: row.phone, tags: row.tags,
        archived_at: row.archived_at, email_opt_out_at: row.email_opt_out_at,
        hasOpenChecklistItem: (count ?? 0) > 0,
      };
    }

    const plan = planWebsiteEvent(event, match);
    let clientId = match?.id ?? null;
    let outcome: "created" | "matched" | "no_client" | "ignored" = match ? "matched" : "no_client";

    if (plan.skip) {
      outcome = plan.skip === "no_client" ? "no_client" : "ignored";
    } else {
      // ── Client ─────────────────────────────────────────────────────────
      if (plan.create) {
        const { data: created, error } = await admin
          .from("clients")
          .insert({ user_id: userId, country: "Canada", ...plan.create })
          .select("id")
          .single();
        if (error || !created) throw new Error(`client insert failed: ${error?.code ?? ""} ${error?.message ?? ""}`);
        clientId = created.id as string;
        outcome = "created";
      } else if (plan.patch && clientId) {
        const { error } = await admin.from("clients").update(plan.patch).eq("id", clientId).eq("user_id", userId);
        if (error) throw new Error(`client update failed: ${error.code ?? ""} ${error.message}`);
      }

      if (clientId) {
        // ── Note on their Activity tab (a note is not contact, 00171) ─────
        if (plan.note) {
          const { error } = await admin.from("contact_activities").insert({
            user_id: userId, client_id: clientId, type: "note",
            description: plan.note, activity_date: plan.occurredAt,
          });
          if (error) throw new Error(`activity insert failed: ${error.code ?? ""} ${error.message}`);
        }

        // ── Checklist ─────────────────────────────────────────────────────
        if (plan.checklist) {
          const { error } = await admin.from("contact_tasks").insert({
            user_id: userId, client_id: clientId,
            title: plan.checklist.title, notes: plan.checklist.notes,
            priority: plan.checklist.priority, due_date: atlanticISODate(),
          });
          if (error) console.error("[inbound/website] checklist item not added:", event.event_id, error.code ?? "", error.message);
        }

        // ── Consent ───────────────────────────────────────────────────────
        if (plan.consent) {
          const { error } = await admin.from("client_email_consents").insert({
            user_id: userId, client_id: clientId, kind: plan.consent.kind, source: "website",
            consent_text: plan.consent.text, consented_at: plan.consent.at, consent_ip: plan.consent.ip,
            source_event_id: event.event_id,
          });
          if (error) throw new Error(`consent insert failed: ${error.code ?? ""} ${error.message}`);
        }
        if (plan.withdraw) {
          let q = admin.from("client_email_consents")
            .update({ withdrawn_at: plan.occurredAt })
            .eq("user_id", userId).eq("client_id", clientId).is("withdrawn_at", null);
          if (plan.withdraw !== "all") q = q.eq("kind", plan.withdraw);
          const { error } = await q;
          if (error) throw new Error(`consent withdraw failed: ${error.code ?? ""} ${error.message}`);
        }
      }
    }

    // ── Record the event once; a concurrent duplicate loses the race here ──
    const { error: evErr } = await admin.from("inbound_events").insert({
      user_id: userId, key_id: keyRow.id, source_event_id: event.event_id,
      kind: event.type, source, client_id: clientId, outcome,
    });
    if (evErr && evErr.code !== "23505") {
      console.error("[inbound/website] event not recorded:", event.event_id, evErr.code ?? "", evErr.message);
    }
    await admin.from("inbound_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

    console.log(`[inbound/website] ${event.event_id} ${source} → ${outcome}${plan.checklist ? " +checklist" : ""}`);
    return json(200, { ok: true, outcome, checklist: Boolean(plan.checklist) });
  } catch (err) {
    console.error("[inbound/website] failed:", event.event_id, source, err instanceof Error ? err.message : err);
    return json(500, { error: "Couldn't save the event. Try again." });
  }
}
