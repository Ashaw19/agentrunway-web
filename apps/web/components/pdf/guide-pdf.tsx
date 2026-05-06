// @ts-nocheck -- @react-pdf/renderer class components are incompatible with @types/react 19.2 strict JSX; no runtime impact
/**
 * Agent Runway — Personalized Getting-Started Guide PDF
 * =====================================================
 * ~6-page PDF generated with @react-pdf/renderer.
 * Personalised to the user's province, business structure, and commission split.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { PROVINCE_LABELS } from "@/lib/types/database";

// ── Helpers ─────────────────────────────────────────────────────────────────

const STRUCTURE_LABELS: Record<string, string> = {
  sole_prop: "Sole Proprietorship",
  prec: "Personal Real Estate Corporation (PREC)",
  corp: "Incorporated (Corporation)",
};

function splitLabel(preset: string): string {
  const match = preset?.match(/p(\d+)_(\d+)/);
  return match ? `${match[1]}/${match[2]}` : preset;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  // Header
  brandName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
  },
  pageTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginTop: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 4,
    lineHeight: 1.5,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    marginVertical: 12,
  },
  // Section
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1e293b",
    marginTop: 16,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    marginTop: 10,
    marginBottom: 4,
  },
  body: {
    fontSize: 9,
    color: "#334155",
    lineHeight: 1.6,
    marginBottom: 4,
  },
  bullet: {
    fontSize: 9,
    color: "#334155",
    lineHeight: 1.6,
    paddingLeft: 12,
    marginBottom: 2,
  },
  infoBox: {
    backgroundColor: "#f0f9ff",
    borderRadius: 4,
    padding: 10,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
  },
  infoBoxText: {
    fontSize: 8.5,
    color: "#1e40af",
    lineHeight: 1.5,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },
  // Config card
  configRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 3,
    marginBottom: 2,
  },
  configLabel: {
    fontSize: 8,
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
  },
  configValue: {
    fontSize: 8,
    color: "#1e293b",
  },
});

function Footer({ pageNum }: { pageNum: number }) {
  return (
    <View style={S.footer} fixed>
      <View style={{ flexDirection: "column" }}>
        <Text style={S.footerText}>Agent Runway — Getting Started Guide</Text>
        <Text style={S.footerText}>
          © 2026 Agent Runway Inc. · Canada Corporation No. 1786542-2
        </Text>
      </View>
      <Text style={S.footerText}>Page {pageNum}</Text>
    </View>
  );
}

// ── PDF Document ────────────────────────────────────────────────────────────

interface Props {
  province: string;
  businessStructure: string;
  splitPreset: string;
}

export function GuidePdf({ province, businessStructure, splitPreset }: Props) {
  const provinceName = (PROVINCE_LABELS as Record<string, string>)[province] ?? province;
  const structureName = STRUCTURE_LABELS[businessStructure] ?? businessStructure;
  const split = splitLabel(splitPreset);

  return (
    <Document title="Agent Runway Getting Started Guide" author="Agent Runway">
      {/* ── Page 1: Welcome ── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.brandName}>Agent Runway</Text>
        <Text style={S.pageTitle}>Getting Started Guide</Text>
        <Text style={S.subtitle}>
          Your personalized reference to the Agent Runway business analytics platform.
          This guide covers every feature, metric, and concept you need to know.
        </Text>

        <View style={S.divider} />

        <Text style={S.sectionTitle}>Your Configuration</Text>
        <View style={S.configRow}>
          <Text style={S.configLabel}>Province</Text>
          <Text style={S.configValue}>{provinceName}</Text>
        </View>
        <View style={S.configRow}>
          <Text style={S.configLabel}>Business Structure</Text>
          <Text style={S.configValue}>{structureName}</Text>
        </View>
        <View style={S.configRow}>
          <Text style={S.configLabel}>Commission Split</Text>
          <Text style={S.configValue}>{split}</Text>
        </View>

        <Text style={S.sectionTitle}>What Is Agent Runway?</Text>
        <Text style={S.body}>
          Agent Runway is a business analytics platform built specifically for Canadian real estate
          agents. It tracks your income, expenses, clients, and taxes — projecting your business
          health with real-time intelligence so you can focus on selling, not spreadsheets.
        </Text>

        <Text style={S.sectionSubtitle}>Key Capabilities</Text>
        <Text style={S.bullet}>
          {"\u2022"} Dashboard with Runway Score, KPI cards, projections, and probability bands
        </Text>
        <Text style={S.bullet}>
          {"\u2022"} Transaction tracking with closed deals, pipeline, and historical data
        </Text>
        <Text style={S.bullet}>
          {"\u2022"} Expense management with receipt OCR, mileage logging, and bank imports
        </Text>
        <Text style={S.bullet}>
          {"\u2022"} Tax estimation engine with 2025 CRA federal + provincial brackets
        </Text>
        <Text style={S.bullet}>
          {"\u2022"} CRM with client statuses, activity logging, and follow-up tasks
        </Text>
        <Text style={S.bullet}>
          {"\u2022"} Forecast with financial waterfall, probability bands, and 5-year projections
        </Text>
        <Text style={S.bullet}>
          {"\u2022"} AI Business Assistant that sees your live data (Pro plan)
        </Text>
        <Text style={S.bullet}>
          {"\u2022"} Social media carousel builder for Instagram month-in-review posts
        </Text>

        <Footer pageNum={1} />
      </Page>

      {/* ── Page 2: Dashboard ── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.sectionTitle}>Your Dashboard</Text>
        <Text style={S.body}>
          The Dashboard is your command center. It shows your business health at a glance with
          a composite Runway Score, KPI cards, monthly chart, and actionable insights.
        </Text>

        <Text style={S.sectionSubtitle}>Runway Score (0–100)</Text>
        <Text style={S.body}>
          Your Runway Score is a composite grade across 5 business health factors:
        </Text>
        <Text style={S.bullet}>{"\u2022"} Pace vs Goal (35%) — Are you on track for your annual GCI target?</Text>
        <Text style={S.bullet}>{"\u2022"} Pipeline Health (25%) — Do you have enough deals in progress?</Text>
        <Text style={S.bullet}>{"\u2022"} Expense Ratio (15%) — Are your expenses under control?</Text>
        <Text style={S.bullet}>{"\u2022"} Survival Runway (15%) — How many months could you survive without income?</Text>
        <Text style={S.bullet}>{"\u2022"} Benchmark Rank (10%) — How you compare to industry-cohort peers</Text>

        <Text style={S.body}>
          Grades: A+ (92+), A (85–91), B (75–84), C (62–74), D (50–61), F (0–49)
        </Text>

        <Text style={S.sectionSubtitle}>Scenario Modes</Text>
        <Text style={S.body}>
          Toggle between Conservative ({"\u2212"}15%), Base, and Optimistic (+15%) projections to
          see how different scenarios affect your year-end numbers.
        </Text>

        <Text style={S.sectionSubtitle}>Probability Bands (P10–P90)</Text>
        <Text style={S.body}>
          Statistical confidence intervals for your year-end GCI. P50 is the median projection.
          P10 means there is only a 10% chance you will earn below that amount. P90 means 90%
          confidence you will earn at least that much.
        </Text>

        <Footer pageNum={2} />
      </Page>

      {/* ── Page 3: Tracking Your Business ── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.sectionTitle}>Tracking Your Business</Text>

        <Text style={S.sectionSubtitle}>Transactions (Deals)</Text>
        <Text style={S.body}>
          The Transactions page has three tabs: Deals (closed transactions), Pipeline (in-progress
          deals with probability stages), and History (annual summaries with year-over-year charts).
        </Text>
        <Text style={S.bullet}>{"\u2022"} GCI = Sale Price {"\u00D7"} Commission %</Text>
        <Text style={S.bullet}>{"\u2022"} Agent Net = GCI {"\u00D7"} Agent Split % (your {split} split)</Text>
        <Text style={S.bullet}>{"\u2022"} Pipeline stages: Lead (10%), Showing (20%), Offer (40%), Conditional (60%), Firm (90%)</Text>

        <Text style={S.sectionSubtitle}>Expenses</Text>
        <Text style={S.body}>
          Two tabs: Receipts (manual or OCR photo entry) and Mileage (CRA 2025 rates).
        </Text>
        <Text style={S.bullet}>{"\u2022"} Expense Ratio target: 25–30% of GCI is healthy</Text>
        {/* Source of truth for mileage rates: CRA_MILEAGE_RATES in packages/core/types/database.ts */}
        <Text style={S.bullet}>{"\u2022"} Mileage: $0.72/km first 5,000 km, $0.66/km after</Text>
        <Text style={S.bullet}>{"\u2022"} Meals: 50% deductible (CRA rule)</Text>
        <Text style={S.bullet}>{"\u2022"} Client gifts: keep reasonable (~$25/person/year) — must be business-related and documented</Text>

        <Text style={S.sectionSubtitle}>CRM & Client Management</Text>
        <Text style={S.body}>
          Track clients through the &quot;flight metaphor&quot; lifecycle:
        </Text>
        <Text style={S.bullet}>{"\u2022"} Boarding — New lead just entered pipeline</Text>
        <Text style={S.bullet}>{"\u2022"} Scheduled — Deferred intent with a future timeframe</Text>
        <Text style={S.bullet}>{"\u2022"} In-Flight — Active client, showing/negotiating</Text>
        <Text style={S.bullet}>{"\u2022"} Cruising — Past client, long-term relationship</Text>

        <View style={S.infoBox}>
          <Text style={S.infoBoxText}>
            Tip: A &quot;stale lead&quot; is any active client (Boarding/In-Flight) with no recorded
            contact in 14+ days. The Dashboard tracks these so you never lose touch.
          </Text>
        </View>

        <Footer pageNum={3} />
      </Page>

      {/* ── Page 4: Tax & Forecast ── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.sectionTitle}>Tax & Forecast ({provinceName})</Text>
        <Text style={S.body}>
          Agent Runway estimates your tax obligations using 2025 CRA rates for your province
          ({provinceName}). These are estimates only — always consult a qualified Canadian accountant.
        </Text>

        <Text style={S.sectionSubtitle}>Tax Components</Text>
        <Text style={S.bullet}>{"\u2022"} Federal income tax (graduated brackets from 14.5% to 33%)</Text>
        <Text style={S.bullet}>{"\u2022"} Provincial income tax ({provinceName} brackets)</Text>
        <Text style={S.bullet}>{"\u2022"} CPP/QPP self-employment (both halves: 11.90% on $3,500–$71,300)</Text>
        <Text style={S.bullet}>{"\u2022"} CPP2 (8.00% on $71,300–$81,200, 100% deductible)</Text>

        <Text style={S.sectionSubtitle}>Tax Estimates</Text>
        <Text style={S.body}>
          The Forecast page shows your tax estimates card with:
        </Text>
        <Text style={S.bullet}>{"\u2022"} Quarterly instalment amount (total annual tax {"\u00F7"} 4)</Text>
        <Text style={S.bullet}>{"\u2022"} Per-deal tax portion (total annual tax {"\u00F7"} projected deal count)</Text>
        <Text style={S.bullet}>{"\u2022"} Effective tax rate (total tax burden {"\u00F7"} net self-employment income)</Text>

        <Text style={S.sectionSubtitle}>Financial Waterfall</Text>
        <Text style={S.body}>
          GCI {"\u2192"} Agent Split {"\u2192"} Fees {"\u2192"} Expenses {"\u2192"} Tax {"\u2192"} Take-Home.
          This shows you exactly where every dollar goes.
        </Text>

        <Text style={S.sectionSubtitle}>Home Office Deduction</Text>
        <Text style={S.body}>
          Two methods: Simplified ($5/sqft, max 300 sqft = $1,500) or Detailed (actual costs
          {"\u00D7"} business-use percentage). Configure in Settings.
        </Text>

        <Footer pageNum={4} />
      </Page>

      {/* ── Page 5: Reports & Tools ── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.sectionTitle}>Reports & Tools</Text>

        <Text style={S.sectionSubtitle}>Reports</Text>
        <Text style={S.body}>
          Three tabs: Overview (Runway Score, waterfall, monthly table), Benchmark (industry-cohort
          cohort comparison), and Tax/T2125 (CRA expense summary with CCA assets).
        </Text>

        <Text style={S.sectionSubtitle}>Social Media</Text>
        <Text style={S.body}>
          Generate Instagram-ready month-in-review carousels. Select deals, choose a template,
          customize branding (logo, headshot), add captions with hashtags, and export directly
          or as a Canva-compatible ZIP.
        </Text>

        <Text style={S.sectionSubtitle}>Voice Input</Text>
        <Text style={S.body}>
          Access from the Quick Actions button on every page. Speak naturally — the system
          transcribes your audio, classifies the intent, and routes you to the correct form
          with fields pre-filled. Supports: new client, new expense, new transaction, and notes.
        </Text>

        <Text style={S.sectionSubtitle}>Keyboard Shortcuts</Text>
        <Text style={S.bullet}>{"\u2022"} N = New transaction</Text>
        <Text style={S.bullet}>{"\u2022"} D = Dashboard</Text>
        <Text style={S.bullet}>{"\u2022"} T = Transactions</Text>
        <Text style={S.bullet}>{"\u2022"} E = Expenses</Text>
        <Text style={S.bullet}>{"\u2022"} F = Forecast</Text>
        <Text style={S.bullet}>{"\u2022"} R = Reports</Text>
        <Text style={S.bullet}>{"\u2022"} P = Pipeline</Text>

        <Footer pageNum={5} />
      </Page>

      {/* ── Page 6: Quick Reference (FAQ) ── */}
      <Page size="LETTER" style={S.page}>
        <Text style={S.sectionTitle}>Quick Reference — FAQ</Text>

        <Text style={S.sectionSubtitle}>How is GCI calculated?</Text>
        <Text style={S.body}>
          GCI = Sale Price {"\u00D7"} Commission %. If you override GCI in the deal form, that value is used instead.
        </Text>

        <Text style={S.sectionSubtitle}>What is the Runway Score?</Text>
        <Text style={S.body}>
          A composite 0–100 score across 5 factors. Grades from A+ (92+) to F (0–49). See page 2 for the full breakdown.
        </Text>

        <Text style={S.sectionSubtitle}>What is survival runway?</Text>
        <Text style={S.body}>
          Cash Reserve {"\u00F7"} Net Monthly Burn. Under 2 months is critical, 2–4 is warning, 4–6 is healthy, 6+ is strong.
        </Text>

        <Text style={S.sectionSubtitle}>How do probability bands work?</Text>
        <Text style={S.body}>
          P10–P90 confidence intervals based on your deal-to-deal variance. P50 is the median; P90 is the optimistic ceiling.
        </Text>

        <Text style={S.sectionSubtitle}>What is the benchmark comparison?</Text>
        <Text style={S.body}>
          Your GCI compared against industry-cohort estimates for agents with similar experience. Cohorts: Rookie (0–2yr), Growth (3–5yr), Established (6–10yr), Top Producer (10+yr).
        </Text>

        <View style={{ ...S.infoBox, marginTop: 16 }}>
          <Text style={S.infoBoxText}>
            For the complete knowledge base — including all metrics, formulas, tax rules, and detailed feature
            descriptions — visit the Guide page in your Agent Runway dashboard or ask your Flight Crew.
          </Text>
        </View>

        <View style={{ ...S.divider, marginTop: 20 }} />
        <Text style={{ ...S.body, fontSize: 7.5, color: "#94a3b8", textAlign: "center" }}>
          All projections and tax estimates are approximations for planning purposes only — not
          financial, tax, or professional advice. Consult a qualified Canadian accountant.
        </Text>

        <Footer pageNum={6} />
      </Page>
    </Document>
  );
}
