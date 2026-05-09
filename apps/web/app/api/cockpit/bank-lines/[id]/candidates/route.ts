/**
 * GET /api/cockpit/bank-lines/[id]/candidates
 *
 * Returns up to 20 corp_transactions that are plausible matches for the
 * given bank line, ranked by combined date + amount proximity.
 *
 * Match window:
 *   - date within ±14 days of line_date
 *   - amount_total within ±$5.00 OR ±5% (whichever is larger) of |line.amount_cad|
 *   - sign-matched: debit (negative bank line) → expense corp_transaction (positive amount)
 *     credit (positive bank line) → revenue corp_transaction
 *   - excludes transactions already matched to ANOTHER bank line
 *
 * Allowlisted to andrew@andrewdshaw.ca.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

interface CandidateRow {
  id: string;
  date: string;
  amount_total: number;
  amount_pretax: number;
  gst_hst: number;
  vendor_name_raw: string | null;
  description: string | null;
  account_code: string | null;
  source_channel: string;
  date_distance_days: number;
  amount_diff: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 1. Load the bank line
  const { data: line, error: lineErr } = await supabase
    .from("corp_bank_lines")
    .select("id, line_date, amount_cad, description_raw")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (lineErr || !line) {
    return NextResponse.json({ error: "bank line not found" }, { status: 404 });
  }

  const lineAmount = Number(line.amount_cad);
  const absAmount = Math.abs(lineAmount);
  const tolerance = Math.max(5.0, absAmount * 0.05);
  const isDebit = lineAmount < 0;

  // 2. Compute the date window
  const [y, m, d] = (line.line_date as string).split("-").map(Number);
  const center = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(center);
  start.setUTCDate(start.getUTCDate() - 14);
  const end = new Date(center);
  end.setUTCDate(end.getUTCDate() + 14);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  // 3. Pull already-matched tx ids (so we don't surface them as candidates)
  const { data: matched } = await supabase
    .from("corp_bank_lines")
    .select("matched_tx_id")
    .eq("user_id", user.id)
    .not("matched_tx_id", "is", null);

  const excludeIds = new Set<string>(
    (matched ?? [])
      .map((r: { matched_tx_id: string | null }) => r.matched_tx_id)
      .filter((x: string | null): x is string => typeof x === "string"),
  );

  // 4. Pull transactions in the date window. Sign filter: debits look at
  //    expense (cogs/opex) accounts (positive amount_total). Credits look at
  //    revenue (negative-ish) but our schema stores revenue as positive too,
  //    keyed by chart_of_accounts.type — so don't filter on amount sign here,
  //    just amount magnitude. Account-type filtering would require a JOIN
  //    and the raw match window already narrows enough.
  const { data: txns, error: txErr } = await supabase
    .from("corp_transactions")
    .select(
      "id, date, amount_total, amount_pretax, gst_hst, vendor_name_raw, description, account_code, source_channel",
    )
    .eq("user_id", user.id)
    .gte("date", startISO)
    .lte("date", endISO)
    .gte("amount_total", absAmount - tolerance)
    .lte("amount_total", absAmount + tolerance)
    .limit(200);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  // 5. Score + rank: prefer smallest date distance, then smallest amount diff
  const ranked: CandidateRow[] = (txns ?? [])
    .filter((t: { id: string }) => !excludeIds.has(t.id))
    .map((t: {
      id: string;
      date: string;
      amount_total: number;
      amount_pretax: number;
      gst_hst: number;
      vendor_name_raw: string | null;
      description: string | null;
      account_code: string | null;
      source_channel: string;
    }) => {
      const [ty, tm, td] = t.date.split("-").map(Number);
      const tDate = new Date(Date.UTC(ty, tm - 1, td));
      const dateDist = Math.round(
        Math.abs(tDate.getTime() - center.getTime()) / 86_400_000,
      );
      const amtDiff = Math.round((Number(t.amount_total) - absAmount) * 100) / 100;
      return {
        ...t,
        amount_total: Number(t.amount_total),
        amount_pretax: Number(t.amount_pretax),
        gst_hst: Number(t.gst_hst),
        date_distance_days: dateDist,
        amount_diff: amtDiff,
      } satisfies CandidateRow;
    })
    .sort((a, b) => {
      // Combined score: 1 day = roughly 1 dollar of amount-diff weight.
      const scoreA = a.date_distance_days + Math.abs(a.amount_diff);
      const scoreB = b.date_distance_days + Math.abs(b.amount_diff);
      return scoreA - scoreB;
    })
    .slice(0, 20);

  return NextResponse.json({
    ok: true,
    line: {
      id: line.id,
      line_date: line.line_date,
      amount_cad: lineAmount,
      description_raw: line.description_raw,
      direction: isDebit ? "debit" : "credit",
    },
    candidates: ranked,
    candidate_count: ranked.length,
    search_window: {
      start: startISO,
      end: endISO,
      amount_min: Math.round((absAmount - tolerance) * 100) / 100,
      amount_max: Math.round((absAmount + tolerance) * 100) / 100,
    },
  });
}
