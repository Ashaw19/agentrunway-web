// @ts-nocheck -- @react-pdf/renderer class components are incompatible with @types/react 19.2 strict JSX; no runtime impact
"use client";

/**
 * The Runway Briefing — Agent Runway
 *
 * Multi-page, fully designed PDF generated client-side via @react-pdf/renderer.
 * Only imported through a dynamic import() inside a click handler — never on the server.
 *
 * Pages:
 *   1. Cover
 *   2. Executive Summary  (KPIs, Goal Progress, P&L, Tax)
 *   3. Income & Projections  (Monthly bar chart, Probability bands, Benchmark)
 *   4. Expenses & Tax  (Category table with receipt totals, Expense ratio, Tax tiles)
 *   5. Transaction Log  (conditional — only if ytdDeals > 0)
 *   6. Business Health Assessment  (Score components, assessment narrative, advisor tips)
 */

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { fmtCurrency, fmtPct, fmtCompact } from "@/lib/formatters";
import {
  computeGCI,
  PROVINCE_LABELS,
  type Transaction,
  type ExpenseCategoryWithItems,
} from "@/lib/types/database";
import type { BenchmarkResult } from "@/lib/engines/benchmark-engine";
import type { SurvivalResult } from "@/lib/engines/survival-engine";
import type { RunwayScoreResult } from "@/lib/engines/runway-score-engine";
import type { AdvisorCard } from "@/lib/engines/advisor-engine";

// ── Palette ──────────────────────────────────────────────────────────────────

const C = {
  navy:     "#0B1728",
  navyMid:  "#1E3A5F",
  blue:     "#1E72F2",
  blueLight:"#BFDBFE",
  emerald:  "#10B981",
  amber:    "#F59E0B",
  rose:     "#F43F5E",
  orange:   "#F97316",
  violet:   "#8B5CF6",
  ink:      "#1E293B",
  muted:    "#64748B",
  light:    "#94A3B8",
  border:   "#E2E8F0",
  stripe:   "#F8FAFC",
  offwhite: "#F1F5F9",
  white:    "#FFFFFF",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeColor(grade: string): string {
  if (grade === "A+" || grade === "A") return C.emerald;
  if (grade === "B") return C.blue;
  if (grade === "C") return C.amber;
  if (grade === "D") return C.orange;
  return C.rose;
}

function gradeLabel(grade: string): string {
  if (grade === "A+") return "Exceptional";
  if (grade === "A") return "Excellent";
  if (grade === "B") return "Strong";
  if (grade === "C") return "Developing";
  if (grade === "D") return "Needs Work";
  return "Critical";
}

function riskColor(level: string): string {
  if (level === "strong") return C.emerald;
  if (level === "healthy") return C.blue;
  if (level === "warning") return C.amber;
  return C.rose;
}

function scoreColor(score: number): string {
  if (score >= 80) return C.emerald;
  if (score >= 60) return C.blue;
  if (score >= 40) return C.amber;
  return C.rose;
}

function ord(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  const s = ["th", "st", "nd", "rd"];
  return `${n}${s[n % 10] ?? "th"}`;
}

function generateAssessment(
  grade: string,
  runwayScore: RunwayScoreResult,
  survival: SurvivalResult,
  expenseRatio: number,
  benchmark: BenchmarkResult,
): string {
  const gradeTexts: Record<string, string> = {
    "A+": "Your business is firing on all cylinders. Every major indicator — goal pace, pipeline health, expense management, and strategic readiness — is at or above benchmark. You are operating in the top tier of Canadian real estate professionals.",
    "A":  "Your business demonstrates excellent health across all measured dimensions. You're tracking ahead of schedule, maintaining strong pipeline coverage, and managing expenses effectively. Small refinements could push you to peak performance.",
    "B":  "Your business is performing well with solid fundamentals. You have meaningful pipeline coverage and a disciplined approach to expenses. With targeted focus on your weakest component, you can reach top-tier performance this year.",
    "C":  "Your business shows promising foundations but has clear opportunities for improvement. Several key indicators suggest you're leaving growth potential on the table. A focused strategy on the highlighted areas below can meaningfully shift your trajectory.",
    "D":  "Your business faces meaningful headwinds that warrant immediate attention. While there is active momentum, the underlying metrics reveal gaps in efficiency, pipeline strength, or goal alignment that require strategic correction.",
    "F":  "Your business requires urgent strategic intervention. Multiple critical indicators are flagging below-threshold performance. The observations below are prioritized by potential impact on your business.",
  };

  const weakest = runwayScore.components.reduce((a, b) => (a.score < b.score ? a : b));
  const survivalNote =
    survival.riskLevel === "critical" || survival.riskLevel === "warning"
      ? ` Your cash runway of ${survival.months.toFixed(1)} months is below the commonly cited 4-month safety buffer — building your reserve should be a near-term priority.`
      : survival.riskLevel === "strong"
      ? ` Your cash runway is strong, giving you the financial stability to take calculated risks and invest in growth.`
      : "";

  const benchmarkNote =
    benchmark.percentile >= 75
      ? ` Benchmark comparison places you in the top quartile of your experience cohort — a strong competitive position.`
      : benchmark.percentile >= 50
      ? ` You're tracking at or above your cohort median, keeping you competitive within your experience tier.`
      : ` Your GCI trajectory currently ranks below the cohort median — closing this gap represents a significant opportunity.`;

  const expenseNote =
    expenseRatio > 35
      ? ` Your expense ratio of ${expenseRatio.toFixed(0)}% is above the 25–30% target; identifying cost efficiencies could significantly boost your net income.`
      : expenseRatio > 0
      ? ` Your expense ratio of ${expenseRatio.toFixed(0)}% is within the healthy 25–30% target range, reflecting disciplined cost management.`
      : "";

  const weakNote =
    weakest.score < 60
      ? ` Your "${weakest.label}" component is your primary growth lever — addressing it directly will produce the most immediate improvement to your overall score.`
      : "";

  return (gradeTexts[grade] ?? gradeTexts["C"]) + survivalNote + benchmarkNote + expenseNote + weakNote;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Pages
  coverPage: {
    fontFamily: "Helvetica",
    backgroundColor: C.navy,
  },
  contentPage: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: C.ink,
    lineHeight: 1.4,
    backgroundColor: C.white,
    paddingBottom: 52,
  },

  // ── Cover
  coverInner: {
    flex: 1,
    padding: 56,
    justifyContent: "space-between",
  },
  coverTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 0,
  },
  coverBrand: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
    letterSpacing: 2.5,
  },
  coverBrandSub: {
    fontSize: 7,
    color: C.muted,
    letterSpacing: 1,
    marginTop: 2,
  },
  coverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: C.navyMid,
  },
  coverAvatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: C.blue,
  },
  coverMiddle: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 60,
  },
  coverAccent: {
    width: 48,
    height: 3,
    backgroundColor: C.blue,
    borderRadius: 2,
    marginBottom: 20,
  },
  coverTitle: {
    fontSize: 42,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    lineHeight: 1.1,
    marginBottom: 10,
  },
  coverSubtitle: {
    fontSize: 12,
    color: C.light,
    letterSpacing: 2,
    marginBottom: 40,
  },
  coverDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.navyMid,
    marginBottom: 24,
  },
  coverAgentName: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 4,
  },
  coverAgentSub: {
    fontSize: 10,
    color: C.light,
    marginBottom: 3,
  },
  coverMeta: {
    fontSize: 9,
    color: C.muted,
    marginTop: 10,
  },
  coverFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.navyMid,
  },
  coverFooterText: {
    fontSize: 8,
    color: C.muted,
  },
  coverConfidential: {
    fontSize: 7,
    color: "#334155",
    letterSpacing: 1.5,
  },

  // ── Page Header (pages 2+)
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.navy,
    paddingVertical: 9,
    paddingHorizontal: 40,
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pageHeaderLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  pageHeaderInitials: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.navyMid,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.blue,
  },
  pageHeaderInitialsText: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  pageHeaderTextBlock: {},
  pageHeaderAgent: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  pageHeaderSub: {
    fontSize: 7,
    color: C.light,
    marginTop: 1,
  },
  pageHeaderRight: {
    alignItems: "flex-end",
  },
  pageHeaderTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
    letterSpacing: 0.5,
  },
  pageHeaderYear: {
    fontSize: 7,
    color: C.light,
    marginTop: 1,
  },

  // ── Content wrapper
  content: {
    paddingHorizontal: 40,
    paddingTop: 22,
  },

  // ── Section headers
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    paddingBottom: 6,
    marginTop: 18,
    marginBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: C.blue,
  },
  sectionTitleFirst: {
    marginTop: 0,
  },

  // ── KPI Tiles
  kpiRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  kpiTile: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  kpiAccent: {
    height: 4,
  },
  kpiBody: {
    padding: 10,
    backgroundColor: C.white,
  },
  kpiLabel: {
    fontSize: 6.5,
    color: C.muted,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  kpiValue: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 2,
  },
  kpiSub: {
    fontSize: 6.5,
    color: C.muted,
  },

  // ── Progress bar
  progressWrap: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  progressLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  progressValue: {
    fontSize: 8,
    color: C.muted,
  },
  progressTrack: {
    height: 10,
    backgroundColor: C.offwhite,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  progressFill: {
    height: 10,
    borderRadius: 5,
  },
  progressNote: {
    fontSize: 7,
    color: C.light,
    marginTop: 3,
  },

  // ── Two-column layout
  twoCol: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  col: {
    flex: 1,
  },

  // ── P&L card
  plCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: "hidden",
  },
  plCardHeader: {
    backgroundColor: C.navy,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  plCardHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  plRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  plRowStripe: {
    backgroundColor: C.stripe,
  },
  plLabel: {
    fontSize: 8,
    color: C.ink,
  },
  plLabelMuted: {
    fontSize: 8,
    color: C.muted,
  },
  plValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
  },
  plValueMuted: {
    fontSize: 8,
    color: C.muted,
  },
  plValueNeg: {
    fontSize: 8,
    color: C.rose,
  },
  plValuePos: {
    fontSize: 8,
    color: C.emerald,
    fontFamily: "Helvetica-Bold",
  },
  plTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: C.navy,
  },
  plTotalLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  plTotalValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.emerald,
  },

  // ── Tax tiles
  taxTileRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  taxTile: {
    flex: 1,
    backgroundColor: C.stripe,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
  },
  taxTileLabel: {
    fontSize: 6.5,
    color: C.muted,
    marginBottom: 4,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  taxTileValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textAlign: "center",
  },
  taxTileSub: {
    fontSize: 6.5,
    color: C.muted,
    marginTop: 2,
    textAlign: "center",
  },
  taxTileHighlight: {
    backgroundColor: C.navy,
    borderColor: C.navy,
  },
  taxTileHighlightLabel: {
    color: C.blueLight,
  },
  taxTileHighlightValue: {
    color: C.white,
  },
  taxTileHighlightSub: {
    color: C.light,
  },

  // ── Bar chart
  chartContainer: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 12,
  },
  chartSubNote: {
    fontSize: 7,
    color: C.muted,
    marginTop: 6,
  },
  barChartArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 72,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 0,
    gap: 3,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "75%",
    borderRadius: 2,
  },
  barLabelRow: {
    flexDirection: "row",
    gap: 3,
    marginTop: 4,
  },
  barLabel: {
    flex: 1,
    fontSize: 5.5,
    color: C.muted,
    textAlign: "center",
  },

  // ── Probability bands
  bandsCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 16,
  },
  bandsHeader: {
    backgroundColor: C.navy,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  bandsHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  bandsHeaderSub: {
    fontSize: 7,
    color: C.light,
    marginTop: 1,
  },
  bandsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  bandsRowHighlight: {
    backgroundColor: "#EFF6FF",
  },
  bandsLabel: {
    width: 90,
    fontSize: 8,
    color: C.ink,
  },
  bandsLabelBold: {
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  bandsBar: {
    flex: 1,
    height: 7,
    backgroundColor: C.offwhite,
    borderRadius: 3.5,
    overflow: "hidden",
    marginRight: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  bandsBarFill: {
    height: 7,
    borderRadius: 3.5,
  },
  bandsValue: {
    width: 72,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textAlign: "right",
  },

  // ── Benchmark card
  benchmarkCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  },
  benchmarkTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 10,
  },
  benchmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  benchmarkBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  benchmarkPctText: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  benchmarkPctSub: {
    fontSize: 6,
    color: C.blueLight,
  },
  benchmarkInfo: {
    flex: 1,
  },
  benchmarkInfoLabel: {
    fontSize: 8,
    color: C.muted,
    marginBottom: 5,
  },
  benchmarkTrack: {
    height: 8,
    backgroundColor: C.offwhite,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 4,
  },
  benchmarkFill: {
    height: 8,
    backgroundColor: C.blue,
    borderRadius: 4,
  },
  benchmarkInfoValue: {
    fontSize: 8,
    color: C.ink,
  },

  // ── Table
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 16,
  },
  tHead: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tHeadCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  tHeadRight: {
    textAlign: "right",
  },
  tRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    alignItems: "center",
  },
  tRowStripe: {
    backgroundColor: C.stripe,
  },
  tCell: {
    fontSize: 8,
    color: C.ink,
  },
  tCellRight: {
    textAlign: "right",
    fontSize: 8,
  },
  tCellBold: {
    fontFamily: "Helvetica-Bold",
  },
  tCellMuted: {
    color: C.muted,
    fontSize: 8,
  },
  tTotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: C.navy,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  tTotalCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },

  // Mini bar in expense table
  miniBarTrack: {
    height: 5,
    backgroundColor: C.offwhite,
    borderRadius: 2.5,
    overflow: "hidden",
    marginTop: 3,
    width: 64,
    borderWidth: 1,
    borderColor: C.border,
  },
  miniBarFill: {
    height: 5,
    backgroundColor: C.blue,
    borderRadius: 2.5,
  },

  // ── GST/HST note
  gstNote: {
    fontSize: 7,
    color: C.muted,
    backgroundColor: C.stripe,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },

  // ── Health Score
  scoreSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 16,
  },
  scoreBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreGradeText: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  scoreNumText: {
    fontSize: 8,
    color: "rgba(255,255,255,0.75)",
  },
  scoreInfo: {
    flex: 1,
  },
  scoreLabelText: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 3,
  },
  scoreSub: {
    fontSize: 8,
    color: C.muted,
    lineHeight: 1.5,
  },
  componentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  componentLabel: {
    width: 110,
    fontSize: 8,
    color: C.ink,
  },
  componentTrack: {
    flex: 1,
    height: 8,
    backgroundColor: C.offwhite,
    borderRadius: 4,
    overflow: "hidden",
    marginRight: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  componentFill: {
    height: 8,
    borderRadius: 4,
  },
  componentValue: {
    width: 32,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textAlign: "right",
  },

  // ── Assessment
  assessmentBox: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  },
  assessmentTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 8,
  },
  assessmentText: {
    fontSize: 8,
    color: C.ink,
    lineHeight: 1.7,
  },

  // ── Advisor cards
  advisorCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    marginBottom: 8,
    overflow: "hidden",
  },
  advisorHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: C.stripe,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  advisorNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  advisorNumText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  advisorTitle: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  advisorImpact: {
    fontSize: 7,
    color: C.blue,
    fontFamily: "Helvetica-Bold",
  },
  advisorBody: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  advisorAction: {
    fontSize: 8,
    color: C.ink,
    lineHeight: 1.5,
  },
  advisorImpactNote: {
    fontSize: 7,
    color: C.emerald,
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
  },

  // ── Footer
  footer: {
    position: "absolute",
    bottom: 14,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.border,
    fontSize: 7,
    color: C.light,
  },
  footerBrand: {
    fontSize: 7,
    color: C.blue,
    fontFamily: "Helvetica-Bold",
  },
  footerSep: {
    fontSize: 7,
    color: C.light,
  },
  footerConfidential: {
    fontSize: 7,
    color: C.light,
    letterSpacing: 0.8,
  },
  footerPage: {
    fontSize: 7,
    color: C.muted,
  },
});

// ── Re-usable sub-components ──────────────────────────────────────────────────

function PageHeaderComp({
  agentName,
  brokerage,
  year,
  logoUrl,
  avatarUrl,
}: {
  agentName: string;
  brokerage: string;
  year: number;
  logoUrl?: string;
  avatarUrl?: string;
}) {
  const initial = (brokerage || agentName || "A").charAt(0).toUpperCase();
  // Primary display name = business/brokerage name; secondary = agent name
  const primaryName = brokerage || agentName || "Agent";
  const secondaryName = brokerage ? agentName : null;

  return (
    <View style={s.pageHeader} fixed>
      <View style={s.pageHeaderLeft}>
        {/* Logo → avatar → initials fallback */}
        {logoUrl ? (
          /* eslint-disable-next-line jsx-a11y/alt-text */
          <Image src={logoUrl} style={s.pageHeaderLogo} />
        ) : avatarUrl ? (
          /* eslint-disable-next-line jsx-a11y/alt-text */
          <Image src={avatarUrl} style={s.pageHeaderLogo} />
        ) : (
          <View style={s.pageHeaderInitials}>
            <Text style={s.pageHeaderInitialsText}>{initial}</Text>
          </View>
        )}
        <View style={s.pageHeaderTextBlock}>
          <Text style={s.pageHeaderAgent}>{primaryName}</Text>
          {!!secondaryName && (
            <Text style={s.pageHeaderSub}>{secondaryName}</Text>
          )}
        </View>
      </View>
      <View style={s.pageHeaderRight}>
        <Text style={s.pageHeaderTitle}>THE RUNWAY BRIEFING</Text>
        <Text style={s.pageHeaderYear}>Agent Runway · {year}</Text>
      </View>
    </View>
  );
}

function FooterComp() {
  return (
    <View style={s.footer} fixed>
      <View style={{ flexDirection: "column" }}>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Text style={s.footerBrand}>Agent Runway</Text>
          <Text style={s.footerSep}>·</Text>
          <Text style={s.footerConfidential}>agentrunway.ca</Text>
          <Text style={s.footerSep}>·</Text>
          <Text style={s.footerConfidential}>CONFIDENTIAL</Text>
        </View>
        <Text style={s.footerConfidential}>
          © 2026 Agent Runway Inc. · Canada Corporation No. 1786542-2
        </Text>
      </View>
      <Text
        style={s.footerPage}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function ProgressBar({
  label,
  value,
  max,
  note,
  color,
}: {
  label: string;
  value: number;
  max: number;
  note?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={s.progressWrap}>
      <View style={s.progressHeader}>
        <Text style={s.progressLabel}>{label}</Text>
        <Text style={s.progressValue}>{Math.round(pct)}%</Text>
      </View>
      <View style={s.progressTrack}>
        <View
          style={[
            s.progressFill,
            {
              width: `${pct}%`,
              backgroundColor: color ?? C.blue,
            },
          ]}
        />
      </View>
      {!!note && <Text style={s.progressNote}>{note}</Text>}
    </View>
  );
}

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
  // Identity
  agentName: string;
  brokerageName: string;
  businessName: string;
  province: string;
  year: number;
  avatarUrl?: string;
  logoUrl?: string;

  // KPIs
  ytdGCI: number;
  ytdDeals: number;
  buyerDeals: number;
  sellerDeals: number;
  avgDealSize: number;
  pipelineWeighted: number;
  pipelineCount: number;

  // Goals + projections
  goalGCI: number;
  fraction: number;
  projectedGCI: number;

  // P&L
  agentPct: number;
  brokerageTake: number;
  txFees: number;
  brokerageFeeYTD: number;
  agentGrossNet: number;
  expensesYTD: number;
  netPreTax: number;
  afterTaxNet: number;

  // Tax
  projectedNet: number;
  taxResult: TaxSummaryForPDF;
  gstHstCollectedYTD: number;
  gstHstLabel: string;

  // Expenses
  expenseRatio: number;
  expenseCategories: ExpenseCategoryWithItems[];
  monthlyRecurring: number;
  receiptTotalsByKey: Record<string, number>;

  // Projections
  bands: { p10: number; p25: number; p50: number; p75: number; p90: number };
  monthlyData: { month: string; gci: number; deals: number }[];

  // Engines
  benchmark: BenchmarkResult;
  survival: SurvivalResult;
  runwayScore: RunwayScoreResult;
  advisorCards: AdvisorCard[];

  // Transactions
  transactions: Transaction[];

  // Year-over-year comparison (optional — Page 7)
  historyYears?: {
    year: number;
    gci: number;
    transactions: number;
  }[];
  referralSummary?: {
    inboundCount: number;
    outboundCount: number;
    feesEarned: number;
    feesPaid: number;
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

export function BusinessReportPDF({
  agentName,
  brokerageName,
  businessName,
  province,
  year,
  avatarUrl,
  logoUrl,
  ytdGCI,
  ytdDeals,
  buyerDeals,
  sellerDeals,
  avgDealSize,
  pipelineWeighted,
  pipelineCount,
  goalGCI,
  fraction,
  projectedGCI,
  agentPct,
  brokerageTake,
  txFees,
  brokerageFeeYTD,
  agentGrossNet,
  expensesYTD,
  netPreTax,
  afterTaxNet,
  projectedNet,
  taxResult,
  gstHstCollectedYTD,
  gstHstLabel,
  expenseRatio,
  expenseCategories,
  monthlyRecurring,
  receiptTotalsByKey,
  bands,
  monthlyData,
  benchmark,
  survival,
  runwayScore,
  advisorCards,
  transactions,
  historyYears,
  referralSummary,
}: BusinessReportPDFProps) {

  const generatedDate = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const provinceLabel = PROVINCE_LABELS[province as keyof typeof PROVINCE_LABELS] ?? province;
  const headerBrokerage = businessName || brokerageName;

  // Max GCI for bar chart scaling
  const maxMonthlyGCI = Math.max(...monthlyData.map((m) => m.gci), 1);

  // Expense categories with receipt totals (non-zero only)
  const filteredExpenses = expenseCategories
    .map((cat) => ({
      ...cat,
      receiptYTD: cat.items.reduce((s, i) => s + (receiptTotalsByKey[i.key] ?? 0), 0),
      catMonthly: cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0),
    }))
    .filter((cat) => cat.receiptYTD > 0 || cat.catMonthly > 0);

  // Probability bands helpers
  const p90 = bands.p90 > 0 ? bands.p90 : 1;
  const bandsItems = [
    { label: "Conservative (P10)", value: bands.p10, color: C.rose, pct: (bands.p10 / p90) * 100 },
    { label: "Low-Likely (P25)",   value: bands.p25, color: C.amber, pct: (bands.p25 / p90) * 100 },
    { label: "Most Likely (P50)",  value: bands.p50, color: C.blue, pct: (bands.p50 / p90) * 100, highlight: true },
    { label: "High-Likely (P75)",  value: bands.p75, color: C.violet, pct: (bands.p75 / p90) * 100 },
    { label: "Optimistic (P90)",   value: bands.p90, color: C.emerald, pct: 100 },
  ];

  // Assessment narrative
  const assessmentText = generateAssessment(
    runwayScore.grade,
    runwayScore,
    survival,
    expenseRatio,
    benchmark,
  );

  // ── PAGE 1: COVER ─────────────────────────────────────────────────────────

  const coverPage = (
    <Page key="cover" size="LETTER" style={s.coverPage}>
      <View style={s.coverInner}>

        {/* Top brand row — no avatar here */}
        <View style={s.coverTop}>
          <View>
            <Text style={s.coverBrand}>AGENT RUNWAY</Text>
            <Text style={s.coverBrandSub}>agentrunway.ca</Text>
          </View>
        </View>

        {/* Center — title */}
        <View style={s.coverMiddle}>
          <View style={s.coverAccent} />
          <Text style={s.coverTitle}>The Runway{"\n"}Briefing</Text>
          <Text style={s.coverSubtitle}>BUSINESS PERFORMANCE REPORT · {year}</Text>

          <View style={s.coverDivider} />

          {/* Agent identity row: avatar on left, name/brokerage on right */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 6 }}>
            {!!avatarUrl ? (
              /* eslint-disable-next-line jsx-a11y/alt-text */
              <Image src={avatarUrl} style={s.coverAvatarLarge} />
            ) : (
              <View style={[s.coverAvatarLarge, { backgroundColor: C.navyMid, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ fontSize: 30, fontFamily: "Helvetica-Bold", color: C.white }}>
                  {(agentName || "A").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View>
              <Text style={s.coverAgentName}>{agentName || "Your Business"}</Text>
              {!!headerBrokerage && (
                <Text style={s.coverAgentSub}>{headerBrokerage}</Text>
              )}
              {!!brokerageName && !!businessName && (
                <Text style={s.coverAgentSub}>{brokerageName}</Text>
              )}
              <Text style={s.coverAgentSub}>{provinceLabel}</Text>
            </View>
          </View>

          <Text style={s.coverMeta}>Generated on {generatedDate}</Text>
        </View>

        {/* Bottom footer */}
        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>
            Powered by Agent Runway · agentrunway.ca
          </Text>
          <Text style={s.coverConfidential}>CONFIDENTIAL</Text>
        </View>

      </View>
    </Page>
  );

  // ── PAGE 2: EXECUTIVE SUMMARY ─────────────────────────────────────────────

  const execSummaryPage = (
    <Page key="exec" size="LETTER" style={s.contentPage}>
      <PageHeaderComp agentName={agentName} brokerage={headerBrokerage} year={year} logoUrl={logoUrl} avatarUrl={avatarUrl} />
      <View style={s.content}>

        {/* Section: YTD Snapshot */}
        <Text style={[s.sectionTitle, s.sectionTitleFirst]}>YTD Snapshot</Text>

        <View style={s.kpiRow}>
          {/* GCI */}
          <View style={s.kpiTile}>
            <View style={[s.kpiAccent, { backgroundColor: C.blue }]} />
            <View style={s.kpiBody}>
              <Text style={s.kpiLabel}>YTD GROSS COMMISSION</Text>
              <Text style={s.kpiValue}>{fmtCurrency(ytdGCI)}</Text>
              <Text style={s.kpiSub}>
                Projected: {fmtCurrency(projectedGCI)}
              </Text>
            </View>
          </View>

          {/* Deals */}
          <View style={s.kpiTile}>
            <View style={[s.kpiAccent, { backgroundColor: C.emerald }]} />
            <View style={s.kpiBody}>
              <Text style={s.kpiLabel}>CLOSED DEALS</Text>
              <Text style={s.kpiValue}>{ytdDeals}</Text>
              <Text style={s.kpiSub}>{buyerDeals}B · {sellerDeals}S</Text>
            </View>
          </View>

          {/* Avg deal */}
          <View style={s.kpiTile}>
            <View style={[s.kpiAccent, { backgroundColor: C.amber }]} />
            <View style={s.kpiBody}>
              <Text style={s.kpiLabel}>AVG DEAL SIZE</Text>
              <Text style={s.kpiValue}>{fmtCurrency(avgDealSize)}</Text>
              <Text style={s.kpiSub}>Commission per deal</Text>
            </View>
          </View>

          {/* Pipeline */}
          <View style={s.kpiTile}>
            <View style={[s.kpiAccent, { backgroundColor: C.violet }]} />
            <View style={s.kpiBody}>
              <Text style={s.kpiLabel}>PIPELINE (WEIGHTED)</Text>
              <Text style={s.kpiValue}>{fmtCurrency(pipelineWeighted)}</Text>
              <Text style={s.kpiSub}>{pipelineCount} active deal{pipelineCount !== 1 ? "s" : ""}</Text>
            </View>
          </View>
        </View>

        {/* Goal Progress */}
        {goalGCI > 0 && (
          <ProgressBar
            label={`Annual GCI Goal Progress · ${fmtCurrency(ytdGCI)} of ${fmtCurrency(goalGCI)}`}
            value={ytdGCI}
            max={goalGCI}
            note={`Projected year-end GCI ${fmtCurrency(projectedGCI)} · ${Math.round(fraction * 100)}% of year elapsed`}
            color={ytdGCI >= goalGCI ? C.emerald : C.blue}
          />
        )}

        {/* P&L + Tax side-by-side */}
        <View style={s.twoCol}>

          {/* P&L */}
          <View style={s.col}>
            <Text style={s.sectionTitle}>Profit & Loss — YTD {year}</Text>
            <View style={s.plCard}>
              <View style={s.plCardHeader}>
                <Text style={s.plCardHeaderText}>Income Waterfall</Text>
              </View>
              <View style={s.plRow}>
                <Text style={s.plLabel}>Gross Commission Income</Text>
                <Text style={s.plValue}>{fmtCurrency(ytdGCI)}</Text>
              </View>
              <View style={[s.plRow, s.plRowStripe]}>
                <Text style={s.plLabelMuted}>
                  Brokerage split ({fmtPct(1 - agentPct)})
                </Text>
                <Text style={s.plValueNeg}>−{fmtCurrency(brokerageTake)}</Text>
              </View>
              <View style={s.plRow}>
                <Text style={s.plLabelMuted}>Transaction fees</Text>
                <Text style={s.plValueNeg}>−{fmtCurrency(txFees)}</Text>
              </View>
              <View style={[s.plRow, s.plRowStripe]}>
                <Text style={s.plLabelMuted}>Desk fees YTD</Text>
                <Text style={s.plValueNeg}>−{fmtCurrency(brokerageFeeYTD)}</Text>
              </View>
              <View style={s.plRow}>
                <Text style={s.plLabel}>Agent Gross</Text>
                <Text style={s.plValue}>{fmtCurrency(agentGrossNet)}</Text>
              </View>
              <View style={[s.plRow, s.plRowStripe]}>
                <Text style={s.plLabelMuted}>Business expenses</Text>
                <Text style={s.plValueNeg}>−{fmtCurrency(expensesYTD)}</Text>
              </View>
              <View style={s.plTotalRow}>
                <Text style={s.plTotalLabel}>Net Pre-Tax</Text>
                <Text style={s.plTotalValue}>{fmtCurrency(netPreTax)}</Text>
              </View>
            </View>
          </View>

          {/* Tax summary */}
          <View style={s.col}>
            <Text style={s.sectionTitle}>Tax Estimate — {taxResult.taxYear}</Text>
            <View style={s.plCard}>
              <View style={s.plCardHeader}>
                <Text style={s.plCardHeaderText}>Projected Annual Tax Burden</Text>
              </View>
              <View style={s.plRow}>
                <Text style={s.plLabel}>Projected net income</Text>
                <Text style={s.plValue}>{fmtCurrency(projectedNet)}</Text>
              </View>
              <View style={[s.plRow, s.plRowStripe]}>
                <Text style={s.plLabelMuted}>CPP/QPP contributions</Text>
                <Text style={s.plValueMuted}>−{fmtCurrency(taxResult.totalCPP)}</Text>
              </View>
              <View style={s.plRow}>
                <Text style={s.plLabelMuted}>Federal income tax</Text>
                <Text style={s.plValueMuted}>−{fmtCurrency(taxResult.federalTax)}</Text>
              </View>
              <View style={[s.plRow, s.plRowStripe]}>
                <Text style={s.plLabelMuted}>Provincial income tax</Text>
                <Text style={s.plValueMuted}>−{fmtCurrency(taxResult.provincialTax)}</Text>
              </View>
              <View style={s.plRow}>
                <Text style={s.plLabel}>Total tax burden</Text>
                <Text style={s.plValue}>{fmtCurrency(taxResult.totalBurden)}</Text>
              </View>
              <View style={[s.plRow, s.plRowStripe]}>
                <Text style={s.plLabelMuted}>Effective rate</Text>
                <Text style={s.plValue}>{fmtPct(taxResult.effectiveRate)}</Text>
              </View>
              <View style={s.plTotalRow}>
                <Text style={s.plTotalLabel}>Est. After-Tax Net</Text>
                <Text style={s.plTotalValue}>{fmtCurrency(afterTaxNet)}</Text>
              </View>
            </View>

            {/* Planning tiles */}
            <View style={s.taxTileRow}>
              <View style={s.taxTile}>
                <Text style={s.taxTileLabel}>QUARTERLY INSTALMENT</Text>
                <Text style={s.taxTileValue}>{fmtCurrency(taxResult.quarterlyEstimate)}</Text>
                <Text style={s.taxTileSub}>Set aside quarterly</Text>
              </View>
              <View style={[s.taxTile, s.taxTileHighlight]}>
                <Text style={[s.taxTileLabel, s.taxTileHighlightLabel]}>PER-DEAL SET-ASIDE</Text>
                <Text style={[s.taxTileValue, s.taxTileHighlightValue]}>{fmtCurrency(taxResult.perDealSetAside)}</Text>
                <Text style={[s.taxTileSub, s.taxTileHighlightSub]}>Reserve per closed deal</Text>
              </View>
            </View>
          </View>

        </View>

      </View>
      <FooterComp />
    </Page>
  );

  // ── PAGE 3: INCOME & PROJECTIONS ──────────────────────────────────────────

  const ALL_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlyMap = new Map(monthlyData.map((m) => [m.month, m]));

  const incomePage = (
    <Page key="income" size="LETTER" style={s.contentPage}>
      <PageHeaderComp agentName={agentName} brokerage={headerBrokerage} year={year} logoUrl={logoUrl} avatarUrl={avatarUrl} />
      <View style={s.content}>

        {/* Monthly GCI Bar Chart */}
        <Text style={[s.sectionTitle, s.sectionTitleFirst]}>Monthly GCI Breakdown — {year}</Text>

        <View style={s.chartContainer}>
          <Text style={s.chartTitle}>Gross Commission by Month</Text>
          <View style={s.barChartArea}>
            {ALL_MONTHS.map((month) => {
              const m = monthlyMap.get(month);
              const gci = m?.gci ?? 0;
              const barH = maxMonthlyGCI > 0 ? Math.max(2, (gci / maxMonthlyGCI) * 68) : 2;
              const barColor = gci > 0 ? C.blue : C.border;
              return (
                <View key={month} style={s.barCol}>
                  {gci > 0 && (
                    <Text style={[s.barLabel, { fontSize: 5, color: C.blue, marginBottom: 1 }]}>
                      {fmtCompact(gci)}
                    </Text>
                  )}
                  <View style={[s.bar, { height: barH, backgroundColor: barColor }]} />
                </View>
              );
            })}
          </View>
          <View style={s.barLabelRow}>
            {ALL_MONTHS.map((month) => (
              <Text key={month} style={s.barLabel}>{month}</Text>
            ))}
          </View>
          <Text style={s.chartSubNote}>
            Chart shows closed commission income per month. Deals without a specific day use the first of the month.
          </Text>
        </View>

        {/* Probability Bands */}
        <Text style={s.sectionTitle}>Year-End Income Forecast Range</Text>

        <View style={s.bandsCard}>
          <View style={s.bandsHeader}>
            <Text style={s.bandsHeaderText}>Probability-Weighted Year-End GCI Scenarios</Text>
            <Text style={s.bandsHeaderSub}>
              Based on YTD pace, pipeline, and historical variance · Current YTD: {fmtCurrency(ytdGCI)}
            </Text>
          </View>
          {bandsItems.map((b) => (
            <View
              key={b.label}
              style={[s.bandsRow, b.highlight ? s.bandsRowHighlight : {}]}
            >
              <Text style={[s.bandsLabel, b.highlight ? s.bandsLabelBold : {}]}>
                {b.label}
              </Text>
              <View style={s.bandsBar}>
                <View
                  style={[
                    s.bandsBarFill,
                    {
                      width: `${Math.max(2, b.pct)}%`,
                      backgroundColor: b.color,
                    },
                  ]}
                />
              </View>
              <Text style={[s.bandsValue, b.highlight ? { color: C.blue } : {}]}>
                {fmtCurrency(b.value)}
              </Text>
            </View>
          ))}
        </View>

        {/* Benchmark */}
        <Text style={s.sectionTitle}>Peer Benchmark Positioning</Text>

        <View style={s.benchmarkCard}>
          <Text style={s.benchmarkTitle}>
            How You Compare — {PROVINCE_LABELS[province as keyof typeof PROVINCE_LABELS] ?? province} · {
              benchmark.cohort === "rookie" ? "Rookie (0–2 yrs)"
              : benchmark.cohort === "growth" ? "Growth (2–5 yrs)"
              : benchmark.cohort === "established" ? "Established (5–10 yrs)"
              : "Top Producer (10+ yrs)"
            } Cohort
          </Text>
          <View style={s.benchmarkRow}>
            <View style={[s.benchmarkBadge, { backgroundColor: benchmark.percentile >= 75 ? C.emerald : benchmark.percentile >= 50 ? C.blue : C.amber }]}>
              <Text style={s.benchmarkPctText}>{ord(benchmark.percentile)}</Text>
              <Text style={s.benchmarkPctSub}>pctile</Text>
            </View>
            <View style={s.benchmarkInfo}>
              <Text style={s.benchmarkInfoLabel}>
                Cohort percentile rank (based on projected GCI of {fmtCurrency(projectedGCI)})
              </Text>
              <View style={s.benchmarkTrack}>
                <View
                  style={[
                    s.benchmarkFill,
                    {
                      width: `${benchmark.percentile}%`,
                      backgroundColor: benchmark.percentile >= 75 ? C.emerald : benchmark.percentile >= 50 ? C.blue : C.amber,
                    },
                  ]}
                />
              </View>
              <Text style={s.benchmarkInfoValue}>
                Cohort median: {fmtCurrency(benchmark.cohortMedianGCI)}
                {benchmark.distanceToNextTier != null && benchmark.nextTierLabel != null
                  ? `  ·  ${fmtCurrency(benchmark.distanceToNextTier)} to ${benchmark.nextTierLabel} median`
                  : "  ·  Top cohort achieved"}
              </Text>
            </View>
          </View>
        </View>

      </View>
      <FooterComp />
    </Page>
  );

  // ── PAGE 4: EXPENSES & TAX ────────────────────────────────────────────────

  const expensePage = (
    <Page key="expenses" size="LETTER" style={s.contentPage}>
      <PageHeaderComp agentName={agentName} brokerage={headerBrokerage} year={year} logoUrl={logoUrl} avatarUrl={avatarUrl} />
      <View style={s.content}>

        <Text style={[s.sectionTitle, s.sectionTitleFirst]}>Expense Analysis — YTD {year}</Text>

        {/* Expense ratio progress */}
        <ProgressBar
          label={`Expense Ratio · ${expenseRatio.toFixed(1)}% of GCI (target: 25–30%)`}
          value={expenseRatio}
          max={50}
          note="Industry benchmark is 25–30%. A lower ratio means more of your GCI reaches your pocket."
          color={expenseRatio <= 30 ? C.emerald : expenseRatio <= 40 ? C.amber : C.rose}
        />

        {/* Category table with receipt totals */}
        {filteredExpenses.length > 0 ? (
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.tHeadCell, { flex: 2 }]}>Category</Text>
              <Text style={[s.tHeadCell, s.tHeadRight, { flex: 1.5 }]}>YTD (Receipts)</Text>
              <Text style={[s.tHeadCell, s.tHeadRight, { flex: 1 }]}>Monthly Recurring</Text>
              <Text style={[s.tHeadCell, s.tHeadRight, { flex: 1 }]}>% of GCI</Text>
            </View>
            {filteredExpenses.map((cat, idx) => {
              const pctOfGCI = ytdGCI > 0 ? (cat.receiptYTD / ytdGCI) * 100 : 0;
              const maxCatYTD = Math.max(...filteredExpenses.map((c) => c.receiptYTD), 1);
              return (
                <View key={cat.id} style={[s.tRow, idx % 2 === 1 ? s.tRowStripe : {}]}>
                  <View style={{ flex: 2 }}>
                    <Text style={s.tCell}>{cat.title}</Text>
                    {cat.receiptYTD > 0 && (
                      <View style={s.miniBarTrack}>
                        <View
                          style={[
                            s.miniBarFill,
                            { width: `${Math.min(100, (cat.receiptYTD / maxCatYTD) * 100)}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                  <Text style={[s.tCell, s.tCellRight, { flex: 1.5 }]}>
                    {fmtCurrency(cat.receiptYTD)}
                  </Text>
                  <Text style={[s.tCell, s.tCellRight, s.tCellMuted, { flex: 1 }]}>
                    {cat.catMonthly > 0 ? fmtCurrency(cat.catMonthly) : "—"}
                  </Text>
                  <Text style={[s.tCell, s.tCellRight, { flex: 1 }]}>
                    {pctOfGCI > 0 ? `${pctOfGCI.toFixed(1)}%` : "—"}
                  </Text>
                </View>
              );
            })}
            <View style={s.tTotalRow}>
              <Text style={[s.tTotalCell, { flex: 2 }]}>Total</Text>
              <Text style={[s.tTotalCell, s.tHeadRight, { flex: 1.5 }]}>
                {fmtCurrency(expensesYTD)}
              </Text>
              <Text style={[s.tTotalCell, s.tHeadRight, { flex: 1 }]}>
                {fmtCurrency(monthlyRecurring)}
              </Text>
              <Text style={[s.tTotalCell, s.tHeadRight, { flex: 1 }]}>
                {ytdGCI > 0 ? `${((expensesYTD / ytdGCI) * 100).toFixed(1)}%` : "—"}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[s.assessmentBox, { marginBottom: 16 }]}>
            <Text style={s.assessmentText}>
              No receipt-based expenses have been logged yet. Track your business expenses in the Expenses section to see a detailed breakdown here.
            </Text>
          </View>
        )}

        {/* GST/HST note */}
        <View style={s.gstNote}>
          <Text>
            {gstHstLabel} Estimate · {fmtCurrency(gstHstCollectedYTD)} collected on YTD GCI of{" "}
            {fmtCurrency(ytdGCI)}. As a self-employed agent, you are responsible for remitting{" "}
            {gstHstLabel} to the CRA if your annual income exceeds $30,000. Keep a dedicated{" "}
            account for these funds.
          </Text>
        </View>

        {/* Tax tiles */}
        <Text style={s.sectionTitle}>Tax Component Breakdown</Text>
        <View style={s.taxTileRow}>
          <View style={s.taxTile}>
            <Text style={s.taxTileLabel}>FEDERAL TAX</Text>
            <Text style={s.taxTileValue}>{fmtCurrency(taxResult.federalTax)}</Text>
            <Text style={s.taxTileSub}>Based on projected income</Text>
          </View>
          <View style={s.taxTile}>
            <Text style={s.taxTileLabel}>PROVINCIAL TAX</Text>
            <Text style={s.taxTileValue}>{fmtCurrency(taxResult.provincialTax)}</Text>
            <Text style={s.taxTileSub}>{provinceLabel}</Text>
          </View>
          <View style={s.taxTile}>
            <Text style={s.taxTileLabel}>CPP / QPP</Text>
            <Text style={s.taxTileValue}>{fmtCurrency(taxResult.totalCPP)}</Text>
            <Text style={s.taxTileSub}>Self-employed contributions</Text>
          </View>
          <View style={[s.taxTile, s.taxTileHighlight]}>
            <Text style={[s.taxTileLabel, s.taxTileHighlightLabel]}>TOTAL BURDEN</Text>
            <Text style={[s.taxTileValue, s.taxTileHighlightValue]}>{fmtCurrency(taxResult.totalBurden)}</Text>
            <Text style={[s.taxTileSub, s.taxTileHighlightSub]}>
              Effective rate {fmtPct(taxResult.effectiveRate)}
            </Text>
          </View>
        </View>

        {/* Cash runway */}
        <Text style={s.sectionTitle}>Cash Runway</Text>
        <View
          style={[
            s.assessmentBox,
            {
              backgroundColor:
                survival.riskLevel === "strong" || survival.riskLevel === "healthy"
                  ? "#F0FDF4"
                  : survival.riskLevel === "warning"
                  ? "#FFFBEB"
                  : "#FFF1F2",
              borderColor:
                survival.riskLevel === "strong" || survival.riskLevel === "healthy"
                  ? "#BBF7D0"
                  : survival.riskLevel === "warning"
                  ? "#FDE68A"
                  : "#FECDD3",
            },
          ]}
        >
          <Text style={[s.assessmentTitle, { color: riskColor(survival.riskLevel) }]}>
            {survival.months.toFixed(1)} Months Cash Runway ·{" "}
            {survival.riskLevel === "strong" ? "Strong" : survival.riskLevel === "healthy" ? "Healthy" : survival.riskLevel === "warning" ? "Warning" : "Critical"}
          </Text>
          <Text style={s.assessmentText}>
            Based on your cash reserve of {fmtCurrency(survival.cashReserve)} and a monthly burn
            rate of {fmtCurrency(survival.monthlyBurn)}.
            {survival.riskLevel === "critical"
              ? " Immediate action required — build at minimum 2 months of reserves."
              : survival.riskLevel === "warning"
              ? " Consider increasing your reserve to 4+ months for professional security."
              : " You are within the recommended 4–6+ month safety buffer."}
          </Text>
        </View>

      </View>
      <FooterComp />
    </Page>
  );

  // ── PAGE 5: TRANSACTION LOG (conditional) ─────────────────────────────────

  const txPage = transactions.length > 0 ? (
    <Page key="transactions" size="LETTER" style={s.contentPage}>
      <PageHeaderComp agentName={agentName} brokerage={headerBrokerage} year={year} logoUrl={logoUrl} avatarUrl={avatarUrl} />
      <View style={s.content}>

        <Text style={[s.sectionTitle, s.sectionTitleFirst]}>
          Transaction Log — {year} ({transactions.length} closed deal{transactions.length !== 1 ? "s" : ""})
        </Text>

        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={[s.tHeadCell, { flex: 0.8 }]}>Date</Text>
            <Text style={[s.tHeadCell, { flex: 2 }]}>Address</Text>
            <Text style={[s.tHeadCell, { flex: 1.4 }]}>Client</Text>
            <Text style={[s.tHeadCell, { flex: 0.5 }]}>Side</Text>
            <Text style={[s.tHeadCell, s.tHeadRight, { flex: 0.8 }]}>GCI</Text>
          </View>
          {transactions.map((tx, idx) => {
            const gci = computeGCI(tx);
            return (
              <View
                key={tx.id}
                style={[s.tRow, idx % 2 === 1 ? s.tRowStripe : {}]}
              >
                <Text style={[s.tCell, s.tCellMuted, { flex: 0.8 }]}>
                  {tx.date}
                </Text>
                <Text style={[s.tCell, { flex: 2 }]}>
                  {tx.address || "—"}
                </Text>
                <Text style={[s.tCell, s.tCellMuted, { flex: 1.4 }]}>
                  {tx.client_name || "—"}
                </Text>
                <Text style={[s.tCell, { flex: 0.5 }]}>
                  {tx.side ? tx.side.charAt(0).toUpperCase() + tx.side.slice(1) : "—"}
                </Text>
                <Text style={[s.tCell, s.tCellRight, s.tCellBold, { flex: 0.8 }]}>
                  {fmtCurrency(gci)}
                </Text>
              </View>
            );
          })}
          <View style={s.tTotalRow}>
            <Text style={[s.tTotalCell, { flex: 0.8 }]}>—</Text>
            <Text style={[s.tTotalCell, { flex: 2 }]}>Total YTD GCI</Text>
            <Text style={[s.tTotalCell, { flex: 1.4 }]} />
            <Text style={[s.tTotalCell, { flex: 0.5 }]} />
            <Text style={[s.tTotalCell, s.tHeadRight, { flex: 0.8 }]}>
              {fmtCurrency(ytdGCI)}
            </Text>
          </View>
        </View>

      </View>
      <FooterComp />
    </Page>
  ) : null;

  // ── PAGE 6: BUSINESS HEALTH ASSESSMENT ───────────────────────────────────

  const healthPage = (
    <Page key="health" size="LETTER" style={s.contentPage}>
      <PageHeaderComp agentName={agentName} brokerage={headerBrokerage} year={year} logoUrl={logoUrl} avatarUrl={avatarUrl} />
      <View style={s.content}>

        <Text style={[s.sectionTitle, s.sectionTitleFirst]}>Business Health Assessment</Text>

        {/* Score badge + label */}
        <View style={s.scoreSection}>
          <View style={[s.scoreBadge, { backgroundColor: gradeColor(runwayScore.grade) }]}>
            <Text style={s.scoreGradeText}>{runwayScore.grade}</Text>
            <Text style={s.scoreNumText}>{runwayScore.score}/100</Text>
          </View>
          <View style={s.scoreInfo}>
            <Text style={[s.scoreLabelText, { color: gradeColor(runwayScore.grade) }]}>
              {gradeLabel(runwayScore.grade)} Business Health
            </Text>
            <Text style={s.scoreSub}>
              Composite score across 5 weighted components: Goal Pace (35%), Pipeline (30%),
              Expenses (15%), Survival (15%), Benchmark (5%).
            </Text>
          </View>
        </View>

        {/* Component bars */}
        <Text style={s.sectionTitle}>Score Breakdown</Text>
        {runwayScore.components.map((comp) => (
          <View key={comp.label} style={s.componentRow}>
            <Text style={s.componentLabel}>{comp.label}</Text>
            <View style={s.componentTrack}>
              <View
                style={[
                  s.componentFill,
                  {
                    width: `${comp.score}%`,
                    backgroundColor: scoreColor(comp.score),
                  },
                ]}
              />
            </View>
            <Text style={s.componentValue}>{comp.score}</Text>
          </View>
        ))}

        {/* Assessment narrative */}
        <Text style={s.sectionTitle}>Assessment</Text>
        <View style={s.assessmentBox}>
          <Text style={s.assessmentTitle}>
            Agent Runway Intelligence · {year} Business Health Report
          </Text>
          <Text style={s.assessmentText}>{assessmentText}</Text>
        </View>

        {/* Advisor tips */}
        {advisorCards.length > 0 && (
          <>
            <Text style={s.sectionTitle}>
              Key Observations for {year}
            </Text>
            {advisorCards.map((card, idx) => (
              <View key={card.id} style={s.advisorCard}>
                <View style={s.advisorHeader}>
                  <View style={s.advisorNum}>
                    <Text style={s.advisorNumText}>{idx + 1}</Text>
                  </View>
                  <Text style={s.advisorTitle}>{card.title}</Text>
                  <Text style={s.advisorImpact}>{card.estimatedImpact}</Text>
                </View>
                <View style={s.advisorBody}>
                  <Text style={s.advisorAction}>{card.action}</Text>
                  {card.evidence.length > 0 && (
                    <Text style={s.advisorImpactNote}>
                      {"> "}{card.evidence[0]}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* Closing note */}
        <View style={[s.gstNote, { marginTop: 8 }]}>
          <Text>
            This report was generated by Agent Runway on {generatedDate}. All projections are
            estimates based on YTD data, historical pace, and probability modelling — not
            financial advice. Consult a licensed accountant for tax planning specific to your
            situation.
          </Text>
        </View>

      </View>
      <FooterComp />
    </Page>
  );

  // ── PAGE 7: Year-Over-Year + Referrals (conditional) ────────────────────

  const hasHistory = historyYears && historyYears.length > 1;
  const hasReferrals = referralSummary && (referralSummary.inboundCount > 0 || referralSummary.outboundCount > 0);

  const yoyPage = (hasHistory || hasReferrals) ? (
    <Page key="yoy" size="LETTER" style={s.contentPage}>
      <PageHeaderComp agentName={agentName} brokerage={headerBrokerage} year={year} logoUrl={logoUrl} avatarUrl={avatarUrl} />
      <View style={s.content}>

        {/* History table */}
        {hasHistory && historyYears && (
          <>
            <Text style={s.sectionTitle}>
              <Text style={{ color: C.violet, fontSize: 11, fontFamily: "Helvetica-Bold" }}>Annual Performance History</Text>
            </Text>

            {/* Table header */}
            <View style={[s.tRow, { backgroundColor: C.navy, borderRadius: 4, marginTop: 6 }]}>
              <Text style={[s.tCell, { color: C.white, width: "20%", fontFamily: "Helvetica-Bold" }]}>Year</Text>
              <Text style={[s.tCell, { color: C.white, width: "30%", fontFamily: "Helvetica-Bold", textAlign: "right" }]}>GCI</Text>
              <Text style={[s.tCell, { color: C.white, width: "20%", fontFamily: "Helvetica-Bold", textAlign: "right" }]}>Deals</Text>
              <Text style={[s.tCell, { color: C.white, width: "30%", fontFamily: "Helvetica-Bold", textAlign: "right" }]}>Avg Deal</Text>
            </View>

            {/* Table rows */}
            {[...historyYears].sort((a, b) => b.year - a.year).map((h, i) => {
              const prevYear = historyYears.find((hy) => hy.year === h.year - 1);
              const gciChange = prevYear && prevYear.gci > 0 ? ((h.gci - prevYear.gci) / prevYear.gci) : null;
              return (
                <View key={h.year} style={[s.tRow, { backgroundColor: i % 2 === 0 ? C.stripe : C.white }]}>
                  <Text style={[s.tCell, { width: "20%", fontFamily: "Helvetica-Bold" }]}>{h.year}</Text>
                  <View style={{ width: "30%", flexDirection: "row", justifyContent: "flex-end", alignItems: "center", padding: 6 }}>
                    <Text style={{ fontSize: 8, color: C.ink }}>{fmtCurrency(h.gci)}</Text>
                    {gciChange !== null && (
                      <Text style={{ fontSize: 7, color: gciChange >= 0 ? C.emerald : C.rose, marginLeft: 4 }}>
                        {gciChange >= 0 ? "+" : ""}{fmtPct(gciChange)}
                      </Text>
                    )}
                  </View>
                  <Text style={[s.tCell, { width: "20%", textAlign: "right" }]}>{h.transactions}</Text>
                  <Text style={[s.tCell, { width: "30%", textAlign: "right" }]}>{h.transactions > 0 ? fmtCurrency(h.gci / h.transactions) : "—"}</Text>
                </View>
              );
            })}

            {/* Growth summary */}
            {historyYears.length >= 2 && (() => {
              const sorted = [...historyYears].sort((a, b) => a.year - b.year);
              const first = sorted[0];
              const last = sorted[sorted.length - 1];
              const yearsSpan = last.year - first.year;
              const totalGrowth = first.gci > 0 ? (last.gci - first.gci) / first.gci : 0;
              const cagr = yearsSpan > 0 && first.gci > 0 ? Math.pow(last.gci / first.gci, 1 / yearsSpan) - 1 : 0;
              return (
                <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                  <View style={{ flex: 1, backgroundColor: C.offwhite, borderRadius: 6, padding: 10 }}>
                    <Text style={{ fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 }}>
                      {yearsSpan}-Year Growth
                    </Text>
                    <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: totalGrowth >= 0 ? C.emerald : C.rose, marginTop: 3 }}>
                      {totalGrowth >= 0 ? "+" : ""}{fmtPct(totalGrowth)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: C.offwhite, borderRadius: 6, padding: 10 }}>
                    <Text style={{ fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 }}>CAGR</Text>
                    <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: cagr >= 0 ? C.emerald : C.rose, marginTop: 3 }}>
                      {cagr >= 0 ? "+" : ""}{fmtPct(cagr)}
                    </Text>
                    <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>compound annual growth rate</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: C.offwhite, borderRadius: 6, padding: 10 }}>
                    <Text style={{ fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 }}>Avg Deal Size</Text>
                    <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 3 }}>
                      {fmtCurrency(last.transactions > 0 ? last.gci / last.transactions : 0)}
                    </Text>
                    <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>{last.year} average</Text>
                  </View>
                </View>
              );
            })()}
          </>
        )}

        {/* Referral Summary */}
        {hasReferrals && referralSummary && (
          <>
            <Text style={[s.sectionTitle, { marginTop: hasHistory ? 20 : 0 }]}>
              <Text style={{ color: C.orange, fontSize: 11, fontFamily: "Helvetica-Bold" }}>Referral Network Summary</Text>
            </Text>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 6, padding: 12, borderWidth: 1, borderColor: "#BFDBFE" }}>
                <Text style={{ fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 }}>Inbound Referrals</Text>
                <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: C.blue, marginTop: 3 }}>{referralSummary.inboundCount}</Text>
                <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>clients referred to you</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#F5F3FF", borderRadius: 6, padding: 12, borderWidth: 1, borderColor: "#DDD6FE" }}>
                <Text style={{ fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 }}>Outbound Referrals</Text>
                <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: C.violet, marginTop: 3 }}>{referralSummary.outboundCount}</Text>
                <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>clients you referred out</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#ECFDF5", borderRadius: 6, padding: 12, borderWidth: 1, borderColor: "#A7F3D0" }}>
                <Text style={{ fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 }}>Net Referral Income</Text>
                <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: C.emerald, marginTop: 3 }}>
                  {fmtCurrency(referralSummary.feesEarned - referralSummary.feesPaid)}
                </Text>
                <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>
                  earned {fmtCurrency(referralSummary.feesEarned)} · paid {fmtCurrency(referralSummary.feesPaid)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Closing note */}
        <View style={[s.gstNote, { marginTop: 16 }]}>
          <Text>
            Year-over-year data is based on transaction history entered into Agent Runway.
            Ensure all prior years are complete for accurate trend analysis.
          </Text>
        </View>
      </View>
      <FooterComp />
    </Page>
  ) : null;

  // ── Document ──────────────────────────────────────────────────────────────

  return (
    <Document
      title={`The Runway Briefing — ${agentName || "Agent Runway"} — ${year}`}
      author="Agent Runway"
      subject="Business Performance Report"
      keywords="real estate, GCI, commission, business health"
    >
      {coverPage}
      {execSummaryPage}
      {incomePage}
      {expensePage}
      {txPage}
      {healthPage}
      {yoyPage}
    </Document>
  );
}
