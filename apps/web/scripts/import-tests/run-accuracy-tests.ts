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
import { normalizeDateFormats } from "../../lib/import/normalizers/normalize-dates.js";
import { normalizeTextDocument } from "../../lib/import/normalizers/normalize-text.js";
import { applyValidation } from "../../lib/import/validation/validate-transactions.js";

// Default model for iteration. Override with --model flag:
//   --model llama-3.3-70b-versatile   (production model, 6k TPM, needs 65s delay)
//   --model llama-3.1-8b-instant      (fast iteration, 20k TPM, 20s delay is fine)
let GROQ_TEXT_MODEL = "llama-3.1-8b-instant";

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
  sale_price_missing_ok: boolean;  // sale_price=null and doc doesn't have it → acceptable
  net_income_correct: boolean | null;   // null when ground truth has no net_income
  commission_percent_correct: boolean | null; // null when ground truth has no commission_percent
  /**
   * True when both gci and net_income are present in the extraction AND gci > net_income.
   * False when values are present but inverted (net > gci = swap error).
   * null when net_income is not present in the extraction (can't evaluate order).
   */
  gci_gt_net: boolean | null;
  names_correct: boolean;
  date_correct: boolean;
  address_correct: boolean;
  side_correct: boolean;
  validation_issues: number;  // count of issues from applyValidation()
}

interface ReportAccuracyResult {
  reportId: string;
  format: string;
  year: number;
  annual_gci_error_pct: number | null;  // % error vs ground truth
  annual_tx_error: number | null;       // absolute deal count error
  truncated: boolean;                   // true if normalizer trimmed the document
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
  extracted: Array<{ date: string; address: string; sale_price?: number | null; gci: number; net_income?: number | null; commission_percent?: number | null; party_a: string; party_b: string; side?: string; issues?: string[] }>,
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
        net_income_correct: null,
        commission_percent_correct: null,
        gci_gt_net: null,
        names_correct: false,
        date_correct: false,
        address_correct: false,
        side_correct: false,
        validation_issues: 0,
      });
      continue;
    }

    const salePriceMissingOk = !hasSalePrice && bestMatch.sale_price == null;

    const netIncomeCorrect = gt.net_income != null
      ? numMatch(bestMatch.net_income ?? 0, gt.net_income, 0.02)
      : null;

    // GCI > net_income sanity check: both must be present and gci must be larger.
    // A false value here means a gross/net swap — the highest-risk financial error.
    const gciGtNet: boolean | null =
      bestMatch.gci > 0 && bestMatch.net_income != null && bestMatch.net_income > 0
        ? bestMatch.gci > bestMatch.net_income
        : null;

    // commission_percent: ground truth doesn't store it so this is always null for now
    const commissionPctCorrect: boolean | null = null;

    results.push({
      matched: true,
      gci_correct: numMatch(bestMatch.gci, gt.gci, 0.02),
      sale_price_correct: hasSalePrice ? numMatch(bestMatch.sale_price ?? 0, gt.sale_price, 0.01) : salePriceMissingOk,
      sale_price_missing_ok: salePriceMissingOk,
      net_income_correct: netIncomeCorrect,
      commission_percent_correct: commissionPctCorrect,
      gci_gt_net: gciGtNet,
      names_correct: nameMatch(bestMatch.party_a, gt.party_a),
      date_correct: dateMatch(bestMatch.date, gt.date, format),
      address_correct: bestMatch.address.toLowerCase().includes(gt.address.split(" ")[1]?.toLowerCase() ?? ""),
      side_correct: bestMatch.side === gt.side || gt.side === null,
      validation_issues: bestMatch.issues?.length ?? 0,
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
  textPrompt: (content: string, columnHints?: string) => string
): Promise<ReportAccuracyResult> {
  try {
    // Mirror production pipeline exactly:
    // 1. Date normalization (Excel serials → ISO, DD/MM disambiguation)
    // 2. Row cleaning + column classification
    const dateNormalized = normalizeDateFormats(report.content);
    const normResult = normalizeTextDocument(dateNormalized, true);
    const truncated  = normResult.stats.truncated;

    const response = await apiCallWithRetry(
      () => groq.chat.completions.create({
        model: GROQ_TEXT_MODEL,
        messages: [{
          role: "user",
          content: textPrompt(
            normResult.cleaned_content,
            normResult.column_hints ?? undefined,
          ),
        }],
        temperature: 0.1,
        max_tokens: 8000,
      }),
      report.id,
    );

    const raw = response.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

    let parsed: { year: number; deals: Array<{ date: string; address: string; sale_price?: number | null; gci: number; net_income?: number | null; commission_percent?: number | null; party_a: string; party_b: string; side?: string }> };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        reportId: report.id,
        format: report.format,
        year: report.year,
        annual_gci_error_pct: null,
        annual_tx_error: null,
        truncated,
        deal_results: [],
        error: `JSON parse failed: ${cleaned.slice(0, 200)}`,
      };
    }

    // Run deterministic validators on extracted deals (same as production route.ts)
    const extractedDeals = (parsed.deals ?? []).map(d => {
      const deal = {
        date:               d.date ?? "",
        address:            (d.address ?? "").trim(),
        sale_price:         d.sale_price != null ? (Number(d.sale_price) || null) : null,
        gci:                Number(d.gci) || 0,
        net_income:         d.net_income != null ? (Number(d.net_income) || null) : null,
        commission_percent: d.commission_percent != null ? (Number(d.commission_percent) || null) : null,
        party_a:            d.party_a ?? "",
        party_b:            d.party_b ?? "",
        agent_side:         null as null,
        side:               (d.side as "buyer" | "seller" | "both" | undefined) ?? undefined,
      };
      return applyValidation(deal, report.year);
    });

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
      truncated,
      deal_results: dealResults,
      raw_response: raw.slice(0, 500),
    };
  } catch (err: unknown) {
    return {
      reportId: report.id,
      format: report.format,
      year: report.year,
      annual_gci_error_pct: null,
      annual_tx_error: null,
      truncated: false,
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
  truncated_count: number;     // reports where normalizer truncated the content
  avg_gci_error_pct: number;
  avg_tx_error: number;
  gci_accuracy: number;        // % deals where GCI within 2%
  sale_price_accuracy: number; // % deals where sale price correct (or acceptably missing)
  net_income_accuracy: number; // % deals where net_income within 2% (only counted when gt has net_income)
  /** % of deals where both gci and net_income present AND gci > net_income. Low = swap risk. */
  gci_gt_net_pct: number;
  names_accuracy: number;
  date_accuracy: number;
  address_accuracy: number;
  deal_match_rate: number;     // % ground truth deals that were found
  avg_validation_issues: number; // average validation issue count per matched deal
  field_presence: {            // % of matched deals where field is non-null
    sale_price: number;
    net_income: number;
    commission_percent: number;
    address: number;
  };
}

function summarise(results: ReportAccuracyResult[]): FormatSummary[] {
  const byFormat: Record<string, ReportAccuracyResult[]> = {};
  for (const r of results) {
    (byFormat[r.format] ??= []).push(r);
  }

  return Object.entries(byFormat).map(([format, rs]) => {
    const valid   = rs.filter(r => !r.error);
    const allDeals = valid.flatMap(r => r.deal_results);
    const matched  = allDeals.filter(d => d.matched);

    const avgGCIErr = valid.length > 0
      ? valid.reduce((s, r) => s + (r.annual_gci_error_pct ?? 0), 0) / valid.length
      : 0;
    const avgTxErr = valid.length > 0
      ? valid.reduce((s, r) => s + (r.annual_tx_error ?? 0), 0) / valid.length
      : 0;

    const pct = (arr: boolean[]) =>
      arr.length === 0 ? 0 : arr.filter(Boolean).length / arr.length * 100;

    // net_income accuracy — only count deals where ground truth has net_income
    const netIncomeDeals = matched.filter(d => d.net_income_correct !== null);
    const netIncomeAcc = netIncomeDeals.length > 0
      ? pct(netIncomeDeals.map(d => d.net_income_correct as boolean))
      : 0;

    // GCI > net_income sanity — only count deals where both fields are present
    const gciGtNetDeals = matched.filter(d => d.gci_gt_net !== null);
    const gciGtNetPct = gciGtNetDeals.length > 0
      ? pct(gciGtNetDeals.map(d => d.gci_gt_net as boolean))
      : 0;

    const avgValidationIssues = matched.length > 0
      ? matched.reduce((s, d) => s + d.validation_issues, 0) / matched.length
      : 0;

    return {
      format,
      reports:           rs.length,
      errors:            rs.filter(r => r.error).length,
      truncated_count:   valid.filter(r => r.truncated).length,
      avg_gci_error_pct: Math.round(avgGCIErr * 10) / 10,
      avg_tx_error:      Math.round(avgTxErr * 10) / 10,
      gci_accuracy:          Math.round(pct(matched.map(d => d.gci_correct))),
      sale_price_accuracy:   Math.round(pct(matched.map(d => d.sale_price_correct))),
      net_income_accuracy:   Math.round(netIncomeAcc),
      gci_gt_net_pct:        Math.round(gciGtNetPct),
      names_accuracy:        Math.round(pct(matched.map(d => d.names_correct))),
      date_accuracy:         Math.round(pct(matched.map(d => d.date_correct))),
      address_accuracy:      Math.round(pct(matched.map(d => d.address_correct))),
      deal_match_rate:       Math.round(pct(allDeals.map(d => d.matched))),
      avg_validation_issues: Math.round(avgValidationIssues * 10) / 10,
      field_presence: {
        sale_price:         Math.round(pct(matched.map(d => d.sale_price_correct || d.sale_price_missing_ok))),
        net_income:         Math.round(pct(matched.map(d => d.net_income_correct !== null && d.net_income_correct !== false))),
        commission_percent: Math.round(pct(matched.map(d => d.commission_percent_correct !== null))),
        address:            Math.round(pct(matched.map(d => d.address_correct))),
      },
    };
  });
}

function printTable(summaries: FormatSummary[]) {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                            IMPORT ACCURACY TEST RESULTS                                      ║");
  console.log("╠══════╦═══════╦═══════╦════╦══════════╦════════╦═══════╦══════╦═══════╦═══════╦════════╦═════╣");
  console.log("║ FMT  ║ RPT   ║ ERR   ║TRNC║ GCI ERR% ║  GCI%  ║PRICE% ║ NET% ║NAMES% ║ DATE% ║G>NET%  ║MTH% ║");
  console.log("╠══════╬═══════╬═══════╬════╬══════════╬════════╬═══════╬══════╬═══════╬═══════╬════════╬═════╣");
  for (const s of summaries) {
    const gciErrStr = `${s.avg_gci_error_pct.toFixed(1)}%`.padStart(8);
    const col  = (v: number) => `${v}%`.padStart(7);
    const col6 = (v: number) => `${v}%`.padStart(6);
    const col8 = (v: number) => `${v}%`.padStart(8);
    const trunc = String(s.truncated_count).padStart(4);
    const mth = `${s.deal_match_rate}%`.padStart(5);
    console.log(
      `║ ${s.format.padEnd(4)} ║ ${String(s.reports).padStart(5)} ║ ${String(s.errors).padStart(5)} ║${trunc}║ ${gciErrStr} ║${col(s.gci_accuracy)} ║${col(s.sale_price_accuracy)} ║${col6(s.net_income_accuracy)} ║${col(s.names_accuracy)} ║${col(s.date_accuracy)} ║${col8(s.gci_gt_net_pct)} ║${mth} ║`
    );
  }
  console.log("╚══════╩═══════╩═══════╩════╩══════════╩════════╩═══════╩══════╩═══════╩═══════╩════════╩═════╝");
  console.log("  G>NET% = % of deals where extracted GCI > Net Income (100% = no swaps detected)");

  // Overall
  const all = summaries;
  const totalReports = all.reduce((s, r) => s + r.reports, 0);
  const totalErrors  = all.reduce((s, r) => s + r.errors, 0);
  const totalTrunc   = all.reduce((s, r) => s + r.truncated_count, 0);
  const avgGCI       = all.reduce((s, r) => s + r.gci_accuracy * r.reports, 0) / totalReports;
  const avgPrice     = all.reduce((s, r) => s + r.sale_price_accuracy * r.reports, 0) / totalReports;
  const avgNet       = all.reduce((s, r) => s + r.net_income_accuracy * r.reports, 0) / totalReports;
  const avgNames     = all.reduce((s, r) => s + r.names_accuracy * r.reports, 0) / totalReports;
  const avgDate      = all.reduce((s, r) => s + r.date_accuracy * r.reports, 0) / totalReports;
  const avgGtNet     = all.reduce((s, r) => s + r.gci_gt_net_pct * r.reports, 0) / totalReports;

  console.log(`\nTotal: ${totalReports} reports, ${totalErrors} errors, ${totalTrunc} truncated`);
  console.log(`Overall accuracy — GCI: ${avgGCI.toFixed(1)}%  Price: ${avgPrice.toFixed(1)}%  Net: ${avgNet.toFixed(1)}%  Names: ${avgNames.toFixed(1)}%  Date: ${avgDate.toFixed(1)}%  GCI>Net: ${avgGtNet.toFixed(1)}%\n`);
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
  const delayMs = parseInt(getArg("--delay", "3000"), 10);

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
