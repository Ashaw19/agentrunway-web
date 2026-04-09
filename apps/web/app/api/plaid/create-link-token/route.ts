/**
 * POST /api/plaid/create-link-token
 *
 * Generates a short-lived Plaid link_token for the authenticated user.
 * The link_token is passed to the Plaid Link SDK on the client to open
 * the bank-selection flow.
 *
 * Returns: { link_token: string }
 */
import { NextResponse }                                     from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments,
         Products, CountryCode }                            from "plaid";
import { createClient }                                     from "@/lib/supabase/server";
import { requirePro }                                       from "@/lib/require-pro";

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

export async function POST() {
  // ── 1. Guard: Plaid not configured ────────────────────────────────────────
  if (!process.env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID === "your_plaid_client_id_here") {
    return NextResponse.json(
      { error: "Plaid credentials not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to your environment variables." },
      { status: 503 },
    );
  }

  // ── 2. Authenticate ───────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── 3. Create link token ──────────────────────────────────────────────────
  try {
    const plaid = buildPlaidClient();
    const response = await plaid.linkTokenCreate({
      user:          { client_user_id: user.id },
      client_name:   "Agent Runway",
      products:      [Products.Transactions],
      country_codes: [CountryCode.Ca],
      language:      "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("[plaid/create-link-token]", err);
    return NextResponse.json({ error: "Failed to initialize bank connection" }, { status: 500 });
  }
}
