/**
 * lib/cockpit/export-bundle.ts
 *
 * Year-end accountant export bundle engine for Agent Runway Inc.
 *
 * Builds a ZIP containing:
 *  reports/   — 5 reporting-view CSVs (P&L, HST, SR&ED, loan, pre-incorp)
 *  ledger/    — full corp_transactions ledger for the fiscal year
 *  receipts/  — receipt images attached to corp_transactions
 *  documents/ — governance documents from corp_documents table
 *  README.txt — what's in the bundle and how to use it
 *
 * Called by /api/cockpit/export-bundle. Uses the admin client so storage
 * downloads are not constrained by RLS.
 */

import JSZip from "jszip";
import { SupabaseClient } from "@supabase/supabase-js";

// ── CSV helpers (mirrors lib/data-export.ts — no shared export to avoid
//    coupling the cockpit lib to the customer-facing export) ──────────────────

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const lines: string[] = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(serializeCell(row[h]))).join(","));
  }
  return lines.join("\r\n");
}

function serializeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  try { return JSON.stringify(value); } catch { return String(value); }
}

function csvEscape(value: string): string {
  if (value === "") return "";
  const first = value.charAt(0);
  if (["=", "+", "-", "@", "|", "\t"].includes(first)) value = "'" + value;
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// ── Export result ────────────────────────────────────────────────────────────

export interface ExportBundleResult {
  zip:              JSZip;
  filenameBase:     string;   // e.g. "AR-Inc-FY2026-export-2026-05-07"
  reportCount:      number;
  txnCount:         number;
  receiptCount:     number;
  docCount:         number;
  resolutionCount:  number;
  sredCount:        number;
  errors:           string[];
}

// ── Main builder ─────────────────────────────────────────────────────────────

export async function buildExportBundle(
  supabase: SupabaseClient,
  userId: string,
  year: number,
): Promise<ExportBundleResult> {
  const zip = new JSZip();
  const errors: string[] = [];
  let reportCount = 0;
  let txnCount = 0;
  let receiptCount = 0;
  let docCount = 0;
  let resolutionCount = 0;
  let sredCount = 0;

  const today = new Date().toISOString().slice(0, 10);
  const filenameBase = `AR-Inc-FY${year}-export-${today}`;

  // ── 1. Reporting views → reports/ ──────────────────────────────────────────

  const reportSpecs: Array<{
    filename: string;
    query: () => unknown;
  }> = [
    {
      filename: `01_pl_by_account_FY${year}.csv`,
      query: () =>
        supabase
          .from("v_corp_pl_by_account")
          .select("account_code, account_name, account_type, total_amount, year")
          .eq("year", year)
          .order("account_code", { ascending: true }),
    },
    {
      filename: "02_gst_hst_summary.csv",
      query: () =>
        supabase
          .from("v_corp_gst_hst_summary")
          .select("*")
          .order("period", { ascending: true }),
    },
    {
      filename: `03_sred_eligible_totals_FY${year}.csv`,
      query: () => supabase.from("v_corp_sred_eligible_totals").select("*"),
    },
    {
      filename: "04_shareholder_loan_balance.csv",
      query: () =>
        supabase
          .from("v_corp_shareholder_loan_balance")
          .select("*")
          .order("entry_date", { ascending: true }),
    },
    {
      filename: "05_pre_incorp_register.csv",
      query: () =>
        supabase
          .from("v_corp_pre_incorp_register")
          .select("*")
          .order("incurred_date", { ascending: true }),
    },
  ];

  const reportsFolder = zip.folder("reports")!;
  for (const spec of reportSpecs) {
    try {
      const { data, error } = await (spec.query() as unknown as Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>);
      if (error) {
        errors.push(`reports/${spec.filename}: ${error.message}`);
        continue;
      }
      reportsFolder.file(spec.filename, rowsToCsv(data ?? []));
      reportCount++;
    } catch (e) {
      errors.push(`reports/${spec.filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 2. Transaction ledger → ledger/ ────────────────────────────────────────

  try {
    const { data: txns, error: txnErr } = await supabase
      .from("corp_transactions")
      .select(
        "id, date, incurred_date, merchant_name, amount_pretax, gst_hst, amount_total, currency, " +
        "account_code, account_type, vendor_name_raw, corp_pct, sred_eligible, sred_category, " +
        "pre_incorp_flag, needs_review, review_reason, description, notes, source_channel, created_at",
      )
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date", { ascending: true });

    if (txnErr) {
      errors.push(`ledger/corp_transactions_FY${year}.csv: ${txnErr.message}`);
    } else {
      const ledgerFolder = zip.folder("ledger")!;
      ledgerFolder.file(
        `corp_transactions_FY${year}.csv`,
        rowsToCsv((txns ?? []) as unknown as Array<Record<string, unknown>>),
      );
      txnCount = (txns ?? []).length;
    }
  } catch (e) {
    errors.push(`ledger: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Receipt images → receipts/ ──────────────────────────────────────────

  try {
    const { data: txnsWithReceipts, error: rErr } = await supabase
      .from("corp_transactions")
      .select("id, date, merchant_name, receipt_storage_path")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .not("receipt_storage_path", "is", null)
      .order("date", { ascending: true });

    if (rErr) {
      errors.push(`receipts: ${rErr.message}`);
    } else {
      const receiptsFolder = zip.folder("receipts")!;
      for (const txn of txnsWithReceipts ?? []) {
        const storagePath = txn.receipt_storage_path as string;
        if (!storagePath) continue;
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from("receipts")
            .download(storagePath);
          if (dlErr || !blob) {
            errors.push(`receipts/${storagePath}: ${dlErr?.message ?? "no data"}`);
            continue;
          }
          const ext = storagePath.split(".").pop() ?? "jpg";
          const safeMerchant = ((txn.merchant_name as string) ?? "unknown")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 40);
          const filename = `${txn.date}_${safeMerchant}_${(txn.id as string).slice(0, 8)}.${ext}`;
          receiptsFolder.file(filename, await blob.arrayBuffer());
          receiptCount++;
        } catch (e) {
          errors.push(`receipts/${storagePath}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  } catch (e) {
    errors.push(`receipts: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4. Governance documents → documents/ ───────────────────────────────────

  try {
    const { data: docs, error: docErr } = await supabase
      .from("corp_documents")
      .select("*")
      .eq("fiscal_year", year)
      .order("document_date", { ascending: true });

    if (docErr) {
      errors.push(`documents: ${docErr.message}`);
    } else {
      const docsFolder = zip.folder("documents")!;
      for (const doc of docs ?? []) {
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from("corp-documents")
            .download(doc.storage_path as string);
          if (dlErr || !blob) {
            errors.push(`documents/${doc.file_name}: ${dlErr?.message ?? "no data"}`);
            continue;
          }
          const safeTitle = (doc.title as string)
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 50);
          const ext = (doc.file_name as string).split(".").pop() ?? "pdf";
          const filename = `${doc.document_date}_${doc.document_type}_${safeTitle}.${ext}`;
          docsFolder.file(filename, await blob.arrayBuffer());
          docCount++;
        } catch (e) {
          errors.push(
            `documents/${doc.file_name}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  } catch (e) {
    errors.push(`documents: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 5. Resolutions → resolutions/ ────────────────────────────────────────────

  try {
    const { data: resolutions } = await supabase
      .from("corp_resolutions")
      .select(
        "resolution_number, resolution_type, subject, body_md, passed_date, fiscal_year, status",
      )
      .eq("fiscal_year", year)
      .eq("status", "passed")
      .order("passed_date", { ascending: true });

    for (const res of resolutions ?? []) {
      const slug = (res.subject as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 50);
      const filename = `${res.resolution_number}_${slug}.md`;
      const content = [
        `# ${res.resolution_number} — ${res.subject}`,
        ``,
        `**Type:** ${res.resolution_type}`,
        `**Date passed:** ${res.passed_date}`,
        `**Fiscal year:** ${res.fiscal_year}`,
        `**Status:** ${res.status}`,
        ``,
        `---`,
        ``,
        res.body_md as string,
      ].join("\n");
      zip.folder("resolutions")!.file(filename, content);
      resolutionCount++;
    }
  } catch (e) {
    errors.push(`resolutions: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 6. SR&ED work-log → sred/ ────────────────────────────────────────────────

  try {
    const { data: sredEntries, error: sredErr } = await supabase
      .from("corp_sred_entries")
      .select("*")
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`)
      .order("entry_date", { ascending: true });

    if (sredErr) {
      errors.push(`sred: ${sredErr.message}`);
    } else {
      const WEIGHT_FACTORS: Record<string, number> = {
        high: 1.00, medium: 0.50, low: 0.15, none: 0.00,
      };
      const WEIGHT_LABELS: Record<string, string> = {
        high: "High (1.00)", medium: "Medium (0.50)", low: "Low (0.15)", none: "None (0.00)",
      };

      const csvHeaders = [
        "Date", "Hours", "SR&ED Weight", "Eligible Hours",
        "Work Summary (T661 Narrative)", "Technological Challenges",
        "SR&ED Characterization", "Commits", "PR / Branch Refs",
      ];
      const csvLines: string[] = [csvHeaders.map(csvEscape).join(",")];
      let totalHours = 0;
      let totalEligible = 0;

      for (const row of (sredEntries ?? []) as Array<Record<string, unknown>>) {
        const weight = row.sred_weight as string;
        const hrs = Number(row.hours);
        const factor = WEIGHT_FACTORS[weight] ?? 0;
        const eligible = Number((hrs * factor).toFixed(2));
        totalHours += hrs;
        totalEligible += eligible;
        csvLines.push([
          csvEscape(serializeCell(row.entry_date)),
          csvEscape(serializeCell(hrs)),
          csvEscape(serializeCell(WEIGHT_LABELS[weight] ?? weight)),
          csvEscape(serializeCell(eligible)),
          csvEscape(serializeCell(row.work_summary)),
          csvEscape(serializeCell(row.tech_challenges)),
          csvEscape(serializeCell(row.sred_note)),
          csvEscape(serializeCell(row.commits_count)),
          csvEscape(serializeCell(row.pr_refs)),
        ].join(","));
      }

      // Totals row
      csvLines.push([
        csvEscape(serializeCell(`FY${year} TOTALS`)),
        csvEscape(serializeCell(Number(totalHours.toFixed(2)))),
        "", csvEscape(serializeCell(Number(totalEligible.toFixed(2)))),
        csvEscape(serializeCell(`${(sredEntries ?? []).length} entries`)),
        "", "", "", "",
      ].join(","));

      const sredFolder = zip.folder("sred")!;
      sredFolder.file(`corp_sred_entries_FY${year}.csv`, csvLines.join("\r\n"));
      sredCount = (sredEntries ?? []).length;
    }
  } catch (e) {
    errors.push(`sred: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 7. README.txt ────────────────────────────────────────────────────────────

  const readme = buildReadme(year, today, {
    reportCount,
    txnCount,
    receiptCount,
    docCount,
    resolutionCount,
    sredCount,
    errors,
  });
  zip.file("README.txt", readme);

  return { zip, filenameBase, reportCount, txnCount, receiptCount, docCount, resolutionCount, sredCount, errors };
}

// ── README generator ─────────────────────────────────────────────────────────

function buildReadme(
  year: number,
  exportDate: string,
  counts: {
    reportCount:     number;
    txnCount:        number;
    receiptCount:    number;
    docCount:        number;
    resolutionCount: number;
    sredCount:       number;
    errors:          string[];
  },
): string {
  return `AGENT RUNWAY INC. — YEAR-END ACCOUNTANT EXPORT BUNDLE
Federal CCPC incorporated 2026-04-16 in New Brunswick
Fiscal year: January 1 – December 31, ${year}
Export generated: ${exportDate}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

reports/  (${counts.reportCount} files)
  Reporting-view exports from the Director Cockpit ledger.
  01_pl_by_account_FY${year}.csv         — P&L grouped by chart-of-accounts entry
  02_gst_hst_summary.csv              — HST/GST collected, ITCs, net owing by quarter
  03_sred_eligible_totals_FY${year}.csv  — SR&ED-eligible expense totals by account
  04_shareholder_loan_balance.csv     — Shareholder-loan running balance
  05_pre_incorp_register.csv          — Pre-incorporation expenses (s.20(1)(b) candidates)

ledger/  (1 file, ${counts.txnCount} transactions)
  corp_transactions_FY${year}.csv
  Full transaction ledger for FY${year}. Includes account codes, vendor names,
  HST amounts, SR&ED flags, and pre-incorporation flags.

receipts/  (${counts.receiptCount} files)
  Receipt images attached to cockpit transactions.
  Named: YYYY-MM-DD_Vendor_TxnID.ext

documents/  (${counts.docCount} files)
  Governance documents uploaded to the Director Cockpit:
  minute-book entries, board resolutions, signed contracts, correspondence.
  Named: YYYY-MM-DD_type_Title.ext

resolutions/  (${counts.resolutionCount} files)
  Passed corporate director resolutions for FY${year} in Markdown format.
  Named: {year}-DR-{NNN}_{subject_slug}.md

sred/  (1 file, ${counts.sredCount} entries)
  corp_sred_entries_FY${year}.csv
  SR&ED daily work-log for T661 preparation. Columns: Date, Hours, SR&ED Weight,
  Eligible Hours (weight-adjusted), Work Summary, Technological Challenges,
  SR&ED Characterization, Commits, PR/Branch Refs. Eligible-hours weights:
  High=1.00, Medium=0.50, Low=0.15, None=0.00. For SR&ED specialist review.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALSO PROVIDE TO YOUR ACCOUNTANT (NOT IN THIS BUNDLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SR&ED Flat-File Historical Log (pre-DB)
  Agent Runway SR&ED Daily Work Log - 2026.md
  Located on Andrew's desktop under Agent Runway - Grant Applications/.
  Contains entries prior to the DB migration. Provide alongside sred/ CSV above.

Bank Statements
  Upload bank CSV files via the Cockpit Reconciliation tab to match
  bank lines to ledger transactions. Reconciled statements are reflected
  in the reconciliation summary but not bundled here (no PII in exports).

Corporate Bank Account Details
  Your accountant will need the account number and institution name
  for Schedule 50 and the GIFI balance sheet.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTES FOR ACCOUNTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• All figures are from the internal Director Cockpit ledger (Agent Runway Inc.'s
  book of record). Verify against bank statements before filing.

• AR Inc. was incorporated 2026-04-16. FY${year} covers only a partial year
  (April 16 – December 31, ${year}) for the first T2 filing.

• SR&ED T661 is a separate workstream requiring an SR&ED specialist.
  The sred_eligible flag in the ledger and the SR&ED totals CSV indicate
  which expenses have been tagged as potentially eligible.

• Pre-incorporation expenses in 05_pre_incorp_register.csv may be eligible
  under s.20(1)(b) of the Income Tax Act (up to the $3,000 limit). Review
  with your accountant.

• HST: Agent Runway Inc.'s registration status with CRA should be confirmed
  with the principal before preparing HST filings.

${
  counts.errors.length > 0
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPORT WARNINGS (${counts.errors.length})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The following items could not be included in this bundle:
${counts.errors.map((e) => "  • " + e).join("\n")}`
    : ""
}
Generated by Agent Runway Director Cockpit — internal use only.
`;
}
