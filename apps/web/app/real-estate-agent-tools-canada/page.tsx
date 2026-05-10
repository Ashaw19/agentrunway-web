import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Calculator,
  FileSpreadsheet,
  Users,
  Layers,
  Compass,
  Radio,
} from "lucide-react";
import { Tailfin } from "@/components/icons/brand-icons";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "What's Missing Between Your Accountant, CRM, and Spreadsheet | Agent Runway",
  description:
    "Canadian real estate agents run accountants, CRMs, and spreadsheets — but none of those three tools show you what you actually owe CRA this quarter, or whether your pipeline covers next month. Here's what AR adds.",
  openGraph: {
    url: "https://agentrunway.ca/real-estate-agent-tools-canada",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/real-estate-agent-tools-canada",
  },
};

const pageArticleSchema = articleSchema({
  headline:
    "What's Missing Between Your Accountant, CRM, and Spreadsheet",
  description:
    "Canadian real estate agents already run an accountant, a CRM, and a spreadsheet. None of those three tools answers the year-round financial questions agents face between filing seasons. Agent Runway fills that gap.",
  url: "/real-estate-agent-tools-canada",
  datePublished: "2026-05-06",
  dateModified: "2026-05-06",
  imageUrl: "/og-image-v2.png",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  {
    name: "AR vs the Default Stack",
    url: "/real-estate-agent-tools-canada",
  },
]);

// ── The three tools (Section 2) ──────────────────────────────────────────────

interface ToolColumn {
  icon: typeof Calculator;
  iconClass: string;
  bgClass: string;
  ringClass: string;
  name: string;
  doesWell: string[];
  cannotGive: string[];
}

const STACK_TOOLS: ToolColumn[] = [
  {
    icon: Calculator,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-50",
    ringClass: "ring-emerald-100",
    name: "Your accountant",
    doesWell: [
      "Files an accurate return at year end",
      "Represents you with CRA if questions come up",
      "Knows your specific situation and deduction history",
    ],
    cannotGive: [
      "Visibility between filing seasons",
      "What you may owe CRA in Q2 right now",
      "Whether your pace is on track for April",
      "An estimate of what your Q3 instalment could approximate",
    ],
  },
  {
    icon: FileSpreadsheet,
    iconClass: "text-blue-500",
    bgClass: "bg-blue-50",
    ringClass: "ring-blue-100",
    name: "Your spreadsheet",
    doesWell: [
      "Flexible — works the way you want it to",
      "Free, familiar, and fully under your control",
      "Fine for a simple historical ledger",
    ],
    cannotGive: [
      "Automatic, rate-current tax estimation",
      "Pipeline-weighted year-end forecasting",
      "CRA-aware instalment estimates",
      "An AI layer that reads your data and surfaces patterns",
    ],
  },
  {
    icon: Users,
    iconClass: "text-violet-500",
    bgClass: "bg-violet-50",
    ringClass: "ring-violet-100",
    name: "Your CRM",
    doesWell: [
      "Tracks client relationships and follow-ups",
      "Manages your deal pipeline and stages",
      "Keeps your communications in one place",
    ],
    cannotGive: [
      "What those deals mean for your net income",
      "What your tax burden may look like by year end",
      "Your financial runway in months",
      "Province-specific CRA obligations as deals close",
    ],
  },
];

// ── Comparison table (Section 4) ─────────────────────────────────────────────

interface CompareRow {
  feature: string;
  stack: { ok: boolean; note: string };
  ar: { ok: boolean; note: string };
}

const COMPARE_ROWS: CompareRow[] = [
  {
    feature: "Year-round tax visibility",
    stack: { ok: false, note: "Accountant available at filing" },
    ar: { ok: true, note: "Province-specific estimates, updated continuously" },
  },
  {
    feature: "CRA instalment estimates",
    stack: { ok: false, note: "Manual, or wait for accountant" },
    ar: { ok: true, note: "Engine estimates Q-by-Q from reported income" },
  },
  {
    feature: "HST / GST tracking",
    stack: { ok: false, note: "Manual spreadsheet entry" },
    ar: { ok: true, note: "Flagged against the $30K threshold automatically" },
  },
  {
    feature: "Financial runway in months",
    stack: { ok: false, note: "Not tracked anywhere" },
    ar: { ok: true, note: "Calculated from cash reserves + pipeline pace" },
  },
  {
    feature: "Year-end GCI forecast",
    stack: { ok: false, note: "Straight-line guess, if anything" },
    ar: { ok: true, note: "Pipeline-weighted, seasonality-adjusted" },
  },
  {
    feature: "AI that reads your business data",
    stack: { ok: false, note: "Not available" },
    ar: { ok: true, note: "Flight Crew — Captain, Navigator, Dispatcher" },
  },
  {
    feature: "Canadian-specific depth",
    stack: { ok: true, note: "Accountant knows CRA" },
    ar: { ok: true, note: "Built for Canadian agents — all 13 provinces" },
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateAgentToolsCanada() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageArticleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <MarketingNav />

      <main>

        {/* ── Section 1: Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <Layers className="h-3.5 w-3.5" />
              AR vs the Default Stack
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              What&apos;s missing between your accountant, your CRM, and your
              spreadsheet.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Most Canadian real estate agents already run three tools — an
              accountant for year-end tax, a spreadsheet for tracking deals,
              and a CRM for clients. None of them answers what you actually owe
              CRA this quarter, whether your pipeline covers next month, or how
              much you actually kept after the year&apos;s deals.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              That gap has a name — and it estimates more than it costs.
            </p>
          </div>
        </section>

        {/* ── Section 2: The Three Tools ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <span className="mb-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                The Default Stack
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Three tools you already have — and what they don&apos;t do
              </h2>
              <p className="mx-auto mt-4 text-base leading-relaxed text-slate-600">
                These are good tools. Top Canadian agents run all three for
                good reasons. The question is what falls in between them.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {STACK_TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <div
                    key={tool.name}
                    className={`rounded-2xl border border-slate-200 bg-white p-6 ring-1 ${tool.ringClass}`}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${tool.bgClass}`}
                      >
                        <Icon className={`h-5 w-5 ${tool.iconClass}`} />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {tool.name}
                      </h3>
                    </div>

                    <div className="mb-5">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Does well
                      </div>
                      <ul className="space-y-2">
                        {tool.doesWell.map((point) => (
                          <li
                            key={point}
                            className="flex items-start gap-2 text-sm leading-relaxed text-slate-700"
                          >
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Cannot give you
                      </div>
                      <ul className="space-y-2">
                        {tool.cannotGive.map((point) => (
                          <li
                            key={point}
                            className="flex items-start gap-2 text-sm leading-relaxed text-slate-600"
                          >
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Section 3: The Gap AR Fills ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-10 text-center">
              <span className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                The Gap
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                What the default stack cannot give you
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                These are the year-round questions that fall between your
                accountant&apos;s filing season, your spreadsheet&apos;s manual
                cells, and your CRM&apos;s deal pipeline. Agent Runway answers
                them as information — not advice.
              </p>
            </div>

            <ul className="space-y-4">
              {[
                {
                  title: "Province-specific marginal tax estimates",
                  body:
                    "As deals close, the engine re-estimates federal and provincial income tax plus self-employed CPP from current CRA rate tables. The numbers update with the deals — not in April.",
                },
                {
                  title: "Financial runway in months",
                  body: (
                    <>
                      How long your business could cover its expenses if nothing
                      new closes — calculated from cash reserves and pipeline
                      pace. See the full definition of{" "}
                      <Link
                        href="/metrics/financial-runway"
                        className="font-medium text-blue-600 underline-offset-2 hover:underline"
                      >
                        financial runway
                      </Link>
                      .
                    </>
                  ),
                },
                {
                  title: "Pipeline-weighted year-end GCI forecast",
                  body:
                    "Not a straight-line guess from current GCI. A probability-weighted forecast that accounts for deals in motion and Canadian seasonality.",
                },
                {
                  title: "A Flight Crew that reads your real business data",
                  body:
                    "Three personas — Captain (overview), Navigator (tax/finance math), Dispatcher (clients/pipeline) — that answer questions against your actual numbers, not generic templates.",
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="mb-1.5 text-base font-semibold text-slate-900">
                    {item.title}
                  </div>
                  <div className="text-sm leading-relaxed text-slate-600">
                    {item.body}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Section 4: Side-by-side Comparison ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <span className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Side-by-side
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                The default stack vs. Agent Runway
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                AR is not a replacement for any of these tools. It is the
                financial layer that sits alongside them.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Capability
                    </th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Accountant + Spreadsheet + CRM
                    </th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Agent Runway
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-slate-100 ${
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                      }`}
                    >
                      <td className="px-4 py-4 font-medium text-slate-800">
                        {row.feature}
                      </td>
                      <td className="px-4 py-4 text-center text-sm">
                        {row.stack.ok ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            <span className="mt-0.5 text-xs text-slate-500">
                              {row.stack.note}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <XCircle className="h-5 w-5 text-slate-300" />
                            <span className="mt-0.5 text-xs text-slate-500">
                              {row.stack.note}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-sm">
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          <span className="mt-0.5 text-xs text-slate-500">
                            {row.ar.note}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td className="px-4 py-4 font-medium text-slate-800">
                      Typical cost
                    </td>
                    <td className="px-4 py-4 text-center text-xs text-slate-600">
                      $3–5K/yr accountant · spreadsheet free ·
                      <br />
                      CRM ~$50–150/mo
                    </td>
                    <td className="px-4 py-4 text-center text-xs text-slate-600">
                      $79–149/mo, all-in
                      <br />
                      <Link
                        href="/pricing"
                        className="font-medium text-blue-600 underline-offset-2 hover:underline"
                      >
                        See pricing
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-slate-500">
              The accountant row is context — Agent Runway is not a replacement
              for an accountant. Agents keep their accountant and add AR for
              the year-round visibility a filing-season relationship cannot
              cover.
            </p>
          </div>
        </section>

        {/* ── Section 5: What AR is NOT replacing ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <span className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                What AR is not
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                We are not trying to replace any of these
              </h2>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  We don&apos;t replace your accountant.
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Your accountant signs the return, handles CRA correspondence,
                  and knows the specifics of your situation. AR surfaces
                  CRA-rule-based estimates and patterns from your data. The
                  numbers are informational, not filing advice — your
                  accountant remains the person who files.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  We don&apos;t replace your CRM.
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  If you&apos;re running Follow Up Boss, kvCORE, LionDesk, or
                  HubSpot — keep it. Top producers run a specialized CRM for a
                  reason. AR sits alongside it as the financial layer, not
                  underneath it as a partial replacement.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  We&apos;re not a spreadsheet killer.
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Some agents will always track certain things in Excel — that
                  is fine. AR is for agents who want the calculations
                  automatic, the rates current, and an AI layer on top of
                  their actual numbers.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 6: Flight Crew advantage ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-10 text-center">
              <span className="mb-3 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
                The one thing none of them can offer
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                A Flight Crew that reads your numbers
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                Three AI personas, each with a defined lane, all answering
                against your real business data — not generic templates.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Tailfin,
                  iconClass: "text-blue-600",
                  bgClass: "bg-blue-50",
                  name: "Captain",
                  body: "Strategic overview — connects your tax, pipeline, and clients into one read of where the business stands.",
                },
                {
                  icon: Compass,
                  iconClass: "text-cyan-600",
                  bgClass: "bg-cyan-50",
                  name: "Navigator",
                  body: "Tax and finance math — CRA rate tables, instalment estimates, HST flagging, year-end forecasts.",
                },
                {
                  icon: Radio,
                  iconClass: "text-violet-600",
                  bgClass: "bg-violet-50",
                  name: "Dispatcher",
                  body: "Clients and pipeline — what stage each deal is in, who is going cold, what the next touch could be.",
                },
              ].map((persona) => {
                const Icon = persona.icon;
                return (
                  <div
                    key={persona.name}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${persona.bgClass}`}
                      >
                        <Icon className={`h-5 w-5 ${persona.iconClass}`} />
                      </div>
                      <div className="text-base font-semibold text-slate-900">
                        {persona.name}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {persona.body}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/demo"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                See it in action
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Section 7: Bottom CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Add the layer your stack is missing.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Keep your accountant. Keep your CRM. Keep your spreadsheet if you
              like it. Add the financial layer that estimates what you owe,
              forecasts where you&apos;re headed, and answers questions in
              plain language.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
              14-day free trial. No credit card.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  );
}
