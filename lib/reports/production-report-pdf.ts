import { type HistoryItem, type ClientRecord } from "@/lib/types/database";

// Brand colours
export const BRAND = {
  blue: "#1E72F2",
  gold: "#F0A800",
  navy: "#0D1221",
  navyMid: "#1A2744",
  slate: "#475569",
  light: "#F8FAFC",
  border: "#E2E8F0",
  white: "#FFFFFF",
};

export interface ProductionReportData {
  historyItems: HistoryItem[];
  clientRecords: ClientRecord[];
  agentName: string;
  brokerage: string;
  province: string;
  generatedAt: string;
  yearFilter?: number;
}

// This module exports data helpers — the actual PDF React component
// is in production-report-pdf-doc.tsx (kept separate for Next.js compatibility)
export function prepareReportData(data: ProductionReportData) {
  const { historyItems, clientRecords, yearFilter } = data;
  const items = yearFilter
    ? historyItems.filter(h => h.year === yearFilter)
    : [...historyItems].sort((a, b) => b.year - a.year);

  const totalGCI = items.reduce((s, h) => s + h.annual_gci, 0);
  const totalDeals = items.reduce((s, h) => s + h.annual_tx, 0);
  const bestYear = items.reduce(
    (best, h) => h.annual_gci > (best?.annual_gci ?? 0) ? h : best,
    items[0],
  );

  const enriched = items.map(h => ({
    ...h,
    qGci: (h.quarter_gci as number[]) ?? [0, 0, 0, 0],
    qTx: (h.quarter_tx as number[]) ?? [0, 0, 0, 0],
    records: clientRecords
      .filter(r => r.year === h.year)
      .sort((a, b) => (a.close_date ?? "").localeCompare(b.close_date ?? "")),
  }));

  return { items: enriched, totalGCI, totalDeals, bestYear };
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}
