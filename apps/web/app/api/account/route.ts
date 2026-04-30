/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account.
 *
 * Deletion order (critical — each step must complete before the next):
 * 1. Revoke ALL Plaid access tokens via /item/remove (server-side, before any DB changes)
 * 2. Delete the Supabase auth.users record (cascades to all application tables)
 *
 * Cascade deletes (via FK ON DELETE CASCADE) handle all other application data:
 * - user_settings, transactions, pipeline_deals, history_items,
 *   expense_categories, expense_items, milestones, agent_profiles,
 *   team_deals, plaid_items, plaid_transactions
 *
 * The Plaid revocation MUST happen before step 2, because once the auth record
 * is deleted the access_tokens are gone from our DB (cascade) but may still be
 * valid with Plaid. Revoking them first closes that window.
 *
 * Returns: { ok: true }
 */

import { NextResponse }                                   from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments }    from "plaid";
import { createAdminClient }                             from "@/lib/supabase/admin";
import { authenticateRequest }                           from "@/lib/api-helpers";

function buildPlaidClient() {
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET":    process.env.PLAID_SECRET    ?? "",
      },
    },
  });
  return new PlaidApi(config);
}

export async function DELETE() {
  try {
    // ── 1. Authenticate ──────────────────────────────────────────────────────
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, userId } = auth;

    const admin = createAdminClient();

    // ── 2. Load all Plaid items for this user ────────────────────────────────
    // Use admin client so we can read access_token (blocked for authenticated role)
    const { data: items } = await admin
      .from("plaid_items")
      .select("id, plaid_item_id, access_token")
      .eq("user_id", userId);

    // ── 3. Revoke ALL Plaid access tokens before deleting the user ──────────
    if (items && items.length > 0 && process.env.PLAID_CLIENT_ID &&
        process.env.PLAID_CLIENT_ID !== "your_plaid_client_id_here") {
      const plaid = buildPlaidClient();
      const revokeResults = await Promise.allSettled(
        items.map((item) =>
          plaid.itemRemove({ access_token: item.access_token }).catch((err) => {
            console.warn(`[account/delete] itemRemove failed for ${item.plaid_item_id}:`, err);
          }),
        ),
      );
      const failed = revokeResults.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(`[account/delete] ${failed}/${items.length} Plaid revocations failed (continuing)`);
      }
    }

    // ── 4. Delete the user (cascades to all application data) ───────────────
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("[account/delete] Failed to delete user:", deleteError.message);
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }

    // ── 5. Sign out the now-deleted session ──────────────────────────────────
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account/delete] Unhandled error:", err);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
