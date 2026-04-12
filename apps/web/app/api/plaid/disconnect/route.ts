/**
 * DELETE /api/plaid/disconnect
 *
 * Removes a connected bank item:
 * 1. Calls Plaid /item/remove to revoke the access token.
 * 2. Deletes the plaid_items row (cascades to plaid_transactions).
 *
 * Body: { item_id: string }   ← UUID from plaid_items.id (our DB row)
 * Returns: { ok: true }
 */
import { NextRequest, NextResponse }                  from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createAdminClient }                          from "@/lib/supabase/admin";
import { requirePro }                                 from "@/lib/require-pro";
import { authenticateRequest }              from "@/lib/api-helpers";

function buildPlaidClient() {
  const env    = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const config = new Configuration({
    basePath:    PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET":    process.env.PLAID_SECRET    ?? "",
      },
    },
  });
  return new PlaidApi(config);
}

export async function DELETE(req: NextRequest) {
  // ── 1. Authenticate ───────────────────────────────────────────────────────
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const proCheck = await requirePro(supabase, userId);
  if (!proCheck.allowed) return proCheck.response!;

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let item_id: string;
  try {
    const body = await req.json();
    item_id = body.item_id;
    if (!item_id) throw new Error("Missing item_id");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body" },
      { status: 400 },
    );
  }

  // ── 3. Load item (verify ownership) ──────────────────────────────────────
  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin
    .from("plaid_items")
    .select("id, user_id, access_token")
    .eq("id", item_id)
    .eq("user_id", userId)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // ── 4. Revoke access token with Plaid (best-effort) ───────────────────────
  if (process.env.PLAID_CLIENT_ID && process.env.PLAID_CLIENT_ID !== "your_plaid_client_id_here") {
    try {
      const plaid = buildPlaidClient();
      await plaid.itemRemove({ access_token: item.access_token });
    } catch (err) {
      // Non-fatal — the item may already be revoked. Continue with DB deletion.
      console.warn("[plaid/disconnect] Plaid itemRemove failed (continuing):", err);
    }
  }

  // ── 5. Delete from DB (cascades to plaid_transactions) ───────────────────
  const { error: deleteError } = await admin
    .from("plaid_items")
    .delete()
    .eq("id", item_id)
    .eq("user_id", userId);

  if (deleteError) {
    console.error("[plaid/disconnect] DB delete failed:", deleteError.message);
    return NextResponse.json({ error: "Failed to remove bank connection" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
