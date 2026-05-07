/**
 * /api/cockpit/bank-statements — POST (upload + parse + auto-match)
 *
 * Accepts a multipart/form-data upload with:
 *   file       — the CSV file from the bank export
 *   bank_name  — string label (e.g. "RBC Business Chequing")
 *   account_label — optional masked account number (e.g. "****1234")
 *
 * CSV format: a flexible header-detection parser that supports the most
 * common Canadian business-bank exports. It scans the header row for
 * recognizable column names and maps them to: date, description, debit,
 * credit, amount (if signed), balance.
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

export const maxDuration = 60;

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

const AMOUNT_TOLERANCE = 0.02;

// ── CSV parsing ───────────────────────────────────────────────────────────────

type ParsedLine = {
  line_date: string;       // YYYY-MM-DD
  description_raw: string;
  amount_cad: number;      // signed: negative = debit, positive = credit
  balance_cad: number | null;
};

function normalizeHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or DD/MM/YYYY — we'll assume MM/DD/YYYY (RBC/TD North American format)
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[1].padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
  // DD-Mon-YYYY (e.g. 01-Apr-2026)
  const months: Record<string, string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };
  const m2 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m2) {
    const mon = months[m2[2].toLowerCase()];
    if (mon) return `${m2[3]}-${mon}-${m2[1].padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/[$,\s]/g, "");
  if (s === "" || s === "-") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseCsvRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Find header row — scan first 5 rows for one that has "date" in it
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (lines[i].toLowerCase().includes("date")) { headerIdx = i; break; }
  }

  const headers = parseCsvRow(lines[headerIdx]).map(normalizeHeader);

  // Column index resolution
  const col = (names: string[]): number =>
    names.reduce((found, n) => found >= 0 ? found : headers.indexOf(n), -1);

  const dateIdx   = col(["date", "transactiondate", "posteddate"]);
  const descIdx   = col(["description", "transactiondetails", "memo", "details", "payee", "transactiontype"]);
  const debitIdx  = col(["debit", "withdrawals", "withdrawal", "debitamount", "charges"]);
  const creditIdx = col(["credit", "deposits", "deposit", "creditamount", "payments"]);
  const amtIdx    = col(["amount", "amt"]); // signed single-column format
  const balIdx    = col(["balance", "runningbalance"]);

  if (dateIdx < 0 || (descIdx < 0)) return [];
  const hasSplitDebitCredit = debitIdx >= 0 && creditIdx >= 0;
  const hasSignedAmount = amtIdx >= 0;
  if (!hasSplitDebitCredit && !hasSignedAmount) return [];

  const result: ParsedLine[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    if (cells.length < 2) continue;

    const dateStr = parseDate(cells[dateIdx] ?? "");
    if (!dateStr) continue;

    const desc = (cells[descIdx] ?? "").trim();
    if (!desc) continue;

    let amount: number | null = null;
    if (hasSplitDebitCredit) {
      const debit  = parseAmount(cells[debitIdx] ?? "");
      const credit = parseAmount(cells[creditIdx] ?? "");
      if (debit != null && debit !== 0) amount = -Math.abs(debit);
      else if (credit != null && credit !== 0) amount = Math.abs(credit);
      else amount = 0;
    } else {
      amount = parseAmount(cells[amtIdx] ?? "");
    }

    if (amount == null) continue;

    result.push({
      line_date: dateStr,
      description_raw: desc,
      amount_cad: amount,
      balance_cad: balIdx >= 0 ? (parseAmount(cells[balIdx] ?? "") ?? null) : null,
    });
  }
  return result;
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
