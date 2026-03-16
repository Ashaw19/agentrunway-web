/**
 * run-accuracy-tests.ts
 *
 * Automated accuracy test runner for the import-history extraction pipeline.
 * Calls the Groq API directly (bypassing the Next.js route and rate limit)
 * to test hundreds of synthetic reports and produce a detailed accuracy report.
 *
 * Usage:
 *   GROQ_API_KEY=gsk_... npx ts-node --esm scripts/import-tests/run-accuracy-tests.ts [options]
 *
 * Options:
 *   --format A1,B2,C1     Only test these formats (default: all)
 *   --count N             Reports per format (default: 20)
 *   --concurrency N       Parallel LLM calls (default: 3, respect Groq rate limits)
 *   --out ./results.json  Save full results to JSON file
 *
 * Output:
 *   - Per-format accuracy table (GCI, sale_price, names, date, address)
 *   - Field-level F1 scores
 *   - List of systematic failures with example content
 *   - Overall pass/fail summary
 */

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { generateSyntheticReports, type SyntheticReport, type GroundTruthDeal } from "./generate-reports.js";

// ── Import extraction logic directly ──────────────────────────────────────────
// We re-implement the key parts here so we can call without HTTP overhead.
// If the prompts change in route.ts, update them here too.

// Default model for iteration. Override with --model flag:
//   --model llama-3.3-70b-versatile   (production model, 6k TPM, needs 65s delay)
//   --model llama-3.1-8b-instant      (fast iteration, 20k TPM, 20s delay is fine)
let GROQ_TEXT_MODEL = "llama-3.1-8b-instant";

function excelSerialToISO(serial: number): string {
  const ANCHOR_DATE   = new Date(Date.UTC(2023, 0, 1));
  const ANCHOR_SERIAL = 44927;
  const ms  = ANCHOR_DATE.getTime() + (serial - ANCHOR_SERIAL) * 86_400_000;
  const d   = new Date(ms);
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDateFormats(content: string): string {
  // Pass 1 — Excel serial numbers (5-digit integers, ~2015-2035 range)
  //
  // Strategy: if the content is a CSV with a labelled Date column, only convert
  // serials in THAT column — prevents false-positives from GCI/price values that
  // happen to fall in the 42000–47999 range (e.g. a $45,000 commission).
  // Falls back to a generic cell-boundary regex for non-CSV content.
  const SERIAL_RE = /^(4[2-7]\d{3}|48[0-3]\d\d)$/;

  const lines = content.split("\n");
  let dateColIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = lines[i].split(",");
    if (cells.length >= 3) {
      const idx = cells.findIndex(c =>
        /\b(?:close[\s_]?)?date\b|\bclosing\b|\bsettlement[\s_]date\b/i.test(c.trim())
      );
      if (idx >= 0) { dateColIdx = idx; break; }
    }
  }

  let result: string;
  if (dateColIdx >= 0) {
    // Column-aware: only replace serials in the detected date column
    result = lines.map(line => {
      const cells = line.split(",");
      if (cells.length > dateColIdx) {
        const cell = cells[dateColIdx].trim();
        if (SERIAL_RE.test(cell)) {
          cells[dateColIdx] = excelSerialToISO(parseInt(cell, 10));
          return cells.join(",");
        }
      }
      return line;
    }).join("\n");
  } else {
    // Generic: replace cell-isolated serial numbers (tab/comma/newline/line-start boundaries)
    result = content.replace(
      /(?<=^|[\t,\n])(4[2-7]\d{3}|48[0-3]\d\d)(?=$|[\t,\n])/gm,
      (_, serial) => excelSerialToISO(parseInt(serial, 10)),
    );
  }

  // Pass 2 — slash date DD/MM vs MM/DD disambiguation
  const slashDate = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  const matches = [...result.matchAll(slashDate)];
  if (matches.length === 0) return result;
  const isDDMM = matches.some(m => parseInt(m[1]) > 12);
  const isMDY  = !isDDMM && matches.some(m => parseInt(m[2]) > 12);
  if (isDDMM) {
    return result.replace(slashDate, (_, d, m, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  if (isMDY) {
    return result.replace(slashDate, (_, m, d, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  return result;
}

// ── Accuracy measurement ──────────────────────────────────────────────────────

interface FieldResult {
  correct: number;
  total: number;
  tolerance?: number;  // for numeric fields, % tolerance
}

interface DealComparisonResult {
  matched: boolean;       // was a matching deal found at all?
  gci_correct: boolean;
  sale_price_correct: boolean;
  sale_price_missing_ok: boolean;  // sale_price=0 and doc doesn't have it → acceptable
  names_correct: boolean;
  date_correct: boolean;
  address_correct: boolean;
  side_correct: boolean;
}

interface ReportAccuracyResult {
  reportId: string;
  format: string;
  year: number;
  annual_gci_error_pct: number | null;  // % error vs ground truth
  annual_tx_error: number | null;       // absolute deal count error
  deal_results: DealComparisonResult[];
  raw_response?: string;
  error?: string;
}

/** Numeric match within tolerance (default 1%) */
function numMatch(a: number, b: number, tolerance = 0.01): boolean {
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return false;
  return Math.abs(a - b) / Math.max(a, b) < tolerance;
}

/** Name match: case-insensitive, ignores extra whitespace */
function nameMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Date match: exact YYYY-MM-DD */
function dateMatch(extracted: string, expected: string, formatCode: string): boolean {
  // For quarter-code formats (A5), accept any date in the same quarter
  if (formatCode === "A5") {
    const eQ = Math.floor((parseInt(extracted.slice(5, 7)) - 1) / 3);
    const gtQ = Math.floor((parseInt(expected.slice(5, 7)) - 1) / 3);
    const eY = extracted.slice(0, 4);
    const gtY = expected.slice(0, 4);
    return eQ === gtQ && eY === gtY;
  }
  return extracted === expected;
}

function compareDeals(
  extracted: Array<{ date: string; address: string; sale_price: number; gci: number; party_a: string; party_b: string; side?: string }>,
  groundTruth: GroundTruthDeal[],
  format: string,
  hasSalePrice: boolean
): DealComparisonResult[] {
  const results: DealComparisonResult[] = [];

  for (const gt of groundTruth) {
    // Find best matching extracted deal (by GCI proximity + date year)
    let bestMatch: typeof extracted[0] | null = null;
    let bestScore = Infinity;

    for (const ex of extracted) {
      // Must be same year
      if (ex.date.slice(0, 4) !== gt.date.slice(0, 4)) continue;
      const gciDiff = Math.abs(ex.gci - gt.gci) / Math.max(gt.gci, 1);
      if (gciDiff < bestScore) {
        bestScore = gciDiff;
        bestMatch = ex;
      }
    }

    if (!bestMatch) {
      results.push({
        matched: false,
        gci_correct: false,
        sale_price_correct: false,
        sale_price_missing_ok: false,
        names_correct: false,
        date_correct: false,
        address_correct: false,
        side_correct: false,
      });
      continue;
    }

    const salePriceMissingOk = !hasSalePrice && bestMatch.sale_price === 0;

    results.push({
      matched: true,
      gci_correct: numMatch(bestMatch.gci, gt.gci, 0.02),
      sale_price_correct: hasSalePrice ? numMatch(bestMatch.sale_price, gt.sale_price, 0.01) : salePriceMissingOk,
      sale_price_missing_ok: salePriceMissingOk,
      names_correct: nameMatch(bestMatch.party_a, gt.party_a),
      date_correct: dateMatch(bestMatch.date, gt.date, format),
      address_correct: bestMatch.address.toLowerCase().includes(gt.address.split(" ")[1]?.toLowerCase() ?? ""),
      side_correct: bestMatch.side === gt.side || gt.side === null,
    });
  }

  return results;
}

// Whether a format contains sale price in the document
const FORMAT_HAS_SALE_PRICE: Record<string, boolean> = {
  A1: true, A2: false, A3: true, A4: true, A5: true,
  B1: true, B2: false, B3: true,
  C1: true, C2: true,
};

// ── Test runner ───────────────────────────────────────────────────────────────

/** Retry an API call up to maxRetries times on 429 rate-limit errors. */
async function apiCallWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 5,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        (err instanceof Error && err.message.includes("429")) ||
        (typeof err === "object" && err !== null && (err as { status?: number }).status === 429);
      if (isRateLimit && attempt < maxRetries - 1) {
        const waitSec = 65; // flat wait — just need one 60s TPM window to reset
        process.stdout.write(`\n    ⏳ Rate limited (${label}). Waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries - 1}... `);
        await new Promise(r => setTimeout(r, waitSec * 1_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

async function runReport(
  groq: OpenAI,
  report: SyntheticReport,
  textPrompt: (content: string) => string
): Promise<ReportAccuracyResult> {
  try {
    const normalized = normalizeDateFormats(report.content);
    const response = await apiCallWithRetry(
      () => groq.chat.completions.create({
        model: GROQ_TEXT_MODEL,
        messages: [{ role: "user", content: textPrompt(normalized) }],
        temperature: 0.1,
        max_tokens: 8000,
      }),
      report.id,
    );

    const raw = response.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

    let parsed: { year: number; deals: Array<{ date: string; address: string; sale_price?: number; gci: number; party_a: string; party_b: string; side?: string }> };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        reportId: report.id,
        format: report.format,
        year: report.year,
        annual_gci_error_pct: null,
        annual_tx_error: null,
        deal_results: [],
        error: `JSON parse failed: ${cleaned.slice(0, 200)}`,
      };
    }

    // Compute extracted aggregates
    const extractedDeals = parsed.deals ?? [];
    const yearDeals = extractedDeals.filter(d => d.date?.slice(0, 4) === String(report.year));
    const extractedGCI = yearDeals.reduce((s, d) => s + (Number(d.gci) || 0), 0);
    const extractedTx  = yearDeals.length;

    const gt = report.groundTruth;
    const gciErrorPct = gt.annual_gci > 0
      ? Math.abs(extractedGCI - gt.annual_gci) / gt.annual_gci * 100
      : null;
    const txError = Math.abs(extractedTx - gt.annual_tx);

    const hasSalePrice = FORMAT_HAS_SALE_PRICE[report.format] ?? false;
    const dealResults = compareDeals(yearDeals, gt.deals, report.format, hasSalePrice);

    return {
      reportId: report.id,
      format: report.format,
      year: report.year,
      annual_gci_error_pct: gciErrorPct,
      annual_tx_error: txError,
      deal_results: dealResults,
      raw_response: raw.slice(0, 500), // first 500 chars for debugging
    };
  } catch (err: unknown) {
    return {
      reportId: report.id,
      format: report.format,
      year: report.year,
      annual_gci_error_pct: null,
      annual_tx_error: null,
      deal_results: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runBatch<T>(
  items: T[],
  fn: (item: T, idx: number) => Promise<unknown>,
  concurrency: number
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ── Summary reporter ──────────────────────────────────────────────────────────

interface FormatSummary {
  format: string;
  reports: number;
  errors: number;
  avg_gci_error_pct: number;
  avg_tx_error: number;
  gci_accuracy: number;        // % deals where GCI within 2%
  sale_price_accuracy: number; // % deals where sale price correct (or acceptably missing)
  names_accuracy: number;
  date_accuracy: number;
  address_accuracy: number;
  deal_match_rate: number;     // % ground truth deals that were found
}

function summarise(results: ReportAccuracyResult[]): FormatSummary[] {
  const byFormat: Record<string, ReportAccuracyResult[]> = {};
  for (const r of results) {
    (byFormat[r.format] ??= []).push(r);
  }

  return Object.entries(byFormat).map(([format, rs]) => {
    const valid = rs.filter(r => !r.error);
    const allDeals = valid.flatMap(r => r.deal_results);
    const matched = allDeals.filter(d => d.matched);

    const avgGCIErr = valid.length > 0
      ? valid.reduce((s, r) => s + (r.annual_gci_error_pct ?? 0), 0) / valid.length
      : 0;

    const avgTxErr = valid.length > 0
      ? valid.reduce((s, r) => s + (r.annual_tx_error ?? 0), 0) / valid.length
      : 0;

    const pct = (arr: boolean[]) => arr.length === 0 ? 0 : arr.filter(Boolean).length / arr.length * 100;

    return {
      format,
      reports: rs.length,
      errors: rs.filter(r => r.error).length,
      avg_gci_error_pct: Math.round(avgGCIErr * 10) / 10,
      avg_tx_error: Math.round(avgTxErr * 10) / 10,
      gci_accuracy:         Math.round(pct(matched.map(d => d.gci_correct))),
      sale_price_accuracy:  Math.round(pct(matched.map(d => d.sale_price_correct))),
      names_accuracy:       Math.round(pct(matched.map(d => d.names_correct))),
      date_accuracy:        Math.round(pct(matched.map(d => d.date_correct))),
      address_accuracy:     Math.round(pct(matched.map(d => d.address_correct))),
      deal_match_rate:      Math.round(pct(allDeals.map(d => d.matched))),
    };
  });
}

function printTable(summaries: FormatSummary[]) {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                     IMPORT ACCURACY TEST RESULTS                              ║");
  console.log("╠══════╦═══════╦═══════╦══════════╦════════╦═══════╦═══════╦═══════╦═════════╣");
  console.log("║ FMT  ║ RPT   ║ ERR   ║ GCI ERR% ║  GCI%  ║PRICE% ║NAMES% ║ DATE% ║MATCH RT ║");
  console.log("╠══════╬═══════╬═══════╬══════════╬════════╬═══════╬═══════╬═══════╬═════════╣");
  for (const s of summaries) {
    const gciErrStr = `${s.avg_gci_error_pct.toFixed(1)}%`.padStart(8);
    const col = (v: number) => `${v}%`.padStart(7);
    const matchRt = `${s.deal_match_rate}%`.padStart(7);
    console.log(
      `║ ${s.format.padEnd(4)} ║ ${String(s.reports).padStart(5)} ║ ${String(s.errors).padStart(5)} ║ ${gciErrStr} ║${col(s.gci_accuracy)} ║${col(s.sale_price_accuracy)} ║${col(s.names_accuracy)} ║${col(s.date_accuracy)} ║${matchRt}  ║`
    );
  }
  console.log("╚══════╩═══════╩═══════╩══════════╩════════╩═══════╩═══════╩═══════╩═════════╝");

  // Overall
  const all = summaries;
  const totalReports = all.reduce((s, r) => s + r.reports, 0);
  const totalErrors = all.reduce((s, r) => s + r.errors, 0);
  const avgGCI = all.reduce((s, r) => s + r.gci_accuracy * r.reports, 0) / totalReports;
  const avgPrice = all.reduce((s, r) => s + r.sale_price_accuracy * r.reports, 0) / totalReports;
  const avgNames = all.reduce((s, r) => s + r.names_accuracy * r.reports, 0) / totalReports;
  const avgDate = all.reduce((s, r) => s + r.date_accuracy * r.reports, 0) / totalReports;

  console.log(`\nTotal: ${totalReports} reports, ${totalErrors} errors`);
  console.log(`Overall field accuracy — GCI: ${avgGCI.toFixed(1)}%  Sale Price: ${avgPrice.toFixed(1)}%  Names: ${avgNames.toFixed(1)}%  Date: ${avgDate.toFixed(1)}%\n`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string, def: string) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GROQ_API_KEY environment variable not set.");
    console.error("Run: GROQ_API_KEY=gsk_... npx ts-node --esm scripts/import-tests/run-accuracy-tests.ts");
    process.exit(1);
  }

  const filterFormats = getArg("--format", "").split(",").filter(Boolean);
  const perFormat = parseInt(getArg("--count", "20"), 10);
  const concurrency = parseInt(getArg("--concurrency", "1"), 10);
  const outFile = getArg("--out", "");

  // --model flag overrides the default model
  const modelOverride = getArg("--model", "");
  if (modelOverride) GROQ_TEXT_MODEL = modelOverride;

  // --delay flag overrides the between-call delay (ms).
  // Recommended: 20000 for 8b-instant (~20k TPM), 70000 for 70b-versatile (~6k TPM).
  const delayMs = parseInt(getArg("--delay", "20000"), 10);

  console.log(`\nGenerating synthetic reports (${perFormat} per format)...`);
  let reports = generateSyntheticReports({ perFormat });

  if (filterFormats.length > 0) {
    reports = reports.filter(r => filterFormats.includes(r.format));
    console.log(`Filtered to formats: ${filterFormats.join(", ")} (${reports.length} reports)`);
  } else {
    console.log(`Total reports to test: ${reports.length}`);
  }

  // We need the TEXT_PROMPT from route.ts — import it dynamically
  // For now, use a local copy of the prompt.
  // In production, export it from route.ts and import here.
  const { TEXT_PROMPT } = await import("./test-prompt-shim.js").catch(() => ({
    TEXT_PROMPT: (content: string) => `Extract real estate commission data from the following document. Return JSON with year and deals array.\n\n${content.slice(0, 20000)}`,
  }));

  const groq = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });

  const results: ReportAccuracyResult[] = [];
  let completed = 0;

  console.log(`\nRunning extraction tests (model=${GROQ_TEXT_MODEL}, concurrency=${concurrency}, delay=${delayMs}ms)...\n`);

  await runBatch(reports, async (report, i) => {
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${reports.length}] ${report.id}...`);
    const result = await runReport(groq, report, TEXT_PROMPT);
    results.push(result);
    completed++;

    if (result.error) {
      process.stdout.write(` ❌ ERROR: ${result.error.slice(0, 60)}\n`);
    } else {
      const gciOk = (result.annual_gci_error_pct ?? 100) < 5;
      const txOk = (result.annual_tx_error ?? 99) === 0;
      process.stdout.write(` ${gciOk ? "✅" : "⚠️"} GCI err ${result.annual_gci_error_pct?.toFixed(1) ?? "?"}%  tx err ${result.annual_tx_error ?? "?"}\n`);
    }

    // Proactive delay to stay within TPM limit (configurable via --delay flag)
    await new Promise(r => setTimeout(r, delayMs));
  }, concurrency);

  console.log(`\nCompleted ${completed}/${reports.length} tests.`);

  const summaries = summarise(results);
  printTable(summaries);

  // Identify systematic failures
  const failures = results.filter(r =>
    !r.error && (
      (r.annual_gci_error_pct ?? 0) > 5 ||
      (r.annual_tx_error ?? 0) > 1
    )
  );

  if (failures.length > 0) {
    console.log(`\n⚠️  Systematic failures (${failures.length} reports):`);
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.reportId}: GCI error ${f.annual_gci_error_pct?.toFixed(1)}%, tx error ${f.annual_tx_error}`);
    }
  }

  // Save full results
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify({ summaries, results }, null, 2), "utf8");
    console.log(`\nFull results saved to: ${outFile}`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
