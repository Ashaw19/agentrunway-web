/**
 * Reconciliation Engine
 *
 * Matches imported brokerage-statement deals against existing transactions
 * in the user's ledger. Detects duplicates, confirms matches, and flags
 * discrepancies so the agent can review before committing.
 *
 * Matching strategy (scored, not binary):
 *   1. Address similarity  — normalized string distance (weight 40)
 *   2. Date proximity      — exact = 40, ±7 days = 25, ±30 days = 10 (weight 40)
 *   3. GCI proximity       — within 5% = 20, within 15% = 10 (weight 20)
 *
 *   Score ≥ 70  → "match" (likely same deal)
 *   Score 40–69 → "possible" (needs manual review)
 *   Score < 40  → "new" (no match found)
 */

import type { Transaction } from "../types/database";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ImportedDeal {
  /** Temporary client-side ID for tracking */
  _importId: string;
  date: string;          // YYYY-MM-DD
  address: string;
  gci: number;
  sale_price: number | null;
  side?: "buyer" | "seller" | "both";
  client_name?: string;
  commission_pct?: number | null;
  net_income?: number | null;
  /** AI confidence per field */
  confidence?: Record<string, string>;
  /** Issues flagged by validators */
  issues?: string[];
}

export interface ReconciliationMatch {
  /** The imported deal */
  imported: ImportedDeal;
  /** Best matching existing transaction, if any */
  existingMatch: Transaction | null;
  /** Match score 0-100 */
  score: number;
  /** Classification */
  status: "match" | "possible" | "new";
  /** Field-level discrepancies for review */
  discrepancies: Discrepancy[];
  /** User decision — set by UI */
  decision?: "skip" | "add" | "update";
}

export interface Discrepancy {
  field: string;
  imported: string | number | null;
  existing: string | number | null;
  severity: "info" | "warning";
}

export interface ReconciliationResult {
  matches: ReconciliationMatch[];
  /** Quick counts */
  matchCount: number;
  possibleCount: number;
  newCount: number;
  /** Total GCI from new deals that would be added */
  newGCI: number;
}

// ── Address normalization ──────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[.,#\-()]/g, " ")
    .replace(/\b(street|st|avenue|ave|drive|dr|road|rd|boulevard|blvd|lane|ln|court|ct|place|pl|crescent|cres|way|circle|cir|terrace|ter|trail|trl)\b/g, "")
    .replace(/\b(unit|apt|suite|ste|#)\s*\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── String similarity (Dice coefficient on bigrams) ────────────────────────

function bigrams(s: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    result.add(s.substring(i, i + 2));
  }
  return result;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  let intersect = 0;
  for (const bg of aBigrams) {
    if (bBigrams.has(bg)) intersect++;
  }
  return (2 * intersect) / (aBigrams.size + bBigrams.size);
}

// ── Scoring helpers ────────────────────────────────────────────────────────

function addressScore(imported: string, existing: string): number {
  const a = normalizeAddress(imported);
  const b = normalizeAddress(existing);
  const similarity = diceCoefficient(a, b);
  // Scale: 1.0 → 40, 0.8 → 32, 0.5 → 20, 0.0 → 0
  return Math.round(similarity * 40);
}

function dateScore(importedDate: string, existingDate: string): number {
  const d1 = new Date(importedDate + "T00:00:00");
  const d2 = new Date(existingDate + "T00:00:00");
  const diffDays = Math.abs(
    Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)),
  );
  if (diffDays === 0) return 40;
  if (diffDays <= 7) return 25;
  if (diffDays <= 30) return 10;
  return 0;
}

function gciScore(importedGCI: number, existingGCI: number): number {
  if (existingGCI === 0 && importedGCI === 0) return 20;
  if (existingGCI === 0 || importedGCI === 0) return 0;
  const pctDiff = Math.abs(importedGCI - existingGCI) / existingGCI;
  if (pctDiff <= 0.05) return 20;
  if (pctDiff <= 0.15) return 10;
  return 0;
}

// ── Discrepancy detection ──────────────────────────────────────────────────

function findDiscrepancies(
  imported: ImportedDeal,
  existing: Transaction,
): Discrepancy[] {
  const discs: Discrepancy[] = [];

  // Date
  if (imported.date !== existing.date) {
    discs.push({
      field: "Date",
      imported: imported.date,
      existing: existing.date,
      severity: "info",
    });
  }

  // GCI
  const existingGCI = existing.gci_override ?? (existing.sale_price * existing.commission_pct);
  const gciDiff = Math.abs(imported.gci - existingGCI);
  if (gciDiff > 1) {
    discs.push({
      field: "GCI",
      imported: imported.gci,
      existing: existingGCI,
      severity: existingGCI > 0 && gciDiff / existingGCI > 0.05 ? "warning" : "info",
    });
  }

  // Sale price
  if (imported.sale_price && existing.sale_price) {
    const priceDiff = Math.abs(imported.sale_price - existing.sale_price);
    if (priceDiff > 100) {
      discs.push({
        field: "Sale price",
        imported: imported.sale_price,
        existing: existing.sale_price,
        severity: priceDiff / existing.sale_price > 0.02 ? "warning" : "info",
      });
    }
  }

  // Side
  if (imported.side && imported.side !== existing.side) {
    discs.push({
      field: "Side",
      imported: imported.side,
      existing: existing.side,
      severity: "warning",
    });
  }

  // Address (minor differences)
  if (normalizeAddress(imported.address) !== normalizeAddress(existing.address)) {
    discs.push({
      field: "Address",
      imported: imported.address,
      existing: existing.address,
      severity: "info",
    });
  }

  return discs;
}

// ── Main reconciliation function ───────────────────────────────────────────

export function reconcileDeals(
  importedDeals: ImportedDeal[],
  existingTransactions: Transaction[],
): ReconciliationResult {
  const matches: ReconciliationMatch[] = [];

  // Track which existing transactions have already been matched
  // to prevent one existing tx from matching multiple imports
  const matchedExistingIds = new Set<string>();

  for (const imported of importedDeals) {
    let bestMatch: Transaction | null = null;
    let bestScore = 0;

    for (const existing of existingTransactions) {
      // Skip if this existing tx was already matched to a higher-scoring import
      if (matchedExistingIds.has(existing.id)) continue;

      const existingGCI = existing.gci_override ?? (existing.sale_price * existing.commission_pct);
      const score =
        addressScore(imported.address, existing.address) +
        dateScore(imported.date, existing.date) +
        gciScore(imported.gci, existingGCI);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = existing;
      }
    }

    let status: "match" | "possible" | "new";
    if (bestScore >= 70) {
      status = "match";
    } else if (bestScore >= 40) {
      status = "possible";
    } else {
      status = "new";
      bestMatch = null; // Don't show a match if score is too low
    }

    // Reserve the matched existing transaction
    if (bestMatch && status !== "new") {
      matchedExistingIds.add(bestMatch.id);
    }

    const discrepancies =
      bestMatch && status !== "new"
        ? findDiscrepancies(imported, bestMatch)
        : [];

    matches.push({
      imported,
      existingMatch: status !== "new" ? bestMatch : null,
      score: bestScore,
      status,
      discrepancies,
      decision: status === "match" ? "skip" : status === "new" ? "add" : undefined,
    });
  }

  const matchCount = matches.filter((m) => m.status === "match").length;
  const possibleCount = matches.filter((m) => m.status === "possible").length;
  const newCount = matches.filter((m) => m.status === "new").length;
  const newGCI = matches
    .filter((m) => m.status === "new")
    .reduce((sum, m) => sum + m.imported.gci, 0);

  return { matches, matchCount, possibleCount, newCount, newGCI };
}
