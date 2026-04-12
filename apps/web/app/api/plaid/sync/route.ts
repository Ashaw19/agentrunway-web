/**
 * POST /api/plaid/sync
 *
 * Runs Plaid /transactions/sync for a connected item (incremental cursor-based).
 * New transactions are upserted into plaid_transactions with review_status='pending'.
 * Auto-categorisation via keyword matching assigns suggested_category.
 *
 * Body: { item_id: string }   ← UUID from plaid_items.id (our DB row)
 * Returns: { added: number, modified: number, removed: number }
 */
import { NextRequest, NextResponse }                  from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createClient }                               from "@/lib/supabase/server";
import { createAdminClient }                          from "@/lib/supabase/admin";
import { requirePro }                                 from "@/lib/require-pro";
import { withRetry }                                  from "@/lib/retry";
import { log }                                        from "@/lib/logger";
import crypto                                         from "crypto";

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

// ── Simple keyword-based auto-categoriser ─────────────────────────────────────
// Maps merchant/description substrings → expense_items.key
const CATEGORY_RULES: Array<{ patterns: RegExp; key: string; confidence: number }> = [
  { patterns: /gas|petro|esso|shell|husky|irving|pioneer|fuel/i,       key: "vehicle_fuel",       confidence: 0.85 },
  { patterns: /carwash|mr\s*lube|oil change|jiffy|midas|canadian tire/i, key: "vehicle_service",   confidence: 0.75 },
  { patterns: /meta\s*ads|facebook\s*ads|google\s*ads|instagram/i,      key: "marketing_ads",     confidence: 0.88 },
  { patterns: /photographer|videographer|drone|media/i,                 key: "marketing_photography", confidence: 0.72 },
  { patterns: /print|staples|vistaprint|fedex\s*print|sign/i,           key: "marketing_print",   confidence: 0.70 },
  { patterns: /restaurant|bistro|cafe|coffee|tim horton|mcdonald|starbucks|subway|pizza/i, key: "meals_client", confidence: 0.60 },
  { patterns: /office\s*supplies|staples|grand\s*&\s*toy/i,             key: "office_supplies",   confidence: 0.78 },
  { patterns: /netflix|spotify|adobe|microsoft|apple\s*subscription|dropbox|zoom|slack|docusign/i, key: "office_software", confidence: 0.82 },
  { patterns: /bell|rogers|telus|shaw|videotron|phone|internet|wireless/i, key: "office_phone",   confidence: 0.83 },
  { patterns: /amazon|best\s*buy|apple\s*store|laptop|computer|monitor/i,  key: "office_hardware", confidence: 0.65 },
  { patterns: /reco|rrea|orea|crea|treb|rebba|rebba2002/i,               key: "prof_licensing",   confidence: 0.90 },
  { patterns: /mls|board\s*dues|realtor\s*dues|association\s*dues/i,     key: "prof_board_mls",   confidence: 0.88 },
  { patterns: /e&o|errors\s*&\s*omissions|professional\s*liability/i,   key: "prof_eo",          confidence: 0.90 },
  { patterns: /accountant|bookkeep|cpa|tax\s*prep|h&r\s*block/i,        key: "prof_accounting",  confidence: 0.85 },
  { patterns: /udemy|coursera|coaching|seminar|conference/i,             key: "edu_courses",      confidence: 0.72 },
];

function suggestCategory(merchant: string | null, description: string): { key: string; confidence: number } | null {
  const text = [merchant ?? "", description].join(" ").toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.test(text)) {
      return { key: rule.key, confidence: rule.confidence };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  // ── 1. Guard: Plaid not configured ────────────────────────────────────────
  if (!process.env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID === "your_plaid_client_id_here") {
    return NextResponse.json({ error: "Plaid credentials not configured." }, { status: 503 });
  }

  // ── 2. Authenticate ───────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── 3. Parse body ─────────────────────────────────────────────────────────
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

  // ── 4. Load item from DB (verify ownership + get access_token) ────────────
  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin
    .from("plaid_items")
    .select("id, user_id, access_token, sync_cursor")
    .eq("id", item_id)
    .eq("user_id", user.id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // ── 5. Run /transactions/sync (paginated until has_more is false) ──────────
  try {
    const plaid = buildPlaidClient();
    let cursor = item.sync_cursor ?? undefined;
    let addedCount    = 0;
    let modifiedCount = 0;
    let removedCount  = 0;

    while (true) {
      const syncResp = await withRetry(
        () => plaid.transactionsSync({ access_token: item.access_token, cursor, count: 500 }),
        { label: "plaid/transactionsSync", attempts: 3 },
      );

      const { added, modified, removed, next_cursor, has_more } = syncResp.data;

      // ── 5a. Upsert added transactions ──────────────────────────────────────
      if (added.length > 0) {
        const rows = added.map((tx) => {
          const suggestion = suggestCategory(tx.merchant_name ?? null, tx.name);
          // Plaid amounts: positive = debit (money out), negative = credit (money in).
          // We only want debits (expenses). Ignore credits (negative amounts).
          const amount = tx.amount; // keep as-is; UI will filter out negatives
          return {
            user_id:               user.id,
            plaid_item_id:         item.id,
            plaid_transaction_id:  tx.transaction_id,
            plaid_account_id:      tx.account_id,
            transaction_date:      tx.date,
            merchant_name:         tx.merchant_name ?? null,
            description:           tx.name,
            amount,
            review_status:         "pending" as const,
            suggested_category:    suggestion?.key     ?? null,
            suggestion_confidence: suggestion?.confidence ?? null,
          };
        });

        await admin
          .from("plaid_transactions")
          .upsert(rows, { onConflict: "user_id,plaid_transaction_id", ignoreDuplicates: true });

        addedCount += added.length;
      }

      // ── 5b. Update modified transactions (category suggestions may change) ──
      if (modified.length > 0) {
        for (const tx of modified) {
          const suggestion = suggestCategory(tx.merchant_name ?? null, tx.name);
          await admin
            .from("plaid_transactions")
            .update({
              merchant_name:         tx.merchant_name ?? null,
              description:           tx.name,
              amount:                tx.amount,
              suggested_category:    suggestion?.key     ?? null,
              suggestion_confidence: suggestion?.confidence ?? null,
            })
            .eq("plaid_transaction_id", tx.transaction_id)
            .eq("user_id", user.id);
        }
        modifiedCount += modified.length;
      }

      // ── 5c. Handle removed transactions ───────────────────────────────────
      if (removed.length > 0) {
        const removedIds = removed.map((r) => r.transaction_id);
        await admin
          .from("plaid_transactions")
          .delete()
          .in("plaid_transaction_id", removedIds)
          .eq("user_id", user.id);
        removedCount += removed.length;
      }

      cursor = next_cursor;
      if (!has_more) break;
    }

    // ── 6. Update cursor + last_synced_at ─────────────────────────────────────
    await admin
      .from("plaid_items")
      .update({
        sync_cursor: cursor,
        last_synced_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", item_id);

    return NextResponse.json({ added: addedCount, modified: modifiedCount, removed: removedCount });
  } catch (err) {
    log.error({ err, requestId }, "[plaid/sync] Plaid sync error");

    // Detect Plaid token/login errors and flag the item for reconnection
    const plaidCode = (err as { response?: { data?: { error_code?: string; error_message?: string } } })
      ?.response?.data?.error_code;
    const plaidMsg = (err as { response?: { data?: { error_message?: string } } })
      ?.response?.data?.error_message;

    if (plaidCode === "ITEM_LOGIN_REQUIRED" || plaidCode === "INVALID_ACCESS_TOKEN") {
      await admin
        .from("plaid_items")
        .update({
          error_code: plaidCode,
          error_message: plaidMsg ?? "Please reconnect this bank account.",
        })
        .eq("id", item_id);

      return NextResponse.json(
        { error: "Bank connection expired. Please reconnect in Settings.", code: plaidCode },
        { status: 401 },
      );
    }

    const message = err instanceof Error ? err.message : "Plaid sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
