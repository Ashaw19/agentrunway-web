/**
 * Settings → Website leads: the signed-in user's inbound key.
 *
 *   GET    connection status: key prefix, when it was made, last used, and
 *          how many events arrived in the last 7 days
 *   POST   make a new key. Any active key is revoked first, so there is only
 *          ever one. The key is returned ONCE and never stored in the clear.
 *   DELETE revoke the active key (disconnects the website)
 *
 * RLS scopes every query to auth.uid() (00173).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateInboundKey } from "@/lib/inbound/keys";

export const dynamic = "force-dynamic";

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [keyRes, countRes, lastRes] = await Promise.all([
    supabase.from("inbound_keys")
      .select("key_prefix, created_at, last_used_at")
      .eq("user_id", user.id).is("revoked_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("inbound_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("received_at", since),
    supabase.from("inbound_events")
      .select("received_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (keyRes.error) return NextResponse.json({ error: "Couldn't load the connection." }, { status: 500 });

  return NextResponse.json({
    connected:    Boolean(keyRes.data),
    keyPrefix:    keyRes.data?.key_prefix ?? null,
    createdAt:    keyRes.data?.created_at ?? null,
    lastUsedAt:   keyRes.data?.last_used_at ?? null,
    eventsLast7d: countRes.count ?? 0,
    lastEventAt:  lastRes.data?.received_at ?? null,
  });
}

export async function POST() {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const now = new Date().toISOString();
  const { error: revokeErr } = await supabase.from("inbound_keys")
    .update({ revoked_at: now }).eq("user_id", user.id).is("revoked_at", null);
  if (revokeErr) return NextResponse.json({ error: "Couldn't replace the old key." }, { status: 500 });

  const { key, prefix, hash } = generateInboundKey();
  const { error } = await supabase.from("inbound_keys").insert({
    user_id: user.id, key_prefix: prefix, key_hash: hash, label: "Website",
  });
  if (error) return NextResponse.json({ error: "Couldn't make a key. Try again." }, { status: 500 });

  // Shown once. Not logged.
  return NextResponse.json({ key, keyPrefix: prefix, createdAt: now });
}

export async function DELETE() {
  const { supabase, user } = await signedIn();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { error } = await supabase.from("inbound_keys")
    .update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).is("revoked_at", null);
  if (error) return NextResponse.json({ error: "Couldn't disconnect. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
