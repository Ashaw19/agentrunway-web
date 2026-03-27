#!/usr/bin/env npx tsx
/**
 * backfill-client-memory.ts
 *
 * One-time batch script to compute memory profiles for all clients that
 * don't have one yet, or whose profile is marked stale.
 *
 * Usage:
 *   npx tsx scripts/backfill-client-memory.ts
 *   npx tsx scripts/backfill-client-memory.ts --user-id <UUID>   # single user
 *   npx tsx scripts/backfill-client-memory.ts --dry-run           # count only
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY
 *   - Uses service role key to bypass RLS
 *
 * Rate-limited: 1 second delay between Groq calls to avoid 429s.
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GROQ_KEY     = process.env.GROQ_API_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!GROQ_KEY) {
  console.error("Missing GROQ_API_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const userIdIdx = args.indexOf("--user-id");
const filterUserId = userIdIdx !== -1 ? args[userIdIdx + 1] : null;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const GROQ_MODELS = ["llama-3.3-70b-versatile", "qwen/qwen3-32b"];

function getGroq() {
  return new OpenAI({ apiKey: GROQ_KEY, baseURL: "https://api.groq.com/openai/v1" });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Inline data gathering (same logic as engine, but uses service role client) ──

async function gatherAndComputeMemory(userId: string, clientId: string, clientName: string): Promise<boolean> {
  // Gather client
  const { data: client } = await supabase
    .from("clients")
    .select("name, email, phone, status, city, province_region, tags, notes, lead_source, birthdate, communication_tone, timeframe, property_interest, property_interest_type, last_contact_at")
    .eq("id", clientId)
    .eq("user_id", userId)
    .single();

  if (!client) {
    console.log(`  ⚠ Client ${clientName} not found, skipping`);
    return false;
  }

  const [transactionsRes, activitiesRes, showingsRes, listingRes, tasksRes, outreachRes] = await Promise.all([
    supabase.from("client_records").select("side, source, address, close_date, gci").eq("client_id", clientId).eq("user_id", userId).order("close_date", { ascending: false }).limit(20),
    supabase.from("contact_activities").select("type, description, activity_date").eq("client_id", clientId).eq("user_id", userId).order("activity_date", { ascending: false }).limit(50),
    supabase.from("property_showings").select("property_address, showing_date, client_rating, notes").eq("client_id", clientId).eq("user_id", userId).order("showing_date", { ascending: false }).limit(30),
    supabase.from("listing_appointments").select("property_address, appointment_date, status, estimated_list_price, notes").eq("client_id", clientId).eq("user_id", userId).order("appointment_date", { ascending: false }).limit(20),
    supabase.from("contact_tasks").select("title, due_date, priority, notes, completed_at").eq("client_id", clientId).eq("user_id", userId).order("due_date", { ascending: false }).limit(30),
    supabase.from("outreach_queue").select("opportunity_type, status, ai_subject, created_at").eq("client_id", clientId).eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  // Build a minimal prompt context
  const c = client as Record<string, unknown>;
  const transactions = transactionsRes.data ?? [];
  const activities = activitiesRes.data ?? [];
  const showings = showingsRes.data ?? [];
  const listings = listingRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const outreach = outreachRes.data ?? [];

  let prompt = `You are a memory engine for a Canadian real estate agent's CRM. Analyze this client data and return a JSON memory profile.

## Client: ${c.name}
- Status: ${c.status}, Location: ${c.city ?? "?"}${c.province_region ? `, ${c.province_region}` : ""}
- Lead Source: ${c.lead_source ?? "?"}, Tone: ${c.communication_tone}, Tags: ${(c.tags as string[])?.join(", ") || "none"}
- Notes: ${c.notes ?? "none"}, Timeframe: ${c.timeframe ?? "?"}, Last Contact: ${c.last_contact_at ?? "never"}
`;

  if (transactions.length) {
    prompt += `\n## Transactions (${transactions.length})\n`;
    for (const tx of (transactions as Array<{ close_date: string | null; side: string | null; address: string | null; gci: number | null; source: string | null }>)) {
      const parts = [tx.close_date ?? "date unknown"];
      if (tx.side) parts.push(tx.side);
      if (tx.address) parts.push(tx.address);
      if (tx.gci) parts.push(`GCI $${Number(tx.gci).toLocaleString()}`);
      if (tx.source) parts.push(`source: ${tx.source}`);
      prompt += `- [${parts.join(" — ")}]\n`;
    }
  }
  if (activities.length) {
    prompt += `\n## Activities (${activities.length})\n`;
    for (const a of (activities as Array<{ activity_date: string; type: string; description: string }>).slice(0, 20)) {
      prompt += `- [${a.activity_date}] ${a.type}: ${a.description || "(none)"}\n`;
    }
  }
  if (showings.length) {
    prompt += `\n## Showings (${showings.length})\n`;
    for (const s of (showings as Array<{ showing_date: string; property_address: string; client_rating: number | null }>).slice(0, 10)) {
      prompt += `- [${s.showing_date}] ${s.property_address}${s.client_rating ? ` (${s.client_rating}/5)` : ""}\n`;
    }
  }
  if (listings.length) {
    prompt += `\n## Listings (${listings.length})\n`;
    for (const l of (listings as Array<{ appointment_date: string; property_address: string | null; status: string }>)) {
      prompt += `- [${l.appointment_date}] ${l.property_address ?? "TBD"} — ${l.status}\n`;
    }
  }
  if (tasks.length) {
    prompt += `\n## Tasks (${tasks.length})\n`;
    for (const t of (tasks as Array<{ due_date: string; title: string; completed_at: string | null }>).slice(0, 10)) {
      prompt += `- [${t.due_date}] ${t.title}${t.completed_at ? " ✓" : ""}\n`;
    }
  }
  if (outreach.length) {
    prompt += `\n## Outreach (${outreach.length})\n`;
    for (const o of (outreach as Array<{ created_at: string; opportunity_type: string; status: string }>).slice(0, 10)) {
      prompt += `- [${o.created_at}] ${o.opportunity_type} — ${o.status}\n`;
    }
  }

  prompt += `
Return valid JSON:
{
  "memory_summary": "2-4 sentence narrative summary",
  "structured_facts": {
    "goal": "..or null", "timeline": "..or null", "motivation": "..or null",
    "pain_point": "..or null", "objection": "..or null", "emotional_state": "..or null",
    "engagement_level": "..or null", "decision_style": "..or null",
    "communication_style": "..or null", "areas_of_interest": "..or null",
    "budget_context": "..or null", "last_key_topic": "..or null",
    "last_meaningful_contact_summary": "..or null", "likely_cold_reason": "..or null",
    "next_best_angle": "..or null", "last_value_sent": "..or null"
  }
}
Use null for unknown fields. Return ONLY JSON.`;

  // Call Groq with fallback
  const groq = getGroq();
  let rawContent: string | null = null;

  for (let mi = 0; mi < GROQ_MODELS.length; mi++) {
    const model = GROQ_MODELS[mi];
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      });
      rawContent = response.choices?.[0]?.message?.content ?? null;
      if (rawContent) break;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && mi < GROQ_MODELS.length - 1) {
        console.log(`  ⚠ Rate limited on ${model}, trying fallback...`);
        continue;
      }
      console.error(`  ✗ Groq error: ${(err as Error).message}`);
      return false;
    }
  }

  if (!rawContent) {
    console.log(`  ✗ Empty Groq response`);
    return false;
  }

  // Parse
  let parsed: { memory_summary?: string; structured_facts?: Record<string, unknown> };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const match = rawContent.match(/\{[\s\S]*\}/);
    if (!match) { console.log(`  ✗ Could not parse JSON`); return false; }
    try { parsed = JSON.parse(match[0]); }
    catch { console.log(`  ✗ Could not parse extracted JSON`); return false; }
  }

  // Upsert
  const { error: upsertErr } = await supabase
    .from("client_memory_profiles")
    .upsert(
      {
        user_id: userId,
        client_id: clientId,
        memory_summary: parsed.memory_summary ?? null,
        structured_facts: parsed.structured_facts ?? {},
        last_computed_at: new Date().toISOString(),
        stale: false,
      },
      { onConflict: "user_id,client_id" },
    );

  if (upsertErr) {
    console.error(`  ✗ DB error: ${upsertErr.message}`);
    return false;
  }

  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Client Memory Backfill ===");
  if (dryRun) console.log("(DRY RUN — no writes)");
  if (filterUserId) console.log(`Filtering to user: ${filterUserId}`);

  // Find clients that need memory profiles (no profile or stale)
  let query = supabase
    .from("clients")
    .select("id, user_id, name")
    .order("created_at", { ascending: true });

  if (filterUserId) {
    query = query.eq("user_id", filterUserId);
  }

  const { data: clients, error } = await query;
  if (error) {
    console.error("Failed to fetch clients:", error);
    process.exit(1);
  }

  if (!clients?.length) {
    console.log("No clients found.");
    return;
  }

  // Check which already have fresh profiles
  const clientIds = clients.map(c => c.id);
  const { data: existing } = await supabase
    .from("client_memory_profiles")
    .select("client_id")
    .in("client_id", clientIds)
    .eq("stale", false);

  const freshSet = new Set((existing ?? []).map(e => e.client_id));
  const needsCompute = clients.filter(c => !freshSet.has(c.id));

  console.log(`Total clients: ${clients.length}, Already fresh: ${freshSet.size}, Need compute: ${needsCompute.length}`);

  if (dryRun) {
    console.log("Dry run complete.");
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < needsCompute.length; i++) {
    const c = needsCompute[i];
    process.stdout.write(`[${i + 1}/${needsCompute.length}] ${c.name}... `);

    const ok = await gatherAndComputeMemory(c.user_id, c.id, c.name);
    if (ok) {
      console.log("✓");
      success++;
    } else {
      failed++;
    }

    // 1s delay between Groq calls
    if (i < needsCompute.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
