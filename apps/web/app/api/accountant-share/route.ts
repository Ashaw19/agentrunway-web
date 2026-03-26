/**
 * GET /api/accountant-share?token=xxx
 *
 * Public endpoint (no auth required) — validates the accountant share token
 * and returns read-only financial data for the agent.
 *
 * Returns only data the agent has opted to share (t2125, expenses, transactions, mileage).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the share token
  const { data: share, error: shareErr } = await admin
    .from("accountant_shares")
    .select("*")
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (shareErr || !share) {
    return NextResponse.json(
      { error: "Invalid or expired share link" },
      { status: 404 }
    );
  }

  // Check expiration
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This share link has expired" },
      { status: 410 }
    );
  }

  const userId = share.user_id;
  const year = new Date().getFullYear();

  // Update access log
  await admin
    .from("accountant_shares")
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (share.access_count ?? 0) + 1,
    })
    .eq("id", share.id);

  // Fetch agent settings
  const { data: settings } = await admin
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!settings) {
    return NextResponse.json(
      { error: "Agent profile not found" },
      { status: 404 }
    );
  }

  const result: Record<string, unknown> = {
    agentName: settings.display_name,
    brokerageName: settings.brokerage_name,
    businessName: settings.business_name,
    province: settings.province,
    year,
    label: share.label,
  };

  // Conditionally fetch data based on share permissions

  if (share.share_transactions) {
    const { data: transactions } = await admin
      .from("transactions")
      .select("id, property_address, date, sale_price, commission_rate, gci_override, side, status")
      .eq("user_id", userId)
      .eq("status", "closed")
      .gte("date", `${year}-01-01`)
      .order("date", { ascending: false })
      .limit(10000);
    result.transactions = transactions ?? [];
  }

  if (share.share_expenses) {
    const { data: categories } = await admin
      .from("expense_categories")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order");

    const { data: items } = await admin
      .from("expense_items")
      .select("*")
      .eq("user_id", userId);

    const { data: receipts } = await admin
      .from("receipt_expenses")
      .select("category_key, total_amount")
      .eq("user_id", userId)
      .gte("expense_date", `${year}-01-01`);

    const receiptTotalsByKey: Record<string, number> = {};
    for (const r of receipts ?? []) {
      if (r.category_key && r.total_amount != null) {
        receiptTotalsByKey[r.category_key] =
          (receiptTotalsByKey[r.category_key] ?? 0) + Number(r.total_amount);
      }
    }

    result.expenseCategories = (categories ?? []).map((cat) => ({
      ...cat,
      items: (items ?? []).filter((i) => i.category_id === cat.id),
    }));
    result.receiptTotalsByKey = receiptTotalsByKey;
  }

  if (share.share_mileage) {
    const { data: mileage } = await admin
      .from("mileage_logs")
      .select("trip_date, description, from_location, to_location, km, deduction, purpose")
      .eq("user_id", userId)
      .gte("trip_date", `${year}-01-01`)
      .order("trip_date", { ascending: false });
    result.mileageLogs = mileage ?? [];
  }

  if (share.share_t2125) {
    const { data: ccaAssets } = await admin
      .from("t2125_cca_assets")
      .select("*")
      .eq("user_id", userId);
    result.ccaAssets = ccaAssets ?? [];
  }

  return NextResponse.json(result);
}
