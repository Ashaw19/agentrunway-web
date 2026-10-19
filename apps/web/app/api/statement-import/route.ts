/**
 * /api/statement-import: bank and credit-card statement import (Expenses →
 * Imports).
 *
 * POST (multipart/form-data): upload one statement and stage its lines.
 *   file          a CSV/TSV export or a PDF statement (4 MB at most), or
 *   rows          JSON rows of an Excel statement, read in the browser
 *                 (lib/import/bank-csv/xlsx-rows.ts), with file_hash and file_name
 *   kind          "bank" | "credit_card"
 *   account_label what the agent calls the account (digits are removed)
 *   mapping       optional JSON column mapping, when the columns couldn't be read
 *   date_order    "mdy" | "dmy" | "ymd", when every date could be read either way
 *
 * Nothing reaches the expense records here: lines are staged for review.
 * The same file uploaded again lands on the same statement, and a line
 * already staged (same fingerprint) is never staged twice. The uploaded file
 * is read in memory and not stored anywhere.
 *
 * GET: the review: statements, their lines, matched receipts, and the
 * reconciliation lists. ?statement=<id> narrows it to one statement.
 *
 * Never logs a description or an amount.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePro } from "@/lib/require-pro";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";
import { decodeStatementBytes } from "@/lib/import/bank-csv/csv";
import { parseStatementCsv, parseStatementRows, type ParsedStatementLine, type StatementColumnMapping, type StatementKind } from "@/lib/import/bank-csv/parse";
import { scrubAccountLabel, scrubFileName } from "@/lib/import/bank-csv/scrub";
import { classifyByRules, unclassified, type ClassifyInput, type LineClassification } from "@/lib/statement-import/classify";
import { classifyWithModel } from "@/lib/statement-import/classify-model";
import { extractPdfStatement } from "@/lib/statement-import/pdf-extract";
import { buildLineRows, fileHash, fingerprintLines } from "@/lib/statement-import/stage";
import { loadActiveRecurring, loadLinesBetween, loadReceiptsBetween, loadStatementReview } from "@/lib/statement-import/server";
import { duplicateSearchWindow, relatedLinesWindow, type StatementVerification } from "@agent-runway/core/engines/statement-import-engine";
import type { DateOrder } from "@/lib/import/bank-csv/values";
import { fetchAllIn } from "@/lib/supabase/fetch-all";

export const maxDuration = 300;

/** Vercel's request body limit is about 4.5 MB. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Lines one upload may stage. */
const MAX_LINES = 5000;

const MappingSchema = z.object({
  headerRow: z.number().int().min(0).nullable().optional(),
  firstDataRow: z.number().int().min(0).optional(),
  date: z.number().int().min(0).max(39),
  description: z.array(z.number().int().min(0).max(39)).min(1).max(3),
  amount: z.number().int().min(0).max(39).nullable().optional(),
  debit: z.number().int().min(0).max(39).nullable().optional(),
  credit: z.number().int().min(0).max(39).nullable().optional(),
  dateOrder: z.enum(["ymd", "mdy", "dmy"]).nullable().optional(),
  negativeIs: z.enum(["out", "in"]).nullable().optional(),
});

const RowsSchema = z.array(z.array(z.string().max(500)).max(40)).max(20000);

function bad(error: string, status = 422, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

interface Parsed {
  lines: ParsedStatementLine[];
  sourceFormat: string;
  institution: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  warnings: string[];
  skippedRows: number;
  statedTotalOut: number | null;
  statedTotalIn: number | null;
  openingBalance: number | null;
  closingBalance: number | null;
  verification: StatementVerification;
}

const NEEDS_DATE_ORDER = "The dates in this file could be month/day or day/month. Choose which before it is read.";

function skippedNote(skipped: Record<string, number>): string | null {
  const parts = Object.entries(skipped).filter(([, n]) => n > 0).map(([reason, n]) => `${n} ${reason}`);
  return parts.length > 0 ? `Rows left out: ${parts.join(", ")}.` : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("Unauthorized", 401);

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "statement-import", 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please wait before uploading another statement." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_FILE_BYTES + 512 * 1024) return bad("That file is larger than 4 MB. Export one month at a time.", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Expected a file upload.", 400);
  }

  const kindRaw = String(form.get("kind") ?? "");
  if (kindRaw !== "bank" && kindRaw !== "credit_card") return bad("Choose whether this is a bank account or a credit card.", 400);
  const kind: StatementKind = kindRaw;
  const labelRaw = String(form.get("account_label") ?? "").slice(0, 200);

  let mapping: Partial<StatementColumnMapping> | null = null;
  const mappingRaw = form.get("mapping");
  if (typeof mappingRaw === "string" && mappingRaw.trim()) {
    try {
      const m = MappingSchema.safeParse(JSON.parse(mappingRaw));
      if (!m.success || (m.data.amount == null && m.data.debit == null && m.data.credit == null)) return bad("The column choices are incomplete: a date, a description and an amount (or debit and credit) are needed.", 400);
      mapping = m.data;
    } catch {
      return bad("The column choices could not be read.", 400);
    }
  }

  const dateOrderRaw = String(form.get("date_order") ?? "");
  const dateOrder: DateOrder | null = dateOrderRaw === "mdy" || dateOrderRaw === "dmy" || dateOrderRaw === "ymd" ? dateOrderRaw : null;

  const today = atlanticISODate();
  let hash: string;
  let fileName: string | null = null;
  let parsed: Parsed;

  const rowsRaw = form.get("rows");
  const file = form.get("file");
  if (typeof rowsRaw === "string") {
    // An Excel statement, read in the browser.
    let rows: string[][];
    try {
      const r = RowsSchema.safeParse(JSON.parse(rowsRaw));
      if (!r.success) return bad("The spreadsheet could not be read. Try saving it as CSV.", 400);
      rows = r.data;
    } catch {
      return bad("The spreadsheet could not be read. Try saving it as CSV.", 400);
    }
    const givenHash = String(form.get("file_hash") ?? "");
    hash = /^[0-9a-f]{64}$/.test(givenHash) ? givenHash : fileHash(new TextEncoder().encode(rowsRaw));
    fileName = scrubFileName(String(form.get("file_name") ?? "statement.xlsx"));
    const p = parseStatementRows(rows, { kind, mapping, dateOrder });
    if (p.needsMapping) {
      return bad("The columns in this spreadsheet couldn't be told apart. Choose which column is which.", 422, { needsMapping: true, preview: p.preview, columnCount: p.columnCount });
    }
    if (p.needsDateOrder) return bad(NEEDS_DATE_ORDER, 422, { needsDateOrder: true, sampleDates: p.sampleDates });
    parsed = {
      lines: p.lines, sourceFormat: `xlsx:${p.formatId}`, institution: p.institution,
      periodStart: p.periodStart, periodEnd: p.periodEnd,
      warnings: [...p.warnings, ...(skippedNote(p.skipped) ? [skippedNote(p.skipped)!] : [])],
      skippedRows: Object.values(p.skipped).reduce((a, b) => a + b, 0),
      statedTotalOut: null, statedTotalIn: null, openingBalance: null, closingBalance: null,
      verification: "not_applicable",
    };
  } else if (file instanceof File) {
    if (file.size === 0) return bad("That file is empty.", 400);
    if (file.size > MAX_FILE_BYTES) return bad("That file is larger than 4 MB. Export one month at a time.", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    hash = fileHash(bytes);
    fileName = scrubFileName(file.name);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf" || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
    if (/\.xlsx?$/i.test(file.name)) return bad("Excel files are read in the browser. Reload the page and upload it again.", 400);
    if (isPdf) {
      if (!process.env.ANTHROPIC_API_KEY) return bad("Reading PDF statements isn't available right now. Upload the CSV export instead.", 503);
      const v = await extractPdfStatement(Buffer.from(bytes).toString("base64"), user.id, today, kind);
      if (!v.ok) return bad(v.error ?? "The PDF could not be read.");
      parsed = {
        lines: v.lines, sourceFormat: "pdf", institution: v.institution,
        periodStart: v.periodStart, periodEnd: v.periodEnd, warnings: v.warnings, skippedRows: 0,
        statedTotalOut: v.statedTotalOut, statedTotalIn: v.statedTotalIn,
        openingBalance: v.openingBalance, closingBalance: v.closingBalance,
        verification: v.verification,
      };
    } else {
      const text = decodeStatementBytes(bytes);
      if ((text.slice(0, 2000).match(/\u0000/g) ?? []).length > 20) return bad("This file isn't a text export. Upload the CSV from the bank's website, or the PDF statement.");
      const p = parseStatementCsv(text, { kind, mapping, dateOrder });
      if (p.needsMapping) {
        return bad("The columns in this file couldn't be told apart. Choose which column is which.", 422, { needsMapping: true, preview: p.preview, columnCount: p.columnCount });
      }
      if (p.needsDateOrder) return bad(NEEDS_DATE_ORDER, 422, { needsDateOrder: true, sampleDates: p.sampleDates });
      parsed = {
        lines: p.lines, sourceFormat: `csv:${p.formatId}`, institution: p.institution,
        periodStart: p.periodStart, periodEnd: p.periodEnd,
        warnings: [...p.warnings, ...(skippedNote(p.skipped) ? [skippedNote(p.skipped)!] : [])],
        skippedRows: Object.values(p.skipped).reduce((a, b) => a + b, 0),
        statedTotalOut: null, statedTotalIn: null, openingBalance: null, closingBalance: null,
        verification: "not_applicable",
      };
    }
  } else {
    return bad("Choose a statement file to upload.", 400);
  }

  // A date after today is a misread, not a charge.
  const future = parsed.lines.filter((l) => l.date > today).length;
  let lines = parsed.lines.filter((l) => l.date <= today);
  if (future > 0) parsed.warnings.push(`${future} line${future === 1 ? "" : "s"} dated after today ${future === 1 ? "was" : "were"} left out.`);
  if (lines.length === 0) return bad("No transactions with a date and an amount were found in this file.");
  if (lines.length > MAX_LINES) return bad(`This file has more than ${MAX_LINES} lines. Export a shorter period.`);
  lines = lines.map((l) => ({ ...l, amount: Math.round(l.amount * 100) / 100 })).filter((l) => l.amount > 0);

  const dates = lines.map((l) => l.date).sort();
  const periodStart = parsed.periodStart && parsed.periodStart <= dates[0] ? parsed.periodStart : dates[0];
  const periodEnd = parsed.periodEnd && parsed.periodEnd >= dates[dates.length - 1] ? parsed.periodEnd : dates[dates.length - 1];

  // ── The statement row: the same file again lands on the same row ────────
  const { data: existing, error: existingErr } = await supabase
    .from("imported_statements")
    .select("id, account_label")
    .eq("user_id", user.id)
    .eq("file_hash", hash)
    .maybeSingle();
  if (existingErr) return bad("Could not read your imports. Try again.", 500);

  let statementId: string;
  let accountLabel: string;
  let createdStatement = false;
  if (existing) {
    statementId = existing.id;
    accountLabel = existing.account_label;
  } else {
    const fallback = `${parsed.institution ?? ""} ${kind === "credit_card" ? "card" : "account"}`.trim();
    accountLabel = scrubAccountLabel(labelRaw, fallback);
    const { data: stmt, error: stmtErr } = await supabase
      .from("imported_statements")
      .insert({
        user_id: user.id,
        kind,
        source_format: parsed.sourceFormat.slice(0, 40),
        institution: parsed.institution,
        account_label: accountLabel,
        file_name: fileName,
        file_hash: hash,
        period_start: periodStart,
        period_end: periodEnd,
        stated_total_out: parsed.statedTotalOut,
        stated_total_in: parsed.statedTotalIn,
        opening_balance: parsed.openingBalance,
        closing_balance: parsed.closingBalance,
        verification: parsed.verification,
        warnings: parsed.warnings.slice(0, 20),
      })
      .select("id")
      .single();
    if (stmtErr || !stmt) {
      console.error("[statement-import] statement insert failed", stmtErr?.code);
      return bad("Could not save the import. Try again.", 500);
    }
    statementId = stmt.id;
    createdStatement = true;
  }

  // ── Lines already staged (same fingerprint) are left as they are ────────
  const fingerprints = fingerprintLines(lines, accountLabel);
  const { data: known, error: knownErr } = await fetchAllIn<string, { fingerprint: string }>(fingerprints, (chunk, from, to) =>
    supabase.from("statement_lines").select("fingerprint").eq("user_id", user.id).in("fingerprint", chunk).order("id").range(from, to),
  );
  if (knownErr) return bad("Could not read your imports. Try again.", 500);
  const knownSet = new Set(known.map((k) => k.fingerprint));
  const fresh = lines.map((l, i) => ({ l, fp: fingerprints[i] })).filter((x) => !knownSet.has(x.fp));

  let added = 0;
  if (fresh.length > 0) {
    const freshLines = fresh.map((x) => x.l);
    // Estimates: rules first, the model for what they leave.
    const inputs: ClassifyInput[] = freshLines.map((l) => ({
      description: l.description, merchant: l.merchant, amount: l.amount, direction: l.direction,
      sourceCategory: l.sourceCategory, sourceBusiness: l.sourceBusiness,
    }));
    const byRules = inputs.map((i) => classifyByRules(i));
    const leftIdx = byRules.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    const byModel = await classifyWithModel(leftIdx.map((i) => inputs[i]), user.id);
    const classifications: LineClassification[] = byRules.map((c) => c ?? unclassified());
    leftIdx.forEach((idx, k) => {
      if (byModel[k]) classifications[idx] = byModel[k]!;
    });

    // Duplicates: against the receipts and recurring charges on file, and
    // the lines of every other import around these dates.
    const dated = freshLines.map((l) => ({ line_date: l.date }));
    const window = duplicateSearchWindow(dated);
    const linesWindow = relatedLinesWindow(dated);
    let receipts: Awaited<ReturnType<typeof loadReceiptsBetween>> = [];
    let recurring: Awaited<ReturnType<typeof loadActiveRecurring>> = [];
    let existingLines: Awaited<ReturnType<typeof loadLinesBetween>> = [];
    try {
      [receipts, recurring, existingLines] = await Promise.all([
        window ? loadReceiptsBetween(supabase, user.id, window.from, window.to) : Promise.resolve([]),
        loadActiveRecurring(supabase, user.id),
        linesWindow ? loadLinesBetween(supabase, user.id, linesWindow.from, linesWindow.to) : Promise.resolve([]),
      ]);
    } catch {
      if (createdStatement) await supabase.from("imported_statements").delete().eq("id", statementId);
      return bad("Could not check this statement against your receipts. Nothing was imported; try again.", 500);
    }

    const rows = buildLineRows({
      userId: user.id,
      statementId,
      lines: freshLines,
      fingerprints: fresh.map((x) => x.fp),
      classifications,
      receipts,
      recurring,
      existingLines,
    });

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { data: inserted, error: insErr } = await supabase
        .from("statement_lines")
        .upsert(chunk, { onConflict: "user_id,fingerprint", ignoreDuplicates: true })
        .select("id");
      if (insErr) {
        console.error("[statement-import] line insert failed", insErr.code, `${chunk.length} lines`);
        if (createdStatement && added === 0) await supabase.from("imported_statements").delete().eq("id", statementId);
        return bad("Could not save the statement lines. Nothing more was imported; try again.", 500);
      }
      added += inserted?.length ?? 0;
    }
  }

  if (createdStatement && added === 0) {
    // Every line was already staged under another import (an overlapping export).
    await supabase.from("imported_statements").delete().eq("id", statementId);
    return NextResponse.json({
      ok: true,
      statementId: null,
      reused: false,
      added: 0,
      alreadyImported: lines.length,
      warnings: [...parsed.warnings, "Every line in this file was already imported from another file."],
    });
  }

  return NextResponse.json({
    ok: true,
    statementId,
    reused: !createdStatement,
    added,
    alreadyImported: lines.length - added,
    skippedRows: parsed.skippedRows,
    warnings: parsed.warnings,
  }, { status: createdStatement ? 201 : 200 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("Unauthorized", 401);
  const statement = new URL(req.url).searchParams.get("statement");
  try {
    const review = await loadStatementReview(supabase, user.id, statement ? [statement] : null);
    return NextResponse.json({ ok: true, ...review });
  } catch (err) {
    console.error("[statement-import] review read failed", err instanceof Error ? err.message.slice(0, 80) : "");
    return bad("Could not load your imports.", 500);
  }
}
