/**
 * POST /api/receipts/save-corporate
 *
 * Cockpit-only endpoint that persists an OCR-extracted receipt into
 * `corp_transactions` (Director Cockpit ledger), distinct from the realtor
 * product's `receipt_expenses` table.  Server-side path lets us run the
 * vendor regex match against the trusted RLS view + insert a clean,
 * auth.uid()-scoped row without exposing regex evaluation to the browser.
 *
 * Tenant gate: cockpit access is allowlisted in `/cockpit/layout.tsx` to
 * a single email.  This route mirrors the same allowlist as defence in
 * depth — there is no other use case for `corp_transactions` writes
 * outside the cockpit, and any other caller would be a bug.
 *
 * Vendor match: pulls the user's `corp_vendors` rows, walks them in
 * insert order, and applies the FIRST matching `regex_pattern` against
 * `vendor_name_raw`.  On match: vendor_id, default_account_code,
 * sred_eligible, sred_category, and corp_pct copy across.  On no match:
 * `account_code=NULL`, `needs_review=TRUE`, `review_reason='no vendor
 * regex matched'`.
 *
 * Schema verified against
 *   apps/web/supabase/migrations/00132_corp_director_cockpit.sql
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// Mirror the cockpit layout's allowlist.  If access widens to a bookkeeper
// later, widen both surfaces in the same change.
const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

type SourceChannel = "receipt_upload" | "mobile_photo";

interface SaveBody {
  vendor:         string | null;
  expense_date:   string | null;
  total_amount:   number | null;
  tax_amount:     number | null;
  subtotal:       number | null;
  currency:       string;
  notes:          string | null;
  receipt_path:   string | null;  // storage path from /api/receipts/process
  source_channel?: SourceChannel; // default 'receipt_upload'
}

interface VendorRow {
  id:                   string;
  default_account_code: string | null;
  sred_eligible:        boolean;
  sred_category:        string | null;
  corp_pct:             number;
  regex_pattern:        string;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Authenticate ──────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // ── 2. Rate limit ────────────────────────────────────────────────────────
  const rl = await checkRateLimit(user.id, "corp_receipt_save", 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // ── 3. Parse body ────────────────────────────────────────────────────────
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const vendorRaw = (body.vendor ?? "").trim();
  const expenseDate = body.expense_date && /^\d{4}-\d{2}-\d{2}$/.test(body.expense_date)
    ? body.expense_date
    : todayIso();
  const totalAmount = Number(body.total_amount ?? 0);
  const taxAmount   = Number(body.tax_amount ?? 0);
  const subtotal    = body.subtotal != null
    ? Number(body.subtotal)
    : Math.max(0, totalAmount - taxAmount);
  const currency    = body.currency || "CAD";
  const sourceChannel: SourceChannel = body.source_channel === "mobile_photo"
    ? "mobile_photo"
    : "receipt_upload";

  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return NextResponse.json(
      { ok: false, error: "Invalid total_amount" },
      { status: 400 },
    );
  }

  // ── 4. Vendor regex match ───────────────────────────────────────────────
  const { data: vendorRows, error: vendorErr } = await supabase
    .from("corp_vendors")
    .select("id, default_account_code, sred_eligible, sred_category, corp_pct, regex_pattern")
    .eq("user_id", user.id);

  if (vendorErr) {
    console.error("[receipts/save-corporate] Vendor read error:", vendorErr.message);
    return NextResponse.json(
      { ok: false, error: "Vendor lookup failed" },
      { status: 500 },
    );
  }

  let matched: VendorRow | null = null;
  if (vendorRaw) {
    for (const v of (vendorRows ?? []) as VendorRow[]) {
      try {
        // The seed regexes embed `(?i)` for case-insensitivity at the
        // pattern start; JS RegExp accepts that as an inline flag in
        // modern engines.  Strip it and add the `i` flag explicitly to
        // stay portable across Node versions.
        const raw = v.regex_pattern || "";
        const ci = raw.startsWith("(?i)") ? raw.slice(4) : raw;
        const re = new RegExp(ci, "i");
        if (re.test(vendorRaw)) {
          matched = v;
          break;
        }
      } catch (err) {
        // Bad regex on a vendor row — skip it; continue trying others.
        console.warn(
          "[receipts/save-corporate] Bad regex on vendor",
          v.id,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // ── 5. Lookup account_type from chart of accounts (if matched) ──────────
  let accountType: string | null = null;
  if (matched?.default_account_code) {
    const { data: acct } = await supabase
      .from("corp_chart_of_accounts")
      .select("type")
      .eq("account_code", matched.default_account_code)
      .single();
    accountType = (acct?.type as string | undefined) ?? null;
  }

  // ── 6. Build insert ─────────────────────────────────────────────────────
  // amount_pretax = subtotal (not the taxed total).  If the OCR didn't
  // extract a subtotal, we derive it as max(0, total - tax) above.
  const insertRow = {
    user_id:              user.id,
    date:                 expenseDate,
    amount_pretax:        subtotal,
    gst_hst:              taxAmount,
    amount_total:         totalAmount,
    currency,
    vendor_id:            matched?.id ?? null,
    vendor_name_raw:      vendorRaw || null,
    account_code:         matched?.default_account_code ?? null,
    account_type:         accountType,
    description:          null,
    source_channel:       sourceChannel,
    source_ref:           null,
    receipt_storage_path: body.receipt_path ?? null,
    corp_pct:             matched?.corp_pct ?? 100,
    sred_eligible:        matched?.sred_eligible ?? false,
    sred_category:        matched?.sred_category ?? null,
    pre_incorp_flag:      false,
    incurred_date:        null,
    needs_review:         matched ? false : true,
    review_reason:        matched ? null : "no vendor regex matched",
    ingested_by_user_id:  user.id,
    notes:                body.notes?.trim() || null,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("corp_transactions")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertErr) {
    console.error("[receipts/save-corporate] Insert error:", insertErr.message);
    return NextResponse.json(
      { ok: false, error: `Insert failed: ${insertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: inserted?.id,
    vendor_matched: matched ? true : false,
    needs_review:   insertRow.needs_review,
  });
}
