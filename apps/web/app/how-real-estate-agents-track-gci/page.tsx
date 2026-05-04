import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Rocket,
  CheckCircle2,
  XCircle,
  ArrowDown,
  Target,
  Activity,
  Layers,
  Banknote,
  Clock,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "How Real Estate Agents Track GCI",
  description:
    "Learn how top real estate agents track gross commission income (GCI), forecast annual income, and measure business performance.",
  openGraph: {
    url: "https://agentrunway.ca/how-real-estate-agents-track-gci",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/how-real-estate-agents-track-gci",
  },
};

const pageArticleSchema = articleSchema({
  headline: "How Real Estate Agents Track Gross Commission Income (GCI)",
  description:
    "A practical guide for real estate agents on how to track gross commission income accurately, forecast year-end earnings, and avoid the common tracking mistakes that lead to income surprises.",
  url: "/how-real-estate-agents-track-gci",
  datePublished: "2025-11-01",
  dateModified: "2026-04-16",
  imageUrl: "/og-image-v2.png",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "How Agents Track GCI", url: "/how-real-estate-agents-track-gci" },
]);

// ── Table of contents ─────────────────────────────────────────────────────────

const TOC = [
  { href: "#what-is-gci", label: "What is GCI?" },
  { href: "#why-agents-track-gci-incorrectly", label: "Why most agents track GCI incorrectly" },
  { href: "#how-top-agents-track-gci", label: "How top agents track GCI" },
  { href: "#how-agent-runway-helps", label: "How Agent Runway helps" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HowRealEstateAgentsTrackGCIPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

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

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <BookOpen className="h-3.5 w-3.5" />
              Guide for Canadian Real Estate Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              How Real Estate Agents Track GCI
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Gross Commission Income is the single most important number in a real estate
              agent&apos;s business — yet most agents track it poorly, forecast it never, and
              only see the real picture at tax time.
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> 6 min read
              </span>
              <span className="h-1 w-1 rounded-full bg-slate-700" />
              <span>Canadian real estate agents</span>
            </div>
          </div>
        </section>

        {/* ── Article Body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Table of Contents */}
            <nav aria-label="Table of contents" className="mb-14 rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                In this guide
              </p>
              <ol className="space-y-3">
                {TOC.map(({ href, label }, i) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-100"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-bold text-blue-600">
                        {i + 1}
                      </span>
                      <span className="text-blue-600 font-medium">{label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            {/* ── Section 1: What is GCI ── */}
            <section id="what-is-gci" className="mb-16 scroll-mt-20">

              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/10">
                  <Banknote className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  What is GCI?
                </h2>
              </div>

              <p className="mb-5 text-base leading-relaxed text-slate-600">
                <strong className="text-slate-800">Gross Commission Income (GCI)</strong> is the
                total commission earned from real estate transactions before any deductions. It sits
                at the same level as gross revenue for any self-employed professional — everything
                meaningful about your business flows downstream from it.
              </p>

              {/* Formula callout */}
              <div className="my-8 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50">
                <div className="bg-blue-600 px-6 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-blue-100">
                    The GCI formula
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 px-6 py-8 text-center">
                  <div className="rounded-xl border border-blue-200 bg-white px-5 py-3 shadow-sm">
                    <p className="text-xs text-slate-500">Sale Price</p>
                    <p className="mt-0.5 text-xl font-bold text-slate-900">$800,000</p>
                  </div>
                  <span className="text-2xl font-light text-blue-400">×</span>
                  <div className="rounded-xl border border-blue-200 bg-white px-5 py-3 shadow-sm">
                    <p className="text-xs text-slate-500">Commission Rate</p>
                    <p className="mt-0.5 text-xl font-bold text-slate-900">3.5%</p>
                  </div>
                  <span className="text-2xl font-light text-blue-400">=</span>
                  <div className="rounded-xl border-2 border-blue-600 bg-blue-600 px-5 py-3 shadow-sm">
                    <p className="text-xs font-semibold text-blue-100">Your GCI</p>
                    <p className="mt-0.5 text-xl font-bold text-white">$28,000</p>
                  </div>
                </div>
                <p className="border-t border-blue-100 bg-white px-6 py-3 text-xs text-slate-500">
                  That $28,000 — before your brokerage split, transaction fees, or any other cost — is your GCI contribution from that deal.
                </p>
              </div>

              <h3 className="mb-3 mt-10 text-lg font-bold text-slate-900">
                GCI vs. net agent income
              </h3>

              <p className="mb-5 text-base leading-relaxed text-slate-600">
                GCI is what you earn. Net agent income is what you keep. The gap between the two
                surprises most agents until they see it laid out.
              </p>

              {/* Income waterfall */}
              <div className="my-8 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-800 px-6 py-4">
                  <p className="text-sm font-semibold text-white">
                    Where $200,000 GCI actually goes
                  </p>
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  {[
                    { label: "GCI (top-line)", value: "$200,000", note: "What you billed", color: "text-slate-900", bg: "bg-white", bold: true },
                    { label: "Brokerage split (20%)", value: "−$40,000", note: "Goes to your brokerage", color: "text-red-600", bg: "bg-red-50/40", bold: false },
                    { label: "Transaction fees", value: "−$3,000", note: "Per-deal fees", color: "text-red-600", bg: "bg-red-50/40", bold: false },
                    { label: "Monthly desk fees", value: "−$4,800", note: "$400/month × 12", color: "text-red-600", bg: "bg-red-50/40", bold: false },
                    { label: "Business expenses", value: "−$22,000", note: "Marketing, MLS, E&O, tech, vehicle", color: "text-red-600", bg: "bg-red-50/40", bold: false },
                    { label: "Net before tax", value: "$130,200", note: "After all business costs", color: "text-amber-600", bg: "bg-amber-50/40", bold: true },
                    { label: "Federal + provincial tax + CPP", value: "−$38,000", note: "Approx. — varies by province", color: "text-red-600", bg: "bg-red-50/40", bold: false },
                    { label: "Take-home income", value: "≈ $92,000", note: "What actually lands in your account", color: "text-emerald-600", bg: "bg-emerald-50/40", bold: true },
                  ].map(({ label, value, note, color, bg, bold }) => (
                    <div key={label} className={`flex items-center justify-between px-6 py-3.5 ${bg}`}>
                      <div>
                        <p className={`text-sm ${bold ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                          {label}
                        </p>
                        <p className="text-xs text-slate-400">{note}</p>
                      </div>
                      <p className={`text-sm font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <p className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500">
                  Tracking GCI alone — without understanding what flows through to net — is one of the most common financial blind spots in the industry.
                </p>
              </div>

            </section>

            {/* Divider */}
            <div className="mb-16 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-100" />
              <ArrowDown className="h-4 w-4 text-slate-300" />
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {/* ── Section 2: Why agents track GCI incorrectly ── */}
            <section id="why-agents-track-gci-incorrectly" className="mb-16 scroll-mt-20">

              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Why most agents track GCI incorrectly
                </h2>
              </div>

              <p className="mb-8 text-base leading-relaxed text-slate-600">
                Ask ten real estate agents how they track their GCI and you&apos;ll hear a familiar
                range of answers — a spreadsheet, their CRM, a rough mental tally, or &ldquo;my
                accountant handles it.&rdquo; Each of these approaches has serious gaps.
              </p>

              {/* Comparison cards */}
              <div className="my-8 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    method: "Spreadsheet",
                    icon: "📊",
                    pros: ["Free", "Flexible"],
                    cons: [
                      "Updated inconsistently",
                      "No time context",
                      "No forecasting",
                      "No seasonality",
                    ],
                    verdict: "Common but incomplete",
                    color: "border-amber-200 bg-amber-50",
                    verdictColor: "text-amber-600",
                  },
                  {
                    method: "CRM",
                    icon: "📇",
                    pros: ["Tied to pipeline", "Auto-tracks closes"],
                    cons: [
                      "Raw totals only",
                      "No split applied",
                      "No projections",
                      "No expense tracking",
                    ],
                    verdict: "Useful but limited",
                    color: "border-amber-200 bg-amber-50",
                    verdictColor: "text-amber-600",
                  },
                  {
                    method: "Agent Runway",
                    icon: "🛩️",
                    pros: [
                      "Net after split + fees",
                      "Seasonality forecasting",
                      "P10–P90 bands",
                      "Tax planning built in",
                    ],
                    cons: [],
                    verdict: "Purpose-built",
                    color: "border-blue-200 bg-blue-50",
                    verdictColor: "text-blue-600",
                  },
                ].map(({ method, icon, pros, cons, verdict, color, verdictColor }) => (
                  <div key={method} className={`rounded-2xl border p-5 ${color}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xl">{icon}</span>
                      <span className="font-bold text-slate-900">{method}</span>
                    </div>
                    <ul className="mb-3 space-y-1.5">
                      {pros.map((p) => (
                        <li key={p} className="flex items-start gap-1.5 text-xs text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          {p}
                        </li>
                      ))}
                      {cons.map((c) => (
                        <li key={c} className="flex items-start gap-1.5 text-xs text-slate-500">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                          {c}
                        </li>
                      ))}
                    </ul>
                    <p className={`text-xs font-semibold ${verdictColor}`}>{verdict}</p>
                  </div>
                ))}
              </div>

              {/* Key gap callout */}
              <div className="my-8 rounded-xl border-l-4 border-amber-400 bg-amber-50 px-6 py-5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
                  The most costly gap
                </p>
                <p className="text-sm leading-relaxed text-slate-700">
                  Knowing you&apos;ve earned $95,000 GCI by August is useful — but knowing whether
                  that pace implies a <strong>$165,000 year or a $135,000 year</strong> is far more
                  actionable. Most tracking methods answer the historical question and leave the
                  forward question unanswered. Real estate income is seasonal: transactions cluster
                  in spring and fall, slow through December and January. Without seasonality
                  adjustments, naive projections routinely mislead.
                </p>
              </div>

            </section>

            {/* Divider */}
            <div className="mb-16 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-100" />
              <ArrowDown className="h-4 w-4 text-slate-300" />
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {/* ── Section 3: How top agents track GCI ── */}
            <section id="how-top-agents-track-gci" className="mb-16 scroll-mt-20">

              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  How top agents track GCI
                </h2>
              </div>

              <p className="mb-8 text-base leading-relaxed text-slate-600">
                High-producing agents — those running their practice as a deliberate business — monitor
                a richer set of metrics. GCI is the starting point, not the endpoint.
              </p>

              {/* Five practices */}
              <div className="space-y-5">
                {[
                  {
                    icon: Target,
                    color: "bg-blue-500/10 text-blue-600",
                    title: "Monthly pace against goal",
                    body: "Rather than watching a cumulative total, disciplined agents track their monthly pace — how much GCI they need to close each month to hit their annual goal, adjusted for which months historically produce more volume. Closing $15,000 in January on a $200,000 goal might actually be ahead of pace, because Q1 is historically slow.",
                  },
                  {
                    icon: Activity,
                    color: "bg-violet-500/10 text-violet-600",
                    title: "Pipeline forecasting with weighted probability",
                    body: "Closed deals represent certainty; active pipeline represents probability. Top agents apply close probabilities to in-progress deals — a listing with a firm accepted offer is near 100%, while a buyer showing early interest might be 20–30%. Weighted pipeline added to year-to-date GCI gives a much sharper year-end estimate.",
                  },
                  {
                    icon: BarChart3,
                    color: "bg-emerald-500/10 text-emerald-600",
                    title: "Annual projections with confidence bands",
                    body: "Rather than committing to a single year-end number, rigorous agents think probabilistically. A base-case projection reflects current pace. A conservative case accounts for a slow Q4. An optimistic case factors in one or two additional deals. Layering in variance — P10 through P90 bands — turns a forecast into a range of realistic outcomes rather than a single guess.",
                  },
                  {
                    icon: Layers,
                    color: "bg-amber-500/10 text-amber-600",
                    title: "Net vs. gross income at every stage",
                    body: "Tracking net agent income — not just GCI — means applying your specific brokerage split, transaction fee structure, desk fees, and known business expenses at every stage. When you receive a commission cheque, the net-to-you figure should be calculable immediately, not discovered at tax time.",
                  },
                  {
                    icon: Rocket,
                    color: "bg-rose-500/10 text-rose-600",
                    title: "Financial runway as a business metric",
                    body: "The agents least vulnerable to market slowdowns monitor their cash runway: how many months their reserves cover their fixed operating costs. This single number determines how much risk you can afford to take, how aggressively you can invest in marketing, and whether you're building a resilient business or living deal-to-deal.",
                  },
                ].map(({ icon: Icon, color, title, body }) => (
                  <div key={title} className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="mb-1.5 font-bold text-slate-900">{title}</h3>
                      <p className="text-sm leading-relaxed text-slate-600">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

            </section>

            {/* Divider */}
            <div className="mb-16 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-100" />
              <ArrowDown className="h-4 w-4 text-slate-300" />
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            {/* ── Section 4: How Agent Runway helps ── */}
            <section id="how-agent-runway-helps" className="mb-8 scroll-mt-20">

              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/10">
                  <Rocket className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  How Agent Runway helps
                </h2>
              </div>

              <p className="mb-8 text-base leading-relaxed text-slate-600">
                <Link href="/" className="font-semibold text-blue-600 underline-offset-2 hover:underline">
                  Agent Runway
                </Link>{" "}
                was built to close the gap between how most agents track GCI today and how the best
                agents manage their business — replacing manual spreadsheets and disconnected CRM
                fields with a{" "}
                <Link href="/real-estate-business-analytics" className="font-semibold text-blue-600 underline-offset-2 hover:underline">
                  live business dashboard
                </Link>{" "}
                purpose-built for Canadian agents.
              </p>

              {/* Feature grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Banknote,
                    title: "Automatic GCI tracking",
                    body: "Every transaction is immediately processed through your split, transaction fees, desk fees, and expenses. Net agent income — not just gross GCI — is calculated from the moment a deal is entered.",
                  },
                  {
                    icon: TrendingUp,
                    title: "Seasonality-aware forecasting",
                    body: "Agent Runway's projection engine applies Canadian real estate seasonality curves to your year-to-date performance. The forecast understands that March and October close more deals than January and July.",
                  },
                  {
                    icon: BarChart3,
                    title: "P10–P90 probability bands",
                    body: "Every forecast is expressed as a range, not a single number. P10 is a conservative outcome; P90 is optimistic. You can see at a glance whether your year-end income is likely to come in above or below your goal.",
                  },
                  {
                    icon: Activity,
                    title: "Financial runway measurement",
                    body: "Agent Runway calculates your runway in months using your cash reserve and total monthly fixed costs — classified as Critical, Warning, Healthy, or Strong. A six-component composite score gives you a single letter grade.",
                  },
                  {
                    icon: Layers,
                    title: "Tax planning built in",
                    body: "Federal and provincial tax obligations estimated for all 13 provinces and territories, including CPP and Quebec QPP. Shows your estimated quarterly instalment and per-deal set-aside amount.",
                  },
                  {
                    icon: Rocket,
                    title: "AI business insights",
                    body: "An AI chat assistant with access to your live data — GCI pace, pipeline, expenses, runway, and projections. Contextual insight cards surface the highest-impact observations automatically.",
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <div className="mb-3 flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/10">
                        <Icon className="h-4 w-4 text-blue-600" />
                      </div>
                      <h3 className="font-bold text-slate-900">{title}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">{body}</p>
                  </div>
                ))}
              </div>

            </section>

          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Stop guessing. Start tracking GCI the right way.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway gives you the GCI tracking, income forecasting, and financial runway
              measurement that top agents use to run their business with clarity. Built
              specifically for Canadian real estate agents.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Try Agent Runway Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/real-estate-business-analytics"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                See All Features
              </Link>
            </div>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  );
}
