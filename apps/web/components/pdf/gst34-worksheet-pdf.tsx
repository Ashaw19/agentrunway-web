// @ts-nocheck -- @react-pdf/renderer class components are incompatible with @types/react 19.2 strict JSX; no runtime impact
/**
 * GST/HST Return Worksheet PDF
 * ============================
 * One filing period, laid out line by line the way CRA's GST34 return is, so
 * the figures can be copied into the return and checked against receipts.
 *
 * Page 1 — the lines of the return, how line 106 was worked out, and what to
 *          check before filing
 * Page 2+ — every expense behind line 106
 *
 * Every number comes from `computeGST34` (the lines) and
 * `buildGST34Worksheet` (the detail). This file only lays them out.
 *
 * IMPORTANT: a worksheet, not a filed return. The agent files with CRA.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { GST34Result, GST34FilingLine } from "@agent-runway/core/engines/gst34-engine";
import type { GST34Worksheet, GST34WorksheetRow } from "@agent-runway/core/engines/gst34-worksheet";
import type { FilingPeriod } from "@/lib/types/database";
import { receiptCategoryFullLabel } from "@/lib/types/receipt";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}
function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}
const pct = (share: number) => `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;

const HOW_LABEL: Record<GST34FilingLine["how"], string> = {
  enter: "You enter",
  calculated: "CRA calculates",
  paper: "Paper return only",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  appName:   { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0284c7" },
  docTitle:  { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1e293b", marginTop: 2 },
  subText:   { fontSize: 8, color: "#64748b", marginTop: 2 },
  divider:   { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginBottom: 12 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },

  tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  row:         { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7" },
  rowMuted:    { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7", backgroundColor: "#f8fafc" },
  rowResult:   { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, backgroundColor: "#e0f2fe", borderRadius: 3, marginTop: 2 },
  th:          { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#475569" },
  td:          { fontSize: 8.5, color: "#1e293b" },
  tdBold:      { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  tdMuted:     { fontSize: 7.5, color: "#64748b" },
  lineNo:      { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#0369a1" },

  noteBox:     { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, padding: 8, marginTop: 4 },
  warnBox:     { borderWidth: 1, borderColor: "#fcd34d", backgroundColor: "#fffbeb", borderRadius: 4, padding: 8, marginTop: 6 },
  bullet:      { fontSize: 8.5, color: "#334155", marginBottom: 3, lineHeight: 1.35 },

  disclaimer:  { position: "absolute", bottom: 20, left: 36, right: 36, borderTopWidth: 0.5, borderTopColor: "#cbd5e1", paddingTop: 5 },
  discText:    { fontSize: 6.5, color: "#94a3b8", textAlign: "center" },
  pageNum:     { position: "absolute", bottom: 10, right: 36, fontSize: 7, color: "#94a3b8" },
});

// ── Props ─────────────────────────────────────────────────────────────────────

export interface Gst34WorksheetPdfProps {
  period: FilingPeriod;
  /** "monthly" | "quarterly" | "annual" */
  frequency: string;
  result: GST34Result;
  worksheet: GST34Worksheet;
  agentName: string;
  /** GST/HST registration number from settings, if the agent entered one. */
  businessNumber?: string | null;
  vehiclePct: number;
  homePct: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Gst34WorksheetPdf({
  period,
  frequency,
  result,
  worksheet,
  agentName,
  businessNumber,
  vehiclePct,
  homePct,
}: Gst34WorksheetPdfProps) {
  const tax = result.taxLabel;
  const generatedOn = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const last = result.filingLines[result.filingLines.length - 1];
  const receiptRows = worksheet.rows.filter((r) => r.source === "receipt");
  const recurringRows = worksheet.rows.filter((r) => r.source === "recurring");

  const ruleNote = (r: GST34WorksheetRow): string =>
    r.rule === "meals" ? "50% meals limit"
    : r.rule === "vehicle" ? `${pct(vehiclePct)} vehicle use`
    : r.rule === "home" ? `${pct(homePct)} home office`
    : "";
  /** Two short lines, so neither is hyphenated in the narrow column. */
  const NoteCell = ({ r }: { r: GST34WorksheetRow }) => (
    <View style={{ width: 96, paddingLeft: 8 }}>
      {ruleNote(r) !== "" && <Text style={S.tdMuted}>{ruleNote(r)}</Text>}
      {r.source === "receipt" && r.hasReceiptImage === false && <Text style={S.tdMuted}>no image stored</Text>}
    </View>
  );

  const Footer = () => (
    <>
      <View style={S.disclaimer} fixed>
        <Text style={S.discText}>
          Agent Runway · {tax} return worksheet · {period.label} · Generated {generatedOn}
          {"\n"}
          A WORKSHEET, NOT A FILED RETURN. Figures are estimates from the records in Agent Runway and are for information only.
          Agent Runway is not a tax professional. Check them against your own records before you file with CRA.
        </Text>
      </View>
      <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
    </>
  );

  return (
    <Document title={`${tax} return worksheet ${period.label}`} author="Agent Runway">
      {/* ── PAGE 1: the return ──────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.appName}>Agent Runway</Text>
            <Text style={S.docTitle}>{tax} Return Worksheet: {period.label}</Text>
            <Text style={S.subText}>
              {agentName}{businessNumber ? ` · ${tax} number ${businessNumber}` : ""}
            </Text>
            <Text style={S.subText}>
              Reporting period {fmtDate(period.startDate)} to {fmtDate(period.endDate)} · {frequency} filer · due {fmtDate(period.deadline)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={S.subText}>{last.line === "114" ? "Refund claimed (line 114)" : "Amount owing (line 115)"}</Text>
            <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: last.line === "114" ? "#047857" : "#b91c1c" }}>
              {fmt(last.amount)}
            </Text>
          </View>
        </View>
        <View style={S.divider} />

        <Text style={[S.sectionTitle, { marginTop: 0 }]}>The return, line by line (CRA Form GST34)</Text>
        <View style={S.tableHeader}>
          <Text style={[S.th, { width: 34 }]}>Line</Text>
          <Text style={[S.th, { flex: 1 }]}>What it is, and where the figure comes from</Text>
          <Text style={[S.th, { width: 78, textAlign: "right" }]}>Amount</Text>
          <Text style={[S.th, { width: 82, textAlign: "right" }]}>On the return</Text>
        </View>
        {result.filingLines.map((l) => {
          const isResult = l.line === "114" || l.line === "115";
          const muted = l.how === "paper" || !l.tracked;
          return (
            <View key={l.line} style={isResult ? S.rowResult : muted ? S.rowMuted : S.row} wrap={false}>
              <Text style={[S.lineNo, { width: 34 }]}>{l.line}</Text>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Text style={isResult || l.line === "106" || l.line === "101" ? S.tdBold : S.td}>{l.label}</Text>
                <Text style={S.tdMuted}>{l.note}</Text>
              </View>
              <Text style={[isResult ? S.tdBold : S.td, { width: 78, textAlign: "right" }]}>{fmt(l.amount)}</Text>
              <Text style={[S.tdMuted, { width: 82, textAlign: "right" }]}>{HOW_LABEL[l.how]}</Text>
            </View>
          );
        })}

        <View wrap={false}>
        <Text style={S.sectionTitle}>How line 106 was worked out</Text>
        <View style={S.noteBox}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
            <Text style={S.td}>{tax} paid on expenses in the period</Text>
            <Text style={S.td}>{fmt(result.hstPaidOnExpenses)}</Text>
          </View>
          {result.mealItcReduction > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={S.tdMuted}>Less: half of the {tax} on meals and entertainment</Text>
              <Text style={S.tdMuted}>{fmt(-result.mealItcReduction)}</Text>
            </View>
          )}
          {result.vehicleItcReduction > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={S.tdMuted}>Less: personal share of vehicle {tax} (business use {pct(vehiclePct)})</Text>
              <Text style={S.tdMuted}>{fmt(-result.vehicleItcReduction)}</Text>
            </View>
          )}
          {result.homeItcReduction > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={S.tdMuted}>Less: personal share of home bill {tax} (home office {pct(homePct)})</Text>
              <Text style={S.tdMuted}>{fmt(-result.homeItcReduction)}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#cbd5e1", paddingTop: 3 }}>
            <Text style={S.tdBold}>Eligible input tax credits (line 106)</Text>
            <Text style={S.tdBold}>{fmt(result.filingLines.find((l) => l.line === "106")?.amount ?? 0)}</Text>
          </View>
        </View>
        </View>

        <View wrap={false}>
        <Text style={S.sectionTitle}>Before you file</Text>
        <View>
          <Text style={S.bullet}>
            {`• Lines marked "You enter" are typed into CRA's return. CRA's online return works out lines 105, 108, 109 and the refund or amount owing from them.`}
          </Text>
          <Text style={S.bullet}>
            {`• Lines 104, 107, 111, 205 and 405 are $0 here because Agent Runway has no information for them. Each one's note says when it applies.`}
          </Text>
          {worksheet.noTaxRecorded.count > 0 && (
            <Text style={S.bullet}>
              • {worksheet.noTaxRecorded.count} receipt{worksheet.noTaxRecorded.count !== 1 ? "s" : ""} in this period ({fmt(worksheet.noTaxRecorded.paid)} paid) {worksheet.noTaxRecorded.count !== 1 ? "have" : "has"} no {tax} recorded. Nothing is claimed on {worksheet.noTaxRecorded.count !== 1 ? "them" : "it"}.
            </Text>
          )}
          {worksheet.withoutReceiptImage > 0 && (
            <Text style={S.bullet}>
              • {worksheet.withoutReceiptImage} of the receipts behind line 106 {worksheet.withoutReceiptImage !== 1 ? "have" : "has"} no receipt image stored in Agent Runway. CRA can ask to see the supporting document for an input tax credit.
            </Text>
          )}
          <Text style={S.bullet}>
            • The {tax} on each expense is the amount recorded on it in Agent Runway. Where an expense was typed in or imported, compare it with the tax printed on the receipt.
          </Text>
          <Text style={S.bullet}>
            • CRA expects a return for every reporting period, including one with no sales.
          </Text>
        </View>
        </View>
        {worksheet.differenceFromLine106 !== 0 && (
          <View style={S.warnBox}>
            <Text style={[S.td, { color: "#92400e" }]}>
              The expense list on the next page adds up to {fmt(worksheet.totals.claimable)}, which differs from line 106 by {fmt(worksheet.differenceFromLine106)}. Do not file from this worksheet until the two agree. Reload the Expenses page and download it again, and contact support if the difference remains.
            </Text>
          </View>
        )}

        <Footer />
      </Page>

      {/* ── PAGE 2+: what is behind line 106 ────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.appName}>Agent Runway</Text>
            <Text style={S.docTitle}>Expenses behind line 106: {period.label}</Text>
            <Text style={S.subText}>Every expense in the period with {tax} recorded, and how much of that {tax} is an eligible credit</Text>
          </View>
        </View>
        <View style={S.divider} />

        <View style={S.tableHeader} fixed>
          <Text style={[S.th, { width: 58 }]}>Date</Text>
          <Text style={[S.th, { flex: 1.3 }]}>Vendor</Text>
          <Text style={[S.th, { flex: 1.2 }]}>Category</Text>
          <Text style={[S.th, { width: 56, textAlign: "right" }]}>Paid</Text>
          <Text style={[S.th, { width: 50, textAlign: "right" }]}>{tax}</Text>
          <Text style={[S.th, { width: 56, textAlign: "right" }]}>Claimable</Text>
          <Text style={[S.th, { width: 96, paddingLeft: 8 }]}>Note</Text>
        </View>
        {worksheet.rows.length === 0 && (
          <View style={S.row}>
            <Text style={S.tdMuted}>No expense in this period has {tax} recorded.</Text>
          </View>
        )}
        {receiptRows.map((r, i) => (
          <View key={`r-${i}`} style={S.row} wrap={false}>
            <Text style={[S.td, { width: 58 }]}>{r.date ? fmtDate(r.date) : ""}</Text>
            <Text style={[S.td, { flex: 1.3, paddingRight: 4 }]}>{r.description}</Text>
            <Text style={[S.tdMuted, { flex: 1.2, paddingRight: 4 }]}>{r.categoryKey ? receiptCategoryFullLabel(r.categoryKey) : "Uncategorized"}</Text>
            <Text style={[S.td, { width: 56, textAlign: "right" }]}>{fmt(r.paid)}</Text>
            <Text style={[S.td, { width: 50, textAlign: "right" }]}>{fmt(r.hst)}</Text>
            <Text style={[S.td, { width: 56, textAlign: "right" }]}>{fmt(r.claimable)}</Text>
            <NoteCell r={r} />
          </View>
        ))}
        {recurringRows.length > 0 && (
          <View style={[S.rowMuted, { marginTop: 4 }]}>
            <Text style={S.th}>Recurring expenses (from your Recurring Expenses list)</Text>
          </View>
        )}
        {recurringRows.map((r, i) => (
          <View key={`re-${i}`} style={S.row} wrap={false}>
            <Text style={[S.tdMuted, { width: 58 }]}>{r.occurrences} charge{r.occurrences !== 1 ? "s" : ""}</Text>
            <Text style={[S.td, { flex: 1.3, paddingRight: 4 }]}>{r.description}</Text>
            <Text style={[S.tdMuted, { flex: 1.2, paddingRight: 4 }]}>{r.categoryKey ? receiptCategoryFullLabel(r.categoryKey) : "Uncategorized"}</Text>
            <Text style={[S.td, { width: 56, textAlign: "right" }]}>{fmt(r.paid)}</Text>
            <Text style={[S.td, { width: 50, textAlign: "right" }]}>{fmt(r.hst)}</Text>
            <Text style={[S.td, { width: 56, textAlign: "right" }]}>{fmt(r.claimable)}</Text>
            <NoteCell r={r} />
          </View>
        ))}
        {worksheet.rows.length > 0 && (
          <View style={S.rowResult} wrap={false}>
            <Text style={[S.tdBold, { flex: 1 }]}>Total ({worksheet.rows.length} expense{worksheet.rows.length !== 1 ? "s" : ""})</Text>
            <Text style={[S.tdBold, { width: 56, textAlign: "right" }]}>{fmt(worksheet.totals.paid)}</Text>
            <Text style={[S.tdBold, { width: 50, textAlign: "right" }]}>{fmt(worksheet.totals.hst)}</Text>
            <Text style={[S.tdBold, { width: 56, textAlign: "right" }]}>{fmt(worksheet.totals.claimable)}</Text>
            <Text style={[S.tdMuted, { width: 96, paddingLeft: 8 }]}>= line 106</Text>
          </View>
        )}

        <Footer />
      </Page>
    </Document>
  );
}
