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
import {
  ALLOWANCE_RATE_NOTE,
  INCOME_TAX_INSTALMENT_DUE_DATES,
  VEHICLE_BUSINESS_PART_RULE,
  VEHICLE_FULL_DEDUCTION_RULE,
  VEHICLE_LOGBOOK_RETENTION_RULE,
  VEHICLE_LOGBOOK_RULE,
} from "@agent-runway/core/tax-copy";
import type { VehicleBusinessUseMethod } from "@agent-runway/core/engines/vehicle-logbook-engine";

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
    paddingBottom: 60, // clears the footer when a long agent name wraps its second row
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
  idValue: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1a1a2e", flex: 1, textAlign: "right", marginLeft: 8 },
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
  lineNote: { fontSize: 7, color: "#F59E0B", marginLeft: 4, marginRight: 6 },
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
  // Footer: the disclaimer on its own row, then the document line and the
  // corporation line side by side. Three texts in one row do not fit LETTER.
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 6,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 2,
  },
  footerText: { fontSize: 7, color: "#94A3B8" },
  footerDisclaimer: { textAlign: "center" },
  footerDocument: { flex: 1, marginRight: 12 }, // takes the room left over, and wraps in it
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
  // Kept whole, and kept with what follows: a page break never lands inside a
  // header or between a header and its first line.
  return (
    <View style={[s.sectionHeader, { borderLeftColor: color }]} wrap={false} minPresenceAhead={40}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function Footer({ year, agentName }: { year: number; agentName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={[s.footerText, s.footerDisclaimer]}>
        ESTIMATES ONLY — NOT PROFESSIONAL TAX ADVICE — CONSULT YOUR ACCOUNTANT
      </Text>
      <View style={s.footerRow}>
        <Text style={[s.footerText, s.footerDocument]}>
          Agent Runway · T2125 Summary · {agentName} · {year} Tax Year
        </Text>
        <Text style={s.footerText}>
          © 2026 Agent Runway Inc. · Canada Corporation No. 1786542-2
        </Text>
      </View>
    </View>
  );
}

// ── Main PDF component ─────────────────────────────────────────────────────────

interface MileageSummary {
  /** Business km logged in the tax year. */
  totalKm: number;
  tripCount: number;
  /** totalKm × CRA's per-km allowance rates (allowanceRateFigure): an employer-allowance benchmark, not a deduction. */
  allowanceRateFigure: number;
  /** The year of the CRA rates used (the latest published when the tax year's are not out). */
  allowanceRatesYear: number;
}

/**
 * The vehicle business-use share on line 9281 and where it comes from
 * (expenseTaxContext(...).vehicleBusinessUse): the logbook's figure when it
 * covers the tax year, else the declared setting.
 */
interface VehicleUse {
  pct: number;
  method: VehicleBusinessUseMethod;
  label: string;
}

interface Props {
  result: T2125Result;
  settings: UserSettings;
  taxYear: number;
  vehicleUse: VehicleUse;
  mileageSummary?: MileageSummary;
  taxOptCards?: TaxOptimizationCard[];
  totalEstimatedSavings?: number;
  /**
   * For a tax year other than the current one: what it is built from and
   * leaves out (lib/t2125-tax-year.ts earlierYearT2125Notes, the tab's list).
   */
  yearNotes?: string[];
}

/** "From the logbook" or "Declared": what the vehicle share is, in a few words. */
function vehicleUseSource(v: VehicleUse, taxYear: number): string {
  if (v.method === "full") return `from the ${taxYear} logbook`;
  if (v.method === "simplified") return "from the logbook, CRA's simplified method";
  return "declared in Settings, not computed from a logbook";
}

export function T2125Pdf({ result, settings, taxYear, vehicleUse, mileageSummary, taxOptCards, totalEstimatedSavings, yearNotes = [] }: Props) {
  const generatedDate = new Date().toLocaleDateString("en-CA");
  const vehicleDeclared = vehicleUse.method === "declared";

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

        {/* An earlier tax year: what it is built from and what it leaves out */}
        {yearNotes.length > 0 && (
          <View style={[s.disclaimer, { backgroundColor: "#F8FAFC", borderColor: "#CBD5E1" }]} wrap={false}>
            {yearNotes.map((note) => (
              <Text key={note} style={{ color: "#334155", marginBottom: 2 }}>{note}</Text>
            ))}
          </View>
        )}

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
        {result.incomeReportingMethod === "cash" ? (
          <LineRow lineNum="8200" label="Gross Commission Income" note="Cash method: commissions paid in the year" value={result.grossCommissionIncome} />
        ) : (
          <LineRow lineNum="8200" label="Gross Commission Income (closed deals)" value={result.grossCommissionIncome} />
        )}
        <LineHighlight lineNum="8200" label="Total Gross Business Income" value={result.totalGrossIncome} />

        {/* Expenses */}
        <SectionHeader title="Part 3B — Deductible Expenses" subtitle="CRA T2125 lines 8521–9369 · Auto-filled from expense tracking" color="#7C3AED" />
        <LineRow lineNum="8521" label="Advertising & Marketing" value={result.line8521_advertising} />
        <LineRow lineNum="9281" label={`Motor Vehicle Expenses (${fmtPct(vehicleUse.pct)} business use)`} value={result.line9281_motorVehicle} note={vehicleDeclared ? "* Declared %" : "* % from the logbook"} />
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
            * Vehicle business-use % ({fmtPct(vehicleUse.pct)}) is {vehicleUseSource(vehicleUse, taxYear)}. {VEHICLE_BUSINESS_PART_RULE} {VEHICLE_FULL_DEDUCTION_RULE}
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
        {/* A cost with bills logged under Home Office is the total of those
            bills to date; the others are the annual estimate from settings. */}
        {(() => {
          const logged = (t: (typeof result.homeOffice.loggedCostTypes)[number]) =>
            result.homeOffice.loggedCostTypes.includes(t);
          const label = (t: (typeof result.homeOffice.loggedCostTypes)[number], name: string) =>
            logged(t) ? `${name} (bills logged)` : `Annual ${name.charAt(0).toLowerCase()}${name.slice(1)} (estimate)`;
          return (
            <>
              <LineRow label={label("rent", "Rent / mortgage interest")} value={result.homeOffice.annualRent} />
              <LineRow label={label("utilities", "Utilities")} value={result.homeOffice.annualUtilities} />
              <LineRow label={label("propertyTax", "Property tax")} value={result.homeOffice.annualPropertyTax} />
              <LineRow label={label("insurance", "Home insurance")} value={result.homeOffice.annualInsurance} />
              <LineRow label={label("maintenance", "Maintenance")} value={result.homeOffice.annualMaintenance} />
              {result.homeOffice.annualCondoFees > 0 && (
                <LineRow label={label("condoFees", "Condo fees")} value={result.homeOffice.annualCondoFees} />
              )}
            </>
          );
        })()}
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
            <Text style={s.kpiSub}>Due {INCOME_TAX_INSTALMENT_DUE_DATES.map((d) => d.short).join(", ")}</Text>
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
            <View style={s.gstRow}><Text>{result.gstHst.statementDeals > 0 ? "Collected (commission statements)" : "Collected on GCI"}</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(result.gstHst.collectedOnGCI)}</Text></View>
            {result.paymentsStored ? (
              <>
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
            ) : (
              <Text style={{ fontSize: 8, color: "#475569", marginTop: 4 }}>
                {`GST/HST remitted and paid on expenses are stored for the current year only, so no ${taxYear} balance is shown.`}
              </Text>
            )}
          </>
        )}

        {/* Instalments */}
        {/* Income tax instalments: CRA's dates for individuals, not the GST/HST filing dates. */}
        <SectionHeader title="CRA Tax Instalment Tracker" subtitle={result.paymentsStored ? "Estimated tax in four equal parts vs. paid" : "Estimated tax in four equal parts"} color="#B45309" />
        <View style={s.ccaHeader}>
          <Text style={[s.ccaCol1, { flex: 1 }]}>Quarter</Text>
          <Text style={[s.ccaCol2]}>Due Date</Text>
          <Text style={[s.ccaCol2]}>Estimated</Text>
          {result.paymentsStored && <Text style={[s.ccaCol2]}>Paid</Text>}
        </View>
        {([1, 2, 3, 4] as const).map((q) => {
          const paid = [result.instalments.paidQ1, result.instalments.paidQ2, result.instalments.paidQ3, result.instalments.paidQ4][q - 1];
          return (
            <View key={q} style={s.ccaRow}>
              <Text style={[s.ccaCol1, { flex: 1, fontSize: 8 }]}>Q{q}</Text>
              <Text style={[s.ccaCol2, { fontSize: 8 }]}>{INCOME_TAX_INSTALMENT_DUE_DATES[q - 1].long}</Text>
              <Text style={[s.ccaCol2, { fontSize: 8 }]}>{fmt(result.instalments.recommendedQuarterly)}</Text>
              {result.paymentsStored && <Text style={[s.ccaCol2, { fontSize: 8, fontFamily: "Helvetica-Bold" }]}>{fmt(paid)}</Text>}
            </View>
          );
        })}
        {result.paymentsStored ? (
          <View style={[s.gstBalance, { backgroundColor: result.instalments.balance > 0 ? "#FFF7ED" : "#ECFDF5" }]}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: result.instalments.balance > 0 ? "#B45309" : "#065F46" }}>
              {result.instalments.balance > 0 ? "Estimated balance remaining" : "On track / overpaid"}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: result.instalments.balance > 0 ? "#B45309" : "#065F46" }}>
              {fmt(result.instalments.balance)}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 8, color: "#475569", marginTop: 4 }}>
            {`Tax instalments paid are stored for the current year only, so no ${taxYear} payments or balance are shown.`}
          </Text>
        )}

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
              <SectionHeader title="Vehicle Mileage Summary" subtitle={`Business trips logged in ${taxYear}`} color="#7C3AED" />
              <View style={s.kpiRow}>
                <View style={s.kpiTile}>
                  <Text style={s.kpiLabel}>Business Kilometres</Text>
                  <Text style={s.kpiValue}>{mileageSummary.totalKm.toLocaleString("en-CA")} km</Text>
                  <Text style={s.kpiSub}>{mileageSummary.tripCount} trips logged</Text>
                </View>
                <View style={s.kpiTile}>
                  <Text style={s.kpiLabel}>{vehicleDeclared ? "Declared Business Use" : "Business Use (Logbook)"}</Text>
                  <Text style={s.kpiValue}>{fmtPct(vehicleUse.pct)}</Text>
                  <Text style={s.kpiSub}>{vehicleDeclared ? "typed in Settings, not measured" : vehicleUse.method === "full" ? `${taxYear} full logbook` : "CRA's simplified method"}</Text>
                </View>
                <View style={s.kpiTile}>
                  <Text style={s.kpiLabel}>At CRA Per-km Allowance Rates</Text>
                  <Text style={s.kpiValue}>{fmt(mileageSummary.allowanceRateFigure)}</Text>
                  <Text style={s.kpiSub}>{`${mileageSummary.allowanceRatesYear} rates; a benchmark, not a deduction`}</Text>
                </View>
              </View>
              <View style={[s.disclaimer, { marginTop: 8, backgroundColor: "#F5F3FF", borderColor: "#C4B5FD" }]}>
                <Text style={{ color: "#5B21B6" }}>
                  {ALLOWANCE_RATE_NOTE} {VEHICLE_LOGBOOK_RULE} {VEHICLE_LOGBOOK_RETENTION_RULE}
                </Text>
              </View>
            </>
          )}

          {/* Tax Deduction Estimates */}
          {taxOptCards && taxOptCards.length > 0 && (
            <>
              <SectionHeader
                title="Common Deduction Categories (Estimates Only)"
                subtitle={(() => {
                  // Information-only cards (the vehicle card) are not opportunities and add no savings.
                  const opportunities = taxOptCards.filter((c) => !c.informational).length;
                  if (opportunities === 0) return "Information about your tax set-up";
                  return totalEstimatedSavings ? `${opportunities} opportunities · Est. ${fmt(totalEstimatedSavings)} total potential savings` : `${opportunities} opportunities identified`;
                })()}
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
