import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Calculator,
  Gauge,
  BarChart3,
  TableProperties,
  Lightbulb,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Real Estate Analytics Software vs. Spreadsheets",
  description:
    "Comparing spreadsheets vs dedicated analytics software for real estate agents — and why purpose-built tools give serious agents a real edge.",
  openGraph: {
    url: "https://agentrunway.ca/real-estate-analytics-vs-spreadsheets",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/real-estate-analytics-vs-spreadsheets",
  },
};

const pageArticleSchema = articleSchema({
  headline: "Real Estate Analytics Software vs. Spreadsheets",
  description:
    "Head-to-head comparison of spreadsheets vs. purpose-built business analytics software for real estate agents — accuracy, forecasting, time cost, and scale.",
  url: "/real-estate-analytics-vs-spreadsheets",
  datePublished: "2025-11-01",
  dateModified: "2026-04-16",
  imageUrl: "/og-image-v2.png",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Analytics vs. Spreadsheets", url: "/real-estate-analytics-vs-spreadsheets" },
]);

// ── Comparison table data ─────────────────────────────────────────────────────

type RowStatus = "yes" | "no" | "partial";

interface ComparisonRow {
  feature: string;
  spreadsheet: RowStatus;
  spreadsheetNote?: string;
  agentRunway: RowStatus;
  agentRunwayNote?: string;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "GCI tracking",
    spreadsheet: "partial",
    spreadsheetNote: "Manual entry only",
    agentRunway: "yes",
    agentRunwayNote: "Live, with split and fees applied",
  },
  {
    feature: "Income forecasting",
    spreadsheet: "partial",
    spreadsheetNote: "Linear extrapolation only",
    agentRunway: "yes",
    agentRunwayNote: "Seasonality-aware with pipeline weighting",
  },
  {
    feature: "Seasonality adjustments",
    spreadsheet: "no",
    agentRunway: "yes",
    agentRunwayNote: "Canadian market curves built in",
  },
  {
    feature: "Tax estimates (federal + CPP)",
    spreadsheet: "no",
    agentRunway: "yes",
    agentRunwayNote: "All 13 provinces and territories",
  },
  {
    feature: "Financial runway score",
    spreadsheet: "no",
    agentRunway: "yes",
    agentRunwayNote: "6-component composite score (A+ to F)",
  },
  {
    feature: "Industry benchmark comparison",
    spreadsheet: "no",
    agentRunway: "yes",
    agentRunwayNote: "National cohort percentile ranking",
  },
  {
    feature: "AI business insights",
    spreadsheet: "no",
    agentRunway: "yes",
    agentRunwayNote: "Ranked by potential business impact",
  },
  {
    feature: "Pipeline management",
    spreadsheet: "partial",
    spreadsheetNote: "Requires custom build",
    agentRunway: "yes",
    agentRunwayNote: "Probability-weighted deal tracking",
  },
  {
    feature: "PDF reports",
    spreadsheet: "partial",
    spreadsheetNote: "Print/export only",
    agentRunway: "yes",
    agentRunwayNote: "Formatted reports with full breakdown",
  },
];

// ── Pain point cards ──────────────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    icon: TrendingUp,
    iconClass: "text-orange-500",
    bgClass: "bg-orange-50 border-orange-100",
    title: "No seasonality awareness",
    body:
      "A spreadsheet projection from October assumes the same deal rate through December and January — months when Canadian real estate markets historically slow significantly. Naive linear projections routinely overestimate year-end income.",
  },
  {
    icon: Calculator,
    iconClass: "text-red-500",
    bgClass: "bg-red-50 border-red-100",
    title: "Manual tax math",
    body: (
      <>
        Estimating your federal income tax, provincial tax, CPP self-employed
        contributions, and quarterly instalment amounts requires a working knowledge
        of current rate tables and ongoing adjustment as income changes. Spreadsheets
        provide no help here. See the full guide to{" "}
        <Link
          href="/real-estate-agent-tax-planning-canada"
          className="font-medium text-red-700 underline underline-offset-2 hover:text-red-600"
        >
          real estate agent tax planning in Canada
        </Link>
        .
      </>
    ),
  },
  {
    icon: Gauge,
    iconClass: "text-purple-500",
    bgClass: "bg-purple-50 border-purple-100",
    title: "No financial runway visibility",
    body: (
      <>
        You don&apos;t know how long your business can sustain itself without new
        commissions. Without a live{" "}
        <Link
          href="/metrics/financial-runway"
          className="font-medium text-purple-700 underline underline-offset-2 hover:text-purple-600"
        >
          financial runway
        </Link>{" "}
        calculation, a slow market can become a crisis before you see it coming.
      </>
    ),
  },
  {
    icon: BarChart3,
    iconClass: "text-blue-500",
    bgClass: "bg-blue-50 border-blue-100",
    title: "No benchmarks",
    body:
      "A spreadsheet can only tell you your own numbers. It cannot tell you whether your GCI, expense ratio, or deal volume compares favourably or poorly against agents at a similar career stage in the Canadian market.",
  },
];

// ── Status cell helpers ───────────────────────────────────────────────────────

function StatusCell({
  status,
  note,
  align = "center",
}: {
  status: RowStatus;
  note?: string;
  align?: "center" | "left";
}) {
  return (
    <td
      className={`px-4 py-4 text-sm ${align === "center" ? "text-center" : "text-left"}`}
    >
      {status === "yes" && (
        <span className="inline-flex flex-col items-center gap-0.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          {note && (
            <span className="mt-0.5 text-xs text-slate-500">{note}</span>
          )}
        </span>
      )}
      {status === "no" && (
        <XCircle className="mx-auto h-5 w-5 text-slate-300" />
      )}
      {status === "partial" && (
        <span className="inline-flex flex-col items-center gap-0.5">
          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Partial
          </span>
          {note && (
            <span className="mt-0.5 text-xs text-slate-500">{note}</span>
          )}
        </span>
      )}
    </td>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateAnalyticsVsSpreadsheets() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD (Article + BreadcrumbList) ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageArticleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <TableProperties className="h-3.5 w-3.5" />
              Why Agents Are Switching
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Real Estate Analytics Software vs. Spreadsheets
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Most real estate agents start tracking their business in a spreadsheet.
              It works — until it doesn&apos;t. At some point, the limitations of a
              manual, formula-driven file become the ceiling on how clearly you can
              see your business. This page breaks down exactly where spreadsheets fall
              short and what purpose-built real estate agent analytics software does
              differently.
            </p>
          </div>
        </section>

        {/* ── Section 1: What Agents Do With Spreadsheets ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-3xl">
              <span className="mb-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                The Starting Point
              </span>
              <h2 className="mb-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                What Agents Typically Do With Spreadsheets
              </h2>
              <p className="mb-6 text-base leading-relaxed text-slate-600">
                A spreadsheet is the natural first tool for any self-employed professional
                trying to track their income. For real estate agents, a typical setup
                includes a tab for closed transactions, a running GCI total, and maybe
                a separate sheet for expenses. It is free, familiar, and endlessly
                customisable. And for agents earlier in their career or those with a
                lower deal volume, it genuinely gets the job done.
              </p>
              <p className="mb-8 text-base leading-relaxed text-slate-600">
                The workflow usually looks something like this: copy deal details from
                the MLS or your brokerage portal, paste them into the sheet, update the
                GCI running total, and revisit the numbers when something prompts you
                to — a slow month, a tax deadline, or a conversation with your accountant.
                There are no projections, no automatic calculations, and no alerts.
                It is a historical ledger, not a business intelligence tool.
              </p>

              {/* Pain point bullets */}
              <ul className="space-y-3">
                {[
                  "Manual GCI entry with no automatic split or fee calculation — the net figure requires a separate formula or mental math",
                  "No connection between the GCI tab and the expense tab, so net income is never shown in real time",
                  "Projections require building your own formulas, and most agents either skip them or use a simple linear extrapolation that ignores seasonality",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    {point}
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-sm leading-relaxed text-slate-500">
                To be clear: spreadsheets work for simple tracking. If you close a
                handful of deals a year and your financial picture is straightforward,
                a well-maintained spreadsheet is a perfectly reasonable tool. The
                problems begin when you need your numbers to actually work for you —
                to forecast, to plan, to warn you, and to compare. For a detailed look
                at how{" "}
                <Link
                  href="/how-real-estate-agents-calculate-net-income"
                  className="text-blue-600 underline-offset-2 hover:underline"
                >
                  real estate agents calculate net income
                </Link>
                {" "}from GCI through to take-home pay, see the full guide.
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 2: Where Spreadsheets Break Down ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <span className="mb-3 inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-600">
                The Limitations
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Where Spreadsheets Break Down
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                These are not edge cases or niche scenarios. They are structural gaps
                that affect every agent who relies on a spreadsheet as their primary
                business analytics tool.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {PAIN_POINTS.map(({ icon: Icon, iconClass, bgClass, title, body }) => (
                <div
                  key={title}
                  className={`rounded-2xl border p-6 ${bgClass}`}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
                    <h3 className="text-base font-semibold text-slate-900">
                      {title}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 3: Comparison Table ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <span className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Feature Comparison
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Spreadsheet vs. Agent Runway
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                A side-by-side look at the capabilities that matter for running a
                real estate business — not just tracking one.
              </p>
            </div>

            {/* Table — scroll on small screens */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Feature
                    </th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Spreadsheet
                    </th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Agent Runway
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                    >
                      <td className="px-4 py-4 font-medium text-slate-800">
                        {row.feature === "GCI tracking" ? (
                          <>
                            <Link
                              href="/metrics/gci"
                              className="text-slate-800 underline underline-offset-2 hover:text-blue-600"
                            >
                              GCI
                            </Link>{" "}
                            tracking
                          </>
                        ) : (
                          row.feature
                        )}
                      </td>
                      <StatusCell
                        status={row.spreadsheet}
                        note={row.spreadsheetNote}
                      />
                      <StatusCell
                        status={row.agentRunway}
                        note={row.agentRunwayNote}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Section 4: Who Should Still Use Spreadsheets ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-10 sm:flex-row sm:items-start">
              {/* Text */}
              <div className="flex-1">
                <span className="mb-3 inline-block rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Honest Assessment
                </span>
                <h2 className="mb-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Who Should Still Use Spreadsheets
                </h2>
                <p className="mb-4 text-base leading-relaxed text-slate-600">
                  Not every agent needs purpose-built analytics software, and it would
                  be disingenuous to pretend otherwise. If you close fewer than five
                  deals per year, have a simple brokerage arrangement, and are not yet
                  actively forecasting or planning for growth, a well-maintained
                  spreadsheet is a perfectly adequate tool. The overhead of setting up
                  and learning new software may not be justified at that scale.
                </p>
                <p className="mb-4 text-base leading-relaxed text-slate-600">
                  Similarly, if you have a long-standing system that works for you and
                  your accountant handles the complexity, a spreadsheet can remain your
                  primary tracking method indefinitely. There is no rule that says more
                  tools are always better.
                </p>
                <p className="text-base leading-relaxed text-slate-600">
                  Agent Runway is designed for agents who are serious about their
                  business growth and financial planning — agents who want to know their
                  real net income at any point in the year, who need a live projection
                  to inform decisions about marketing spend or team expansion, and who
                  want their tax obligations tracked proactively rather than discovered
                  at filing time. If that describes how you think about your business,
                  the gap between a spreadsheet and a purpose-built tool is significant.
                </p>
              </div>

              {/* Visual callout */}
              <div className="sm:w-80 shrink-0">
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-semibold text-slate-800">
                      A spreadsheet is fine if...
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {[
                      "You close fewer than 5 deals per year",
                      "You don't need forward projections",
                      "Your tax planning is fully handled by an accountant",
                      "You have a simple, stable brokerage structure",
                    ].map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-slate-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        {point}
                      </li>
                    ))}
                  </ul>

                  <div className="my-5 border-t border-slate-100" />

                  <div className="mb-4 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-semibold text-slate-800">
                      Consider Agent Runway if...
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {[
                      "You want live net income, not just GCI",
                      "You need seasonality-aware forecasting",
                      "You want quarterly tax estimates built in",
                      "You want to benchmark against peers",
                    ].map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-slate-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              See the difference for yourself.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway is free to try. Log your transactions, connect your brokerage
              structure, and see your live net income, tax estimates, and{" "}
              <Link
                href="/metrics/financial-runway"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                financial runway
              </Link>{" "}
              in minutes — no credit card required.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                View Demo
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <MarketingFooter />
    </div>
  );
}
