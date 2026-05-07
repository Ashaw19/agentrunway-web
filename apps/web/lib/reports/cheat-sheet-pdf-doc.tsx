// @ts-nocheck -- @react-pdf/renderer class components are incompatible with @types/react 19.2 strict JSX; no runtime impact
//
// Canadian Realtor Tax Cheat Sheet — single-page PDF
//
// Source content + every numeric claim cited in:
//   memory/findings/gtm_tax_cheat_sheet_scope_2026-05-06.md
//
// Re-render after content changes by running:
//   npx tsx scripts/render-cheat-sheet-pdf.ts
//
// Output: apps/web/public/canadian-realtor-tax-cheat-sheet-2025.pdf

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";

const BRAND = {
  navy:   "#0D1221",
  blue:   "#1E72F2",
  gold:   "#F0A800",
  slate:  "#475569",
  light:  "#F8FAFC",
  border: "#E2E8F0",
  white:  "#FFFFFF",
  text:   "#1F2937",
  muted:  "#6B7280",
};

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: BRAND.white,
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 24,
    fontSize: 7.5,
    color: BRAND.text,
  },

  // ── Header ──
  headerBand: {
    backgroundColor: BRAND.navy,
    padding: "7 12",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 3,
  },
  headerTitle: {
    color: BRAND.white,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  headerSub: {
    color: "#93C5FD",
    fontSize: 7,
    marginTop: 1,
  },
  headerYearTag: {
    color: BRAND.gold,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  goldStrip: { height: 2, backgroundColor: BRAND.gold, marginBottom: 6 },

  // ── Layout columns ──
  twoCol: { flexDirection: "row", gap: 8, marginTop: 4 },
  col: { flex: 1 },

  // ── Section ──
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: BRAND.navy,
    marginBottom: 3,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionTitleFirst: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: BRAND.navy,
    marginBottom: 3,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // ── Table ──
  table: {
    borderWidth: 0.5,
    borderColor: BRAND.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: BRAND.navy,
    padding: "3 5",
  },
  tableHeadCell: {
    color: BRAND.white,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderColor: BRAND.border,
    padding: "1.8 5",
  },
  tableRowAlt: { backgroundColor: BRAND.light },
  tableCell: { fontSize: 7, color: BRAND.text },
  tableCellBold: { fontSize: 7, fontFamily: "Helvetica-Bold", color: BRAND.navy },

  // ── Cite line ──
  cite: {
    fontSize: 5.5,
    color: BRAND.muted,
    marginTop: 1.5,
    fontStyle: "italic",
  },

  // ── List ──
  bullet: {
    fontSize: 7,
    color: BRAND.text,
    marginBottom: 1,
    paddingLeft: 6,
  },
  numberedItem: {
    fontSize: 7,
    color: BRAND.text,
    marginBottom: 1.2,
    flexDirection: "row",
  },
  numberedNum: {
    width: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND.blue,
    fontSize: 7,
  },
  numberedText: { flex: 1, fontSize: 7 },

  // ── Footer ──
  footer: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderColor: BRAND.border,
  },
  footerDisclaimer: {
    fontSize: 6,
    color: BRAND.muted,
    lineHeight: 1.35,
    marginBottom: 3,
  },
  footerBrand: {
    fontSize: 6.5,
    color: BRAND.navy,
    fontFamily: "Helvetica-Bold",
  },
  footerLink: { color: BRAND.blue },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function HeadCell({ text, flex = 1 }: { text: string; flex?: number }) {
  return <Text style={[S.tableHeadCell, { flex }]}>{text}</Text>;
}

function Cell({
  text,
  flex = 1,
  bold = false,
}: {
  text: string;
  flex?: number;
  bold?: boolean;
}) {
  return (
    <Text style={[bold ? S.tableCellBold : S.tableCell, { flex }]}>{text}</Text>
  );
}

function Row({
  cells,
  alt = false,
}: {
  cells: { text: string; flex?: number; bold?: boolean }[];
  alt?: boolean;
}) {
  return (
    <View style={[S.tableRow, alt ? S.tableRowAlt : null]}>
      {cells.map((c, i) => (
        <Cell key={i} text={c.text} flex={c.flex} bold={c.bold} />
      ))}
    </View>
  );
}

// ── Document ────────────────────────────────────────────────────────────────

export function CheatSheetPDF() {
  return (
    <Document
      title="Canadian Realtor Tax Cheat Sheet — 2025"
      author="Agent Runway Inc."
      subject="2025 tax-year reference card for self-employed Canadian real estate agents"
      keywords="canadian realtor tax cheat sheet 2025 cpp gst hst t2125"
    >
      <Page size="LETTER" style={S.page}>
        {/* ── Header ── */}
        <View style={S.headerBand}>
          <View>
            <Text style={S.headerTitle}>
              Canadian Realtor Tax Cheat Sheet
            </Text>
            <Text style={S.headerSub}>
              For self-employed real estate agents in Canada (excluding Quebec) ·
              Built by Agent Runway · agentrunway.ca
            </Text>
          </View>
          <Text style={S.headerYearTag}>2025</Text>
        </View>
        <View style={S.goldStrip} />

        {/* ── A — Federal brackets ── */}
        <Text style={S.sectionTitleFirst}>A. 2025 Federal Tax Brackets</Text>
        <View style={S.table}>
          <View style={S.tableHead}>
            <HeadCell text="Taxable income" flex={3} />
            <HeadCell text="Federal rate" flex={1} />
          </View>
          <Row
            cells={[
              { text: "Up to $57,375", flex: 3 },
              { text: "14.5%", flex: 1, bold: true },
            ]}
          />
          <Row
            alt
            cells={[
              { text: "$57,375.01 – $114,750", flex: 3 },
              { text: "20.5%", flex: 1, bold: true },
            ]}
          />
          <Row
            cells={[
              { text: "$114,750.01 – $177,882", flex: 3 },
              { text: "26.0%", flex: 1, bold: true },
            ]}
          />
          <Row
            alt
            cells={[
              { text: "$177,882.01 – $253,414", flex: 3 },
              { text: "29.0%", flex: 1, bold: true },
            ]}
          />
          <Row
            cells={[
              { text: "Over $253,414", flex: 3 },
              { text: "33.0%", flex: 1, bold: true },
            ]}
          />
        </View>
        <Text style={S.cite}>
          Source: CRA — Canadian income tax rates for individuals. The 14.5% bottom
          rate for 2025 is the blended full-year rate after the mid-year reduction
          from 15% to 14% effective July 1, 2025 (NWMM, May 27, 2025).
        </Text>

        {/* ── B — Provincial top-bracket snapshot (split into 2 columns) ── */}
        <Text style={S.sectionTitle}>
          B. Provincial Top-Bracket Snapshot (2025)
        </Text>
        <View style={S.twoCol}>
          {[
            [
              ["Newfoundland & Labrador", "21.8%", "$1,128,858"],
              ["Prince Edward Island",    "18.75%", "$140,000"],
              ["Nova Scotia",             "21.0%", "$150,000"],
              ["New Brunswick",           "19.5%", "$185,064"],
              ["Ontario",                 "13.16%", "$220,000"],
              ["Manitoba",                "17.4%", "$79,625"],
            ],
            [
              ["Saskatchewan",            "14.5%", "$148,734"],
              ["Alberta",                 "15.0%", "$355,845"],
              ["British Columbia",        "20.5%", "$252,752"],
              ["Yukon",                   "15.0%", "$500,000"],
              ["Northwest Territories",   "14.05%", "$147,826"],
              ["Nunavut",                 "11.5%", "$173,205"],
            ],
          ].map((group, gi) => (
            <View key={gi} style={S.col}>
              <View style={S.table}>
                <View style={S.tableHead}>
                  <HeadCell text="Province / Territory" flex={2.6} />
                  <HeadCell text="Rate" flex={1} />
                  <HeadCell text="Top from" flex={1.6} />
                </View>
                {group.map((r, i) => (
                  <Row
                    key={r[0]}
                    alt={i % 2 === 1}
                    cells={[
                      { text: r[0], flex: 2.6 },
                      { text: r[1], flex: 1, bold: true },
                      { text: r[2], flex: 1.6 },
                    ]}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
        <Text style={S.cite}>
          Source: CRA — Canadian income tax rates for individuals (provincial section).
          Quebec applies its own provincial system administered by Revenu Québec.
        </Text>

        {/* ── Two-column row: C (CPP) + D (GST/HST) ── */}
        <View style={S.twoCol}>
          <View style={S.col}>
            <Text style={S.sectionTitle}>C. Self-Employed CPP (2025)</Text>
            <View style={S.table}>
              <View style={S.tableHead}>
                <HeadCell text="Item" flex={2.6} />
                <HeadCell text="Value" flex={1.4} />
              </View>
              {[
                ["Basic exemption", "$3,500"],
                ["YMPE (CPP1 ceiling)", "$71,300"],
                ["YAMPE (CPP2 ceiling)", "$81,200"],
                ["CPP1 rate (self-employed, both halves)", "11.90%"],
                ["CPP2 rate (self-employed, both halves)", "8.00%"],
                ["CPP1 max contribution (SE)", "$8,068.20"],
                ["CPP2 max contribution (SE)", "$792.00"],
                ["Total max CPP (SE, 2025)", "$8,860.20"],
              ].map((r, i) => (
                <Row
                  key={r[0]}
                  alt={i % 2 === 1}
                  cells={[
                    { text: r[0], flex: 2.6 },
                    { text: r[1], flex: 1.4, bold: true },
                  ]}
                />
              ))}
            </View>
            <Text style={S.cite}>
              Source: CRA — CPP contribution rates, maximums and exemptions.
              Self-employed agents pay both employee and employer halves.
            </Text>
          </View>
          <View style={S.col}>
            <Text style={S.sectionTitle}>D. GST / HST</Text>
            <View style={S.table}>
              <View style={S.tableHead}>
                <HeadCell text="Item" flex={2.6} />
                <HeadCell text="Value" flex={1.4} />
              </View>
              {[
                ["Small-supplier threshold (4 quarters)", "$30,000"],
                ["GST (AB, BC, MB, NT, NU, SK, YT)", "5%"],
                ["HST — Ontario", "13%"],
                ["HST — NB, NL, NS, PEI", "15%"],
              ].map((r, i) => (
                <Row
                  key={r[0]}
                  alt={i % 2 === 1}
                  cells={[
                    { text: r[0], flex: 2.6 },
                    { text: r[1], flex: 1.4, bold: true },
                  ]}
                />
              ))}
            </View>
            <Text style={S.cite}>
              Source: CRA — When to register for and start charging the GST/HST.
              Real estate commissions are taxable supplies.
            </Text>
          </View>
        </View>

        {/* ── E — 2026 Deadlines ── */}
        <Text style={S.sectionTitle}>E. 2026 Key Deadlines (for 2025 tax year)</Text>
        <View style={S.table}>
          <View style={S.tableHead}>
            <HeadCell text="Date" flex={1.2} />
            <HeadCell text="Event" flex={3.8} />
          </View>
          {[
            ["Feb 28, 2026", "T4A slips issued (if you paid contractors over $500)"],
            ["Mar 15, 2026", "Q1 personal tax instalment"],
            ["Apr 30, 2026", "T1 PAYMENT due (self-employed and otherwise)"],
            ["Jun 15, 2026", "Q2 instalment + T1 FILING deadline (self-employed)"],
            ["Sep 15, 2026", "Q3 instalment"],
            ["Dec 15, 2026", "Q4 instalment"],
          ].map((r, i) => (
            <Row
              key={r[0]}
              alt={i % 2 === 1}
              cells={[
                { text: r[0], flex: 1.2, bold: true },
                { text: r[1], flex: 3.8 },
              ]}
            />
          ))}
        </View>
        <Text style={S.cite}>
          Sources: CRA — Important dates for individuals; CRA — Paying your income
          tax by instalments. GST/HST quarterly filers: filing + payment due one
          month after each fiscal quarter-end.
        </Text>

        {/* ── F + G two-column ── */}
        <View style={S.twoCol}>
          <View style={S.col}>
            <Text style={S.sectionTitle}>F. T2125 Categories at a Glance</Text>
            {[
              "Advertising",
              "Meals and entertainment (50% deductible)",
              "Insurance (business)",
              "Interest and bank charges",
              "Office expenses + supplies",
              "Professional fees (legal, accounting)",
              "Management and administration fees",
              "Telephone and utilities (business portion)",
              "Motor vehicle expenses (business-use proportion)",
              "Capital cost allowance (CCA) on business assets",
              "Business-use-of-home (proportional)",
            ].map((b) => (
              <Text key={b} style={S.bullet}>
                • {b}
              </Text>
            ))}
            <Text style={S.cite}>
              Source: CRA — T2125 Statement of Business or Professional Activities.
              Mixed-use proportions depend on factors an accountant verifies.
            </Text>
          </View>
          <View style={S.col}>
            <Text style={S.sectionTitle}>
              G. 10 Categories Realtors Commonly Deduct
            </Text>
            {[
              "Brokerage desk fees + commission splits.",
              "MLS / board / association dues (CREA, provincial, local).",
              "Licensing + continuing education (regulator + CE).",
              "Marketing + advertising (signage, photography, social ads).",
              "Vehicle (business-use proportion of fuel, insurance, CCA).",
              "Cell phone + data (business-use proportion).",
              "Home office (business-use proportion of utilities + interest).",
              "Client meals (50%) + closing gifts (limits apply).",
              "Professional fees (accountant, lawyer, software, AR sub).",
              "E&O insurance + general business liability premiums.",
            ].map((t, i) => (
              <View key={i} style={S.numberedItem}>
                <Text style={S.numberedNum}>{i + 1}.</Text>
                <Text style={S.numberedText}>{t}</Text>
              </View>
            ))}
            <Text style={S.cite}>
              Source: CRA — Business expenses. Deductibility of any specific item
              depends on whether the expense was incurred to earn business income.
            </Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={S.footer}>
          <Text style={S.footerDisclaimer}>
            This card surfaces published CRA rules and 2025 figures. It is general
            information, not financial, tax, or professional advice. Federal and
            provincial rates change with budgets — confirm current values at
            canada.ca before relying on them. Always consult a qualified accountant
            or tax professional for your own situation. Quebec residents are
            subject to a separate provincial system administered by Revenu Québec;
            this card excludes Quebec specifics.
          </Text>
          <Text style={S.footerBrand}>
            Agent Runway — the financial layer Canadian real estate agents run
            alongside their CRM.{" "}
            <Link
              src="https://agentrunway.ca/tools/realtor-tax-estimator"
              style={S.footerLink}
            >
              Try the live tax estimator at agentrunway.ca/tools/realtor-tax-estimator
            </Link>
            .
          </Text>
        </View>
      </Page>
    </Document>
  );
}
