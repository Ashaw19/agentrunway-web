/**
 * /api/cockpit/bank-statements — POST (upload + parse + auto-match)
 *
 * Accepts a multipart/form-data upload with:
 *   file       — the CSV file from the bank export
 *   bank_name  — string label (e.g. "RBC Business Chequing")
 *   account_label — optional masked account number (e.g. "****1234")
 *
 * CSV format: the shared Canadian bank export parser
 * (lib/import/bank-csv/parse.ts): known layouts by their header or shape,
 * else column names, else column contents. Lines come back signed here
 * (negative = money out), as corp_bank_lines stores them.
 *
 * Auto-match algorithm runs synchronously after insert:
 *   Pass 1 — exact date + ABS(amount) within $0.02 → confidence 1.0
 *   Pass 2 — ±2-day window + ABS(amount) within $0.02 → confidence 0.8
 * Any line with exactly one candidate gets matched. Multiple candidates
 * leave the line unmatched (ambiguous).
 *
 * Returns:
 *   { ok: true, statement_id, row_count, matched_count, unmatched_count }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseStatementCsv } from "@/lib/import/bank-csv/parse";

export const maxDuration = 60;

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

const AMOUNT_TOLERANCE = 0.02;

// ── CSV parsing ───────────────────────────────────────────────────────────────
// The shared bank and card export parser (lib/import/bank-csv/parse.ts), the
// same one the Expenses → Imports upload uses: RBC, TD, Scotiabank, BMO,
// CIBC, National Bank, Tangerine, Simplii, Desjardins, Amex and generic
// layouts, with account and card numbers removed from descriptions.

type ParsedLine = {
  line_date: string;       // YYYY-MM-DD
  description_raw: string;
  amount_cad: number;      // signed: negative = debit, positive = credit
  balance_cad: number | null;
};

function parseCsv(text: string): ParsedLine[] {
  return parseStatementCsv(text, { kind: "bank" }).lines.map((l) => ({
    line_date: l.date,
    description_raw: l.description,
    amount_cad: l.direction === "out" ? -l.amount : l.amount,
    balance_cad: l.balance,
  }));
}

// ── Auto-match ────────────────────────────────────────────────────────────────

type TxCandidate = {
  id: string;
  date: string;
  amount_total: number;
};

async function runAutoMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  statementId: string,
  lines: { id: string; line_date: string; amount_cad: number }[],
) {
  if (lines.length === 0) return;

  const dates = [...new Set(lines.map(l => l.line_date))].sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  // Fetch corp_transactions in the ±2-day window around the statement period
  const winStart = new Date(minDate);
  winStart.setDate(winStart.getDate() - 2);
  const winEnd = new Date(maxDate);
  winEnd.setDate(winEnd.getDate() + 2);

  const { data: txRows } = await supabase
    .from("corp_transactions")
    .select("id, date, amount_total")
    .eq("user_id", userId)
    .gte("date", winStart.toISOString().slice(0, 10))
    .lte("date", winEnd.toISOString().slice(0, 10));

  if (!txRows || txRows.length === 0) return;

  const txByDate = new Map<string, TxCandidate[]>();
  for (const tx of txRows as TxCandidate[]) {
    const arr = txByDate.get(tx.date) ?? [];
    arr.push(tx);
    txByDate.set(tx.date, arr);
  }

  for (const line of lines) {
    const absAmt = Math.abs(line.amount_cad);

    // Pass 1: exact date
    const exactCandidates = (txByDate.get(line.line_date) ?? [])
      .filter(tx => Math.abs(tx.amount_total - absAmt) <= AMOUNT_TOLERANCE);

    if (exactCandidates.length === 1) {
      await supabase
        .from("corp_bank_lines")
        .update({
          match_status:     "matched",
          matched_tx_id:    exactCandidates[0].id,
          match_method:     "auto-exact",
          match_confidence: 1.0,
          updated_at:       new Date().toISOString(),
        })
        .eq("id", line.id);
      continue;
    }

    // Pass 2: ±2-day window
    const windowCandidates: TxCandidate[] = [];
    for (let offset = -2; offset <= 2; offset++) {
      if (offset === 0) continue;
      const d = new Date(line.line_date);
      d.setDate(d.getDate() + offset);
      const ds = d.toISOString().slice(0, 10);
      const hits = (txByDate.get(ds) ?? [])
        .filter(tx => Math.abs(tx.amount_total - absAmt) <= AMOUNT_TOLERANCE);
      windowCandidates.push(...hits);
    }

    const allCandidates = [...exactCandidates, ...windowCandidates];
    if (allCandidates.length === 1) {
      await supabase
        .from("corp_bank_lines")
        .update({
          match_status:     "matched",
          matched_tx_id:    allCandidates[0].id,
          match_method:     "auto-window",
          match_confidence: 0.8,
          updated_at:       new Date().toISOString(),
        })
        .eq("id", line.id);
    }
    // 0 or >1 candidates → leave unmatched
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const bankName = (formData.get("bank_name") as string | null)?.trim();
  const accountLabel = (formData.get("account_label") as string | null)?.trim() || null;

  if (!file) return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  if (!bankName) return NextResponse.json({ ok: false, error: "bank_name is required" }, { status: 400 });

  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read file" }, { status: 400 });
  }

  const parsedLines = parseCsv(csvText);
  if (parsedLines.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No rows parsed. Check that the CSV has a Date column and either Debit/Credit columns or a signed Amount column.",
    }, { status: 422 });
  }

  // Derive period from parsed lines
  const sortedDates = parsedLines.map(l => l.line_date).sort();
  const periodStart = sortedDates[0];
  const periodEnd = sortedDates[sortedDates.length - 1];

  // Create statement record
  const { data: stmt, error: stmtErr } = await supabase
    .from("corp_bank_statements")
    .insert({
      user_id:       user.id,
      bank_name:     bankName,
      account_label: accountLabel,
      period_start:  periodStart,
      period_end:    periodEnd,
      raw_filename:  file.name,
    })
    .select("id")
    .single();

  if (stmtErr || !stmt) {
    console.error("[bank-statements POST] insert statement", stmtErr?.message);
    return NextResponse.json({ ok: false, error: "Failed to create statement record" }, { status: 500 });
  }

  const statementId = stmt.id;

  // Batch-insert all lines
  const lineInserts = parsedLines.map(l => ({
    user_id:         user.id,
    statement_id:    statementId,
    line_date:       l.line_date,
    description_raw: l.description_raw,
    amount_cad:      l.amount_cad,
    balance_cad:     l.balance_cad,
  }));

  const { data: insertedLines, error: linesErr } = await supabase
    .from("corp_bank_lines")
    .insert(lineInserts)
    .select("id, line_date, amount_cad");

  if (linesErr || !insertedLines) {
    console.error("[bank-statements POST] insert lines", linesErr?.message);
    // Clean up orphaned statement
    await supabase.from("corp_bank_statements").delete().eq("id", statementId);
    return NextResponse.json({ ok: false, error: "Failed to insert statement lines" }, { status: 500 });
  }

  // Run auto-match (best-effort — failure doesn't abort the upload)
  try {
    await runAutoMatch(supabase, user.id, statementId, insertedLines);
  } catch (e) {
    console.error("[bank-statements POST] auto-match error", e);
  }

  // Read final counts from the trigger-updated statement row
  const { data: finalStmt } = await supabase
    .from("corp_bank_statements")
    .select("row_count, matched_count, unmatched_count, manual_count")
    .eq("id", statementId)
    .single();

  return NextResponse.json({
    ok: true,
    statement_id:    statementId,
    row_count:       finalStmt?.row_count ?? parsedLines.length,
    matched_count:   finalStmt?.matched_count ?? 0,
    unmatched_count: finalStmt?.unmatched_count ?? parsedLines.length,
  }, { status: 201 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase()))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10)));

  const { data, error: dbErr } = await supabase
    .from("v_corp_bank_reconciliation_summary")
    .select("*")
    .eq("user_id", user.id)
    .limit(limit);

  if (dbErr) {
    console.error("[bank-statements GET]", dbErr.message);
    return NextResponse.json({ ok: false, error: "DB read failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, statements: data ?? [] });
}
