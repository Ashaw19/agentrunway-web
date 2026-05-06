// @ts-nocheck -- @react-pdf/renderer class components are incompatible with @types/react 19.2 strict JSX; no runtime impact
/**
 * Expense Export PDF
 * ==================
 * Accountant-ready annual expense summary using @react-pdf/renderer.
 *
 * Page 1 — Category summary with CRA deductibility breakdown
 * Page 2+ — Full receipt log sorted by date
 *
 * IMPORTANT: This is a pre-fill summary for your accountant — not a filed
 * CRA return. Your accountant must review and file actual returns.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ExpenseCategoryWithItems, UserSettings } from "@/lib/types/database";
import { PROVINCE_LABELS } from "@/lib/types/database";
import { EXPENSE_KEY_TO_T2125 } from "@/lib/engines/t2125-engine";
import type { ReceiptExpense } from "@/lib/types/receipt";
import { RECEIPT_CATEGORIES } from "@/lib/types/receipt";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}
const CAT_LABEL: Record<string, string> = Object.fromEntries(
  RECEIPT_CATEGORIES.map((c) => [c.key, c.label]),
);

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    paddingTop: 32,
    paddingBottom: 44,
    paddingHorizontal: 36,
  },
  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  appName:   { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#10b981" },
  docTitle:  { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e293b", marginTop: 2 },
  subText:   { fontSize: 8, color: "#64748b", marginTop: 2 },
  divider:   { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginBottom: 12 },

  // Section
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },

  // Table
  tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5, paddingHorizontal: 6, borderRadius: 3 },
  tableRow:    { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  tableRowAlt: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, backgroundColor: "#f8fafc", borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  tableFooter: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, backgroundColor: "#e2e8f0", borderRadius: 3, marginTop: 2 },
  thText:      { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#475569" },
  tdText:      { fontSize: 8.5, color: "#1e293b" },
  tdMuted:     { fontSize: 8, color: "#64748b" },
  tdGreen:     { fontSize: 8.5, color: "#059669", fontFamily: "Helvetica-Bold" },
  tdAmber:     { fontSize: 8.5, color: "#d97706" },
  tdBlue:      { fontSize: 8.5, color: "#2563eb" },

  // Deduct summary box
  summaryBox:  { flexDirection: "row", gap: 6, marginTop: 14, marginBottom: 8 },
  summaryCard: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, padding: 8 },
  summaryLabel:{ fontSize: 7.5, color: "#64748b", marginBottom: 2 },
  summaryValue:{ fontSize: 11, fontFamily: "Helvetica-Bold" },

  // Disclaimer
  disclaimer:  { position: "absolute", bottom: 20, left: 36, right: 36, borderTopWidth: 0.5, borderTopColor: "#cbd5e1", paddingTop: 5 },
  discText:    { fontSize: 6.5, color: "#94a3b8", textAlign: "center" },

  // Page number
  pageNum:     { position: "absolute", bottom: 10, right: 36, fontSize: 7, color: "#94a3b8" },
});

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ExpenseExportPdfProps {
  year: number;
  settings: UserSettings | null;
  categories: ExpenseCategoryWithItems[];
  receiptTotals: Record<string, number>;
  vehiclePct: number;
  receipts: ReceiptExpense[];
  totalDeductible: number;
  deductFull: number;
  deductMeals: number;
  deductVehicle: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExpenseExportPdf({
  year,
  settings,
  categories,
  receiptTotals,
  vehiclePct,
  receipts,
  totalDeductible,
  deductFull,
  deductMeals,
  deductVehicle,
}: ExpenseExportPdfProps) {
  const totalYtd = Object.values(receiptTotals).reduce((s, v) => s + v, 0);
  const province = settings?.province
    ? PROVINCE_LABELS[settings.province] ?? settings.province
    : "—";
  const agentName = settings?.display_name || settings?.business_name || "Agent";
  const brokerage = settings?.brokerage_name || "—";
  const generatedOn = new Date().toLocaleDateString("en-CA", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Sort receipts by date desc
  const sortedReceipts = [...receipts].sort((a, b) => {
    if (!a.expense_date) return 1;
    if (!b.expense_date) return -1;
    return b.expense_date.localeCompare(a.expense_date);
  });

  // Category rows for summary page
  const catRows = categories
    .map((cat) => {
      const ytd = cat.items.reduce((s, i) => s + (receiptTotals[i.key] ?? 0), 0);
      const deductible = cat.items.reduce((s, i) => {
        const v = receiptTotals[i.key] ?? 0;
        const map = EXPENSE_KEY_TO_T2125[i.key];
        if (!map) return s + v;
        if (map.applyVehicleUse) return s + v * vehiclePct;
        return s + v * map.deductiblePct;
      }, 0);
      const rule = cat.items.some((i) => EXPENSE_KEY_TO_T2125[i.key]?.applyVehicleUse)
        ? `${Math.round(vehiclePct * 100)}% biz use`
        : cat.items.some((i) => (EXPENSE_KEY_TO_T2125[i.key]?.deductiblePct ?? 1) < 1)
        ? "50% rule"
        : "100%";
      return { name: cat.title, ytd, deductible, rule };
    })
    .filter((r) => r.ytd > 0);

  const Disclaimer = () => (
    <View style={S.disclaimer}>
      <Text style={S.discText}>
        Agent Runway · Expense Summary Report · {year} · Generated {generatedOn}
        {"\n"}
        FOR PLANNING PURPOSES ONLY — NOT A FILED CRA RETURN. This report is an estimate based on receipts entered into Agent Runway.
        {" "}Actual deductible amounts may differ. Always consult a qualified accountant or tax professional before filing.
        {"\n"}
        © 2026 Agent Runway Inc. · Canada Corporation No. 1786542-2
      </Text>
    </View>
  );

  return (
    <Document
      title={`Agent Runway Expense Report ${year}`}
      author={agentName}
      subject="Annual Expense Summary"
    >
      {/* ── PAGE 1: Summary ─────────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        {/* Header */}
        <View style={S.headerRow}>
          <View>
            <Text style={S.appName}>Agent Runway</Text>
            <Text style={S.docTitle}>Annual Expense Summary — {year}</Text>
            <Text style={S.subText}>
              {agentName}{brokerage !== "—" ? ` · ${brokerage}` : ""} · {province}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={S.subText}>Generated {generatedOn}</Text>
            <Text style={[S.subText, { marginTop: 3, fontFamily: "Helvetica-Bold" }]}>
              Total YTD: {fmt(totalYtd)}
            </Text>
            <Text style={[S.subText, { color: "#059669", fontFamily: "Helvetica-Bold" }]}>
              Est. Deductible: {fmt(totalDeductible)}
            </Text>
          </View>
        </View>
        <View style={S.divider} />

        {/* Category Summary */}
        <Text style={S.sectionTitle}>Expense Categories</Text>
        <View style={S.tableHeader}>
          <Text style={[S.thText, { flex: 2 }]}>Category</Text>
          <Text style={[S.thText, { flex: 1, textAlign: "right" }]}>YTD Total</Text>
          <Text style={[S.thText, { flex: 1, textAlign: "right" }]}>Est. Deductible</Text>
          <Text style={[S.thText, { flex: 0.7, textAlign: "center" }]}>CRA Rule</Text>
        </View>
        {catRows.map((row, i) => (
          <View key={row.name} style={i % 2 === 0 ? S.tableRow : S.tableRowAlt}>
            <Text style={[S.tdText, { flex: 2 }]}>{row.name}</Text>
            <Text style={[S.tdText, { flex: 1, textAlign: "right" }]}>{fmt(row.ytd)}</Text>
            <Text style={[S.tdGreen, { flex: 1, textAlign: "right" }]}>{fmt(row.deductible)}</Text>
            <Text style={[
              row.rule === "100%" ? S.tdGreen :
              row.rule.includes("50%") ? S.tdAmber : S.tdBlue,
              { flex: 0.7, textAlign: "center" },
            ]}>{row.rule}</Text>
          </View>
        ))}
        <View style={S.tableFooter}>
          <Text style={[S.thText, { flex: 2 }]}>TOTAL</Text>
          <Text style={[S.thText, { flex: 1, textAlign: "right" }]}>{fmt(totalYtd)}</Text>
          <Text style={[S.thText, { flex: 1, textAlign: "right", color: "#059669" }]}>{fmt(totalDeductible)}</Text>
          <Text style={[S.thText, { flex: 0.7 }]} />
        </View>

        {/* Deductibility Breakdown */}
        <View style={[S.summaryBox, { marginTop: 18 }]}>
          <View style={[S.summaryCard, { borderColor: "#86efac" }]}>
            <Text style={S.summaryLabel}>100% Deductible</Text>
            <Text style={[S.summaryValue, { color: "#059669" }]}>{fmt(deductFull)}</Text>
            <Text style={S.summaryLabel}>Advertising, fees, office, education</Text>
          </View>
          {deductMeals > 0 && (
            <View style={[S.summaryCard, { borderColor: "#fde68a" }]}>
              <Text style={S.summaryLabel}>50% Deductible (Meals & Ent.)</Text>
              <Text style={[S.summaryValue, { color: "#d97706" }]}>{fmt(deductMeals)}</Text>
              <Text style={S.summaryLabel}>CRA allows 50% of meals/entertainment</Text>
            </View>
          )}
          {deductVehicle > 0 && (
            <View style={[S.summaryCard, { borderColor: "#bfdbfe" }]}>
              <Text style={S.summaryLabel}>Vehicle ({fmtPct(vehiclePct)} Biz Use)</Text>
              <Text style={[S.summaryValue, { color: "#2563eb" }]}>{fmt(deductVehicle)}</Text>
              <Text style={S.summaryLabel}>Based on business-use % you set</Text>
            </View>
          )}
        </View>

        <Disclaimer />
        <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── PAGE 2+: Receipt Log ────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        {/* Header */}
        <View style={S.headerRow}>
          <View>
            <Text style={S.appName}>Agent Runway</Text>
            <Text style={S.docTitle}>Receipt Log — {year}</Text>
            <Text style={S.subText}>{sortedReceipts.length} receipts captured · {agentName}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={S.subText}>Generated {generatedOn}</Text>
          </View>
        </View>
        <View style={S.divider} />

        <View style={S.tableHeader}>
          <Text style={[S.thText, { width: 55 }]}>Date</Text>
          <Text style={[S.thText, { flex: 1.5 }]}>Vendor</Text>
          <Text style={[S.thText, { flex: 1.4 }]}>Category</Text>
          <Text style={[S.thText, { width: 55, textAlign: "right" }]}>Total</Text>
          <Text style={[S.thText, { width: 46, textAlign: "right" }]}>Tax/HST</Text>
          <Text style={[S.thText, { flex: 1.5 }]}>Notes</Text>
        </View>

        {sortedReceipts.map((r, i) => (
          <View key={r.id} style={i % 2 === 0 ? S.tableRow : S.tableRowAlt} wrap={false}>
            <Text style={[S.tdMuted, { width: 55 }]}>
              {r.expense_date
                ? new Date(r.expense_date + "T12:00:00").toLocaleDateString("en-CA", {
                    month: "short", day: "numeric",
                  })
                : "—"}
            </Text>
            <Text style={[S.tdText, { flex: 1.5 }]}>
              {r.vendor ?? "Unknown"}
            </Text>
            <Text style={[S.tdMuted, { flex: 1.4 }]}>
              {r.category_key ? (CAT_LABEL[r.category_key] ?? r.category_key) : "Uncategorized"}
            </Text>
            <Text style={[S.tdText, { width: 55, textAlign: "right" }]}>
              {r.total_amount != null ? fmt(r.total_amount) : "—"}
            </Text>
            <Text style={[S.tdMuted, { width: 46, textAlign: "right" }]}>
              {r.tax_amount != null ? fmt(r.tax_amount) : "—"}
            </Text>
            <Text style={[S.tdMuted, { flex: 1.5 }]}>
              {r.notes ?? ""}
            </Text>
          </View>
        ))}

        {sortedReceipts.length === 0 && (
          <View style={[S.tableRow, { justifyContent: "center" }]}>
            <Text style={[S.tdMuted, { textAlign: "center" }]}>No receipts captured yet.</Text>
          </View>
        )}

        {/* Total row */}
        <View style={[S.tableFooter, { marginTop: 4 }]}>
          <Text style={[S.thText, { width: 55 }]} />
          <Text style={[S.thText, { flex: 1.5 }]}>TOTAL</Text>
          <Text style={[S.thText, { flex: 1.4 }]} />
          <Text style={[S.thText, { width: 55, textAlign: "right" }]}>
            {fmt(sortedReceipts.reduce((s, r) => s + (r.total_amount ?? 0), 0))}
          </Text>
          <Text style={[S.thText, { width: 46, textAlign: "right" }]}>
            {fmt(sortedReceipts.reduce((s, r) => s + (r.tax_amount ?? 0), 0))}
          </Text>
          <Text style={[S.thText, { flex: 1.5 }]} />
        </View>

        <Disclaimer />
        <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
