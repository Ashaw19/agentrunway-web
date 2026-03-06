"use client";

/**
 * Business Report PDF — Agent Runway
 *
 * Rendered client-side via @react-pdf/renderer. Only imported through a
 * dynamic import() inside a click handler — never on the server.
 */

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  computeGCI,
  PROVINCE_LABELS,
  type Transaction,
  type ExpenseCategoryWithItems,
} from "@/lib/types/database";

// ── Palette ──────────────────────────────────────────────────────────────────

const C = {
  blue:   "#1E72F2",
  dark:   "#0F172A",
  muted:  "#64748B",
  border: "#E2E8F0",
  stripe: "#F8FAFC",
} as const;

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Page
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: C.dark,
    lineHeight: 1.5,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 12,
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: C.blue,
  },
  brandName: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
  },
  reportSubtitle: {
    fontSize: 8,
    color: C.muted,
    marginTop: 3,
  },
  headerRight: {
    textAlign: "right",
  },
  agentName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  agentSub: {
    color: C.muted,
    marginTop: 2,
  },

  // ── KPI row ───────────────────────────────────────────────────────────────
  kpiRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: C.stripe,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 9,
    marginRight: 6,
  },
  kpiBoxLast: {
    marginRight: 0,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.muted,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  kpiSub: {
    fontSize: 7,
    color: C.muted,
    marginTop: 2,
  },

  // ── Section title ─────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 20,
    marginBottom: 8,
  },

  // ── Two-column (P&L + Tax) ────────────────────────────────────────────────
  twoCol: {
    flexDirection: "row",
  },
  col: {
    flex: 1,
    paddingRight: 16,
  },
  colRight: {
    flex: 1,
  },
  colTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 7,
    marginTop: 20,
  },

  // ── P&L / Tax row ─────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  rowMuted: {
    color: C.muted,
  },
  rowBold: {
    fontFamily: "Helvetica-Bold",
  },
  rowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  rowTotalLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  rowTotalValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginVertical: 4,
  },

  // ── Table ─────────────────────────────────────────────────────────────────
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
  },
  tHead: {
    flexDirection: "row",
    backgroundColor: C.stripe,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tHeadCell: {
    flex: 1,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
  },
  tHeadRight: {
    textAlign: "right",
  },
  tRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tRowLast: {
    borderBottomWidth: 0,
  },
  tRowStripe: {
    backgroundColor: C.stripe,
  },
  tRowTotal: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  tCell: {
    flex: 1,
  },
  tCellRight: {
    textAlign: "right",
  },
  tCellBold: {
    fontFamily: "Helvetica-Bold",
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
  },
});

// ── Props ────────────────────────────────────────────────────────────────────

export interface TaxSummaryForPDF {
  taxYear: number;
  totalCPP: number;
  federalTax: number;
  provincialTax: number;
  totalBurden: number;
  effectiveRate: number;
  quarterlyEstimate: number;
  perDealSetAside: number;
}

export interface BusinessReportPDFProps {
  // Agent identity
  agentName: string;
  brokerageName: string;
  businessName: string;
  province: string;
  year: number;
  // KPIs
  ytdGCI: number;
  ytdDeals: number;
  buyerDeals: number;
  sellerDeals: number;
  avgDealSize: number;
  pipelineWeighted: number;
  pipelineCount: number;
  // P&L
  agentPct: number;
  brokerageTake: number;
  txFees: number;
  brokerageFeeYTD: number;
  agentGrossNet: number;
  expensesYTD: number;
  netPreTax: number;
  // Tax
  projectedNet: number;
  taxResult: TaxSummaryForPDF;
  // Tables
  expenseCategories: ExpenseCategoryWithItems[];
  monthlyRecurring: number;
  monthlyData: { month: string; gci: number; deals: number }[];
  transactions: Transaction[];
}

// ── Component ────────────────────────────────────────────────────────────────

export function BusinessReportPDF({
  agentName,
  brokerageName,
  businessName,
  province,
  year,
  ytdGCI,
  ytdDeals,
  buyerDeals,
  sellerDeals,
  avgDealSize,
  pipelineWeighted,
  pipelineCount,
  agentPct,
  brokerageTake,
  txFees,
  brokerageFeeYTD,
  agentGrossNet,
  expensesYTD,
  netPreTax,
  projectedNet,
  taxResult,
  expenseCategories,
  monthlyRecurring,
  monthlyData,
  transactions,
}: BusinessReportPDFProps) {
  const generatedDate = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const provinceLabel = PROVINCE_LABELS[province as keyof typeof PROVINCE_LABELS] ?? province;

  const filteredExpenses = expenseCategories.filter((cat) => {
    const y = cat.items.reduce((sum, i) => sum + Number(i.ytd_amount), 0);
    const m = cat.items.reduce((sum, i) => sum + Number(i.monthly_recurring), 0);
    return y > 0 || m > 0;
  });

  return (
    <Document
      title={`Agent Runway — Business Report ${year}`}
      author="Agent Runway"
    >
      <Page size="LETTER" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>Agent Runway</Text>
            <Text style={s.reportSubtitle}>
              Business Performance Report — YTD {year}
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.agentName}>{agentName || "Real Estate Agent"}</Text>
            {!!brokerageName && <Text style={s.agentSub}>{brokerageName}</Text>}
            {!!businessName && <Text style={s.agentSub}>{businessName}</Text>}
            <Text style={s.agentSub}>
              {provinceLabel} · Generated {generatedDate}
            </Text>
          </View>
        </View>

        {/* ── KPI Row ── */}
        <View style={s.kpiRow}>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>YTD GCI</Text>
            <Text style={s.kpiValue}>{fmtCurrency(ytdGCI)}</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Closed Deals</Text>
            <Text style={s.kpiValue}>{ytdDeals}</Text>
            <Text style={s.kpiSub}>{buyerDeals}B / {sellerDeals}S</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Avg Deal Size</Text>
            <Text style={s.kpiValue}>{fmtCurrency(avgDealSize)}</Text>
          </View>
          <View style={[s.kpiBox, s.kpiBoxLast]}>
            <Text style={s.kpiLabel}>Pipeline (Weighted)</Text>
            <Text style={s.kpiValue}>{fmtCurrency(pipelineWeighted)}</Text>
            <Text style={s.kpiSub}>{pipelineCount} deals</Text>
          </View>
        </View>

        {/* ── P&L + Tax side by side ── */}
        <View style={s.twoCol}>

          {/* P&L */}
          <View style={s.col}>
            <Text style={s.colTitle}>Profit & Loss — YTD {year}</Text>
            <View style={s.row}>
              <Text>Gross Commission Income</Text>
              <Text style={s.rowBold}>{fmtCurrency(ytdGCI)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>
                Brokerage split ({fmtPct(1 - agentPct)})
              </Text>
              <Text style={s.rowMuted}>−{fmtCurrency(brokerageTake)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>Transaction fees</Text>
              <Text style={s.rowMuted}>−{fmtCurrency(txFees)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>Brokerage desk fees</Text>
              <Text style={s.rowMuted}>−{fmtCurrency(brokerageFeeYTD)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.rowBold}>Agent Gross</Text>
              <Text style={s.rowBold}>{fmtCurrency(agentGrossNet)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>Business expenses</Text>
              <Text style={s.rowMuted}>−{fmtCurrency(expensesYTD)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.rowTotal}>
              <Text style={s.rowTotalLabel}>Net Pre-Tax</Text>
              <Text style={s.rowTotalValue}>{fmtCurrency(netPreTax)}</Text>
            </View>
          </View>

          {/* Tax */}
          <View style={s.colRight}>
            <Text style={s.colTitle}>Projected Tax — {taxResult.taxYear}</Text>
            <View style={s.row}>
              <Text>Projected net income</Text>
              <Text style={s.rowBold}>{fmtCurrency(projectedNet)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>CPP/QPP contributions</Text>
              <Text style={s.rowMuted}>−{fmtCurrency(taxResult.totalCPP)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>Federal income tax</Text>
              <Text style={s.rowMuted}>−{fmtCurrency(taxResult.federalTax)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>Provincial income tax</Text>
              <Text style={s.rowMuted}>−{fmtCurrency(taxResult.provincialTax)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.rowBold}>Total tax burden</Text>
              <Text style={s.rowBold}>{fmtCurrency(taxResult.totalBurden)}</Text>
            </View>
            <View style={s.row}>
              <Text>Effective rate</Text>
              <Text style={s.rowBold}>{fmtPct(taxResult.effectiveRate)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.rowMuted}>Quarterly instalment</Text>
              <Text style={s.rowBold}>{fmtCurrency(taxResult.quarterlyEstimate)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowMuted}>Per-deal set-aside</Text>
              <Text style={s.rowBold}>{fmtCurrency(taxResult.perDealSetAside)}</Text>
            </View>
          </View>
        </View>

        {/* ── Expenses by Category ── */}
        <Text style={s.sectionTitle}>Expenses by Category</Text>
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={s.tHeadCell}>Category</Text>
            <Text style={[s.tHeadCell, s.tHeadRight]}>YTD Amount</Text>
            <Text style={[s.tHeadCell, s.tHeadRight]}>Monthly</Text>
          </View>
          {filteredExpenses.map((cat, idx) => {
            const catYTD = cat.items.reduce((sum, i) => sum + Number(i.ytd_amount), 0);
            const catMonthly = cat.items.reduce((sum, i) => sum + Number(i.monthly_recurring), 0);
            const isLast = idx === filteredExpenses.length - 1;
            return (
              <View
                key={cat.id}
                style={[
                  s.tRow,
                  idx % 2 === 1 ? s.tRowStripe : {},
                  isLast ? s.tRowLast : {},
                ]}
              >
                <Text style={s.tCell}>{cat.title}</Text>
                <Text style={[s.tCell, s.tCellRight]}>{fmtCurrency(catYTD)}</Text>
                <Text style={[s.tCell, s.tCellRight]}>{fmtCurrency(catMonthly)}</Text>
              </View>
            );
          })}
          <View style={s.tRowTotal}>
            <Text style={[s.tCell, s.tCellBold]}>Total</Text>
            <Text style={[s.tCell, s.tCellRight, s.tCellBold]}>
              {fmtCurrency(expensesYTD)}
            </Text>
            <Text style={[s.tCell, s.tCellRight, s.tCellBold]}>
              {fmtCurrency(monthlyRecurring)}
            </Text>
          </View>
        </View>

        {/* ── Monthly Breakdown ── */}
        {monthlyData.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>Monthly Breakdown</Text>
            <View style={s.table}>
              <View style={s.tHead}>
                <Text style={s.tHeadCell}>Month</Text>
                <Text style={[s.tHeadCell, s.tHeadRight]}>GCI</Text>
                <Text style={[s.tHeadCell, s.tHeadRight]}>Deals</Text>
              </View>
              {monthlyData.map((m, idx) => (
                <View
                  key={m.month}
                  style={[
                    s.tRow,
                    idx % 2 === 1 ? s.tRowStripe : {},
                    idx === monthlyData.length - 1 ? s.tRowLast : {},
                  ]}
                >
                  <Text style={s.tCell}>{m.month}</Text>
                  <Text style={[s.tCell, s.tCellRight]}>{fmtCurrency(m.gci)}</Text>
                  <Text style={[s.tCell, s.tCellRight]}>{m.deals}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Transaction Log ── */}
        {transactions.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>
              Transaction Log ({transactions.length} deals)
            </Text>
            <View style={s.table}>
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 0.75 }]}>Date</Text>
                <Text style={[s.tHeadCell, { flex: 1.75 }]}>Address</Text>
                <Text style={[s.tHeadCell, { flex: 1.25 }]}>Client</Text>
                <Text style={[s.tHeadCell, { flex: 0.5 }]}>Side</Text>
                <Text style={[s.tHeadCell, s.tHeadRight, { flex: 0.75 }]}>GCI</Text>
              </View>
              {transactions.map((tx, idx) => (
                <View
                  key={tx.id}
                  style={[
                    s.tRow,
                    idx % 2 === 1 ? s.tRowStripe : {},
                    idx === transactions.length - 1 ? s.tRowLast : {},
                  ]}
                >
                  <Text style={[s.tCell, { flex: 0.75 }]}>{tx.date}</Text>
                  <Text style={[s.tCell, { flex: 1.75 }]}>{tx.address || "—"}</Text>
                  <Text style={[s.tCell, { flex: 1.25 }]}>{tx.client_name || "—"}</Text>
                  <Text style={[s.tCell, { flex: 0.5 }]}>{tx.side}</Text>
                  <Text style={[s.tCell, s.tCellRight, { flex: 0.75 }]}>
                    {fmtCurrency(computeGCI(tx))}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Footer (repeats on every page) ── */}
        <View style={s.footer} fixed>
          <Text>Agent Runway — agentrunway.ca</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  );
}
