/**
 * lib/ai/client-memory-engine.ts
 *
 * Server-side engine that computes a per-client memory profile by gathering
 * all available data (client record, activities, showings, listing appointments,
 * tasks, outreach history, existing memory) and asking Groq to synthesize a
 * structured memory profile.
 *
 * Phase 1: compute-on-demand only. Called by:
 *   - POST /api/ai/client-memory  (manual trigger)
 *   - backfill-client-memory.ts   (one-time batch script)
 *
 * Design principles:
 *   • Failure-safe — AI failure never breaks CRM. Returns null on error.
 *   • Additive-only — reads existing data, writes only to client_memory_profiles.
 *   • No side effects on any other table.
 */

import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Structured Facts shape ──────────────────────────────────────────────────

export interface ClientMemoryFacts {
  goal:                           string | null;
  timeline:                       string | null;
  motivation:                     string | null;
  pain_point:                     string | null;
  objection:                      string | null;
  emotional_state:                string | null;
  engagement_level:               string | null;
  decision_style:                 string | null;
  communication_style:            string | null;
  areas_of_interest:              string | null;
  budget_context:                 string | null;
  last_key_topic:                 string | null;
  last_meaningful_contact_summary: string | null;
  likely_cold_reason:             string | null;
  next_best_angle:                string | null;
  last_value_sent:                string | null;
}

export interface ClientMemoryProfile {
  id: string;
  user_id: string;
  client_id: string;
  memory_summary: string | null;
  structured_facts: ClientMemoryFacts;
  last_computed_at: string | null;
  stale: boolean;
  created_at: string;
  updated_at: string;
}

// ── AI config ───────────────────────────────────────────────────────────────

function isAIConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY);
}

// ── Data gathering ──────────────────────────────────────────────────────────

interface GatheredClientData {
  client: {
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    city: string | null;
    province_region: string | null;
    tags: string[];
    notes: string | null;
    lead_source: string | null;
    birthdate: string | null;
    communication_tone: string;
    timeframe: string | null;
    property_interest: number | null;
    property_interest_type: string;
    last_contact_at: string | null;
  };
  transactions: { side: string | null; source: string | null; address: string | null; close_date: string | null; gci: number | null }[];
  activities: { type: string; description: string; activity_date: string }[];
  showings: { property_address: string; showing_date: string; client_rating: number | null; notes: string | null }[];
  listing_appointments: { property_address: string | null; appointment_date: string; status: string; estimated_list_price: number | null; notes: string | null }[];
  tasks: { title: string; due_date: string; priority: string; notes: string | null; completed_at: string | null }[];
  outreach_history: { opportunity_type: string; status: string; ai_subject: string | null; created_at: string }[];
  existing_memory: { memory_summary: string | null; structured_facts: Record<string, unknown> } | null;
  client_notes: { content: string; created_at: string }[];
}

async function gatherClientData(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<GatheredClientData | null> {
  // Fetch client record
  const { data: client } = await supabase
    .from("clients")
    .select("name, email, phone, status, city, province_region, tags, notes, lead_source, birthdate, communication_tone, timeframe, property_interest, property_interest_type, last_contact_at")
    .eq("id", clientId)
    .eq("user_id", userId)
    .single();

  if (!client) return null;

  // Parallel fetches for related data (capped per table to keep token budget)
  const [transactionsRes, activitiesRes, showingsRes, listingRes, tasksRes, outreachRes, memoryRes, clientNotesRes] = await Promise.all([
    supabase
      .from("client_records")
      .select("side, source, address, close_date, gci")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .order("close_date", { ascending: false })
      .limit(20),
    supabase
      .from("contact_activities")
      .select("type, description, activity_date")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .order("activity_date", { ascending: false })
      .limit(50),
    supabase
      .from("property_showings")
      .select("property_address, showing_date, client_rating, notes")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .order("showing_date", { ascending: false })
      .limit(30),
    supabase
      .from("listing_appointments")
      .select("property_address, appointment_date, status, estimated_list_price, notes")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .order("appointment_date", { ascending: false })
      .limit(20),
    supabase
      .from("contact_tasks")
      .select("title, due_date, priority, notes, completed_at")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .order("due_date", { ascending: false })
      .limit(30),
    supabase
      .from("outreach_queue")
      .select("opportunity_type, status, ai_subject, created_at")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("client_memory_profiles")
      .select("memory_summary, structured_facts")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("client_notes")
      .select("content, created_at")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return {
    client: client as GatheredClientData["client"],
    transactions: (transactionsRes.data ?? []) as GatheredClientData["transactions"],
    activities: (activitiesRes.data ?? []) as GatheredClientData["activities"],
    showings: (showingsRes.data ?? []) as GatheredClientData["showings"],
    listing_appointments: (listingRes.data ?? []) as GatheredClientData["listing_appointments"],
    tasks: (tasksRes.data ?? []) as GatheredClientData["tasks"],
    outreach_history: (outreachRes.data ?? []) as GatheredClientData["outreach_history"],
    existing_memory: memoryRes.data as GatheredClientData["existing_memory"],
    client_notes: (clientNotesRes.data ?? []) as GatheredClientData["client_notes"],
  };
}

// ── Prompt builder ──────────────────────────────────────────────────────────

function buildMemoryPrompt(data: GatheredClientData): string {
  const c = data.client;

  const today = new Date().toISOString().slice(0, 10);

  let prompt = `You are a memory engine for a Canadian real estate agent's CRM system. Analyze ALL available data about this client and produce a structured memory profile.

Today's date: ${today}

CRM pipeline status definitions (4-stage model):
- boarding  = active lead, not yet under contract
- scheduled = future intent — plans to act later (target date or phrase captured)
- in_flight = under contract / transaction in progress
- cruising  = past client or long-term nurture relationship

## Client Record
- Name: ${c.name}
- Status: ${c.status}
- Location: ${c.city ?? "unknown"}${c.province_region ? `, ${c.province_region}` : ""}
- Lead Source: ${c.lead_source ?? "unknown"}
- Communication Tone: ${c.communication_tone}
- Tags: ${c.tags?.length ? c.tags.join(", ") : "none"}
- Legacy Notes: ${c.notes ?? "none"}
- Timeframe: ${c.timeframe ?? "unknown"}
- Property Interest: ${c.property_interest ? `$${c.property_interest.toLocaleString()} (${c.property_interest_type})` : "unknown"}
- Birthday: ${c.birthdate ?? "unknown"}
- Last Contact: ${c.last_contact_at ?? "never"}
`;

  if (data.transactions.length > 0) {
    prompt += `\n## Transaction History (${data.transactions.length} closed deals)\n`;
    for (const tx of data.transactions) {
      const parts = [tx.close_date ?? "date unknown"];
      if (tx.side) parts.push(tx.side);
      if (tx.address) parts.push(tx.address);
      if (tx.gci) parts.push(`GCI $${Number(tx.gci).toLocaleString()}`);
      if (tx.source) parts.push(`source: ${tx.source}`);
      prompt += `- [${parts.join(" — ")}]\n`;
    }
  }

  if (data.activities.length > 0) {
    prompt += `\n## Contact Activities (${data.activities.length} most recent)\n`;
    for (const a of data.activities.slice(0, 30)) {
      prompt += `- [${a.activity_date}] ${a.type}: ${a.description || "(no description)"}\n`;
    }
  }

  if (data.client_notes.length > 0) {
    prompt += `\n## Agent Notes (${data.client_notes.length} entries — most recent first)\n`;
    for (const n of data.client_notes.slice(0, 20)) {
      prompt += `- [${n.created_at.slice(0, 10)}] ${n.content}\n`;
    }
  }

  if (data.showings.length > 0) {
    prompt += `\n## Property Showings (${data.showings.length})\n`;
    for (const s of data.showings.slice(0, 15)) {
      prompt += `- [${s.showing_date}] ${s.property_address}${s.client_rating ? ` — rated ${s.client_rating}/5` : ""}${s.notes ? ` — "${s.notes}"` : ""}\n`;
    }
  }

  if (data.listing_appointments.length > 0) {
    prompt += `\n## Listing Appointments (${data.listing_appointments.length})\n`;
    for (const la of data.listing_appointments) {
      prompt += `- [${la.appointment_date}] ${la.property_address ?? "address TBD"} — status: ${la.status}${la.estimated_list_price ? ` — est. $${la.estimated_list_price.toLocaleString()}` : ""}${la.notes ? ` — "${la.notes}"` : ""}\n`;
    }
  }

  if (data.tasks.length > 0) {
    prompt += `\n## Tasks (${data.tasks.length})\n`;
    for (const t of data.tasks.slice(0, 15)) {
      const done = t.completed_at ? " ✓" : "";
      prompt += `- [due ${t.due_date}] ${t.title} (${t.priority})${done}${t.notes ? ` — "${t.notes}"` : ""}\n`;
    }
  }

  if (data.outreach_history.length > 0) {
    prompt += `\n## Outreach History (${data.outreach_history.length})\n`;
    for (const o of data.outreach_history.slice(0, 10)) {
      prompt += `- [${o.created_at}] ${o.opportunity_type} — ${o.status}${o.ai_subject ? ` — "${o.ai_subject}"` : ""}\n`;
    }
  }

  if (data.existing_memory?.memory_summary) {
    prompt += `\n## Previous Memory Summary\n${data.existing_memory.memory_summary}\n`;
  }

  prompt += `
## Instructions
Synthesize ALL the above into a memory profile. Return valid JSON with exactly this shape:

{
  "memory_summary": "A 2-4 sentence narrative summary of this client relationship — who they are, what they want, where things stand, and what matters to them.",
  "structured_facts": {
    "goal": "Their real estate goal (buying first home, selling to downsize, investment, etc.) or null",
    "timeline": "When they want to act (spring 2026, ASAP, 6 months, etc.) or null",
    "motivation": "Why they're doing this (growing family, retirement, relocation, etc.) or null",
    "pain_point": "What frustrates or worries them or null",
    "objection": "Known hesitations or blockers or null",
    "emotional_state": "Current emotional disposition (excited, anxious, hesitant, confident, etc.) or null",
    "engagement_level": "How engaged they are (highly active, responsive, lukewarm, going cold, ghost) or null",
    "decision_style": "How they make decisions (analytical, emotional, consensus-driven, impulsive, cautious) or null",
    "communication_style": "How they prefer to communicate and what style resonates or null",
    "areas_of_interest": "Neighbourhoods, property types, or features they care about or null",
    "budget_context": "Any budget signals — not exact numbers, but context like 'stretching budget' or 'comfortable range' or null",
    "last_key_topic": "The main topic of the most recent meaningful interaction or null",
    "last_meaningful_contact_summary": "One sentence on what happened in the last real conversation or null",
    "likely_cold_reason": "If engagement is low, why they might have gone cold or null",
    "next_best_angle": "The best approach for the next touchpoint or null",
    "last_value_sent": "The last piece of value the agent provided (market update, listing alert, etc.) or null"
  }
}

Rules:
- Use null for any field you cannot confidently infer. Do NOT fabricate.
- Keep strings concise (1-2 sentences max per field).
- engagement_level rules (use today's date ${today} to judge recency):
  • "boarding" status clients are NEW LEADS — classify as "not yet engaged", never "going cold".
  • "in_flight" status means an active deal — classify as "highly active" or "responsive", never "going cold".
  • "cruising" status with a close_date within the last 60 days = "responsive" (recently closed).
  • Only use "going cold" when there is a meaningful lapse: last_contact_at or most recent close_date is 90+ days ago AND no recent activities.
  • Use "ghost" only when last_contact_at is 6+ months ago or the client is known to be unreachable.
- Return ONLY the JSON object, no markdown, no explanation.`;

  return prompt;
}

// ── Core compute function ───────────────────────────────────────────────────

export interface ComputeMemoryResult {
  success: boolean;
  profile: ClientMemoryProfile | null;
  error?: string;
}

/**
 * Compute (or recompute) the memory profile for a single client.
 * Failure-safe: returns { success: false } on any error, never throws.
 */
export async function updateClientMemory(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<ComputeMemoryResult> {
  try {
    // 1. Gather all data
    const data = await gatherClientData(supabase, userId, clientId);
    if (!data) {
      return { success: false, profile: null, error: "Client not found" };
    }

    // 2. Check AI is configured
    if (!isAIConfigured()) {
      return { success: false, profile: null, error: "AI provider not configured" };
    }

    // 3. Build prompt and call Claude (Sonnet) with Groq fallback
    const prompt = buildMemoryPrompt(data);
    const aiHeaders = heliconeHeaders({ userId, feature: "client-memory" });
    let rawContent: string | null = null;

    try {
      const { text } = await generateText({
        model: models.default,
        prompt,
        temperature: 0.1,
        maxOutputTokens: 2000,
        headers: aiHeaders,
      });
      rawContent = text || null;
    } catch (primaryErr) {
      console.warn("[client-memory] Primary model (Sonnet) failed, falling back to Groq:", primaryErr);
      try {
        const { text } = await generateText({
          model: models.fallback,
          prompt,
          temperature: 0.1,
          maxOutputTokens: 2000,
          headers: aiHeaders,
        });
        rawContent = text || null;
      } catch (fallbackErr: unknown) {
        const status = (fallbackErr as { status?: number })?.status;
        console.error(`[client-memory] Fallback error status=${status}`, fallbackErr);
        return { success: false, profile: null, error: `AI ${status ?? "error"}: ${(fallbackErr as Error).message}` };
      }
    }

    if (!rawContent) {
      return { success: false, profile: null, error: "Empty response from AI" };
    }

    // 4. Parse JSON — try direct, then extract {...} block
    let parsed: { memory_summary?: string; structured_facts?: Record<string, unknown> };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (!match) {
        return { success: false, profile: null, error: "Could not parse Groq response as JSON" };
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return { success: false, profile: null, error: "Could not parse extracted JSON block" };
      }
    }

    const memorySummary = typeof parsed.memory_summary === "string" ? parsed.memory_summary : null;
    const structuredFacts = (parsed.structured_facts && typeof parsed.structured_facts === "object")
      ? parsed.structured_facts
      : {};

    // 5. Upsert into client_memory_profiles
    const now = new Date().toISOString();
    const { data: upserted, error: upsertErr } = await supabase
      .from("client_memory_profiles")
      .upsert(
        {
          user_id: userId,
          client_id: clientId,
          memory_summary: memorySummary,
          structured_facts: structuredFacts,
          last_computed_at: now,
          stale: false,
        },
        { onConflict: "user_id,client_id" },
      )
      .select()
      .single();

    if (upsertErr) {
      console.error("[client-memory] Upsert error:", upsertErr);
      return { success: false, profile: null, error: `DB upsert failed: ${upsertErr.message}` };
    }

    return { success: true, profile: upserted as ClientMemoryProfile };
  } catch (err) {
    console.error("[client-memory] Unexpected error:", err);
    return { success: false, profile: null, error: (err as Error).message };
  }
}

// ── Read-only fetch ─────────────────────────────────────────────────────────

/**
 * Fetch the existing memory profile for a client. Returns null if none exists.
 */
export async function getClientMemory(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<ClientMemoryProfile | null> {
  const { data } = await supabase
    .from("client_memory_profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .single();

  return (data as ClientMemoryProfile) ?? null;
}

// ── Stale marker ────────────────────────────────────────────────────────────

/**
 * Mark a client's memory profile as stale. Non-blocking, fire-and-forget.
 * Safe to call even if no profile exists yet (no-op in that case).
 */
export async function markMemoryStale(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<void> {
  try {
    await supabase
      .from("client_memory_profiles")
      .update({ stale: true })
      .eq("client_id", clientId)
      .eq("user_id", userId);
  } catch {
    // Fire-and-forget — never let stale marking break the caller
  }
}
