// @ts-nocheck -- @react-pdf/renderer class components are incompatible with @types/react 19.2 strict JSX; no runtime impact
"use client";
import React from "react";
import {
  Document, Page, View, Text, StyleSheet,
} from "@react-pdf/renderer";
import { BRAND, fmtMoney, type ProductionReportData, prepareReportData } from "./production-report-pdf";

const S = StyleSheet.create({
  page: { fontFamily: "Helvetica", backgroundColor: BRAND.white, paddingBottom: 40 },
  // Cover
  coverBand: { backgroundColor: BRAND.navy, padding: 40, paddingBottom: 32 },
  coverGoldLine: { height: 3, backgroundColor: BRAND.gold, marginBottom: 24 },
  coverTitle: { fontSize: 28, fontFamily: "Helvetica-Bold", color: BRAND.white, marginBottom: 6 },
  coverSub: { fontSize: 13, color: "#93C5FD", marginBottom: 20 },
  coverAgent: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND.white },
  coverBrokerage: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  coverDate: { fontSize: 9, color: "#64748B", marginTop: 16 },
  coverBody: { padding: 40 },
  // Section
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND.navy, marginBottom: 8, marginTop: 16 },
  // Table
  table: { borderWidth: 1, borderColor: BRAND.border, borderRadius: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: BRAND.navy, padding: "6 8" },
  tableHeaderText: { color: BRAND.white, fontSize: 8, fontFamily: "Helvetica-Bold" },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderColor: BRAND.border, padding: "5 8" },
  tableRowAlt: { backgroundColor: BRAND.light },
  tableCell: { fontSize: 8, color: BRAND.slate },
  tableCellBold: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND.navy },
  // Year header band
  yearBand: { backgroundColor: BRAND.blue, padding: "10 40", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  yearTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BRAND.white },
  yearGCI: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BRAND.gold },
  // KPI row
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 12, padding: "0 40" },
  kpiBox: { flex: 1, borderWidth: 1, borderColor: BRAND.border, borderRadius: 4, padding: 10 },
  kpiLabel: { fontSize: 8, color: BRAND.slate, marginBottom: 3 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND.navy },
  // Footer
  footer: { position: "absolute", bottom: 16, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: "#94A3B8" },
  // Body padding
  body: { paddingHorizontal: 40 },
});

function TableHeaderCell({ children, flex = 1 }: { children: string; flex?: number }) {
  return <Text style={[S.tableHeaderText, { flex }]}>{children}</Text>;
}
function TableCell({ children, flex = 1, bold = false }: { children: string; flex?: number; bold?: boolean }) {
  return <Text style={[bold ? S.tableCellBold : S.tableCell, { flex }]}>{children}</Text>;
}

export function ProductionReportPDF(props: ProductionReportData) {
  const { items, totalGCI, totalDeals, bestYear } = prepareReportData(props);
  const { agentName, brokerage, province, generatedAt, yearFilter } = props;

  return (
    <Document title={yearFilter ? `Production Report ${yearFilter}` : "Career Production Report"} author="Agent Runway">
      {/* ── COVER PAGE ── */}
      <Page size="LETTER" style={S.page}>
        <View style={S.coverBand}>
          <View style={S.coverGoldLine} />
          <Text style={S.coverTitle}>Historical Production{"\n"}Report</Text>
          <Text style={S.coverSub}>{yearFilter ? `Year: ${yearFilter}` : `${items[items.length - 1]?.year ?? ""} – ${items[0]?.year ?? ""}`}</Text>
          <Text style={S.coverAgent}>{agentName || "Agent"}</Text>
          <Text style={S.coverBrokerage}>{brokerage || ""}{province ? ` · ${province}` : ""}</Text>
          <Text style={S.coverDate}>Generated {generatedAt} · Powered by Agent Runway</Text>
        </View>

        {/* Career highlights on cover */}
        <View style={[S.coverBody, { paddingTop: 32 }]}>
          <Text style={S.sectionTitle}>Career Highlights</Text>
          <View style={[S.kpiRow, { padding: 0, marginTop: 8 }]}>
            <View style={S.kpiBox}>
              <Text style={S.kpiLabel}>Total Career GCI</Text>
              <Text style={S.kpiValue}>{fmtMoney(totalGCI)}</Text>
            </View>
            <View style={S.kpiBox}>
              <Text style={S.kpiLabel}>Total Closed Deals</Text>
              <Text style={S.kpiValue}>{totalDeals}</Text>
            </View>
            <View style={S.kpiBox}>
              <Text style={S.kpiLabel}>Years on Record</Text>
              <Text style={S.kpiValue}>{items.length}</Text>
            </View>
          </View>
          {bestYear && (
            <View style={[S.kpiRow, { padding: 0, marginTop: 0 }]}>
              <View style={S.kpiBox}>
                <Text style={S.kpiLabel}>Best Year</Text>
                <Text style={S.kpiValue}>{bestYear.year}</Text>
              </View>
              <View style={S.kpiBox}>
                <Text style={S.kpiLabel}>Best Year GCI</Text>
                <Text style={S.kpiValue}>{fmtMoney(bestYear.annual_gci)}</Text>
              </View>
              <View style={S.kpiBox}>
                <Text style={S.kpiLabel}>Avg per Deal</Text>
                <Text style={S.kpiValue}>{totalDeals > 0 ? fmtMoney(totalGCI / totalDeals) : "—"}</Text>
              </View>
            </View>
          )}

          {/* Career summary table */}
          <Text style={[S.sectionTitle, { marginTop: 24 }]}>Year-by-Year Summary</Text>
          <View style={S.table}>
            <View style={S.tableHeader}>
              <TableHeaderCell flex={0.6}>Year</TableHeaderCell>
              <TableHeaderCell flex={1.2}>GCI</TableHeaderCell>
              <TableHeaderCell flex={0.6}>Deals</TableHeaderCell>
              <TableHeaderCell flex={1.2}>Avg/Deal</TableHeaderCell>
              <TableHeaderCell>Q1</TableHeaderCell>
              <TableHeaderCell>Q2</TableHeaderCell>
              <TableHeaderCell>Q3</TableHeaderCell>
              <TableHeaderCell>Q4</TableHeaderCell>
            </View>
            {items.map((h, i) => (
              <View key={h.year} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}>
                <TableCell flex={0.6} bold>{String(h.year)}</TableCell>
                <TableCell flex={1.2} bold>{fmtMoney(h.annual_gci)}</TableCell>
                <TableCell flex={0.6}>{String(h.annual_tx)}</TableCell>
                <TableCell flex={1.2}>{h.annual_tx > 0 ? fmtMoney(h.annual_gci / h.annual_tx) : "—"}</TableCell>
                <TableCell>{fmtMoney(h.qGci[0] ?? 0)}</TableCell>
                <TableCell>{fmtMoney(h.qGci[1] ?? 0)}</TableCell>
                <TableCell>{fmtMoney(h.qGci[2] ?? 0)}</TableCell>
                <TableCell>{fmtMoney(h.qGci[3] ?? 0)}</TableCell>
              </View>
            ))}
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>Agent Runway — Confidential</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ── PER-YEAR PAGES ── */}
      {items.map(h => (
        <Page key={h.year} size="LETTER" style={S.page}>
          <View style={S.yearBand}>
            <Text style={S.yearTitle}>{h.year}</Text>
            <Text style={S.yearGCI}>{fmtMoney(h.annual_gci)}</Text>
          </View>

          <View style={[S.kpiRow, { marginTop: 16 }]}>
            <View style={S.kpiBox}>
              <Text style={S.kpiLabel}>Closed Deals</Text>
              <Text style={S.kpiValue}>{h.annual_tx}</Text>
            </View>
            <View style={S.kpiBox}>
              <Text style={S.kpiLabel}>Avg / Deal</Text>
              <Text style={S.kpiValue}>{h.annual_tx > 0 ? fmtMoney(h.annual_gci / h.annual_tx) : "—"}</Text>
            </View>
            <View style={S.kpiBox}>
              <Text style={S.kpiLabel}>Agent Split</Text>
              <Text style={S.kpiValue}>{h.split_pct != null ? `${(h.split_pct * 100).toFixed(0)}%` : "—"}</Text>
            </View>
          </View>

          {/* Quarterly breakdown */}
          <View style={S.body}>
            <Text style={S.sectionTitle}>Quarterly Breakdown</Text>
            <View style={S.table}>
              <View style={S.tableHeader}>
                <TableHeaderCell>Quarter</TableHeaderCell>
                <TableHeaderCell>GCI</TableHeaderCell>
                <TableHeaderCell>Deals</TableHeaderCell>
                <TableHeaderCell>Avg/Deal</TableHeaderCell>
                <TableHeaderCell>% of Year</TableHeaderCell>
              </View>
              {["Q1","Q2","Q3","Q4"].map((q, qi) => (
                <View key={q} style={[S.tableRow, qi % 2 === 1 ? S.tableRowAlt : {}]}>
                  <TableCell bold>{q}</TableCell>
                  <TableCell>{fmtMoney(h.qGci[qi] ?? 0)}</TableCell>
                  <TableCell>{String(h.qTx[qi] ?? 0)}</TableCell>
                  <TableCell>{(h.qTx[qi] ?? 0) > 0 ? fmtMoney((h.qGci[qi] ?? 0) / (h.qTx[qi] ?? 1)) : "—"}</TableCell>
                  <TableCell>{h.annual_gci > 0 ? `${(((h.qGci[qi] ?? 0) / h.annual_gci) * 100).toFixed(0)}%` : "—"}</TableCell>
                </View>
              ))}
            </View>

            {/* Deal log */}
            {h.records.length > 0 && (
              <>
                <Text style={S.sectionTitle}>Deal Log</Text>
                <View style={S.table}>
                  <View style={S.tableHeader}>
                    <TableHeaderCell flex={0.9}>Date</TableHeaderCell>
                    <TableHeaderCell flex={2.2}>Address</TableHeaderCell>
                    <TableHeaderCell flex={1.5}>Client</TableHeaderCell>
                    <TableHeaderCell flex={0.6}>Side</TableHeaderCell>
                    <TableHeaderCell flex={1}>GCI</TableHeaderCell>
                    <TableHeaderCell flex={1}>Source</TableHeaderCell>
                  </View>
                  {h.records.map((r, ri) => (
                    <View key={r.id} style={[S.tableRow, ri % 2 === 1 ? S.tableRowAlt : {}]}>
                      <TableCell flex={0.9}>{r.close_date ?? "—"}</TableCell>
                      <TableCell flex={2.2}>{r.address ?? "—"}</TableCell>
                      <TableCell flex={1.5}>{r.name ?? "—"}</TableCell>
                      <TableCell flex={0.6}>{(r.side ?? "").toUpperCase().slice(0, 1)}</TableCell>
                      <TableCell flex={1} bold>{fmtMoney(r.gci ?? 0)}</TableCell>
                      <TableCell flex={1}>{r.source ?? "—"}</TableCell>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          <View style={S.footer} fixed>
            <Text style={S.footerText}>Agent Runway — {agentName} — Confidential</Text>
            <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
