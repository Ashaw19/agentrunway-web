import { type HistoryItem, type ClientRecord } from "@/lib/types/database";

/** Sanitize cell values to prevent Excel formula injection */
function sanitizeExcelCell(val: string): string {
  if (!val) return val;
  const first = val.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "|" || first === "\t") {
    return "'" + val;
  }
  return val;
}

interface ReportData {
  historyItems: HistoryItem[];
  clientRecords: ClientRecord[];
  agentName: string;
  brokerage: string;
  province: string;
  generatedAt: string;
}

export async function generateProductionExcel(data: ReportData, yearFilter?: number): Promise<void> {
  const XLSX = await import("xlsx");
  const { historyItems, clientRecords, agentName, brokerage, generatedAt } = data;

  const items = yearFilter
    ? historyItems.filter(h => h.year === yearFilter)
    : [...historyItems].sort((a, b) => b.year - a.year);

  const wb = XLSX.utils.book_new();

  // ── SHEET 1: Career Summary ──────────────────────────────────────────
  const summaryHeader = [
    ["Agent Runway — Historical Production Report"],
    [`Agent: ${agentName}`, `Brokerage: ${brokerage}`],
    [`Generated: ${generatedAt}`],
    [],
    ["Year", "Annual GCI", "Deals", "Avg / Deal", "Q1 GCI", "Q2 GCI", "Q3 GCI", "Q4 GCI", "Agent Split %"],
  ];

  const summaryRows = items.map(h => {
    const qGci = (h.quarter_gci as number[]) ?? [0, 0, 0, 0];
    const splitPct = h.split_pct != null ? `${(h.split_pct * 100).toFixed(0)}%` : "—";
    const avgDeal = h.annual_tx > 0 ? h.annual_gci / h.annual_tx : 0;
    return [
      h.year,
      h.annual_gci,
      h.annual_tx,
      avgDeal,
      qGci[0] ?? 0,
      qGci[1] ?? 0,
      qGci[2] ?? 0,
      qGci[3] ?? 0,
      splitPct,
    ];
  });

  // Totals row
  const totalGCI = items.reduce((s, h) => s + h.annual_gci, 0);
  const totalDeals = items.reduce((s, h) => s + h.annual_tx, 0);
  summaryRows.push(["TOTAL", totalGCI, totalDeals, totalDeals > 0 ? totalGCI / totalDeals : 0, "", "", "", "", ""]);

  const summarySheet = XLSX.utils.aoa_to_sheet([...summaryHeader, ...summaryRows]);

  // Column widths
  summarySheet["!cols"] = [
    { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, summarySheet, "Career Summary");

  // ── PER-YEAR SHEETS ──────────────────────────────────────────────────
  items.forEach(h => {
    const yearRecords = clientRecords
      .filter(r => r.year === h.year)
      .sort((a, b) => (a.close_date ?? "").localeCompare(b.close_date ?? ""));

    const qGci = (h.quarter_gci as number[]) ?? [0, 0, 0, 0];
    const qTx = (h.quarter_tx as number[]) ?? [0, 0, 0, 0];

    const sheetData: (string | number)[][] = [
      [`${h.year} Production Report — ${agentName}`],
      [],
      ["ANNUAL SUMMARY"],
      ["GCI", h.annual_gci, "Deals", h.annual_tx],
      ["Avg/Deal", h.annual_tx > 0 ? h.annual_gci / h.annual_tx : 0, "Split", h.split_pct != null ? `${(h.split_pct * 100).toFixed(0)}%` : "—"],
      [],
      ["QUARTERLY BREAKDOWN"],
      ["", "Q1", "Q2", "Q3", "Q4"],
      ["GCI", qGci[0] ?? 0, qGci[1] ?? 0, qGci[2] ?? 0, qGci[3] ?? 0],
      ["Deals", qTx[0] ?? 0, qTx[1] ?? 0, qTx[2] ?? 0, qTx[3] ?? 0],
      [],
    ];

    if (yearRecords.length > 0) {
      sheetData.push(["DEAL LOG"]);
      sheetData.push(["Date", "Address", "Client", "Side", "GCI", "Source"]);
      yearRecords.forEach(r => {
        sheetData.push([
          sanitizeExcelCell(r.close_date ?? ""),
          sanitizeExcelCell(r.address ?? ""),
          sanitizeExcelCell(r.name ?? ""),
          sanitizeExcelCell((r.side ?? "").toUpperCase()),
          r.gci ?? 0,
          sanitizeExcelCell(r.source ?? ""),
        ]);
      });
    } else {
      sheetData.push(["No individual deal records available for this year."]);
      sheetData.push(["(Import a brokerage statement to add deal-level detail.)"]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    sheet["!cols"] = [
      { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, sheet, String(h.year));
  });

  // Trigger download
  XLSX.writeFile(wb, yearFilter ? `production-report-${yearFilter}.xlsx` : "career-production-report.xlsx");
}
