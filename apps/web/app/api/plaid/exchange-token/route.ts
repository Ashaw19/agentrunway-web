/**
 * POST /api/plaid/exchange-token
 *
 * Exchanges a Plaid public_token (from the Link onSuccess callback) for a
 * permanent access_token and saves the item to the plaid_items table.
 *
 * Body: { public_token: string, institution_id: string, institution_name: string }
 * Returns: { item_id: string }
 */
import { NextRequest, NextResponse }                        from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments }       from "plaid";
import { createAdminClient }                                from "@/lib/supabase/admin";
import { requirePro }                                       from "@/lib/require-pro";
import { authenticateRequest }                    from "@/lib/api-helpers";

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

export async function POST(req: NextRequest) {
  // ── 1. Guard: Plaid not configured ────────────────────────────────────────
  if (!process.env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID === "your_plaid_client_id_here") {
    return NextResponse.json({ error: "Plaid credentials not configured." }, { status: 503 });
  }

  // ── 2. Authenticate ───────────────────────────────────────────────────────
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const proCheck = await requirePro(supabase, userId);
  if (!proCheck.allowed) return proCheck.response!;

  // ── 3. Parse body ─────────────────────────────────────────────────────────
  let public_token: string;
  let institution_id: string | null   = null;
  let institution_name: string | null = null;
  try {
    const body     = await req.json();
    public_token   = body.public_token;
    institution_id = body.institution_id   ?? null;
    institution_name = body.institution_name ?? null;
    if (!public_token) throw new Error("Missing public_token");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body" },
      { status: 400 },
    );
  }

  // ── 4. Exchange public_token → access_token ───────────────────────────────
  try {
    const plaid    = buildPlaidClient();
    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const { access_token, item_id: plaid_item_id } = exchange.data;

    // ── 5. Persist to plaid_items (admin client to guarantee write) ──────────
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("plaid_items")
      .upsert(
        {
          user_id:          userId,
          plaid_item_id,
          access_token,
          institution_id,
          institution_name,
        },
        { onConflict: "user_id,plaid_item_id" },
      )
      .select("id")
      .single();

    if (error) {
      console.error("[plaid/exchange-token] DB upsert failed:", error.message);
      return NextResponse.json({ error: "Failed to save bank connection" }, { status: 500 });
    }

    return NextResponse.json({ item_id: data.id });
  } catch (err) {
    console.error("[plaid/exchange-token]", err);
    return NextResponse.json({ error: "Failed to connect bank account" }, { status: 500 });
  }
}
