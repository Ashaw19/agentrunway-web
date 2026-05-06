// @ts-nocheck -- @react-pdf/renderer class components are incompatible with @types/react 19.2 strict JSX; no runtime impact
/**
 * T2125 Summary PDF
 * ==================
 * Uses @react-pdf/renderer to generate a clean, accountant-ready
 * T2125 Statement of Business Activities summary.
 *
 * IMPORTANT: This is a pre-fill summary for your accountant — NOT
 * a filed CRA T2125. Your accountant must review, adjust, and file
 * the actual form.
 */

import {
  Document, Page, Text, View, StyleSheet,
} from "@react-pdf/renderer";
import type { T2125Result } from "@/lib/engines/t2125-engine";
import type { TaxOptimizationCard } from "@/lib/engines/tax-optimization-engine";
import type { UserSettings } from "@/lib/types/database";
import { PROVINCE_LABELS } from "@/lib/types/database";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a2e",
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    backgroundColor: "#ffffff",
  },
  // Header
  headerBar: {
    height: 4,
    backgroundColor: "#1E40AF",
    marginBottom: 12,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#1E40AF",
  },
  headerSubtitle: {
    fontSize: 9,
    color: "#64748b",
    marginTop: 3,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  headerBadge: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 8,
    color: "#1D4ED8",
  },
  // Disclaimer
  disclaimer: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginBottom: 14,
    fontSize: 8,
    color: "#92400E",
    lineHeight: 1.5,
  },
  // Section
  sectionHeader: {
    backgroundColor: "#F1F5F9",
    borderLeftWidth: 3,
    borderLeftColor: "#3B82F6",
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1E3A5F",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 1,
  },
  // Identification grid
  idGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 8,
  },
  idCell: {
    width: "48%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  idLabel: { fontSize: 8, color: "#64748b" },
  idValue: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
  // Line rows
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  lineLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  lineNum: { fontSize: 7, color: "#94A3B8", width: 32, fontFamily: "Helvetica" },
  lineLabel: { fontSize: 8.5, color: "#334155", flex: 1 },
  lineNote: { fontSize: 7, color: "#F59E0B", marginLeft: 4 },
  lineValue: { fontSize: 8.5, color: "#1a1a2e", fontFamily: "Helvetica-Bold", textAlign: "right" },
  lineRowHighlight: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 3,
    marginVertical: 3,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  lineRowHighlightLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1E3A8A", flex: 1 },
  lineRowHighlightValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1E3A8A" },
  // Net income box
  netIncomeBox: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1.5,
    borderColor: "#6EE7B7",
    borderRadius: 6,
    padding: 10,
    marginTop: 10,
    marginBottom: 6,
  },
  netIncomeTitle: { fontSize: 8, color: "#065F46", marginBottom: 6 },
  netWaterfallRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  netWaterfallLabel: { fontSize: 8, color: "#374151" },
  netWaterfallValue: { fontSize: 8, color: "#374151", fontFamily: "Helvetica-Bold" },
  netTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1.5,
    borderTopColor: "#6EE7B7",
    marginTop: 5,
    paddingTop: 5,
  },
  netTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#065F46" },
  netTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#065F46" },
  // KPI tiles
  kpiRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  kpiTile: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 4,
    padding: 8,
    alignItems: "center",
  },
  kpiLabel: { fontSize: 7, color: "#64748b", marginBottom: 2, textAlign: "center" },
  kpiValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a1a2e", textAlign: "center" },
  kpiSub: { fontSize: 6.5, color: "#94A3B8", marginTop: 1, textAlign: "center" },
  // CCA table
  ccaHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 2,
  },
  ccaCol1: { flex: 2, fontSize: 7, color: "#64748b", fontFamily: "Helvetica-Bold" },
  ccaCol2: { flex: 1, fontSize: 7, color: "#64748b", fontFamily: "Helvetica-Bold", textAlign: "right" },
  ccaRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  // GST/HST and instalments
  gstRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    fontSize: 8,
  },
  gstBalance: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: "#FFF7ED",
    borderRadius: 3,
    marginTop: 4,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { fontSize: 7, color: "#94A3B8" },
  pageNum: { fontSize: 7, color: "#94A3B8" },
});

// ── Sub-components ─────────────────────────────────────────────────────────────

function LineRow({ lineNum, label, value, note }: {
  lineNum?: string; label: string; value: number; note?: string;
}) {
  return (
    <View style={s.lineRow}>
      <View style={s.lineLeft}>
        {lineNum && <Text style={s.lineNum}>{lineNum}</Text>}
        <Text style={s.lineLabel}>{label}</Text>
        {note && <Text style={s.lineNote}>{note}</Text>}
      </View>
      <Text style={s.lineValue}>{fmt(value)}</Text>
    </View>
  );
}

function LineHighlight({ lineNum, label, value }: {
  lineNum?: string; label: string; value: number;
}) {
  return (
    <View style={s.lineRowHighlight}>
      <Text style={s.lineRowHighlightLabel}>
        {lineNum ? `${lineNum} · ` : ""}{label}
      </Text>
      <Text style={s.lineRowHighlightValue}>{fmt(value)}</Text>
    </View>
  );
}

function SectionHeader({ title, subtitle, color = "#3B82F6" }: {
  title: string; subtitle?: string; color?: string;
}) {
  return (
    <View style={[s.sectionHeader, { borderLeftColor: color }]}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function Footer({ year, agentName }: { year: number; agentName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        Agent Runway · T2125 Summary · {agentName} · {year} Tax Year
      </Text>
      <Text style={s.footerText}>
        ESTIMATES ONLY — NOT PROFESSIONAL TAX ADVICE — CONSULT YOUR ACCOUNTANT
      </Text>
      <Text style={s.footerText}>
        © 2026 Agent Runway Inc. · Canada Corporation No. 1786542-2
      </Text>
    </View>
  );
}

// ── Main PDF component ─────────────────────────────────────────────────────────

interface MileageSummary {
  totalKm: number;
  totalDeduction: number;
  tripCount: number;
  businessUsePct: number;
}

interface Props {
  result: T2125Result;
  settings: UserSettings;
  taxYear: number;
  mileageSummary?: MileageSummary;
  taxOptCards?: TaxOptimizationCard[];
  totalEstimatedSavings?: number;
}

export function T2125Pdf({ result, settings, taxYear, mileageSummary, taxOptCards, totalEstimatedSavings }: Props) {
  const generatedDate = new Date().toLocaleDateString("en-CA");

  return (
    <Document
      title={`T2125 Summary — ${result.agentName} — ${taxYear}`}
      author="Agent Runway"
      subject="T2125 Statement of Business Activities — Pre-Fill Summary"
      keywords="T2125, real estate, self-employment, CRA, tax"
    >
      {/* ── PAGE 1: Identification + Income + Expenses ── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.headerBar} />

        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>T2125 Summary</Text>
            <Text style={s.headerSubtitle}>
              Statement of Business Activities · {taxYear} Tax Year
            </Text>
            <Text style={s.headerSubtitle}>
              Generated {generatedDate} by Agent Runway
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerBadge}>NAICS 531210 — Real Estate Agent</Text>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={s.disclaimer}>
          <Text>
            ⚠️  IMPORTANT: This is a pre-fill summary for planning purposes and to assist your
            accountant — it is NOT a filed T2125. Values are calculated from your Agent Runway
            data and may not reflect all deductions or adjustments you are entitled to. A
            qualified accountant must review, adjust, and file your actual T2125 with CRA.
            This document does not constitute tax advice. See agentrunway.ca/terms.
          </Text>
        </View>

        {/* Identification */}
        <SectionHeader title="Identification" subtitle="Basic business details for your CRA filing" />
        <View style={s.idGrid}>
          <View style={s.idCell}><Text style={s.idLabel}>Agent Name</Text><Text style={s.idValue}>{result.agentName || "—"}</Text></View>
          <View style={s.idCell}><Text style={s.idLabel}>Province</Text><Text style={s.idValue}>{PROVINCE_LABELS[settings.province] ?? settings.province}</Text></View>
          <View style={s.idCell}><Text style={s.idLabel}>Business / Trade Name</Text><Text style={s.idValue}>{result.businessName || "—"}</Text></View>
          <View style={s.idCell}><Text style={s.idLabel}>GST/HST Registration #</Text><Text style={s.idValue}>{result.businessNumber || "Not provided"}</Text></View>
          <View style={s.idCell}><Text style={s.idLabel}>Fiscal Year End</Text><Text style={s.idValue}>December 31, {taxYear}</Text></View>
          <View style={s.idCell}><Text style={s.idLabel}>Industry Code (NAICS)</Text><Text style={s.idValue}>531210</Text></View>
        </View>

        {/* Income */}
        <SectionHeader title="Part 3A — Income" subtitle="Gross commission income from closed transactions" color="#059669" />
        <LineRow lineNum="8200" label="Gross Commission Income (closed deals)" value={result.grossCommissionIncome} />
        <LineHighlight lineNum="8200" label="Total Gross Business Income" value={result.totalGrossIncome} />

        {/* Expenses */}
        <SectionHeader title="Part 3B — Deductible Expenses" subtitle="CRA T2125 lines 8521–9369 · Auto-filled from expense tracking" color="#7C3AED" />
        <LineRow lineNum="8521" label="Advertising & Marketing" value={result.line8521_advertising} />
        <LineRow lineNum="9281" label={`Motor Vehicle Expenses (${fmtPct(settings.vehicle_business_use_pct)} business use)`} value={result.line9281_motorVehicle} note="* User-declared %" />
        <LineRow lineNum="8811" label="Office Supplies & Software" value={result.line8811_officeSupplies} />
        <LineRow
          lineNum="8523"
          label="Meals & Entertainment (50% rule applied)"
          value={result.line8523_mealsEntertainment50pct}
          note={`Gross: ${fmt(result.line8523_mealsEntertainmentGross)} × 50%`}
        />
        <LineRow lineNum="9220" label="Utilities (Phone, Internet)" value={result.line9220_utilities} />
        {result.line9270_otherExpenses > 0 && (
          <LineRow lineNum="9270" label="Other Expenses (Gifts, Education)" value={result.line9270_otherExpenses} />
        )}
        <LineRow lineNum="8760" label="Licences, Memberships & Dues" value={result.line8760_licencesMemberships} />
        {result.line8690_insurance > 0 && (
          <LineRow lineNum="8690" label="Insurance (E&O)" value={result.line8690_insurance} />
        )}
        <LineRow lineNum="8860" label="Professional Fees (Accounting & Legal)" value={result.line8860_professionalFees} />
        <LineHighlight lineNum="9369" label="Total Deductible Expenses" value={result.line9369_totalExpenses} />
        {result.line9281_motorVehicle > 0 && (
          <Text style={{ fontSize: 7, color: "#92400E", paddingHorizontal: 6, marginTop: 2 }}>
            * Vehicle business-use % ({fmtPct(settings.vehicle_business_use_pct)}) is user-declared. CRA requires a contemporaneous mileage logbook to substantiate this figure.
          </Text>
        )}

        <Footer year={taxYear} agentName={result.agentName} />
      </Page>

      {/* ── PAGE 2: CCA + Home Office + Net Income + GST/HST + Instalments ── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.headerBar} />
        <Text style={[s.headerTitle, { marginBottom: 12 }]}>T2125 Summary · Page 2 · {taxYear}</Text>

        {/* CCA */}
        <SectionHeader title="Capital Cost Allowance (Line 9936)" subtitle="Depreciation on business assets" color="#EA580C" />
        {result.ccaLines.length === 0 ? (
          <Text style={{ fontSize: 8, color: "#94A3B8", padding: 8 }}>No CCA assets recorded.</Text>
        ) : (
          <>
            <View style={s.ccaHeader}>
              <Text style={s.ccaCol1}>Asset</Text>
              <Text style={s.ccaCol2}>Class / Rate</Text>
              <Text style={s.ccaCol2}>UCC</Text>
              <Text style={s.ccaCol2}>Business %</Text>
              <Text style={s.ccaCol2}>CCA Claimed</Text>
            </View>
            {result.ccaLines.map((line, i) => (
              <View key={i} style={s.ccaRow}>
                <Text style={[s.ccaCol1, { fontSize: 7.5 }]}>{line.asset.description}</Text>
                <Text style={[s.ccaCol2, { fontSize: 7.5 }]}>
                  Cl.{line.asset.cca_class} / {fmtPct(line.asset.class_rate)}
                </Text>
                <Text style={[s.ccaCol2, { fontSize: 7.5 }]}>{fmt(line.ucc)}</Text>
                <Text style={[s.ccaCol2, { fontSize: 7.5 }]}>{fmtPct(line.asset.business_use_pct)}</Text>
                <Text style={[s.ccaCol2, { fontSize: 7.5, fontFamily: "Helvetica-Bold" }]}>{fmt(line.ccaClaimed)}</Text>
              </View>
            ))}
          </>
        )}
        <LineHighlight lineNum="9936" label="Total CCA Deduction" value={result.line9936_totalCca} />

        {/* Home Office */}
        <SectionHeader title="Home Office — Line 9945" subtitle={`Actual costs × ${fmtPct(result.homeOffice.businessUsePct)} business use`} color="#0D9488" />
        <LineRow label="Annual rent / mortgage interest" value={result.homeOffice.annualRent} />
        <LineRow label="Annual utilities" value={result.homeOffice.annualUtilities} />
        <LineRow label="Annual property tax" value={result.homeOffice.annualPropertyTax} />
        <LineRow label="Annual home insurance" value={result.homeOffice.annualInsurance} />
        <LineRow label="Annual maintenance" value={result.homeOffice.annualMaintenance} />
        {result.homeOffice.annualCondoFees > 0 && <LineRow label="Annual condo fees" value={result.homeOffice.annualCondoFees} />}
        <LineRow label={`Total × ${fmtPct(result.homeOffice.businessUsePct)} business use`} value={result.homeOffice.deduction} />
        <LineHighlight lineNum="9945" label="Home Office Deduction" value={result.line9945_homeOfficeDeduction} />

        {/* Net Business Income */}
        <SectionHeader title="Net Business Income — Line 8270" subtitle="T1 General Line 10400 — Reportable self-employment income" color="#059669" />
        <View style={s.netIncomeBox}>
          <Text style={s.netIncomeTitle}>Business Income Waterfall</Text>
          <View style={s.netWaterfallRow}>
            <Text style={s.netWaterfallLabel}>Total Gross Income (8200)</Text>
            <Text style={s.netWaterfallValue}>{fmt(result.totalGrossIncome)}</Text>
          </View>
          <View style={s.netWaterfallRow}>
            <Text style={s.netWaterfallLabel}>− Deductible Expenses (9369)</Text>
            <Text style={s.netWaterfallValue}>−{fmt(result.line9369_totalExpenses)}</Text>
          </View>
          <View style={s.netWaterfallRow}>
            <Text style={s.netWaterfallLabel}>− Capital Cost Allowance (9936)</Text>
            <Text style={s.netWaterfallValue}>−{fmt(result.line9936_totalCca)}</Text>
          </View>
          <View style={s.netWaterfallRow}>
            <Text style={s.netWaterfallLabel}>− Home Office Deduction (9945)</Text>
            <Text style={s.netWaterfallValue}>−{fmt(result.line9945_homeOfficeDeduction)}</Text>
          </View>
          <View style={s.netTotal}>
            <Text style={s.netTotalLabel}>Net Business Income (8270)</Text>
            <Text style={s.netTotalValue}>{fmt(result.line8270_netBusinessIncome)}</Text>
          </View>
        </View>

        <View style={s.kpiRow}>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>CPP Contribution</Text>
            <Text style={s.kpiValue}>{fmt(result.cppContribution)}</Text>
            <Text style={s.kpiSub}>{fmt(result.cppDeductible)} deductible</Text>
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>Est. Tax Burden</Text>
            <Text style={s.kpiValue}>{fmt(result.totalTaxBurden)}</Text>
            <Text style={s.kpiSub}>{fmtPct(result.effectiveRate)} effective rate</Text>
          </View>
          <View style={s.kpiTile}>
            <Text style={s.kpiLabel}>Quarterly Instalment</Text>
            <Text style={s.kpiValue}>{fmt(result.instalments.recommendedQuarterly)}</Text>
            <Text style={s.kpiSub}>Due Apr/Jul/Oct/Jan</Text>
          </View>
        </View>

        {/* GST/HST */}
        {settings.gst_hst_registered && (
          <>
            <SectionHeader
              title={`${result.gstHst.label} Remittance`}
              subtitle={`Rate: ${(result.gstHst.rate * 100).toFixed(result.gstHst.rate === 0.14975 ? 3 : 0)}% · ${PROVINCE_LABELS[settings.province] ?? settings.province}`}
              color="#0369A1"
            />
            <View style={s.gstRow}><Text>Collected on GCI</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(result.gstHst.collectedOnGCI)}</Text></View>
            <View style={s.gstRow}><Text>Less: ITCs (tax paid on expenses)</Text><Text>−{fmt(result.gstHst.paidOnExpenses)}</Text></View>
            <View style={s.gstRow}><Text>Less: Already remitted to CRA</Text><Text>−{fmt(result.gstHst.remittedTotal)}</Text></View>
            <View style={s.gstBalance}>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: result.gstHst.netPayable > 0 ? "#B45309" : "#065F46" }}>
                {result.gstHst.netPayable > 0 ? "Estimated balance owing" : "Estimated refund / credit"}
              </Text>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: result.gstHst.netPayable > 0 ? "#B45309" : "#065F46" }}>
                {fmt(Math.abs(result.gstHst.netPayable))}
              </Text>
            </View>
          </>
        )}

        {/* Instalments */}
        <SectionHeader title="CRA Tax Instalment Tracker" subtitle="Recommended vs. paid comparison" color="#B45309" />
        <View style={s.ccaHeader}>
          <Text style={[s.ccaCol1, { flex: 1 }]}>Quarter</Text>
          <Text style={[s.ccaCol2]}>Due Date</Text>
          <Text style={[s.ccaCol2]}>Recommended</Text>
          <Text style={[s.ccaCol2]}>Paid</Text>
        </View>
        {([1, 2, 3, 4] as const).map((q) => {
          const paid = [result.instalments.paidQ1, result.instalments.paidQ2, result.instalments.paidQ3, result.instalments.paidQ4][q - 1];
          const dueDates = ["April 30", "July 31", "October 31", "January 31"];
          return (
            <View key={q} style={s.ccaRow}>
              <Text style={[s.ccaCol1, { flex: 1, fontSize: 8 }]}>Q{q}</Text>
              <Text style={[s.ccaCol2, { fontSize: 8 }]}>{dueDates[q - 1]}</Text>
              <Text style={[s.ccaCol2, { fontSize: 8 }]}>{fmt(result.instalments.recommendedQuarterly)}</Text>
              <Text style={[s.ccaCol2, { fontSize: 8, fontFamily: "Helvetica-Bold" }]}>{fmt(paid)}</Text>
            </View>
          );
        })}
        <View style={[s.gstBalance, { backgroundColor: result.instalments.balance > 0 ? "#FFF7ED" : "#ECFDF5" }]}>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: result.instalments.balance > 0 ? "#B45309" : "#065F46" }}>
            {result.instalments.balance > 0 ? "Estimated balance remaining" : "On track / overpaid"}
          </Text>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: result.instalments.balance > 0 ? "#B45309" : "#065F46" }}>
            {fmt(result.instalments.balance)}
          </Text>
        </View>

        {/* Closing note */}
        <View style={[s.disclaimer, { marginTop: 14 }]}>
          <Text>
            This T2125 summary was generated by Agent Runway on {generatedDate}. All figures are
            estimates based on data entered in Agent Runway and may not reflect all deductions,
            credits, adjustments, or CRA changes applicable to your situation. This document is
            NOT a filed T2125 and does NOT constitute tax advice or professional services. Your
            accountant must review, verify, and file your actual T2125 with CRA. Agent Runway
            Inc. (Canada Corporation No. 1786542-2) accepts no liability for tax obligations,
            penalties, interest, or other consequences arising from reliance on this document.
            See agentrunway.ca/terms.
          </Text>
        </View>

        <Footer year={taxYear} agentName={result.agentName} />
      </Page>

      {/* ── PAGE 3: Mileage Summary + Tax Deduction Estimates ── */}
      {(mileageSummary || (taxOptCards && taxOptCards.length > 0)) && (
        <Page size="LETTER" style={s.page}>
          <View style={s.headerBar} />
          <Text style={[s.headerTitle, { marginBottom: 12 }]}>T2125 Summary · Page 3 · {taxYear}</Text>

          {/* Mileage Summary */}
          {mileageSummary && mileageSummary.tripCount > 0 && (
            <>
              <SectionHeader title="Vehicle Mileage Summary" subtitle="Mileage log totals formatted for vehicle expense tracking" color="#7C3AED" />
              <View style={s.kpiRow}>
                <View style={s.kpiTile}>
                  <Text style={s.kpiLabel}>Total Kilometres</Text>
                  <Text style={s.kpiValue}>{mileageSummary.totalKm.toLocaleString("en-CA")} km</Text>
                  <Text style={s.kpiSub}>{mileageSummary.tripCount} trips logged</Text>
                </View>
                <View style={s.kpiTile}>
                  <Text style={s.kpiLabel}>Business Use</Text>
                  <Text style={s.kpiValue}>{fmtPct(mileageSummary.businessUsePct)}</Text>
                  <Text style={s.kpiSub}>of total driving</Text>
                </View>
                <View style={s.kpiTile}>
                  <Text style={s.kpiLabel}>Total Deduction</Text>
                  <Text style={s.kpiValue}>{fmt(mileageSummary.totalDeduction)}</Text>
                  <Text style={s.kpiSub}>at CRA per-km rate</Text>
                </View>
              </View>
              <View style={[s.disclaimer, { marginTop: 8, backgroundColor: "#F5F3FF", borderColor: "#C4B5FD" }]}>
                <Text style={{ color: "#5B21B6" }}>
                  CRA requires a logbook tracking each business trip with date, destination, purpose, and
                  kilometres. Keep this mileage log with your tax records for at least 6 years.
                </Text>
              </View>
            </>
          )}

          {/* Tax Deduction Estimates */}
          {taxOptCards && taxOptCards.length > 0 && (
            <>
              <SectionHeader
                title="Common Deduction Categories (Estimates Only)"
                subtitle={totalEstimatedSavings ? `${taxOptCards.length} opportunities · Est. ${fmt(totalEstimatedSavings)} total potential savings` : `${taxOptCards.length} opportunities identified`}
                color="#059669"
              />
              {taxOptCards.map((card, i) => (
                <View key={card.id} style={{
                  backgroundColor: i % 2 === 0 ? "#F8FAFC" : "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 4,
                  padding: 8,
                  marginBottom: 4,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1E3A5F", flex: 1 }}>
                      {card.title}
                    </Text>
                    {card.estimatedSavings > 0 && (
                      <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#059669" }}>
                        {card.estimatedSavingsLabel}
                      </Text>
                    )}
                  </View>
                  {card.evidence.length > 0 && (
                    <Text style={{ fontSize: 7.5, color: "#64748b", marginBottom: 2, lineHeight: 1.4 }}>
                      {card.evidence.join(" · ")}
                    </Text>
                  )}
                  <Text style={{ fontSize: 8, color: "#334155", lineHeight: 1.4 }}>
                    {card.action}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
                    <Text style={{
                      fontSize: 6.5,
                      color: card.complexity === "easy" ? "#059669" : card.complexity === "moderate" ? "#D97706" : "#DC2626",
                      backgroundColor: card.complexity === "easy" ? "#ECFDF5" : card.complexity === "moderate" ? "#FFFBEB" : "#FEF2F2",
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 2,
                    }}>
                      {card.complexity.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))}

              <View style={[s.disclaimer, { marginTop: 8 }]}>
                <Text>
                  Tax optimization suggestions are generated algorithmically from your Agent Runway data.
                  They are NOT tax advice. Discuss these opportunities with your accountant before taking action.
                  Estimated savings are approximate and depend on your specific tax situation.
                </Text>
              </View>
            </>
          )}

          <Footer year={taxYear} agentName={result.agentName} />
        </Page>
      )}
    </Document>
  );
}
